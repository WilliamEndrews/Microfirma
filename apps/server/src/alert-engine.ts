/**
 * MOTOR DE ALERTAS
 *
 * Watchdog sobre KPIs e eventos do mundo. Quando uma condicao dispara,
 * envia notificacao pelo canal configurado (webhook, slack, pagerduty, email).
 *
 * O motor e injetado no laco de tick: a cada N ticks, avalia as condicoes
 * contra o estado atual do mundo. Se disparar, cria um AlertEvent, tenta
 * entregar, e registra no AuditTrail.
 *
 * Canais:
 *   - webhook: POST JSON para targetUrl
 *   - slack: POST JSON (Slack Incoming Webhook format) para targetUrl
 *   - pagerduty: POST JSON (Events API v2) para targetUrl
 *   - email: delegado para um sender injetado (nodemailer em producao)
 */

import type { AlertConfig, AlertEvent, WorldKpis } from '@microfirma/contracts';
import { gerarId } from './auth.js';
import type { AuditTrail } from './audit-trail.js';

export interface AlertEngineOptions {
  /** Intervalo de avaliacao em ticks. Default: a cada 10 ticks (~1s). */
  intervaloTicks?: number;
  /** Sender de email injetado. Se ausente, canal email loga apenas. */
  enviarEmail?: (to: string, subject: string, body: string) => Promise<void>;
}

interface EstadoAlerta {
  /** Ultima vez que disparou (epoch ms) - para debounce. */
  ultimoDisparo: number;
  /** Quantas vezes disparou. */
  contador: number;
}

export class AlertEngine {
  private configs = new Map<string, AlertConfig>();
  private configsPorTenant = new Map<string, AlertConfig[]>();
  private estado = new Map<string, EstadoAlerta>();
  private eventos: AlertEvent[] = [];
  private intervaloTicks: number;
  private enviarEmail: ((to: string, subject: string, body: string) => Promise<void>) | null;
  private audit: AuditTrail;
  private ticksDesdeAvaliacao = 0;

  constructor(audit: AuditTrail, opts: AlertEngineOptions = {}) {
    this.audit = audit;
    this.intervaloTicks = opts.intervaloTicks ?? 10;
    this.enviarEmail = opts.enviarEmail ?? null;
  }

  /** Adiciona ou atualiza uma config de alerta. */
  configurar(config: AlertConfig): void {
    this.configs.set(config.alertId, config);
    let lista = this.configsPorTenant.get(config.tenantId);
    if (!lista) {
      lista = [];
      this.configsPorTenant.set(config.tenantId, lista);
    }
    const idx = lista.findIndex((c) => c.alertId === config.alertId);
    if (idx >= 0) lista[idx] = config;
    else lista.push(config);
  }

  /** Remove uma config de alerta. */
  remover(alertId: string): void {
    const config = this.configs.get(alertId);
    if (!config) return;
    this.configs.delete(alertId);
    const lista = this.configsPorTenant.get(config.tenantId);
    if (lista) {
      const idx = lista.findIndex((c) => c.alertId === alertId);
      if (idx >= 0) lista.splice(idx, 1);
    }
  }

  /** Lista configs de um tenant. */
  configsDoTenant(tenantId: string): AlertConfig[] {
    return this.configsPorTenant.get(tenantId) ?? [];
  }

  /**
   * Avalia condicoes contra o estado atual. Chamada no laco de tick.
   * Devolve os eventos disparados (para o caller decidir o que fazer).
   */
  avaliar(tenantId: string, kpis: WorldKpis, pendingApprovals: Array<{ agentId: string; waitingSeconds: number }>): AlertEvent[] {
    this.ticksDesdeAvaliacao++;
    if (this.ticksDesdeAvaliacao < this.intervaloTicks) return [];
    this.ticksDesdeAvaliacao = 0;

    const configs = this.configsPorTenant.get(tenantId) ?? [];
    const disparados: AlertEvent[] = [];
    const agora = Date.now();

    for (const config of configs) {
      if (!config.enabled) continue;

      const deveDisparar = this.avaliarCondicao(config, kpis, pendingApprovals, agora);
      if (!deveDisparar) continue;

      // Debounce: nao disparar mais de uma vez por janela.
      const estado = this.estado.get(config.alertId);
      const debounceMs = (config.windowSeconds ?? 300) * 1000;
      if (estado && agora - estado.ultimoDisparo < debounceMs) continue;

      const evento = this.criarEvento(config, kpis, agora);
      this.eventos.push(evento);
      if (this.eventos.length > 1000) this.eventos.shift();

      this.estado.set(config.alertId, {
        ultimoDisparo: agora,
        contador: (estado?.contador ?? 0) + 1,
      });

      // Entregar assincronamente (nao bloqueia o tick).
      void this.entregar(config, evento);

      disparados.push(evento);
    }

    return disparados;
  }

  /** Eventos disparados (todos os tenants). */
  get eventosDisparados(): AlertEvent[] {
    return [...this.eventos];
  }

  private avaliarCondicao(
    config: AlertConfig,
    kpis: WorldKpis,
    pendingApprovals: Array<{ agentId: string; waitingSeconds: number }>,
    agora: number,
  ): boolean {
    switch (config.condition) {
      case 'agent_failing':
        return kpis.errorsLast5Min > (config.threshold ?? 5);

      case 'budget_exceeded':
        return kpis.costUsdToday >= kpis.budgetUsdToday;

      case 'approval_pending_long': {
        const limiar = (config.windowSeconds ?? 300);
        return pendingApprovals.some((a) => a.waitingSeconds >= limiar);
      }

      case 'error_rate_high':
        return kpis.errorsLast5Min > (config.threshold ?? 10);

      case 'agent_discovered':
        // Disparado por evento externo, nao por KPI. Sempre false aqui.
        return false;

      default:
        return false;
    }
  }

  private criarEvento(config: AlertConfig, kpis: WorldKpis, agora: number): AlertEvent {
    const mensagens: Record<AlertConfig['condition'], string> = {
      agent_failing: `${kpis.errorsLast5Min} erros nos ultimos 5 minutos`,
      budget_exceeded: `Orcamento diario estourado: $${kpis.costUsdToday.toFixed(2)} / $${kpis.budgetUsdToday.toFixed(2)}`,
      approval_pending_long: `Aprovacao pendente ha mais de ${config.windowSeconds ?? 300}s`,
      error_rate_high: `Taxa de erro alta: ${kpis.errorsLast5Min} erros em 5 min`,
      agent_discovered: 'Novo agente descoberto',
    };

    return {
      alertEventId: gerarId(),
      tenantId: config.tenantId,
      alertId: config.alertId,
      condition: config.condition,
      ts: agora,
      message: mensagens[config.condition] ?? config.condition,
      context: {
        errorsLast5Min: kpis.errorsLast5Min,
        costUsdToday: kpis.costUsdToday,
        budgetUsdToday: kpis.budgetUsdToday,
        pendingApprovals: kpis.pendingApprovals,
      },
      delivered: false,
    };
  }

  private async entregar(config: AlertConfig, evento: AlertEvent): Promise<void> {
    try {
      switch (config.channel) {
        case 'webhook':
          if (config.targetUrl) {
            await this.postJson(config.targetUrl, evento);
          }
          break;

        case 'slack':
          if (config.targetUrl) {
            await this.postJson(config.targetUrl, {
              text: `:rotating_light: [MicroFirma] ${evento.message}`,
              attachments: [{ color: 'danger', fields: Object.entries(evento.context).map(([k, v]) => ({ title: k, value: String(v), short: true })) }],
            });
          }
          break;

        case 'pagerduty':
          if (config.targetUrl) {
            await this.postJson(config.targetUrl, {
              routing_key: config.targetUrl.includes('integration_key=') ? config.targetUrl.split('integration_key=')[1] : 'unknown',
              event_action: 'trigger',
              dedup_key: evento.alertId,
              payload: { summary: evento.message, severity: 'error', source: 'microfirma' },
            });
          }
          break;

        case 'email':
          if (config.targetEmail && this.enviarEmail) {
            await this.enviarEmail(config.targetEmail, `[MicroFirma] ${evento.message}`, JSON.stringify(evento, null, 2));
          } else if (config.targetEmail) {
            console.log(`[alert] email para ${config.targetEmail}: ${evento.message}`);
          }
          break;
      }
      evento.delivered = true;
    } catch (erro) {
      console.warn(`[alert] falha ao entregar via ${config.channel}:`, erro);
      evento.delivered = false;
    }
  }

  private async postJson(url: string, body: unknown): Promise<void> {
    // fetch nativo do Node 18+.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }
}

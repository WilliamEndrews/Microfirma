/**
 * TRILHA DE AUDITORIA
 *
 * Log imutavel de acoes humanas. Cada registro carrega who/when/what/result.
 * Em producao, isto seria persistido em banco. Aqui, fica em memoria com
 * limite de tamanho (ring buffer) - suficiente para a Fase 3.
 *
 * A imutabilidade e garantida por construcao: AuditEvent e um tipo frozen
 * e o metodo `registrar` devolve uma copia congelada.
 */

import type { AuditAction, AuditEvent } from '@microfirma/contracts';
import { gerarId } from './auth.js';

const MAX_EVENTOS = 10_000;

export class AuditTrail {
  private eventos: AuditEvent[] = [];
  private porTenant = new Map<string, AuditEvent[]>();

  registrar(opts: {
    tenantId: string;
    userId: string;
    action: AuditAction;
    details?: Record<string, unknown>;
    result?: 'success' | 'failure';
  }): AuditEvent {
    const evento: AuditEvent = {
      auditId: gerarId(),
      tenantId: opts.tenantId,
      userId: opts.userId,
      action: opts.action,
      ts: Date.now(),
      details: opts.details ?? {},
      result: opts.result ?? 'success',
    };

    this.eventos.push(evento);
    if (this.eventos.length > MAX_EVENTOS) {
      this.eventos.shift();
    }

    let lista = this.porTenant.get(opts.tenantId);
    if (!lista) {
      lista = [];
      this.porTenant.set(opts.tenantId, lista);
    }
    lista.push(evento);
    if (lista.length > MAX_EVENTOS) {
      lista.shift();
    }

    return evento;
  }

  /** Consulta eventos de um tenant, opcionalmente filtrados por acao. */
  consultar(tenantId: string, filtro?: { action?: AuditAction; limite?: number }): AuditEvent[] {
    const lista = this.porTenant.get(tenantId) ?? [];
    let resultado = lista;
    if (filtro?.action) {
      resultado = resultado.filter((e) => e.action === filtro.action);
    }
    const limite = filtro?.limite ?? 100;
    return resultado.slice(-limite);
  }

  /** Total de eventos (todas as tenants). */
  get total(): number {
    return this.eventos.length;
  }
}

/**
 * REGISTRO DE TENANTS
 *
 * Mapa tenantId -> OfficeSession. Cada tenant tem sua propria sessao,
 * seu proprio ingestor OTLP, seu proprio estado. Isolamento total:
 * dados de uma empresa nunca vazam para outra.
 *
 * Lifecycle:
 *   - criar(): cria tenant + OfficeSession + OtlpIngestor
 *   - obter(): devolve a sessao do tenant (ou null)
 *   - pausar()/retomar(): controla a sessao
 *   - remover(): destroi a sessao e libera recursos
 *
 * O registro tambem mantem o mapa de configs de alerta por tenant e
 * injeta o AlertEngine no laco de tick de cada sessao.
 */

import type { Tenant, Plano, AlertConfig, SessionLogHeader } from '@microfirma/contracts';
import { LIMITES_POR_PLANO } from '@microfirma/contracts';
import { OtlpIngestor, type Violacao } from '@microfirma/world-engine';
import { OfficeSession, type FonteEventos } from './office-session.js';
import { AuditTrail } from './audit-trail.js';
import { AlertEngine } from './alert-engine.js';
import { gerarId } from './auth.js';

interface SessaoTenant {
  tenant: Tenant;
  sessao: OfficeSession;
  ingestor: OtlpIngestor | null;
  violacoes: Violacao[];
}

export class TenantRegistry {
  private sessoes = new Map<string, SessaoTenant>();
  private audit: AuditTrail;
  private alertEngine: AlertEngine;

  constructor(audit: AuditTrail, alertEngine: AlertEngine) {
    this.audit = audit;
    this.alertEngine = alertEngine;
  }

  /**
   * Cria um novo tenant com sua propria sessao.
   * Devolve o tenant criado (sem segredos).
   */
  criar(opts: {
    displayName: string;
    plano?: Plano;
    seed?: number;
    otlpEndpoint?: string;
    fonteEventos?: FonteEventos;
    tenantId?: string;
    gravarEm?: NodeJS.WritableStream;
  }): Tenant {
    const tenantId = opts.tenantId ?? gerarId();
    const plano = opts.plano ?? 'free';
    const seed = opts.seed ?? Date.now();
    const agora = Date.now();

    const tenant: Tenant = {
      tenantId,
      displayName: opts.displayName,
      plano,
      seed,
      createdAt: agora,
      otlpEndpoint: opts.otlpEndpoint,
      active: true,
    };

    const ingestor = opts.otlpEndpoint
      ? new OtlpIngestor({ tenantId })
      : null;

    const fonte: FonteEventos | undefined = opts.fonteEventos ?? ingestor ?? undefined;

    const sessao = new OfficeSession({
      tenantId,
      seed,
      fonteEventos: fonte,
      gravarEm: opts.gravarEm,
    });

    const entry: SessaoTenant = {
      tenant,
      sessao,
      ingestor,
      violacoes: sessao.layoutViolations,
    };

    this.sessoes.set(tenantId, entry);

    this.audit.registrar({
      tenantId,
      userId: 'system',
      action: 'tenant.created',
      details: { displayName: opts.displayName, plano },
    });

    return tenant;
  }

  /**
   * Carrega um tenant a partir de um SessionLog previamente gravado.
   * Preserva tenantId e seed do header para reproduzir a mesma sessao.
   */
  carregar(header: SessionLogHeader, opts?: { gravarEm?: NodeJS.WritableStream }): Tenant | null {
    if (this.sessoes.has(header.tenantId)) return null;
    const tenant: Tenant = {
      tenantId: header.tenantId,
      displayName: `replay-${header.tenantId.slice(0, 8)}`,
      plano: 'free',
      seed: header.seed,
      createdAt: Date.now(),
      active: true,
    };
    const sessao = new OfficeSession({
      tenantId: header.tenantId,
      seed: header.seed,
      gravarEm: opts?.gravarEm,
    });
    const entry: SessaoTenant = {
      tenant,
      sessao,
      ingestor: null,
      violacoes: sessao.layoutViolations,
    };
    this.sessoes.set(header.tenantId, entry);
    this.audit.registrar({
      tenantId: header.tenantId,
      userId: 'system',
      action: 'tenant.created',
      details: { source: 'replay', replayFrom: header.startedAtMs },
    });
    return tenant;
  }

  /** Obtem a sessao de um tenant. */
  obter(tenantId: string): SessaoTenant | null {
    return this.sessoes.get(tenantId) ?? null;
  }

  /** Lista todos os tenants. */
  listar(): Tenant[] {
    return [...this.sessoes.values()].map((s) => s.tenant);
  }

  /** Atualiza o plano de um tenant. */
  atualizarPlano(tenantId: string, plano: Plano): Tenant | null {
    const entry = this.sessoes.get(tenantId);
    if (!entry) return null;
    entry.tenant.plano = plano;
    this.audit.registrar({
      tenantId,
      userId: 'system',
      action: 'tenant.updated',
      details: { plano },
    });
    return entry.tenant;
  }

  /** Remove um tenant e destroi sua sessao. */
  remover(tenantId: string): boolean {
    const entry = this.sessoes.get(tenantId);
    if (!entry) return false;
    this.audit.registrar({
      tenantId,
      userId: 'system',
      action: 'tenant.deleted',
    });
    this.sessoes.delete(tenantId);
    return true;
  }

  /** Obtem o ingestor OTLP de um tenant (para receber spans). */
  ingestorDoTenant(tenantId: string): OtlpIngestor | null {
    return this.sessoes.get(tenantId)?.ingestor ?? null;
  }

  /** Configura um alerta para um tenant. */
  configurarAlerta(config: AlertConfig): void {
    this.alertEngine.configurar(config);
  }

  /** Lista alertas de um tenant. */
  alertasDoTenant(tenantId: string): AlertConfig[] {
    return this.alertEngine.configsDoTenant(tenantId);
  }

  /** Simula um cenario what-if para o tenant. Usa a sessao existente como
   * ponto de partida e devolve o snapshot final. */
  simular(tenantId: string, durationMs: number, carga: number) {
    const entry = this.sessoes.get(tenantId);
    if (!entry) return null;
    const sessao = new OfficeSession({
      tenantId,
      seed: entry.tenant.seed,
      carga,
    });
    return sessao.simular(durationMs);
  }

  /** Limites efetivos de um tenant baseado no plano. */
  limitesDoTenant(tenantId: string): typeof LIMITES_POR_PLANO[Plano] | null {
    const entry = this.sessoes.get(tenantId);
    if (!entry) return null;
    return LIMITES_POR_PLANO[entry.tenant.plano];
  }

  /** Itera sobre todas as sessoes ativas (para o laco de tick global). */
  *sessoesAtivas(): IterableIterator<{ tenantId: string; sessao: OfficeSession }> {
    for (const [tenantId, entry] of this.sessoes) {
      if (entry.tenant.active) {
        yield { tenantId, sessao: entry.sessao };
      }
    }
  }

  get total(): number {
    return this.sessoes.size;
  }
}

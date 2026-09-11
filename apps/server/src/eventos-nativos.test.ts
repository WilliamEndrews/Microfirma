import { describe, expect, it } from 'vitest';
import { AlertEngine } from './alert-engine.js';
import { AuditTrail } from './audit-trail.js';
import {
  expandirEventosNativos,
  ingerirEventosPublicos,
  simularAgenciaPublica,
} from './eventos-nativos.js';
import { TenantRegistry } from './tenant-registry.js';

describe('eventos nativos + simular agencia', () => {
  function setupComOtlp() {
    const audit = new AuditTrail();
    const registry = new TenantRegistry(audit, new AlertEngine(audit));
    const tenant = registry.criar({
      displayName: 'Nativo',
      plano: 'pro',
      otlpEndpoint: 'http://127.0.0.1:8787',
    });
    return { registry, tenantId: tenant.tenantId };
  }

  it('expandirEventosNativos preenche envelope e agent.discovered', () => {
    const ev = expandirEventosNativos('t1', [
      { type: 'agent.discovered', agentId: 'a1', name: 'Triador', role: 'researcher' },
      { type: 'tool.called', agentId: 'a1', toolName: 'busca', ok: false, durationMs: 40 },
    ]);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({
      type: 'agent.discovered',
      tenantId: 't1',
      agent: { agentId: 'a1', displayName: 'Triador', role: 'researcher' },
    });
    expect(ev[1]).toMatchObject({
      type: 'tool.called',
      toolName: 'busca',
      ok: false,
    });
    expect(ev[0]!.eventId).toBeTruthy();
  });

  it('simularAgenciaPublica injeta a fixture no ingestor', () => {
    const { registry, tenantId } = setupComOtlp();
    const r = simularAgenciaPublica(registry, tenantId);
    expect(r).toEqual(expect.objectContaining({ eventos: expect.any(Number) }));
    if ('eventos' in r) expect(r.eventos).toBeGreaterThan(0);
    const ing = registry.ingestorDoTenant(tenantId)!;
    expect(ing.pendentes).toBeGreaterThan(0);
  });

  it('simularAgenciaPublica 404 para codigo inexistente', () => {
    const { registry } = setupComOtlp();
    expect(simularAgenciaPublica(registry, 'nao-existe')).toEqual({
      erro: 'codigo nao encontrado ou sem OTLP',
      status: 404,
    });
  });

  it('ingerirEventosPublicos aceita payload compacto', () => {
    const { registry, tenantId } = setupComOtlp();
    const r = ingerirEventosPublicos(registry, tenantId, [
      { type: 'agent.discovered', agentId: 'bot_1', name: 'Bot' },
      { type: 'approval.requested', agentId: 'bot_1', question: 'Seguir?' },
    ]);
    expect(r).toEqual({ eventos: 2 });
  });
});

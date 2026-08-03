/**
 * Testes do motor de alertas.
 */

import { describe, it, expect } from 'vitest';
import { AlertEngine } from './alert-engine.js';
import { AuditTrail } from './audit-trail.js';
import type { AlertConfig, WorldKpis } from '@microfirma/contracts';

const kpisBase: WorldKpis = {
  activeRuns: 1,
  costUsdToday: 0,
  budgetUsdToday: 100,
  errorsLast5Min: 0,
  tokensPerMinute: 100,
  pendingApprovals: 0,
};

function configAlerta(overrides: Partial<AlertConfig>): AlertConfig {
  return {
    alertId: 'alert-1',
    tenantId: 't1',
    name: 'Test Alert',
    condition: 'budget_exceeded',
    channel: 'webhook',
    targetUrl: 'http://localhost:9999/hook',
    enabled: true,
    ...overrides,
  };
}

describe('AlertEngine', () => {
  it('nao dispara sem configs', () => {
    const audit = new AuditTrail();
    const engine = new AlertEngine(audit);
    const alertas = engine.avaliar('t1', kpisBase, []);
    expect(alertas).toEqual([]);
  });

  it('dispara quando budget excedido', () => {
    const audit = new AuditTrail();
    const engine = new AlertEngine(audit, { intervaloTicks: 1 });
    engine.configurar(configAlerta({ condition: 'budget_exceeded' }));

    const kpis: WorldKpis = { ...kpisBase, costUsdToday: 150, budgetUsdToday: 100 };
    const alertas = engine.avaliar('t1', kpis, []);
    expect(alertas.length).toBe(1);
    expect(alertas[0]!.condition).toBe('budget_exceeded');
  });

  it('nao dispara quando budget nao excedido', () => {
    const audit = new AuditTrail();
    const engine = new AlertEngine(audit, { intervaloTicks: 1 });
    engine.configurar(configAlerta({ condition: 'budget_exceeded' }));

    const alertas = engine.avaliar('t1', kpisBase, []);
    expect(alertas).toEqual([]);
  });

  it('dispara quando erros > threshold', () => {
    const audit = new AuditTrail();
    const engine = new AlertEngine(audit, { intervaloTicks: 1 });
    engine.configurar(configAlerta({ condition: 'error_rate_high', threshold: 10 }));

    const kpis: WorldKpis = { ...kpisBase, errorsLast5Min: 15 };
    const alertas = engine.avaliar('t1', kpis, []);
    expect(alertas.length).toBe(1);
  });

  it('dispara para aprovacao pendente longa', () => {
    const audit = new AuditTrail();
    const engine = new AlertEngine(audit, { intervaloTicks: 1 });
    engine.configurar(configAlerta({
      condition: 'approval_pending_long',
      windowSeconds: 60,
    }));

    const alertas = engine.avaliar('t1', kpisBase, [
      { agentId: 'a1', waitingSeconds: 90 },
    ]);
    expect(alertas.length).toBe(1);
  });

  it('respeita debounce (nao dispara 2x na janela)', () => {
    const audit = new AuditTrail();
    const engine = new AlertEngine(audit, { intervaloTicks: 1 });
    engine.configurar(configAlerta({
      condition: 'budget_exceeded',
      windowSeconds: 300,
    }));

    const kpis: WorldKpis = { ...kpisBase, costUsdToday: 200, budgetUsdToday: 100 };
    const a1 = engine.avaliar('t1', kpis, []);
    expect(a1.length).toBe(1);
    const a2 = engine.avaliar('t1', kpis, []);
    expect(a2.length).toBe(0); // debounce
  });

  it('nao dispara se config desativada', () => {
    const audit = new AuditTrail();
    const engine = new AlertEngine(audit, { intervaloTicks: 1 });
    engine.configurar(configAlerta({ condition: 'budget_exceeded', enabled: false }));

    const kpis: WorldKpis = { ...kpisBase, costUsdToday: 200, budgetUsdToday: 100 };
    expect(engine.avaliar('t1', kpis, [])).toEqual([]);
  });

  it('remove config', () => {
    const audit = new AuditTrail();
    const engine = new AlertEngine(audit, { intervaloTicks: 1 });
    engine.configurar(configAlerta({ condition: 'budget_exceeded' }));
    engine.remover('alert-1');
    expect(engine.configsDoTenant('t1')).toEqual([]);
  });

  it('respeita intervalo de avaliacao', () => {
    const audit = new AuditTrail();
    const engine = new AlertEngine(audit, { intervaloTicks: 5 });
    engine.configurar(configAlerta({ condition: 'budget_exceeded' }));

    const kpis: WorldKpis = { ...kpisBase, costUsdToday: 200, budgetUsdToday: 100 };
    // Primeiro tick: nao avalia (intervaloTicks=5).
    expect(engine.avaliar('t1', kpis, [])).toEqual([]);
    expect(engine.avaliar('t1', kpis, [])).toEqual([]);
    expect(engine.avaliar('t1', kpis, [])).toEqual([]);
    expect(engine.avaliar('t1', kpis, [])).toEqual([]);
    // Quinto tick: avalia.
    const alertas = engine.avaliar('t1', kpis, []);
    expect(alertas.length).toBe(1);
  });
});

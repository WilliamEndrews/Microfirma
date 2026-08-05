/**
 * Testes do TenantRegistry.
 */

import { describe, it, expect } from 'vitest';
import { TenantRegistry } from './tenant-registry.js';
import { AuditTrail } from './audit-trail.js';
import { AlertEngine } from './alert-engine.js';
import { LIMITES_POR_PLANO } from '@microfirma/contracts';

describe('TenantRegistry', () => {
  function setup() {
    const audit = new AuditTrail();
    const alertEngine = new AlertEngine(audit);
    const registry = new TenantRegistry(audit, alertEngine);
    return { registry, audit, alertEngine };
  }

  it('cria tenant com sessao ativa', () => {
    const { registry } = setup();
    const tenant = registry.criar({ displayName: 'Acme Corp', plano: 'pro', seed: 42 });
    expect(tenant.tenantId).toBeTruthy();
    expect(tenant.displayName).toBe('Acme Corp');
    expect(tenant.plano).toBe('pro');
    expect(tenant.active).toBe(true);

    const entry = registry.obter(tenant.tenantId);
    expect(entry).not.toBeNull();
    expect(entry!.sessao.seed).toBe(42);
  });

  it('cria tenant com plano free por default', () => {
    const { registry } = setup();
    const tenant = registry.criar({ displayName: 'Free Co' });
    expect(tenant.plano).toBe('free');
  });

  it('lista tenants criados', () => {
    const { registry } = setup();
    registry.criar({ displayName: 'A' });
    registry.criar({ displayName: 'B' });
    expect(registry.listar().length).toBe(2);
  });

  it('obter retorna null para tenant inexistente', () => {
    const { registry } = setup();
    expect(registry.obter('inexistente')).toBeNull();
  });

  it('remove tenant', () => {
    const { registry } = setup();
    const tenant = registry.criar({ displayName: 'X' });
    expect(registry.remover(tenant.tenantId)).toBe(true);
    expect(registry.obter(tenant.tenantId)).toBeNull();
  });

  it('remover tenant inexistente retorna false', () => {
    const { registry } = setup();
    expect(registry.remover('inexistente')).toBe(false);
  });

  it('atualiza plano', () => {
    const { registry } = setup();
    const tenant = registry.criar({ displayName: 'X', plano: 'free' });
    const atualizado = registry.atualizarPlano(tenant.tenantId, 'enterprise');
    expect(atualizado?.plano).toBe('enterprise');
  });

  it('limitesDoTenant retorna limites do plano', () => {
    const { registry } = setup();
    const tenant = registry.criar({ displayName: 'X', plano: 'pro' });
    const limites = registry.limitesDoTenant(tenant.tenantId);
    expect(limites).toEqual(LIMITES_POR_PLANO.pro);
  });

  it('limitesDoTenant retorna null para inexistente', () => {
    const { registry } = setup();
    expect(registry.limitesDoTenant('inexistente')).toBeNull();
  });

  it('sessoesAtivas itera sobre tenants ativos', () => {
    const { registry } = setup();
    registry.criar({ displayName: 'A', seed: 1 });
    registry.criar({ displayName: 'B', seed: 2 });
    const ativas = [...registry.sessoesAtivas()];
    expect(ativas.length).toBe(2);
  });

  it('configurarAlerta delega para AlertEngine', () => {
    const { registry, alertEngine } = setup();
    const tenant = registry.criar({ displayName: 'X' });
    registry.configurarAlerta({
      alertId: 'a1',
      tenantId: tenant.tenantId,
      name: 'Test',
      condition: 'budget_exceeded',
      channel: 'webhook',
      targetUrl: 'http://localhost:9999/hook',
      enabled: true,
    });
    expect(alertEngine.configsDoTenant(tenant.tenantId).length).toBe(1);
  });

  it('registra tenant.created no audit trail', () => {
    const { registry, audit } = setup();
    registry.criar({ displayName: 'X' });
    expect(audit.total).toBe(1);
  });

  it('cria tenant com OTLP ingestor quando otlpEndpoint fornecido', () => {
    const { registry } = setup();
    const tenant = registry.criar({ displayName: 'OTLP Co', otlpEndpoint: 'http://localhost:4318' });
    const ingestor = registry.ingestorDoTenant(tenant.tenantId);
    expect(ingestor).not.toBeNull();
  });

  it('nao cria ingestor sem otlpEndpoint', () => {
    const { registry } = setup();
    const tenant = registry.criar({ displayName: 'No OTLP' });
    expect(registry.ingestorDoTenant(tenant.tenantId)).toBeNull();
  });

  it('simular retorna snapshot e kpis para um cenario what-if', () => {
    const { registry } = setup();
    const tenant = registry.criar({ displayName: 'Sim Co', seed: 123 });
    const resultado = registry.simular(tenant.tenantId, 2000, 2);
    expect(resultado).not.toBeNull();
    expect(resultado!.ticks).toBeGreaterThanOrEqual(20);
    expect(resultado!.tMundoMs).toBeGreaterThanOrEqual(2000);
    expect(resultado!.snapshot.kpis).toBeDefined();
  });

  it('simular retorna null para tenant inexistente', () => {
    const { registry } = setup();
    expect(registry.simular('inexistente', 1000, 1)).toBeNull();
  });
});

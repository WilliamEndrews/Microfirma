/**
 * Teste de carga do SimFirma.
 *
 * Verifica que `TenantRegistry.simular` consegue executar um cenario de alta
 * carga (50x) dentro de um tempo razoavel. Se o tempo estourar, indica
 * gargalo no WorldEngine ou no SyntheticStream.
 */

import { describe, it, expect } from 'vitest';
import { AuditTrail } from './audit-trail.js';
import { AlertEngine } from './alert-engine.js';
import { TenantRegistry } from './tenant-registry.js';

describe('carga SimFirma', () => {
  it('simula 10000ms a 50x em menos de 5s', () => {
    const audit = new AuditTrail();
    const alertEngine = new AlertEngine(audit);
    const registry = new TenantRegistry(audit, alertEngine);
    const tenant = registry.criar({ displayName: 'Carga' });

    const inicio = performance.now();
    const resultado = registry.simular(tenant.tenantId, 10000, 50);
    const duracao = performance.now() - inicio;

    expect(resultado).not.toBeNull();
    expect(resultado!.ticks).toBeGreaterThan(0);
    expect(resultado!.tMundoMs).toBeGreaterThan(0);
    expect(duracao).toBeLessThan(5000);
  });
});

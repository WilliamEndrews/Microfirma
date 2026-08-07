/**
 * Testes do registro de metricas Prometheus.
 */

import { describe, it, expect } from 'vitest';
import { MetricsRegistry } from './metrics.js';

describe('MetricsRegistry', () => {
  it('expor metricas em formato Prometheus', () => {
    const m = new MetricsRegistry();
    m.inc('microfirma_requests_total', { method: 'GET', route: '/health' }, 1, 'Requisicoes');
    m.inc('microfirma_requests_total', { method: 'GET', route: '/health' }, 1);
    m.set('microfirma_active_tenants', {}, 3, 'Ativos');

    const texto = m.expose();

    expect(texto).toContain('# HELP microfirma_requests_total Requisicoes');
    expect(texto).toContain('# TYPE microfirma_requests_total counter');
    expect(texto).toContain('microfirma_requests_total{method="GET",route="/health"} 2');
    expect(texto).toContain('microfirma_active_tenants{} 3');
  });

  it('escapa aspas em labels', () => {
    const m = new MetricsRegistry();
    m.inc('x', { route: '/path"with"quotes' }, 1);
    expect(m.expose()).toContain('route="/path\\"with\\"quotes"');
  });
});

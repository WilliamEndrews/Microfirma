/**
 * Teste end-to-end OTLP: span real -> OtlpIngestor -> OfficeSession -> snapshot.
 *
 * Verifica que um span OTLP no formato JSON eh traduzido em eventos de dominio,
 * ingerido pela sessao e refletido no estado do mundo (agente descoberto + KPI).
 */

import { describe, it, expect } from 'vitest';
import { OtlpIngestor } from '@microfirma/world-engine';
import type { OtlpExportRequest, OtlpSpan } from '@microfirma/contracts';
import { OfficeSession } from './office-session.js';

function spanOtlp(name: string, attrs: Record<string, unknown> = {}): OtlpSpan {
  return {
    traceId: 'abcdef0123456789abcdef0123456789',
    spanId: '1234567890abcdef',
    name,
    startTimeUnixNano: '1700000000000000000',
    endTimeUnixNano: '1700000005000000000',
    attributes: Object.entries(attrs).map(([key, value]) => ({
      key,
      value:
        typeof value === 'string'
          ? { stringValue: value }
          : typeof value === 'number'
            ? Number.isInteger(value)
              ? { intValue: String(value) }
              : { doubleValue: value }
            : { stringValue: String(value) },
    })),
    status: { code: 1 },
  };
}

function loteOtlp(name: string, attrs: Record<string, unknown> = {}): OtlpExportRequest {
  return {
    resourceSpans: [{
      scopeSpans: [{
        spans: [spanOtlp(name, attrs)],
      }],
    }],
  };
}

describe('OTLP end-to-end', () => {
  it('ingere span de agente e o mundo reflete run ativa', () => {
    const tenantId = 'tenant-otlp-e2e';
    const ingestor = new OtlpIngestor({ tenantId });
    const sessao = new OfficeSession({
      tenantId,
      seed: 42,
      fonteEventos: ingestor,
      tickMs: 100,
      keyframeEveryTicks: 1000,
    });

    const inseridos = ingestor.ingerir(loteOtlp('atender-ticket', {
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': 'gpt-4o-mini',
      'gen_ai.usage.input_tokens': 1200,
      'gen_ai.usage.output_tokens': 350,
      'gen_ai.usage.cost': 0.0042,
    }));

    expect(inseridos).toBeGreaterThan(0);

    sessao.tick();
    const snap = sessao.snapshot();

    expect(snap.actors.some((a) => a.agentId !== 'microfirma-placeholder')).toBe(true);
    expect(snap.kpis.costUsdToday).toBeGreaterThan(0);
  });
});

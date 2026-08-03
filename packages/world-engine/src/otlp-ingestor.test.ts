/**
 * Testes do OtlpIngestor - buffer, deduplicacao e descoberta de agentes.
 */

import { describe, it, expect } from 'vitest';
import { OtlpIngestor } from './otlp-ingestor.js';
import type { OtlpExportRequest } from '@microfirma/contracts';

function loteComSpan(attrs: Record<string, unknown>, traceId = 'abc123'): OtlpExportRequest {
  return {
    resourceSpans: [
      {
        scopeSpans: [
          {
            spans: [
              {
                traceId,
                spanId: 'span001',
                name: 'gen_ai.chat',
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
                        : typeof value === 'boolean'
                          ? { boolValue: value }
                          : { stringValue: String(value) },
                })),
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('OtlpIngestor', () => {
  it('ingerir lote gera eventos no buffer', () => {
    const ing = new OtlpIngestor();
    const n = ing.ingerir(loteComSpan({ 'gen_ai.operation.name': 'chat' }));
    expect(n).toBeGreaterThan(0);
    expect(ing.pendentes).toBeGreaterThan(0);
  });

  it('poll devolve e limpa o buffer', () => {
    const ing = new OtlpIngestor();
    ing.ingerir(loteComSpan({ 'gen_ai.operation.name': 'chat' }));
    const eventos = ing.poll(100);
    expect(eventos.length).toBeGreaterThan(0);
    expect(ing.pendentes).toBe(0);
  });

  it('deduplicacao: mesmo eventId nao gera evento duplicado', () => {
    const ing = new OtlpIngestor();
    const lote = loteComSpan({ 'gen_ai.operation.name': 'chat' });
    ing.ingerir(lote);
    const n1 = ing.poll(100).length;
    ing.ingerir(lote); // mesmo span, mesmo eventId
    const n2 = ing.poll(100).length;
    expect(n2).toBe(0);
    expect(n1).toBeGreaterThan(0);
  });

  it('agent.discovered so emitido uma vez por agente', () => {
    const ing = new OtlpIngestor();
    const attrs = {
      'gen_ai.operation.name': 'chat',
      'gen_ai.agent.name': 'Triagem',
      'gen_ai.agent.id': 'agent-triagem',
    };
    ing.ingerir(loteComSpan(attrs, 'trace-1'));
    ing.poll(100);
    ing.ingerir(loteComSpan(attrs, 'trace-2')); // outro trace, mesmo agente
    const eventos = ing.poll(100);
    const discovers = eventos.filter((e) => e.type === 'agent.discovered');
    expect(discovers).toHaveLength(0); // ja foi descoberto
  });

  it('redescobrirAgentes=true reemite agent.discovered', () => {
    const ing = new OtlpIngestor({ redescobrirAgentes: true });
    const attrs = {
      'gen_ai.operation.name': 'chat',
      'gen_ai.agent.name': 'Triagem',
      'gen_ai.agent.id': 'agent-triagem',
    };
    ing.ingerir(loteComSpan(attrs, 'trace-1'));
    ing.poll(100);
    ing.ingerir(loteComSpan(attrs, 'trace-2'));
    const eventos = ing.poll(100);
    const discovers = eventos.filter((e) => e.type === 'agent.discovered');
    expect(discovers.length).toBeGreaterThan(0);
  });

  it('agents retorna AgentDescriptor[] dos descobertos', () => {
    const ing = new OtlpIngestor();
    ing.ingerir(
      loteComSpan({
        'gen_ai.operation.name': 'chat',
        'gen_ai.agent.name': 'Pesquisa',
        'gen_ai.agent.id': 'agent-pesquisa',
      }),
    );
    expect(ing.agents.length).toBe(1);
    expect(ing.agents[0]?.agentId).toBe('agent-pesquisa');
    expect(ing.agents[0]?.displayName).toBe('Pesquisa');
  });

  it('estatisticas acumulam corretamente', () => {
    const ing = new OtlpIngestor();
    ing.ingerir(loteComSpan({ 'gen_ai.operation.name': 'chat' }, 't1'));
    ing.ingerir(loteComSpan({ 'gen_ai.operation.name': 'chat' }, 't2'));
    const stats = ing.estatisticas;
    expect(stats.spansRecebidos).toBe(2);
    expect(stats.eventosGerados).toBeGreaterThan(0);
  });

  it('reset limpa todo o estado', () => {
    const ing = new OtlpIngestor();
    ing.ingerir(loteComSpan({ 'gen_ai.operation.name': 'chat' }));
    ing.poll(100);
    ing.reset();
    expect(ing.pendentes).toBe(0);
    expect(ing.agents).toHaveLength(0);
    expect(ing.estatisticas.spansRecebidos).toBe(0);
  });

  it('buffer ordenado por tsReal apos ingerir lotes fora de ordem', () => {
    const ing = new OtlpIngestor();
    // Lote com timestamp maior primeiro
    ing.ingerir({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'late',
                  spanId: 's1',
                  name: 'run',
                  startTimeUnixNano: '1700000010000000000',
                  endTimeUnixNano: '1700000015000000000',
                },
              ],
            },
          ],
        },
      ],
    });
    // Lote com timestamp menor depois
    ing.ingerir({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'early',
                  spanId: 's2',
                  name: 'run',
                  startTimeUnixNano: '1700000000000000000',
                  endTimeUnixNano: '1700000005000000000',
                },
              ],
            },
          ],
        },
      ],
    });
    const eventos = ing.poll(100);
    // O primeiro evento deve ter tsReal menor (do span 'early')
    expect(eventos[0]!.tsReal).toBeLessThanOrEqual(eventos[eventos.length - 1]!.tsReal);
  });
});

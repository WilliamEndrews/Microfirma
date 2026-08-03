/**
 * Testes do adaptador OTLP -> DomainEvent.
 *
 * Cada teste envia um span OTLP sintetico (no formato JSON que o receptor
 * recebe) e verifica que os DomainEvents corretos sao gerados. Os spans
 * seguem a semantica GenAI do OpenTelemetry (gen_ai.* attributes).
 */

import { describe, it, expect } from 'vitest';
import {
  traduzirSpan,
  traduzirLoteOtlp,
  type OtlpSpan,
  type OtlpExportRequest,
} from './otlp.js';

/** Helper: cria um span OTLP minimo com atributos GenAI. */
function span(opts: {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attrs?: Record<string, unknown>;
  statusCode?: number;
}): OtlpSpan {
  return {
    traceId: opts.traceId ?? 'abcdef0123456789abcdef0123456789',
    spanId: opts.spanId ?? '1234567890abcdef',
    parentSpanId: opts.parentSpanId,
    name: opts.name ?? 'gen_ai.chat',
    startTimeUnixNano: opts.startTimeUnixNano ?? '1700000000000000000',
    endTimeUnixNano: opts.endTimeUnixNano ?? '1700000005000000000',
    attributes: Object.entries(opts.attrs ?? {}).map(([key, value]) => ({
      key,
      value: typeof value === 'string'
        ? { stringValue: value }
        : typeof value === 'number'
          ? Number.isInteger(value)
            ? { intValue: String(value) }
            : { doubleValue: value }
          : typeof value === 'boolean'
            ? { boolValue: value }
            : { stringValue: String(value) },
    })),
    status: opts.statusCode !== undefined ? { code: opts.statusCode } : undefined,
  };
}

describe('traduzirSpan', () => {
  it('span raiz gera run.started + run.finished', () => {
    const s = span({ name: 'agent-run' });
    const eventos = traduzirSpan(s);
    const tipos = eventos.map((e) => e.type);
    expect(tipos).toContain('run.started');
    expect(tipos).toContain('run.finished');
  });

  it('span filho nao gera run.started', () => {
    const s = span({ name: 'gen_ai.chat', parentSpanId: 'aabbccdd' });
    const eventos = traduzirSpan(s);
    const tipos = eventos.map((e) => e.type);
    expect(tipos).not.toContain('run.started');
    expect(tipos).not.toContain('run.finished');
  });

  it('span com gen_ai.operation.name=chat gera llm.completed', () => {
    const s = span({
      name: 'gen_ai.chat',
      attrs: {
        'gen_ai.operation.name': 'chat',
        'gen_ai.request.model': 'gpt-4o-mini',
        'gen_ai.usage.input_tokens': 1200,
        'gen_ai.usage.output_tokens': 350,
        'gen_ai.usage.cost': 0.0042,
      },
    });
    const eventos = traduzirSpan(s);
    const llm = eventos.find((e) => e.type === 'llm.completed');
    expect(llm).toBeDefined();
    if (llm && llm.type === 'llm.completed') {
      expect(llm.model).toBe('gpt-4o-mini');
      expect(llm.inputTokens).toBe(1200);
      expect(llm.outputTokens).toBe(350);
      expect(llm.costUsd).toBeCloseTo(0.0042);
      expect(llm.latencyMs).toBe(5000);
    }
  });

  it('span com gen_ai.operation.name=tool gera tool.called', () => {
    const s = span({
      name: 'gen_ai.tool',
      attrs: {
        'gen_ai.operation.name': 'tool',
        'gen_ai.tool.name': 'buscar_crm',
      },
    });
    const eventos = traduzirSpan(s);
    const tool = eventos.find((e) => e.type === 'tool.called');
    expect(tool).toBeDefined();
    if (tool && tool.type === 'tool.called') {
      expect(tool.toolName).toBe('buscar_crm');
      expect(tool.ok).toBe(true);
    }
  });

  it('span com erro gera error.raised', () => {
    const s = span({
      name: 'gen_ai.chat',
      attrs: {
        'gen_ai.operation.name': 'chat',
        'error.type': 'rate_limit',
      },
      statusCode: 2,
    });
    const eventos = traduzirSpan(s);
    const err = eventos.find((e) => e.type === 'error.raised');
    expect(err).toBeDefined();
    if (err && err.type === 'error.raised') {
      expect(err.kind).toBe('rate_limit');
      expect(err.severity).toBe('warning');
    }
  });

  it('span com human_approval.required gera approval.requested', () => {
    const s = span({
      name: 'agent-approval',
      attrs: {
        'human_approval.required': true,
        'human_approval.id': 'appr-123',
        'human_approval.question': 'Posso executar esta acao?',
      },
    });
    const eventos = traduzirSpan(s);
    const appr = eventos.find((e) => e.type === 'approval.requested');
    expect(appr).toBeDefined();
    if (appr && appr.type === 'approval.requested') {
      expect(appr.approvalId).toBe('appr-123');
      expect(appr.question).toBe('Posso executar esta acao?');
    }
  });

  it('span com queue.depth gera queue.observed', () => {
    const s = span({
      name: 'queue-check',
      attrs: { 'queue.depth': 15 },
    });
    const eventos = traduzirSpan(s);
    const q = eventos.find((e) => e.type === 'queue.observed');
    expect(q).toBeDefined();
    if (q && q.type === 'queue.observed') {
      expect(q.depth).toBe(15);
    }
  });

  it('span com gen_ai.agent.name gera agent.discovered', () => {
    const s = span({
      name: 'agent-run',
      attrs: {
        'gen_ai.agent.name': 'Triagem',
        'gen_ai.agent.id': 'agent-triagem',
      },
    });
    const eventos = traduzirSpan(s);
    const disc = eventos.find((e) => e.type === 'agent.discovered');
    expect(disc).toBeDefined();
    if (disc && disc.type === 'agent.discovered') {
      expect(disc.agent.agentId).toBe('agent-triagem');
      expect(disc.agent.displayName).toBe('Triagem');
      expect(disc.agent.discoveredVia).toBe('otel');
    }
  });

  it('span sem semantica GenAI so gera run.started/finished se raiz', () => {
    const s = span({ name: 'http-request', parentSpanId: 'parent' });
    const eventos = traduzirSpan(s);
    expect(eventos).toHaveLength(0);
  });

  it('todos os eventos tem eventId, tenantId e tsReal', () => {
    const s = span({
      name: 'gen_ai.chat',
      attrs: { 'gen_ai.operation.name': 'chat' },
    });
    const eventos = traduzirSpan(s, {}, 'tenant-test');
    for (const e of eventos) {
      expect(e.eventId).toBeTruthy();
      expect(e.tenantId).toBe('tenant-test');
      expect(e.tsReal).toBeGreaterThan(0);
    }
  });

  it('classificacao de erro: timeout', () => {
    const s = span({
      name: 'gen_ai.chat',
      attrs: {
        'gen_ai.operation.name': 'chat',
        'exception.message': 'Request timed out after 30s',
      },
      statusCode: 2,
    });
    const eventos = traduzirSpan(s);
    const err = eventos.find((e) => e.type === 'error.raised');
    expect(err).toBeDefined();
    if (err && err.type === 'error.raised') {
      expect(err.kind).toBe('timeout');
      expect(err.severity).toBe('warning');
    }
  });

  it('classificacao de erro: guardrail = critical', () => {
    const s = span({
      name: 'gen_ai.chat',
      attrs: {
        'gen_ai.operation.name': 'chat',
        'exception.message': 'Guardrail policy violation detected',
      },
      statusCode: 2,
    });
    const eventos = traduzirSpan(s);
    const err = eventos.find((e) => e.type === 'error.raised');
    if (err && err.type === 'error.raised') {
      expect(err.severity).toBe('critical');
    }
  });
});

describe('traduzirLoteOtlp', () => {
  it('lote vazio devolve array vazio', () => {
    expect(traduzirLoteOtlp({})).toEqual([]);
    expect(traduzirLoteOtlp({ resourceSpans: [] })).toEqual([]);
  });

  it('lote com resource attributes injeta contexto no span', () => {
    const lote: OtlpExportRequest = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'telemetry.sdk.name', value: { stringValue: 'langgraph' } },
            ],
          },
          scopeSpans: [
            {
              spans: [
                span({
                  name: 'agent-run',
                  attrs: { 'gen_ai.agent.name': 'Maestro' },
                }),
              ],
            },
          ],
        },
      ],
    };
    const eventos = traduzirLoteOtlp(lote);
    const disc = eventos.find((e) => e.type === 'agent.discovered');
    expect(disc).toBeDefined();
    if (disc && disc.type === 'agent.discovered') {
      expect(disc.agent.framework).toBe('langgraph');
    }
  });

  it('span que quebra o adaptador nao derruba o lote', () => {
    const lote: OtlpExportRequest = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                // Span malformado: startTimeUnixNano invalido
                { ...span({}), startTimeUnixNano: 'not-a-number' },
                // Span bom
                span({ name: 'gen_ai.chat', attrs: { 'gen_ai.operation.name': 'chat' } }),
              ],
            },
          ],
        },
      ],
    };
    const eventos = traduzirLoteOtlp(lote);
    // O span bom ainda deve gerar eventos, mesmo que o malformado quebre.
    expect(eventos.length).toBeGreaterThan(0);
  });
});

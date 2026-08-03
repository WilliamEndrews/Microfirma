/**
 * CONTRATO 5 - ADAPTADOR OTLP -> DOMAIN EVENT
 *
 * O OpenTelemetry e o padrao de fato para telemetria de sistemas agenticos.
 * SDKs de LangChain, CrewAI, OpenAI, etc. ja emitem spans OTel GenAI. Mas
 * spans NAO sao eventos de dominio - sao arvores de intervalos com atributos
 * semi-estruturados. A traducao precisa ser explicita e testavel.
 *
 * Este arquivo define:
 *
 *   1. `OtlpSpan` - a forma de um span OTLP/JSON como chega pela rede. Nao e
 *      o schema protobuf completo (isso seria 5000 linhas geradas); e a
 *      superficie que importa para a MicroFirma, com os atributos GenAI
 *      semanticos que os SDKs ja emitem.
 *
 *   2. `traduzirSpan` - funcao pura que recebe um span e devolve zero ou mais
 *      DomainEvents. Zero quando o span nao tem semantica agentic (ex.: span
 *      de infra). Mais de um quando o span carrega informacao composta.
 *
 *   3. `traduzirLoteOtlp` - aplica `traduzirSpan` a um lote (ExportTraceServiceRequest
 *      em JSON), coletando todos os eventos. Esta e a funcao que o endpoint
 *      OTLP chama.
 *
 * PRINCIPIO: o adaptador e uma BORDA. Ele desconfia de tudo: atributos
 * ausentes, tipos errados, base64 onde esperava string, timestamps em
 * nanossegundos. Se um span nao tem o minimo para ser um evento util, ele e
 * silenciosamente descartado (log em debug, nao excecao). Um span malformado
 * de um agente nao pode derrubar o ingest de todos os outros.
 */

import type { DomainEvent } from './domain-events.js';

// ---------------------------------------------------------------------------
// TIPO DO SPAN OTLP (superficie relevante)
// ---------------------------------------------------------------------------

/**
 * Atributos semânticos GenAI do OpenTelemetry.
 * Referencia: opentelemetry.io/docs/specs/semconv/gen-ai/
 *
 * Nao sao todos obrigatorios. A presenca/ausencia determina qual DomainEvent
 * o span gera (ou se gera algum).
 */
export interface GenAiAttributes {
  /** "chat" | "generate" | "tool" - tipo de operacao GenAI. */
  'gen_ai.operation.name'?: string;
  /** Nome do modelo: "gpt-4o-mini", "claude-3-haiku", ... */
  'gen_ai.request.model'?: string;
  /** Tokens de entrada reportados pelo provedor. */
  'gen_ai.usage.input_tokens'?: number;
  /** Tokens de saida reportados pelo provedor. */
  'gen_ai.usage.output_tokens'?: number;
  /** Custo em USD, quando o SDK calcula (LangChain, Langfuse). */
  'gen_ai.usage.cost'?: number;
  /** Nome da ferramenta quando operation = tool. */
  'gen_ai.tool.name'?: string;
  /** Nome do agente/framework: "langgraph", "crewai", ... */
  'gen_ai.agent.name'?: string;
  /** Papel funcional quando detectado pelo SDK. */
  'gen_ai.agent.role'?: string;
  /** ID do agente quando o SDK atribui um estavel. */
  'gen_ai.agent.id'?: string;
}

/**
 * Atributos de erro/severidade. Spans de erro geram `error.raised`.
 */
export interface ErrorAttributes {
  'error.type'?: string;
  'exception.type'?: string;
  'exception.message'?: string;
}

/**
 * Atributos de fila/backpressure. Nem todos os SDKs emitem, mas quando
 * presente, gera `queue.observed`.
 */
export interface QueueAttributes {
  'queue.depth'?: number;
  'queue.name'?: string;
}

/**
 * Atributos de aprovacao humana (human-in-the-loop).
 * LangGraph e CrewAI emitem quando o agente pausa para revisao.
 */
export interface ApprovalAttributes {
  'human_approval.id'?: string;
  'human_approval.question'?: string;
  'human_approval.required'?: boolean;
}

/** Union dos atributos que o adaptador conhece. Atributos desconhecidos sao ignorados. */
export type SpanAttributes = GenAiAttributes & ErrorAttributes & QueueAttributes & ApprovalAttributes & Record<string, unknown>;

/** Status de um span OTLP. */
interface SpanStatus {
  code?: number; // 0 = UNSET, 1 = OK, 2 = ERROR
  message?: string;
}

/** Um span OTLP individual, na forma JSON que chega do receptor. */
export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: number; // 0 = INTERNAL, 1 = SERVER, 2 = CLIENT, 3 = PRODUCER, 4 = CONSUMER
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes?: Array<{ key: string; value: { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean } }>;
  status?: SpanStatus;
  /** Resource attributes do recurso pai (service.name, etc.) - achatados pelo receptor. */
  resourceAttributes?: Array<{ key: string; value: { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean } }>;
}

/** Um lote de spans OTLP (ExportTraceServiceRequest em JSON). */
export interface OtlpExportRequest {
  resourceSpans?: Array<{
    resource?: { attributes?: Array<{ key: string; value: { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean } }> };
    scopeSpans?: Array<{
      spans?: OtlpSpan[];
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// UTILITARIOS INTERNOS
// ---------------------------------------------------------------------------

/**
 * Converte um array de atributos OTLP (key/value aninhado) num Record plano.
 * OTLP codifica inteiros como string (proto JSON) - converte de volta.
 */
function achatarAtributos(attrs: Array<{ key: string; value: { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean } }> | undefined): Record<string, unknown> {
  if (!attrs) return {};
  const out: Record<string, unknown> = {};
  for (const { key, value } of attrs) {
    if (value.stringValue !== undefined) out[key] = value.stringValue;
    else if (value.intValue !== undefined) out[key] = Number(value.intValue);
    else if (value.doubleValue !== undefined) out[key] = value.doubleValue;
    else if (value.boolValue !== undefined) out[key] = value.boolValue;
  }
  return out;
}

/** Converte nanossegundos (string, proto JSON) para milissegundos (number). */
function nanoParaMs(nano: string): number {
  return Math.floor(Number(nano) / 1_000_000);
}

/** Duracao em ms a partir de start/end em nanossegundos. */
function duracaoMs(inicioNano: string, fimNano: string): number {
  return Math.max(0, Math.floor((Number(fimNano) - Number(inicioNano)) / 1_000_000));
}

/** Deriva um agentId estavel quando o SDK nao fornece um explicito. */
function derivarAgentId(attrs: SpanAttributes, traceId: string, spanName: string): string {
  if (attrs['gen_ai.agent.id']) return String(attrs['gen_ai.agent.id']);
  if (attrs['gen_ai.agent.name']) return `agent-${String(attrs['gen_ai.agent.name']).toLowerCase().replace(/\s+/g, '-')}`;
  // Sem ID nem nome: usa o traceId raiz como identificador. Nao e ideal (um
  // trace pode ter multiplos agentes), mas e deterministico e nao colide.
  return `agent-${traceId.slice(0, 8)}`;
}

/** Deriva um displayName legivel. */
function derivarDisplayName(attrs: SpanAttributes, spanName: string): string {
  if (attrs['gen_ai.agent.name']) return String(attrs['gen_ai.agent.name']);
  // Fallback: o nome do span, limpo. "chat gpt-4o-mini" -> "Chat gpt-4o-mini".
  return spanName.replace(/^gen_ai\./, '').replace(/_/g, ' ');
}

/** Detecta o framework a partir de atributos do resource ou do span. */
function detectarFramework(attrs: SpanAttributes, resourceAttrs: Record<string, unknown>): string {
  if (attrs['gen_ai.agent.name']) {
    const nome = String(attrs['gen_ai.agent.name']).toLowerCase();
    if (nome.includes('langgraph')) return 'langgraph';
    if (nome.includes('crewai')) return 'crewai';
    if (nome.includes('autogen')) return 'autogen';
  }
  const telemetrySdk = resourceAttrs['telemetry.sdk.name'];
  if (telemetrySdk) return String(telemetrySdk);
  const scope = resourceAttrs['telemetry.sdk.language'];
  if (scope) return String(scope);
  return 'unknown';
}

/** Detecta o papel funcional do agente. */
function detectarRole(attrs: SpanAttributes): string {
  if (attrs['gen_ai.agent.role']) return String(attrs['gen_ai.agent.role']);
  // Heuristica pelo nome do agente: convencao comum nos SDKs.
  const nome = String(attrs['gen_ai.agent.name'] ?? '').toLowerCase();
  if (nome.includes('orchestr') || nome.includes('supervis') || nome.includes('router') || nome.includes('maestro')) return 'orchestrator';
  if (nome.includes('research') || nome.includes('search') || nome.includes('triag')) return 'researcher';
  if (nome.includes('analys') || nome.includes('analist')) return 'analyst';
  if (nome.includes('support') || nome.includes('help') || nome.includes('attend')) return 'support';
  if (nome.includes('engin') || nome.includes('code') || nome.includes('develop')) return 'engineer';
  if (nome.includes('financ') || nome.includes('fiscal') || nome.includes('audit')) return 'finance';
  if (nome.includes('review') || nome.includes('guard') || nome.includes('valid')) return 'guardian';
  return 'unknown';
}

/** Hash deterministico de string para inteiros (avatarSeed). */
function hashParaInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Mapeia o codigo de status do span para status de RunFinished. */
function statusDoSpan(code: number | undefined, hasError: boolean): 'ok' | 'error' | 'timeout' | 'cancelled' {
  if (code === 2) {
    // ERROR: tenta distinguir timeout de erro generico pelo nome do atributo.
    return 'error';
  }
  if (hasError) return 'error';
  return 'ok';
}

/** Classifica o tipo de erro para ErrorRaised.kind. */
function classificarErro(attrs: SpanAttributes): string {
  if (attrs['error.type']) return String(attrs['error.type']);
  if (attrs['exception.type']) return String(attrs['exception.type']);
  // Heuristica pela mensagem.
  const msg = String(attrs['exception.message'] ?? '').toLowerCase();
  if (msg.includes('rate_limit') || msg.includes('rate limit') || msg.includes('429')) return 'rate_limit';
  if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
  if (msg.includes('5xx') || msg.includes('500') || msg.includes('502') || msg.includes('503')) return 'http_5xx';
  if (msg.includes('tool') || msg.includes('function')) return 'tool_failure';
  if (msg.includes('guardrail') || msg.includes('policy')) return 'guardrail';
  return 'unknown';
}

/** Determina severidade do erro. */
function severidadeDoErro(attrs: SpanAttributes): 'warning' | 'error' | 'critical' {
  const kind = classificarErro(attrs);
  if (kind === 'rate_limit' || kind === 'timeout') return 'warning';
  if (kind === 'guardrail') return 'critical';
  return 'error';
}

// ---------------------------------------------------------------------------
// TRADUCAO PRINCIPAL
// ---------------------------------------------------------------------------

/**
 * Traduz um span OTLP em zero ou mais DomainEvents.
 *
 * A logica de "qual evento gerar" segue a semantica GenAI do OpenTelemetry:
 *
 *   - Span raiz (sem parent) com operation GenAI -> `run.started` + `run.finished`
 *     (se ja tiver end time) + `agent.discovered` (na primeira vez).
 *   - Span com operation = "chat" ou "generate" -> `llm.completed`.
 *   - Span com operation = "tool" -> `tool.called`.
 *   - Span com status ERROR -> `error.raised`.
 *   - Span com human_approval.required = true -> `approval.requested`.
 *   - Span com queue.depth -> `queue.observed`.
 *
 * Um unico span pode gerar multiplos eventos (ex.: um span de LLM que tambem
 * teve erro gera `llm.completed` E `error.raised`).
 */
export function traduzirSpan(span: OtlpSpan, resourceAttrs: Record<string, unknown> = {}, tenantId = 'default'): DomainEvent[] {
  const attrs = achatarAtributos(span.attributes) as SpanAttributes;
  const resAttrs = resourceAttrs;
  const eventos: DomainEvent[] = [];

  const traceId = span.traceId;
  const spanId = span.spanId;
  const tsReal = nanoParaMs(span.startTimeUnixNano);
  const duracao = duracaoMs(span.startTimeUnixNano, span.endTimeUnixNano);
  const agentId = derivarAgentId(attrs, traceId, span.name);
  const hasError = span.status?.code === 2 || !!attrs['error.type'] || !!attrs['exception.type'];
  const op = attrs['gen_ai.operation.name'];

  // --- agent.discovered (sempre que ha nome/role do agente) ---
  if (attrs['gen_ai.agent.name'] || attrs['gen_ai.agent.id']) {
    eventos.push({
      type: 'agent.discovered',
      eventId: `${traceId}:${spanId}:discover`,
      tenantId,
      tsReal,
      traceId,
      agent: {
        agentId,
        displayName: derivarDisplayName(attrs, span.name),
        role: detectarRole(attrs) as 'orchestrator' | 'researcher' | 'analyst' | 'support' | 'engineer' | 'finance' | 'guardian' | 'unknown',
        framework: detectarFramework(attrs, resAttrs),
        primaryModel: attrs['gen_ai.request.model'] as string | undefined,
        discoveredVia: 'otel',
        avatarSeed: hashParaInt(agentId),
      },
    });
  }

  // --- run.started / run.finished (span raiz, sem parentSpanId) ---
  if (!span.parentSpanId) {
    const runId = traceId; // trace raiz = run
    eventos.push({
      type: 'run.started',
      eventId: `${traceId}:${spanId}:run-start`,
      tenantId,
      tsReal,
      traceId,
      agentId,
      runId,
      label: span.name,
    });
    // Se o span ja tem end time (ja terminou), emite run.finished tambem.
    // OTLP/HTTP envia spans ja encerrados - nao existe "span aberto" neste protocolo.
    if (span.endTimeUnixNano && Number(span.endTimeUnixNano) > 0) {
      eventos.push({
        type: 'run.finished',
        eventId: `${traceId}:${spanId}:run-end`,
        tenantId,
        tsReal: nanoParaMs(span.endTimeUnixNano),
        traceId,
        agentId,
        runId,
        status: statusDoSpan(span.status?.code, hasError),
        durationMs: duracao,
      });
    }
  }

  // --- llm.completed (operation = chat ou generate) ---
  if (op === 'chat' || op === 'generate') {
    const inputTokens = Number(attrs['gen_ai.usage.input_tokens'] ?? 0);
    const outputTokens = Number(attrs['gen_ai.usage.output_tokens'] ?? 0);
    const costUsd = Number(attrs['gen_ai.usage.cost'] ?? 0);
    const model = String(attrs['gen_ai.request.model'] ?? 'unknown');
    eventos.push({
      type: 'llm.completed',
      eventId: `${traceId}:${spanId}:llm`,
      tenantId,
      tsReal,
      traceId,
      agentId,
      runId: span.parentSpanId ? traceId : undefined,
      model,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs: duracao,
    });
  }

  // --- tool.called (operation = tool) ---
  if (op === 'tool') {
    const toolName = String(attrs['gen_ai.tool.name'] ?? span.name);
    eventos.push({
      type: 'tool.called',
      eventId: `${traceId}:${spanId}:tool`,
      tenantId,
      tsReal,
      traceId,
      agentId,
      runId: span.parentSpanId ? traceId : undefined,
      toolName,
      durationMs: duracao,
      ok: !hasError,
    });
  }

  // --- error.raised (span com erro) ---
  if (hasError) {
    eventos.push({
      type: 'error.raised',
      eventId: `${traceId}:${spanId}:error`,
      tenantId,
      tsReal,
      traceId,
      agentId,
      runId: span.parentSpanId ? traceId : undefined,
      kind: classificarErro(attrs),
      severity: severidadeDoErro(attrs),
    });
  }

  // --- approval.requested (human-in-the-loop) ---
  if (attrs['human_approval.required'] === true || attrs['human_approval.id']) {
    eventos.push({
      type: 'approval.requested',
      eventId: `${traceId}:${spanId}:approval`,
      tenantId,
      tsReal,
      traceId,
      agentId,
      runId: span.parentSpanId ? traceId : undefined,
      approvalId: String(attrs['human_approval.id'] ?? `${traceId}:${spanId}`),
      question: String(attrs['human_approval.question'] ?? 'Aprovacao humana necessaria.'),
    });
  }

  // --- queue.observed (atributo de fila) ---
  if (attrs['queue.depth'] !== undefined) {
    eventos.push({
      type: 'queue.observed',
      eventId: `${traceId}:${spanId}:queue`,
      tenantId,
      tsReal,
      traceId,
      agentId,
      depth: Number(attrs['queue.depth']),
    });
  }

  return eventos;
}

/**
 * Traduz um lote OTLP completo (ExportTraceServiceRequest em JSON).
 * Achata resourceSpans -> scopeSpans -> spans, injetando resource attributes
 * em cada span para que `traduzirSpan` tenha contexto (service.name, sdk, etc.).
 */
export function traduzirLoteOtlp(lote: OtlpExportRequest, tenantId = 'default'): DomainEvent[] {
  if (!lote.resourceSpans) return [];
  const eventos: DomainEvent[] = [];
  for (const rs of lote.resourceSpans) {
    const resourceAttrs = achatarAtributos(rs.resource?.attributes);
    for (const scope of rs.scopeSpans ?? []) {
      for (const span of scope.spans ?? []) {
        // Injeta resource attributes no span para que traduzirSpan tenha contexto.
        const spanComResource: OtlpSpan = {
          ...span,
          resourceAttributes: rs.resource?.attributes,
        };
        try {
          const evts = traduzirSpan(spanComResource, resourceAttrs, tenantId);
          eventos.push(...evts);
        } catch (erro) {
          // Um span que quebra o adaptador nao derruba o lote inteiro.
          console.warn(`[otlp] span ${span.traceId}:${span.spanId} descartado:`, erro);
        }
      }
    }
  }
  return eventos;
}

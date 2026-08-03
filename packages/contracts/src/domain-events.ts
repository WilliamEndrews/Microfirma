/**
 * CONTRATO 1 - EVENTOS DE DOMINIO
 *
 * Esta e a linguagem unica do sistema. Tudo que entra na MicroFirma (spans OTel
 * GenAI, eventos do SDK, webhooks) e traduzido para UM destes eventos antes de
 * tocar qualquer outra camada. Nada a jusante conhece OpenTelemetry.
 *
 * Regra de ouro (ADR-0002): "nenhum pixel sem fato". Todo elemento visual do
 * escritorio nasce de um evento desta lista e guarda o `eventId` de origem,
 * para que o usuario possa sempre navegar do pixel de volta ao trace real.
 *
 * IMPORTANTE: eventos NAO carregam conteudo de prompt/resposta por padrao
 * (ADR-0007 - privacidade). Apenas forma e numeros: duracao, tokens, custo,
 * status, nome de ferramenta.
 */

import { z } from 'zod';

/** Papel funcional do agente. Define aparencia, vizinhanca e tipo de sala. */
export const AgentRole = z.enum([
  'orchestrator', // coordena outros agentes (supervisor / router)
  'researcher', // busca e le informacao
  'analyst', // processa dados, gera relatorios
  'support', // atende usuario final
  'engineer', // escreve ou executa codigo
  'finance', // lida com dados sensiveis -> prefere sala privada
  'guardian', // valida, revisa, aplica politica
  'unknown', // descoberto mas nao classificado ainda
]);
export type AgentRole = z.infer<typeof AgentRole>;

/** Estado de saude do agente, derivado da telemetria (nao informado pelo cliente). */
export const HealthStatus = z.enum(['healthy', 'degraded', 'failing', 'offline']);
export type HealthStatus = z.infer<typeof HealthStatus>;

/**
 * Identidade de um agente descoberto.
 * `avatarSeed` e derivado deterministicamente do id: o mesmo agente sempre
 * recebe o mesmo personagem, em qualquer navegador, para sempre.
 */
export const AgentDescriptor = z.object({
  agentId: z.string().min(1),
  displayName: z.string().min(1),
  role: AgentRole.default('unknown'),
  /** Framework detectado: langgraph, crewai, autogen, openai-sdk, custom... */
  framework: z.string().default('unknown'),
  /** Modelo predominante observado (ex.: gpt-4o-mini). Usado no painel de custos. */
  primaryModel: z.string().optional(),
  /** Origem da descoberta - importante para auditoria (ADR-0003). */
  discoveredVia: z.enum(['otel', 'sdk', 'a2a-card', 'mcp', 'manual', 'synthetic']),
  avatarSeed: z.number().int().nonnegative(),
});
export type AgentDescriptor = z.infer<typeof AgentDescriptor>;

/** Campos presentes em TODO evento de dominio. */
const EventBase = z.object({
  eventId: z.string().min(1),
  tenantId: z.string().min(1),
  /** Tempo REAL, epoch em milissegundos. Nunca e alterado. Ver spec do tempo narrativo. */
  tsReal: z.number().int().nonnegative(),
  /** Id do trace de origem, para o caminho de volta pixel -> span. */
  traceId: z.string().optional(),
});

/** Um agente novo entrou no sistema (deploy, primeiro span, novo Agent Card). */
export const AgentDiscovered = EventBase.extend({
  type: z.literal('agent.discovered'),
  agent: AgentDescriptor,
});

/** Uma unidade de trabalho de ponta a ponta comecou (equivale a um trace raiz). */
export const RunStarted = EventBase.extend({
  type: z.literal('run.started'),
  agentId: z.string(),
  runId: z.string(),
  /** Rotulo curto e legivel do que esta sendo feito, se disponivel. */
  label: z.string().optional(),
});

/** A unidade de trabalho terminou. */
export const RunFinished = EventBase.extend({
  type: z.literal('run.finished'),
  agentId: z.string(),
  runId: z.string(),
  status: z.enum(['ok', 'error', 'timeout', 'cancelled']),
  durationMs: z.number().nonnegative(),
});

/** Chamada de ferramenta (tool call / function call / MCP call). */
export const ToolCalled = EventBase.extend({
  type: z.literal('tool.called'),
  agentId: z.string(),
  runId: z.string().optional(),
  toolName: z.string(),
  durationMs: z.number().nonnegative(),
  ok: z.boolean(),
});

/** Chamada de LLM concluida. Fonte primaria do painel de custos. */
export const LlmCompleted = EventBase.extend({
  type: z.literal('llm.completed'),
  agentId: z.string(),
  runId: z.string().optional(),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),
});

/** Falha observada. Alimenta a mecanica de luz queimada / incendio. */
export const ErrorRaised = EventBase.extend({
  type: z.literal('error.raised'),
  agentId: z.string(),
  runId: z.string().optional(),
  /** Classe do erro: rate_limit, timeout, http_5xx, tool_failure, guardrail... */
  kind: z.string(),
  severity: z.enum(['warning', 'error', 'critical']),
});

/**
 * O agente parou e precisa de um humano (human-in-the-loop).
 * Visualmente: o agente vai ate a porta do usuario e espera. Esta e a feature
 * que transforma a MicroFirma de visualizacao em ferramenta operacional.
 */
export const ApprovalRequested = EventBase.extend({
  type: z.literal('approval.requested'),
  agentId: z.string(),
  runId: z.string().optional(),
  approvalId: z.string(),
  /** Pergunta ja redigida/redacted pela borda. */
  question: z.string(),
});

/** Profundidade de fila observada. Visualmente: pilha de papel na mesa. */
export const QueueObserved = EventBase.extend({
  type: z.literal('queue.observed'),
  agentId: z.string(),
  depth: z.number().int().nonnegative(),
});

export const DomainEvent = z.discriminatedUnion('type', [
  AgentDiscovered,
  RunStarted,
  RunFinished,
  ToolCalled,
  LlmCompleted,
  ErrorRaised,
  ApprovalRequested,
  QueueObserved,
]);
export type DomainEvent = z.infer<typeof DomainEvent>;
export type DomainEventType = DomainEvent['type'];

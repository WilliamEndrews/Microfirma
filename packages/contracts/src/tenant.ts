/**
 * CONTRATO 5 - TENANT, AUTH, AUDITORIA, ALERTAS, APROVACAO
 *
 * Fase 3 - Produto. Estes tipos transformam o MicroFirma de demo tecnica
 * em SaaS multi-tenant. Todos os tipos aqui sao schemas zod validaveis
 * na borda de rede, como em wire.ts e domain-events.ts.
 *
 * Principios:
 *   - Tenant e a unidade de isolamento: dados de uma empresa nunca vazam.
 *   - RBAC: 3 papeis (admin, operator, viewer). Quem pode o quê.
 *   - Auditoria: toda acao humana e logada com who/when/what/result.
 *   - Alertas: config por tenant, dispara por canal (webhook, slack, pagerduty).
 *   - Aprovacao: contexto completo para o humano decidir (nao so "aprove").
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// TENANT
// ---------------------------------------------------------------------------

/** Plano de assinatura. Define limites e features. */
export const Plano = z.enum(['free', 'pro', 'enterprise']);
export type Plano = z.infer<typeof Plano>;

/** Configuracao de limites por plano. */
export const LimitesPlano = z.object({
  maxAgents: z.number().int().positive(),
  maxTicksPerSecond: z.number().int().positive(),
  maxRetentionDays: z.number().int().positive(),
  canUseOtlp: z.boolean(),
  canUseAlerts: z.boolean(),
  canUseAudit: z.boolean(),
});
export type LimitesPlano = z.infer<typeof LimitesPlano>;

export const LIMITES_POR_PLANO: Record<Plano, LimitesPlano> = {
  free: {
    maxAgents: 5,
    maxTicksPerSecond: 10,
    maxRetentionDays: 7,
    canUseOtlp: false,
    canUseAlerts: false,
    canUseAudit: false,
  },
  pro: {
    maxAgents: 50,
    maxTicksPerSecond: 10,
    maxRetentionDays: 30,
    canUseOtlp: true,
    canUseAlerts: true,
    canUseAudit: true,
  },
  enterprise: {
    maxAgents: 500,
    maxTicksPerSecond: 20,
    maxRetentionDays: 365,
    canUseOtlp: true,
    canUseAlerts: true,
    canUseAudit: true,
  },
};

/** Um tenant (empresa) no sistema. */
export const Tenant = z.object({
  tenantId: z.string().min(1),
  displayName: z.string().min(1),
  plano: Plano.default('free'),
  seed: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  /** Endpoint OTLP do tenant (para receber telemetria propria). */
  otlpEndpoint: z.string().optional(),
  /** Se a sessao esta ativa (tem OfficeSession rodando). */
  active: z.boolean().default(true),
});
export type Tenant = z.infer<typeof Tenant>;

// ---------------------------------------------------------------------------
// AUTH - RBAC
// ---------------------------------------------------------------------------

/** Papel funcional do usuario humano no sistema. */
export const Papel = z.enum(['admin', 'operator', 'viewer']);
export type Papel = z.infer<typeof Papel>;

/** O que cada papel pode fazer. */
export const PERMISSOES: Record<Papel, {
  approve: boolean;
  pause: boolean;
  reseed: boolean;
  manageTenant: boolean;
  viewAudit: boolean;
}> = {
  admin: { approve: true, pause: true, reseed: true, manageTenant: true, viewAudit: true },
  operator: { approve: true, pause: true, reseed: false, manageTenant: false, viewAudit: true },
  viewer: { approve: false, pause: false, reseed: false, manageTenant: false, viewAudit: false },
};

/** Payload do JWT. Nao inclui segredo - o segredo fica no servidor. */
export const JwtPayload = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  papel: Papel,
  /** Timestamp de expiracao (epoch ms). */
  exp: z.number().int().positive(),
  /** Timestamp de emissao (epoch ms). */
  iat: z.number().int().nonnegative(),
});
export type JwtPayload = z.infer<typeof JwtPayload>;

/** Usuario humano autenticado. */
export const Usuario = z.object({
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  displayName: z.string().min(1),
  email: z.string().email(),
  papel: Papel,
});
export type Usuario = z.infer<typeof Usuario>;

// ---------------------------------------------------------------------------
// AUDITORIA
// ---------------------------------------------------------------------------

/** Acao humana auditada. */
export const AuditAction = z.enum([
  'approval.granted',
  'approval.rejected',
  'session.paused',
  'session.resumed',
  'session.reseeded',
  'tenant.created',
  'tenant.updated',
  'tenant.deleted',
  'user.invited',
  'user.removed',
  'alert.acknowledged',
]);
export type AuditAction = z.infer<typeof AuditAction>;

/** Registro imutavel de auditoria. */
export const AuditEvent = z.object({
  auditId: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  action: AuditAction,
  /** Timestamp real (epoch ms). */
  ts: z.number().int().nonnegative(),
  /** Detalhes da acao em JSON livre (agentId, seed, reason, etc). */
  details: z.record(z.string(), z.unknown()).default({}),
  /** Resultado da acao. */
  result: z.enum(['success', 'failure']).default('success'),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

// ---------------------------------------------------------------------------
// ALERTAS
// ---------------------------------------------------------------------------

/** Canal de notificacao. */
export const AlertChannel = z.enum(['webhook', 'slack', 'pagerduty', 'email']);
export type AlertChannel = z.infer<typeof AlertChannel>;

/** Configuracao de um alerta por tenant. */
export const AlertConfig = z.object({
  alertId: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  /** Condicao que dispara o alerta. */
  condition: z.enum([
    'agent_failing',
    'budget_exceeded',
    'approval_pending_long',
    'error_rate_high',
    'agent_discovered',
  ]),
  /** Canal de notificacao. */
  channel: AlertChannel,
  /** URL do webhook / Slack / PagerDuty. */
  targetUrl: z.string().url().optional(),
  /** Email do destinatario (canal email). */
  targetEmail: z.string().email().optional(),
  /** Limiar numerico para condicoes que precisam (ex.: error_rate > X). */
  threshold: z.number().optional(),
  /** Segundos de janela para condicoes temporais (ex.: pending > 300s). */
  windowSeconds: z.number().int().positive().optional(),
  /** Se o alerta esta ativo. */
  enabled: z.boolean().default(true),
});
export type AlertConfig = z.infer<typeof AlertConfig>;

/** Evento de alerta disparado. */
export const AlertEvent = z.object({
  alertEventId: z.string().min(1),
  tenantId: z.string().min(1),
  alertId: z.string().min(1),
  condition: AlertConfig.shape.condition,
  /** Timestamp do disparo (epoch ms). */
  ts: z.number().int().nonnegative(),
  /** Mensagem humanamente legivel. */
  message: z.string().min(1),
  /** Dados do contexto que disparou o alerta. */
  context: z.record(z.string(), z.unknown()).default({}),
  /** Se o envio foi bem-sucedido. */
  delivered: z.boolean().default(false),
});
export type AlertEvent = z.infer<typeof AlertEvent>;

// ---------------------------------------------------------------------------
// APROVACAO - contexto completo para o humano decidir
// ---------------------------------------------------------------------------

/** Contexto de uma aprovacao pendente. Vai no wire para o cliente. */
export const ApprovalContext = z.object({
  approvalId: z.string().min(1),
  agentId: z.string().min(1),
  agentDisplayName: z.string().min(1),
  runId: z.string().optional(),
  /** Pergunta redigida/redacted pela borda (ADR-0007). */
  question: z.string().min(1),
  /** Resumo do que o agente estava fazendo quando parou. */
  summary: z.string().optional(),
  /** Há quanto tempo está esperando (segundos). */
  waitingSeconds: z.number().int().nonnegative().default(0),
  /** Custo acumulado do run ate agora. */
  runCostUsd: z.number().nonnegative().default(0),
  /** Quantos tokens ja consumidos no run. */
  runTokens: z.number().int().nonnegative().default(0),
});
export type ApprovalContext = z.infer<typeof ApprovalContext>;

/** Comando estendido: aprovar com motivo (rejeitar tambem). */
export const ResolveApprovalExtended = z.object({
  type: z.literal('resolve_approval'),
  agentId: z.string().min(1).max(200),
  approvalId: z.string().min(1),
  /** true = aprovado, false = rejeitado. */
  approved: z.boolean(),
  /** Motivo da decisao (para auditoria). */
  reason: z.string().max(2000).optional(),
}).strict();

/** Comando estendido: acknowledge de alerta. */
export const AckAlert = z.object({
  type: z.literal('ack_alert'),
  alertEventId: z.string().min(1),
}).strict();

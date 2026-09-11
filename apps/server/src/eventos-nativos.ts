/**
 * Ingestao nativa (sem OTLP): eventos compactos -> DomainEvent.
 * Porta publica para SDKs / webhooks / bots sem OpenTelemetry.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentRole, DomainEvent, OtlpExportRequest } from '@microfirma/contracts';
import { AgentRole as AgentRoleSchema } from '@microfirma/contracts';
import { gerarId } from './auth.js';
import type { TenantRegistry } from './tenant-registry.js';

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/fixtures/agencia-3-agentes.otlp.json',
);

let fixtureCache: OtlpExportRequest | null = null;

export function carregarFixtureAgencia(): OtlpExportRequest {
  if (fixtureCache) return fixtureCache;
  fixtureCache = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as OtlpExportRequest;
  return fixtureCache;
}

/** Shape publico minimo — campos de envelope sao preenchidos pelo servidor. */
export type EventoNativoCompacto =
  | {
      type: 'agent.discovered';
      agentId: string;
      name?: string;
      role?: string;
      framework?: string;
    }
  | {
      type: 'run.started';
      agentId: string;
      runId?: string;
      label?: string;
    }
  | {
      type: 'run.finished';
      agentId: string;
      runId?: string;
      status?: 'ok' | 'error' | 'timeout' | 'cancelled';
      durationMs?: number;
    }
  | {
      type: 'tool.called';
      agentId: string;
      toolName: string;
      ok?: boolean;
      durationMs?: number;
      runId?: string;
    }
  | {
      type: 'llm.completed';
      agentId: string;
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
      latencyMs?: number;
      runId?: string;
    }
  | {
      type: 'error.raised';
      agentId: string;
      kind?: string;
      severity?: 'warning' | 'error' | 'critical';
      runId?: string;
    }
  | {
      type: 'approval.requested';
      agentId: string;
      question: string;
      approvalId?: string;
      runId?: string;
    }
  | {
      type: 'queue.observed';
      agentId: string;
      depth: number;
    };

function papelDe(raw: string | undefined): AgentRole {
  const parsed = AgentRoleSchema.safeParse(raw ?? 'unknown');
  return parsed.success ? parsed.data : 'unknown';
}

function avatarSeedDe(agentId: string): number {
  const h = createHash('sha256').update(agentId).digest();
  return h.readUInt32BE(0) >>> 0;
}

/**
 * Expande o JSON compacto do cliente para DomainEvent completo.
 * Gera eventId / tsReal / tenantId quando ausentes.
 */
export function expandirEventosNativos(
  tenantId: string,
  compactos: EventoNativoCompacto[],
  agora = Date.now(),
): DomainEvent[] {
  const out: DomainEvent[] = [];
  let i = 0;
  for (const c of compactos) {
    const base = {
      eventId: gerarId(),
      tenantId,
      tsReal: agora + i,
      traceId: `native-${tenantId.slice(0, 8)}`,
    };
    i += 1;

    switch (c.type) {
      case 'agent.discovered':
        out.push({
          ...base,
          type: 'agent.discovered',
          agent: {
            agentId: c.agentId,
            displayName: c.name?.trim() || c.agentId,
            role: papelDe(c.role),
            framework: c.framework ?? 'native',
            discoveredVia: 'sdk',
            avatarSeed: avatarSeedDe(c.agentId),
          },
        });
        break;
      case 'run.started':
        out.push({
          ...base,
          type: 'run.started',
          agentId: c.agentId,
          runId: c.runId ?? gerarId(),
          label: c.label,
        });
        break;
      case 'run.finished':
        out.push({
          ...base,
          type: 'run.finished',
          agentId: c.agentId,
          runId: c.runId ?? gerarId(),
          status: c.status ?? 'ok',
          durationMs: c.durationMs ?? 0,
        });
        break;
      case 'tool.called':
        out.push({
          ...base,
          type: 'tool.called',
          agentId: c.agentId,
          runId: c.runId,
          toolName: c.toolName,
          durationMs: c.durationMs ?? 0,
          ok: c.ok ?? true,
        });
        break;
      case 'llm.completed':
        out.push({
          ...base,
          type: 'llm.completed',
          agentId: c.agentId,
          runId: c.runId,
          model: c.model ?? 'unknown',
          inputTokens: c.inputTokens ?? 0,
          outputTokens: c.outputTokens ?? 0,
          costUsd: c.costUsd ?? 0,
          latencyMs: c.latencyMs ?? 0,
        });
        break;
      case 'error.raised':
        out.push({
          ...base,
          type: 'error.raised',
          agentId: c.agentId,
          runId: c.runId,
          kind: c.kind ?? 'error',
          severity: c.severity ?? 'error',
        });
        break;
      case 'approval.requested':
        out.push({
          ...base,
          type: 'approval.requested',
          agentId: c.agentId,
          runId: c.runId,
          approvalId: c.approvalId ?? gerarId(),
          question: c.question,
        });
        break;
      case 'queue.observed':
        out.push({
          ...base,
          type: 'queue.observed',
          agentId: c.agentId,
          depth: c.depth,
        });
        break;
      default: {
        const _never: never = c;
        void _never;
        throw new Error('tipo de evento nativo desconhecido');
      }
    }
  }
  return out;
}

export type ResultadoIngest = { eventos: number } | { erro: string; status: 404 | 400 };

/** Injeta a fixture de 3 agentes no tenant (demo sem OTLP do cliente). */
export function simularAgenciaPublica(registry: TenantRegistry, codigo: string): ResultadoIngest {
  const id = codigo.trim();
  if (!id) return { erro: 'codigo obrigatorio', status: 400 };
  const ingestor = registry.ingestorDoTenant(id);
  if (!ingestor) return { erro: 'codigo nao encontrado ou sem OTLP', status: 404 };
  const n = ingestor.ingerir(carregarFixtureAgencia());
  return { eventos: n };
}

/** Injeta eventos nativos compactos no tenant. */
export function ingerirEventosPublicos(
  registry: TenantRegistry,
  tenantId: string,
  compactos: unknown,
): ResultadoIngest {
  const id = tenantId.trim();
  if (!id) return { erro: 'tenantId obrigatorio', status: 400 };
  if (!Array.isArray(compactos) || compactos.length === 0) {
    return { erro: 'events deve ser um array nao vazio', status: 400 };
  }
  const ingestor = registry.ingestorDoTenant(id);
  if (!ingestor) return { erro: 'tenant nao encontrado ou sem OTLP', status: 404 };

  try {
    const eventos = expandirEventosNativos(id, compactos as EventoNativoCompacto[]);
    const n = ingestor.ingerirEventos(eventos);
    return { eventos: n };
  } catch (e) {
    return {
      erro: e instanceof Error ? e.message : 'payload invalido',
      status: 400,
    };
  }
}

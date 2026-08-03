/**
 * CONTRATO 6 - GRAVACAO E REPLAY DE SESSAO
 *
 * O WorldEngine e deterministico: dado o mesmo layout, a mesma seed e a mesma
 * sequencia de (eventos, dt), produz exatamente os mesmos quadros. Este arquivo
 * define o formato que captura essa tripla para reproducao posterior.
 *
 * Casos de uso (ADR-0006):
 *   - Auditoria: "o que foi mostrado a quem, e quando" - replay reconstrói.
 *   - Debug: um bug reportado num horario especifico pode ser reproduzido
 *     exatamente, tick por tick, sem depender do estado vivo do servidor.
 *   - Demo: gravar uma sessao interessante e reproduzir em apresentacao,
 *     sem depender de telemetria ao vivo.
 *
 * Formato NDJSON (Newline Delimited JSON): um JSON por linha. Vantagens:
 *   - streaming: nao precisa carregar o arquivo inteiro na memoria;
 *   - append-only: cada tick e uma linha nova, nao reescreve o arquivo;
 *   - resiliencia: se o processo cai, o que ja foi gravado esta intacto.
 *
 * Estrutura:
 *   linha 1: header (seed, agentes, layout, tickMs, keyframeEveryTicks)
 *   linha 2+: um TickRecord por tick (eventos ingeridos + quadro produzido)
 */

import type { AgentDescriptor, DomainEvent, OfficeLayout, WorldSnapshot, WorldDelta } from './index.js';

/** Cabecalho do arquivo de gravacao. Sempre a primeira linha. */
export interface SessionLogHeader {
  format: 'microfirma-session-log';
  version: 1;
  /** Semente usada para construir o escritorio. */
  seed: number;
  /** Tenant da sessao. */
  tenantId: string;
  /** Passo de simulacao em ms. */
  tickMs: number;
  /** Cadencia de keyframe. */
  keyframeEveryTicks: number;
  /** Agentes iniciais (para reconstruir o escritorio no replay). */
  agents: AgentDescriptor[];
  /** Layout gerado pela seed + agentes. */
  layout: OfficeLayout;
  /** Timestamp real de inicio da gravacao (epoch ms). */
  startedAtMs: number;
}

/** Um tick gravado. Eventos que entraram + quadro que saiu. */
export interface TickRecord {
  /** Numero do tick (monotonico, comeca em 1). */
  tick: number;
  /** Eventos ingeridos neste tick. Pode ser vazio. */
  events: DomainEvent[];
  /** Quadro produzido: snapshot ou delta. */
  frame: WorldSnapshot | WorldDelta;
}

/** Tipo union para distinguir header de tick ao ler NDJSON. */
export type SessionLogLine =
  | { kind: 'header'; data: SessionLogHeader }
  | { kind: 'tick'; data: TickRecord };

/**
 * Serializa um header para linha NDJSON.
 */
export function serializarHeader(header: SessionLogHeader): string {
  return JSON.stringify({ kind: 'header', data: header });
}

/**
 * Serializa um TickRecord para linha NDJSON.
 */
export function serializarTick(record: TickRecord): string {
  return JSON.stringify({ kind: 'tick', data: record });
}

/**
 * Desserializa uma linha NDJSON. Devolve null para linhas vazias (ex.: trailing
 * newline). Lanca se a linha nao e JSON valido ou nao tem `kind`.
 */
export function desserializarLinha(linha: string): SessionLogLine | null {
  const trimmed = linha.trim();
  if (!trimmed) return null;
  const obj = JSON.parse(trimmed) as SessionLogLine;
  if (obj.kind !== 'header' && obj.kind !== 'tick') {
    throw new Error(`linha sem kind valido: ${trimmed.slice(0, 80)}`);
  }
  return obj;
}

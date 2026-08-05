/**
 * CONTRATO 2 - LAYOUT DO ESCRITORIO
 *
 * Aqui vive a decisao arquitetural mais importante sobre geracao de ambiente
 * (ADR-0004): o LLM NAO produz geometria. O LLM produz o `SpaceProgram`
 * (programa de necessidades, sem coordenadas). Um solver deterministico e
 * seeded transforma o programa em `OfficeLayout` (geometria valida).
 *
 * Consequencias praticas:
 *  - mesma seed + mesmo programa = exatamente o mesmo escritorio, sempre
 *    (essencial para o modo Replay e para testes automatizados);
 *  - impossivel gerar salas sobrepostas ou inalcancaveis, porque a validacao
 *    e feita por codigo, nao por confianca no modelo;
 *  - custo de LLM por escritorio: uma unica chamada.
 */

import { z } from 'zod';
import { AgentRole } from './domain-events.js';

// ---------------------------------------------------------------------------
// ENTRADA: o que o LLM Arquiteto produz (alto nivel, sem coordenadas)
// ---------------------------------------------------------------------------

/** Uma zona funcional pedida pelo programa de necessidades. */
export const ZoneRequest = z.object({
  zoneId: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['open', 'private', 'break', 'meeting', 'war_room', 'reception']),
  /** Peso relativo de area. O solver normaliza; nao sao metros quadrados. */
  areaWeight: z.number().positive(),
  /** Agentes alocados nesta zona (definem quantas mesas o solver precisa criar). */
  agentIds: z.array(z.string()).default([]),
});
export type ZoneRequest = z.infer<typeof ZoneRequest>;

/**
 * Programa de necessidades. E o unico artefato que o LLM gera.
 * `adjacency` vem do grafo real de colaboracao extraido da telemetria: agentes
 * que se chamam muito ficam perto. Assim o layout tem SIGNIFICADO - o
 * escritorio e um diagrama de arquitetura legivel por intuicao.
 */
export const SpaceProgram = z.object({
  officeId: z.string().min(1),
  /** Semente determinística. Mesma seed => mesmo escritorio. */
  seed: z.number().int().nonnegative(),
  grid: z.object({ width: z.number().int().min(16), height: z.number().int().min(12) }),
  zones: z.array(ZoneRequest).min(1),
  /** Pares de zonas que devem ficar proximas, com peso. */
  adjacency: z
    .array(z.object({ a: z.string(), b: z.string(), weight: z.number().min(0).max(1) }))
    .default([]),
  /** Direcao estetica escolhida pelo Agente Decorador. */
  theme: z
    .object({
      name: z.string().default('nordic-calm'),
      palette: z.array(z.string()).default([]),
      greenery: z.number().min(0).max(1).default(0.4),
    })
    .default({ name: 'nordic-calm', palette: [], greenery: 0.4 }),
});
export type SpaceProgram = z.infer<typeof SpaceProgram>;

// ---------------------------------------------------------------------------
// SAIDA: geometria produzida pelo solver deterministico
// ---------------------------------------------------------------------------

/** Retangulo em coordenadas de grid, inclusivo em x0/y0 e exclusivo em x1/y1. */
export const Rect = z.object({
  x0: z.number().int(),
  y0: z.number().int(),
  x1: z.number().int(),
  y1: z.number().int(),
});
export type Rect = z.infer<typeof Rect>;

export const Cell = z.object({ x: z.number().int(), y: z.number().int() });
export type Cell = z.infer<typeof Cell>;

export const Room = z.object({
  roomId: z.string(),
  zoneId: z.string(),
  name: z.string(),
  kind: ZoneRequest.shape.kind,
  rect: Rect,
  /** Celula da porta. Garantidamente adjacente a um corredor (invariante testada). */
  door: Cell,
});
export type Room = z.infer<typeof Room>;

/** Mobiliario e equipamento. `ownerAgentId` liga o objeto ao dono. */
export const Prop = z.object({
  propId: z.string(),
  kind: z.enum(['desk', 'chair', 'plant', 'lamp', 'printer', 'sofa', 'coffee', 'board', 'meter', 'cabinet', 'bookshelf', 'water', 'rug']),
  cell: Cell,
  roomId: z.string(),
  ownerAgentId: z.string().optional(),
  /** Orientacao para o render (0=sul, 1=oeste, 2=norte, 3=leste). */
  facing: z.number().int().min(0).max(3).default(0),
});
export type Prop = z.infer<typeof Prop>;

export const OfficeLayout = z.object({
  officeId: z.string(),
  seed: z.number().int().nonnegative(),
  grid: z.object({ width: z.number().int(), height: z.number().int() }),
  rooms: z.array(Room),
  props: z.array(Prop),
  /** Celulas de circulacao (corredores). Base do pathfinding entre salas. */
  corridors: z.array(Cell),
  theme: SpaceProgram.shape.theme,
});
export type OfficeLayout = z.infer<typeof OfficeLayout>;

/** Preferencia de tipo de sala por papel - usada pelo Arquiteto e por testes. */
export const ROOM_PREFERENCE: Record<AgentRole, ZoneRequest['kind']> = {
  orchestrator: 'private',
  finance: 'private',
  guardian: 'private',
  researcher: 'open',
  analyst: 'open',
  support: 'open',
  engineer: 'open',
  unknown: 'open',
};

/**
 * CONTRATO 3 - PROTOCOLO DE MUNDO
 *
 * O que o World Engine (autoritativo) envia para o renderizador.
 *
 * Por que tipos TypeScript puros aqui, e nao schemas zod como nos eventos de
 * dominio? Porque este e o caminho quente: 10 quadros de estado por segundo,
 * por sessao. Validar com zod a cada tick e desperdicio de CPU. A validacao
 * acontece na borda de rede apenas em desenvolvimento (ADR-0006), e a corretude
 * e garantida por testes do engine, nao por checagem em runtime.
 */

import type { OfficeLayout } from './layout.js';
import type { HealthStatus } from './domain-events.js';

/**
 * O que um agente esta fazendo no mundo, do ponto de vista visual.
 * Cada valor corresponde a um fato operacional - nada e decorativo:
 *  - working: existe um run ativo
 *  - waiting_approval: existe um human-in-the-loop pendente
 *  - resting: sem runs ha mais que o limiar de ociosidade
 *  - blocked: rate limit / circuit breaker aberto
 */
export type Activity =
  | 'idle'
  | 'walking'
  | 'working'
  | 'resting'
  | 'waiting_approval'
  | 'blocked'
  | 'sweeping'
  | 'repairing'
  | 'talking';

/** Estado visual de um ator (agente do cliente ou agente interno da MicroFirma). */
export interface ActorState {
  agentId: string;
  /** Posicao em coordenadas de grid, fracionaria para interpolacao suave. */
  x: number;
  y: number;
  facing: 0 | 1 | 2 | 3;
  activity: Activity;
  /** 0..1 - progresso da atividade atual, desenhado como barra sobre a cabeca. */
  progress: number;
  health: HealthStatus;
  /** Agentes internos (zelador, tecnico) sao desenhados com uniforme distinto. */
  isInternal: boolean;
  /** Ultimo evento de dominio que causou a atividade atual: caminho pixel -> span. */
  causedByEventId?: string;
}

/**
 * Estado ambiente de uma mesa. Aqui mora a gamificacao SEMANTICA: cada campo
 * e a projecao direta de uma metrica que hoje e dificil de perceber.
 */
export interface DeskAmbient {
  propId: string;
  ownerAgentId?: string;
  /** 0..1 - derivado de retries/loops. "A mesa esquenta" antes de virar fatura. */
  heat: number;
  /** Numero de folhas na pilha = profundidade de fila observada. */
  queuePile: number;
  /** Sacos de lixo = volume de runs concluidos ainda nao "coletados". */
  litter: number;
}

/** Estado ambiente de uma sala. */
export interface RoomAmbient {
  roomId: string;
  /** Luz queimada = erro 5xx / falha de dependencia naquela area. */
  lightBroken: boolean;
  /** 0..1 - incidente ativo. Acima de 0.6 o render mostra fumaca. */
  incident: number;
}

/** Indicadores globais, exibidos no saguao e no modo executivo. */
export interface WorldKpis {
  activeRuns: number;
  costUsdToday: number;
  /** Orcamento diario de tokens em dolares. Estourar = apagao progressivo. */
  budgetUsdToday: number;
  errorsLast5Min: number;
  tokensPerMinute: number;
  pendingApprovals: number;
}

/** Quadro completo do mundo. Enviado no handshake e a cada N ticks (keyframe). */
export interface WorldSnapshot {
  kind: 'snapshot';
  /** Contador monotonico de ticks da simulacao. */
  tick: number;
  /** Tempo do MUNDO em ms (diegetico). Diferente do tempo real. Ver spec. */
  tMundo: number;
  /** Fator de dilatacao temporal em vigor. Ver Motor de Tempo Narrativo. */
  alpha: number;
  layout: OfficeLayout;
  actors: ActorState[];
  desks: DeskAmbient[];
  rooms: RoomAmbient[];
  kpis: WorldKpis;
}

/** Diferencas desde o ultimo quadro. Enviado a 10 Hz. */
export interface WorldDelta {
  kind: 'delta';
  tick: number;
  tMundo: number;
  alpha: number;
  actors: ActorState[];
  desks: DeskAmbient[];
  rooms: RoomAmbient[];
  kpis: WorldKpis;
  /** Falas curtas para bolhas de dialogo. Sempre derivadas de fatos. */
  chatter: Array<{ agentId: string; text: string; eventId?: string }>;
}

export type WorldFrame = WorldSnapshot | WorldDelta;

// ---------------------------------------------------------------------------
// INTENCOES NARRATIVAS
// ---------------------------------------------------------------------------

/**
 * Uma intencao narrativa e a unidade que o Narrative Scheduler emite. Ela NAO
 * e um evento: e a decisao de que um determinado fato merece ser ENCENADO, com
 * duracao minima de legibilidade humana.
 *
 * Ver docs/specs/motor-de-tempo-narrativo.md
 */
export interface NarrativeIntent {
  intentId: string;
  agentId: string;
  /** O comportamento a encenar. */
  behavior: 'go_to_desk' | 'work' | 'go_to_break' | 'go_to_door' | 'sweep' | 'repair' | 'meet';
  /** Alvo opcional: propId ou roomId. */
  target?: string;
  /** Duracao minima em tempo de MUNDO para que o olho humano acompanhe. */
  minDurationMs: number;
  /** 0..1 - prioridade. Incidentes ganham do cotidiano quando falta atencao. */
  priority: number;
  /** Quantos eventos reais esta intencao representa (agregacao). */
  representsEvents: number;
  causedByEventId?: string;
}

/**
 * Simulacao roteirizada de agentes no Debugpreview (FSM leve, sem WorldEngine).
 *
 * Cada agente percorre um ciclo deterministico: trabalha → porta → corredor →
 * copa → volta a mesa. Pathfinding usa o NavGrid de `espaco-agencia`; a
 * cena estatica fica num canvas separado e os atores sao blitted por cima.
 */

import type { Activity, ActorState, Cell } from '@microfirma/contracts';
import { createRng, findPath, isWalkable, type NavGrid } from '@microfirma/world-engine';
import {
  celulasWalkableNaSala,
  type AgenteEspacial,
  type CenarioEspacial,
} from './espaco-agencia';

const VELOCIDADE_CELULAS_POR_S = 2.6;
const DURACAO_WORKING_MS = 3500;
const DURACAO_RESTING_MS = 2500;

type FaseRoteiro =
  | 'working'
  | 'indo_porta'
  | 'indo_corredor'
  | 'indo_copa'
  | 'descansando'
  | 'voltando';

type AgenteInterno = {
  meta: AgenteEspacial;
  x: number;
  y: number;
  facing: 0 | 1 | 2 | 3;
  activity: Activity;
  progress: number;
  path: Cell[];
  fase: FaseRoteiro;
  faseAteMs: number;
};

export type DebugSim = {
  paths: Map<string, Cell[]>;
  posicoes: Map<string, { x: number; y: number }>;
};

export class SimulacaoAgentes {
  private readonly nav: NavGrid;
  private readonly corredor: Cell[];
  private readonly copa: Cell[];
  private readonly agentes = new Map<string, AgenteInterno>();
  private tMundo = 0;
  private readonly rng: ReturnType<typeof createRng>;

  constructor(cenario: CenarioEspacial, seed: number) {
    this.nav = cenario.nav;
    this.corredor = cenario.layout.corridors.filter((c) => isWalkable(this.nav, c));
    const salaCopa = cenario.layout.rooms.find((r) => r.kind === 'break');
    this.copa = salaCopa ? celulasWalkableNaSala(this.nav, salaCopa.rect) : [];
    this.rng = createRng(seed).fork('sim-agentes');

    for (const meta of cenario.agentes) {
      const inicio = meta.seat ?? meta.door;
      this.agentes.set(meta.agentId, {
        meta,
        x: inicio.x,
        y: inicio.y,
        facing: 2,
        activity: 'working',
        progress: 0,
        path: [],
        fase: 'working',
        faseAteMs: DURACAO_WORKING_MS,
      });
    }
  }

  tick(dtMs: number): ActorState[] {
    this.tMundo += dtMs;
    for (const ator of this.agentes.values()) {
      this.avancarAtor(ator, dtMs);
    }
    return this.snapshot();
  }

  debugInfo(): DebugSim {
    const paths = new Map<string, Cell[]>();
    const posicoes = new Map<string, { x: number; y: number }>();
    for (const [id, ator] of this.agentes) {
      if (ator.path.length > 0) paths.set(id, [...ator.path]);
      posicoes.set(id, { x: ator.x, y: ator.y });
    }
    return { paths, posicoes };
  }

  private snapshot(): ActorState[] {
    const out: ActorState[] = [];
    for (const ator of this.agentes.values()) {
      const noPostoVisual =
        ator.activity === 'working' && ator.path.length === 0 ? ator.meta.seatFrac : undefined;
      out.push({
        agentId: ator.meta.agentId,
        x: noPostoVisual?.x ?? ator.x,
        y: noPostoVisual?.y ?? ator.y,
        facing: noPostoVisual?.facing ?? ator.facing,
        activity: ator.activity,
        progress: ator.progress,
        health: 'healthy',
        isInternal: false,
      });
    }
    return out;
  }

  private avancarAtor(ator: AgenteInterno, dtMs: number): void {
    if (ator.path.length > 0) {
      const alvo = ator.path[0]!;
      const passo = (VELOCIDADE_CELULAS_POR_S * dtMs) / 1000;
      const dx = alvo.x - ator.x;
      const dy = alvo.y - ator.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= passo) {
        ator.x = alvo.x;
        ator.y = alvo.y;
        ator.path.shift();
      } else {
        ator.x += (dx / dist) * passo;
        ator.y += (dy / dist) * passo;
      }
      ator.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : dy > 0 ? 0 : 2;
      ator.activity = 'walking';
      return;
    }

    switch (ator.fase) {
      case 'working': {
        ator.activity = 'working';
        ator.progress = 1 - Math.max(0, ator.faseAteMs) / DURACAO_WORKING_MS;
        ator.faseAteMs -= dtMs;
        if (ator.faseAteMs <= 0) {
          ator.fase = 'indo_porta';
          this.mandarPara(ator, ator.meta.door);
        }
        break;
      }
      case 'indo_porta': {
        ator.fase = 'indo_corredor';
        const dest = this.celulaAleatoria(this.corredor) ?? ator.meta.door;
        this.mandarPara(ator, dest);
        break;
      }
      case 'indo_corredor': {
        ator.fase = 'indo_copa';
        const dest = this.celulaAleatoria(this.copa);
        if (dest) this.mandarPara(ator, dest);
        else {
          ator.fase = 'descansando';
          ator.faseAteMs = DURACAO_RESTING_MS;
          ator.activity = 'resting';
        }
        break;
      }
      case 'indo_copa': {
        ator.fase = 'descansando';
        ator.faseAteMs = DURACAO_RESTING_MS;
        ator.progress = 0;
        ator.activity = 'resting';
        break;
      }
      case 'descansando': {
        ator.activity = 'resting';
        ator.progress = 1 - Math.max(0, ator.faseAteMs) / DURACAO_RESTING_MS;
        ator.faseAteMs -= dtMs;
        if (ator.faseAteMs <= 0) {
          ator.fase = 'voltando';
          const dest = ator.meta.seat ?? ator.meta.door;
          this.mandarPara(ator, dest);
        }
        break;
      }
      case 'voltando': {
        ator.fase = 'working';
        ator.faseAteMs = DURACAO_WORKING_MS;
        ator.progress = 0;
        ator.activity = 'working';
        break;
      }
    }
  }

  private mandarPara(ator: AgenteInterno, destino: Cell): void {
    const origem = { x: Math.round(ator.x), y: Math.round(ator.y) };
    const rota = findPath(this.nav, origem, destino);
    ator.path = rota ?? [];
    if (ator.path.length > 0) ator.activity = 'walking';
  }

  private celulaAleatoria(lista: Cell[]): Cell | undefined {
    if (lista.length === 0) return undefined;
    return this.rng.pick(lista);
  }
}

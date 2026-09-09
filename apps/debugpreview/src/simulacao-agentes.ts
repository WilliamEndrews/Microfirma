/**
 * Simulacao roteirizada de agentes no Debugpreview (FSM leve, sem WorldEngine).
 *
 * Cada agente percorre um ciclo deterministico: trabalha na mesa → passeia
 * pela propria sala parando em frente ao mobiliario (impressora, armario,
 * bebedouro, copiadora) → porta → corredor → copa → volta a mesa. Trabalhar e
 * o estado "acionado"; entre acionamentos o agente ocupa o ambiente em vez de
 * ficar plantado no tapete. Pathfinding usa o NavGrid de `espaco-agencia`; a
 * cena estatica fica num canvas separado e os atores sao blitted por cima.
 */

import type { Activity, ActorState, Cell } from '@microfirma/contracts';
import {
  createRng,
  facingDeDelta,
  findPath,
  isWalkable,
  type NavGrid,
} from '@microfirma/world-engine';
import {
  celulasDePasseio,
  celulasWalkableNaSala,
  type AgenteEspacial,
  type CenarioEspacial,
} from './espaco-agencia';

const VELOCIDADE_CELULAS_POR_S = 2.6;
const DURACAO_WORKING_MS = 3500;
const DURACAO_RESTING_MS = 2500;
/** Tempo parado diante do mobiliario visitado no passeio. */
const DURACAO_PARADA_MS = 2200;
const VISITAS_MIN = 1;
const VISITAS_MAX = 2;
/** Com POIs disponiveis, o passeio prefere o mobiliario a uma celula qualquer. */
const CHANCE_POI = 0.72;

type FaseRoteiro =
  | 'working'
  | 'passeando'
  | 'observando'
  | 'indo_porta'
  | 'indo_corredor'
  | 'indo_copa'
  | 'descansando'
  | 'voltando';

type ParadaPasseio = { cell: Cell; facing?: 0 | 1 | 2 | 3 };

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
  /** Visitas restantes no passeio antes de sair para a copa. */
  visitas: number;
  /** Orientacao mantida enquanto parado — encara o objeto visitado. */
  facingParada?: 0 | 1 | 2 | 3;
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
    // Descansar tambem e uma parada: o agente nao pode pousar sobre a maquina
    // de cafe nem sobre o sofa da copa.
    const salaCopa = cenario.layout.rooms.find((r) => r.kind === 'break');
    const livresCopa = salaCopa
      ? celulasDePasseio(this.nav, salaCopa.rect, salaCopa.door, cenario.ocupadas)
      : [];
    this.copa =
      livresCopa.length > 0
        ? livresCopa
        : salaCopa
          ? celulasWalkableNaSala(this.nav, salaCopa.rect)
          : [];
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
        visitas: 0,
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
        pose: noPostoVisual ? 'seated' : 'standing',
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
      ator.facing = facingDeDelta(dx, dy, ator.facing);
      // Consumir a ultima celula encerra o deslocamento aqui mesmo; manter
      // `walking` deixaria o agente pisando no lugar ate a fase seguinte.
      ator.activity = ator.path.length > 0 ? 'walking' : 'idle';
      return;
    }

    switch (ator.fase) {
      case 'working': {
        ator.activity = 'working';
        ator.progress = 1 - Math.max(0, ator.faseAteMs) / DURACAO_WORKING_MS;
        ator.faseAteMs -= dtMs;
        if (ator.faseAteMs <= 0) {
          ator.visitas = this.rng.int(VISITAS_MIN, VISITAS_MAX);
          this.iniciarPasseio(ator);
        }
        break;
      }
      case 'passeando': {
        // Rota do passeio concluida: fica um tempo diante do objeto.
        this.pararNaVisita(ator);
        break;
      }
      case 'observando': {
        ator.activity = 'idle';
        if (ator.facingParada != null) ator.facing = ator.facingParada;
        ator.faseAteMs -= dtMs;
        if (ator.faseAteMs <= 0) {
          ator.visitas -= 1;
          if (ator.visitas > 0) {
            this.iniciarPasseio(ator);
          } else {
            ator.fase = 'indo_porta';
            this.mandarPara(ator, ator.meta.door);
          }
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

  /**
   * Escolhe a proxima parada dentro da sala e manda o agente ate ela. Sem
   * destino possivel (sala sem folga), cai direto no trecho corredor/copa.
   */
  private iniciarPasseio(ator: AgenteInterno): void {
    const parada = this.paradaDePasseio(ator);
    if (!parada) {
      ator.fase = 'indo_porta';
      this.mandarPara(ator, ator.meta.door);
      return;
    }

    ator.fase = 'passeando';
    ator.facingParada = parada.facing;
    ator.progress = 0;
    this.mandarPara(ator, parada.cell);
    if (ator.path.length > 0) return;

    // Sem rota: ou ja estava na celula, ou o destino e inalcancavel. Encarar o
    // objeto so faz sentido no primeiro caso.
    const chegou =
      Math.round(ator.x) === parada.cell.x && Math.round(ator.y) === parada.cell.y;
    if (!chegou) delete ator.facingParada;
    this.pararNaVisita(ator);
  }

  private pararNaVisita(ator: AgenteInterno): void {
    ator.fase = 'observando';
    ator.faseAteMs = DURACAO_PARADA_MS;
    ator.progress = 0;
    ator.activity = 'idle';
    if (ator.facingParada != null) ator.facing = ator.facingParada;
  }

  /**
   * Mobiliario tem prioridade — e ele que produz a leitura de interacao com o
   * ambiente. As celulas de `passeio` ja excluem qualquer footprint de asset,
   * entao o agente nunca para em cima de uma peca.
   */
  private paradaDePasseio(ator: AgenteInterno): ParadaPasseio | undefined {
    const pontos = ator.meta.pontosInteresse;
    if (pontos.length > 0 && this.rng.chance(CHANCE_POI)) {
      const poi = this.rng.pick(pontos);
      return { cell: poi.cell, facing: poi.facing };
    }

    const livres = ator.meta.passeio.filter(
      (c) => c.x !== Math.round(ator.x) || c.y !== Math.round(ator.y),
    );
    if (livres.length > 0) return { cell: this.rng.pick(livres) };
    if (pontos.length > 0) {
      const poi = this.rng.pick(pontos);
      return { cell: poi.cell, facing: poi.facing };
    }
    return undefined;
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

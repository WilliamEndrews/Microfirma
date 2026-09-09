/**
 * Simulacao roteirizada da Tarefa especial: uma batida ativa por vez (A→B→C),
 * pathfinding pelas portas, baloes de fala. Ao terminar, reinicia a historia.
 */

import type { Activity, ActorState, Cell } from '@microfirma/contracts';
import {
  createRng,
  facingDeDelta,
  findPath,
  isWalkable,
  type NavGrid,
} from '@microfirma/world-engine';
import type { AgenteEspacial, CenarioEspacial } from '../espaco-agencia';
import type { DebugSim } from '../simulacao-agentes';
import type { AcaoBatida, Batida, Historia, PapelHistoria } from './historias';

const VELOCIDADE_CELULAS_POR_S = 2.6;

export type AtorTarefa = ActorState & { speech?: string };

export type StatusTarefa = {
  historiaId: string;
  titulo: string;
  resumo: string;
  batidaIndex: number;
  batidaTotal: number;
  batidaId: string;
  papelAtivo: PapelHistoria;
  nomeAtivo: string;
  falaAtiva: string | null;
};

type AgenteInterno = {
  meta: AgenteEspacial;
  papel: PapelHistoria;
  x: number;
  y: number;
  facing: 0 | 1 | 2 | 3;
  activity: Activity;
  progress: number;
  path: Cell[];
  speech?: string;
  ateMs: number;
  duracaoMs: number;
};

export class SimulacaoTarefaEspecial {
  private readonly nav: NavGrid;
  private readonly corredor: Cell[];
  private readonly agentes = new Map<string, AgenteInterno>();
  private readonly porPapel = new Map<PapelHistoria, AgenteInterno>();
  private readonly historia: Historia;
  private batidaIndex = 0;
  private batidaPronta = false;
  private readonly rng: ReturnType<typeof createRng>;

  constructor(cenario: CenarioEspacial, historia: Historia, seed: number) {
    this.historia = historia;
    this.nav = cenario.nav;
    this.corredor = cenario.layout.corridors.filter((c) => isWalkable(this.nav, c));
    this.rng = createRng(seed).fork('sim-tarefa');

    const metas = new Map(cenario.agentes.map((a) => [a.agentId, a]));
    for (const papel of ['A', 'B', 'C'] as PapelHistoria[]) {
      const info = historia.papeis[papel];
      const meta = metas.get(info.agentId);
      if (!meta) continue;
      const inicio = meta.seat ?? meta.door;
      const ator: AgenteInterno = {
        meta,
        papel,
        x: inicio.x,
        y: inicio.y,
        facing: meta.seatFrac?.facing ?? 2,
        activity: 'idle',
        progress: 0,
        path: [],
        ateMs: 0,
        duracaoMs: 0,
      };
      this.agentes.set(info.agentId, ator);
      this.porPapel.set(papel, ator);
    }

    this.iniciarBatidaAtual();
  }

  tick(dtMs: number): AtorTarefa[] {
    for (const ator of this.agentes.values()) {
      if (ator.path.length > 0) {
        this.avancarCaminho(ator, dtMs);
      }
    }

    const batida = this.historia.batidas[this.batidaIndex];
    if (batida) {
      const ator = this.porPapel.get(batida.agente);
      if (ator && ator.path.length === 0) {
        this.tickBatidaParada(ator, batida, dtMs);
      }
    }

    return this.snapshot();
  }

  status(): StatusTarefa {
    const batida = this.historia.batidas[this.batidaIndex];
    const papel = batida?.agente ?? 'A';
    const acao = batida?.acao;
    const fala =
      acao && 'fala' in acao ? acao.fala : this.porPapel.get(papel)?.speech ?? null;
    return {
      historiaId: this.historia.id,
      titulo: this.historia.titulo,
      resumo: this.historia.resumo,
      batidaIndex: this.batidaIndex,
      batidaTotal: this.historia.batidas.length,
      batidaId: batida?.id ?? '',
      papelAtivo: papel,
      nomeAtivo: this.historia.papeis[papel].nome,
      falaAtiva: fala,
    };
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

  private snapshot(): AtorTarefa[] {
    const out: AtorTarefa[] = [];
    for (const ator of this.agentes.values()) {
      const noPosto =
        ator.path.length === 0 &&
        (ator.activity === 'working' ||
          ator.activity === 'idle' ||
          ator.activity === 'talking' ||
          ator.activity === 'waiting_approval')
          ? ator.meta.seatFrac
          : undefined;
      // So aplica seatFrac se o ator esta perto do proprio assento
      const pertoDoAssento =
        ator.meta.seat &&
        Math.hypot(ator.x - ator.meta.seat.x, ator.y - ator.meta.seat.y) < 0.35;
      const usarFrac = noPosto && pertoDoAssento ? noPosto : undefined;
      out.push({
        agentId: ator.meta.agentId,
        x: usarFrac?.x ?? ator.x,
        y: usarFrac?.y ?? ator.y,
        facing: usarFrac?.facing ?? ator.facing,
        activity: ator.activity,
        pose: usarFrac ? 'seated' : 'standing',
        progress: ator.progress,
        health: 'healthy',
        isInternal: false,
        ...(ator.speech ? { speech: ator.speech } : {}),
      });
    }
    return out;
  }

  private avancarCaminho(ator: AgenteInterno, dtMs: number): void {
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
    // A ultima celula consumida encerra o deslocamento no mesmo tick: manter
    // `walking` aqui deixaria o ator pisando no lugar ate a proxima batida.
    ator.activity = ator.path.length > 0 ? 'walking' : 'idle';
    ator.progress = 0;
    delete ator.speech;
  }

  private tickBatidaParada(ator: AgenteInterno, batida: Batida, dtMs: number): void {
    if (!this.batidaPronta) {
      this.dispararAcao(ator, batida.acao);
      this.batidaPronta = true;
      if (ator.path.length > 0) return;
    }

    const acao = batida.acao;
    if (acao.tipo === 'ir_porta_propria' || acao.tipo === 'ir_corredor' || acao.tipo === 'ir_porta_de' || acao.tipo === 'ir_assento_de' || acao.tipo === 'voltar_assento') {
      // Deslocamento ja concluido (path vazio)
      this.avancarBatida();
      return;
    }

    if (ator.duracaoMs > 0) {
      ator.ateMs -= dtMs;
      ator.progress = 1 - Math.max(0, ator.ateMs) / ator.duracaoMs;
      if (ator.ateMs <= 0) {
        ator.progress = 1;
        this.avancarBatida();
      }
    } else {
      this.avancarBatida();
    }
  }

  private dispararAcao(ator: AgenteInterno, acao: AcaoBatida): void {
    // Limpa fala dos outros; so o ativo fala
    for (const a of this.agentes.values()) {
      if (a !== ator) {
        delete a.speech;
        if (a.activity === 'talking' || a.activity === 'waiting_approval') {
          a.activity = 'idle';
          a.progress = 0;
        }
      }
    }

    switch (acao.tipo) {
      case 'trabalhar':
        ator.activity = 'working';
        ator.speech = acao.fala;
        ator.duracaoMs = acao.ms;
        ator.ateMs = acao.ms;
        ator.progress = 0;
        break;
      case 'falar':
        ator.activity = 'talking';
        ator.speech = acao.fala;
        ator.duracaoMs = acao.ms;
        ator.ateMs = acao.ms;
        ator.progress = 0;
        break;
      case 'aguardar_aprovacao':
        ator.activity = 'waiting_approval';
        ator.speech = acao.fala;
        ator.duracaoMs = acao.ms;
        ator.ateMs = acao.ms;
        ator.progress = 0;
        break;
      case 'ir_porta_propria':
        this.mandarPara(ator, ator.meta.door);
        break;
      case 'ir_corredor': {
        const dest = this.celulaCorredor() ?? ator.meta.door;
        this.mandarPara(ator, dest);
        break;
      }
      case 'ir_porta_de': {
        const alvo = this.porPapel.get(acao.de);
        this.mandarPara(ator, alvo?.meta.door ?? ator.meta.door);
        break;
      }
      case 'ir_assento_de': {
        const alvo = this.porPapel.get(acao.de);
        const dest = alvo?.meta.seat ?? alvo?.meta.door ?? ator.meta.door;
        this.mandarPara(ator, dest);
        break;
      }
      case 'voltar_assento': {
        const dest = ator.meta.seat ?? ator.meta.door;
        this.mandarPara(ator, dest);
        break;
      }
    }
  }

  private iniciarBatidaAtual(): void {
    this.batidaPronta = false;
    const batida = this.historia.batidas[this.batidaIndex];
    if (!batida) return;
    // Agentes ociosos no assento enquanto esperam sua vez. Quem ainda tem rota
    // continua andando; sem rota, `walking` e sempre estado residual.
    for (const a of this.agentes.values()) {
      if (a.papel !== batida.agente && a.path.length === 0) {
        a.activity = 'idle';
        a.progress = 0;
      }
    }
  }

  private avancarBatida(): void {
    this.batidaIndex += 1;
    if (this.batidaIndex >= this.historia.batidas.length) {
      this.batidaIndex = 0;
      // Reinicia no posto de cada um
      for (const a of this.agentes.values()) {
        const inicio = a.meta.seat ?? a.meta.door;
        a.x = inicio.x;
        a.y = inicio.y;
        a.path = [];
        a.activity = 'idle';
        a.progress = 0;
        delete a.speech;
        a.ateMs = 0;
        a.duracaoMs = 0;
      }
    }
    this.iniciarBatidaAtual();
  }

  private mandarPara(ator: AgenteInterno, destino: Cell): void {
    const origem = { x: Math.round(ator.x), y: Math.round(ator.y) };
    const rota = findPath(this.nav, origem, destino);
    ator.path = rota ?? [];
    delete ator.speech;
    ator.duracaoMs = 0;
    ator.ateMs = 0;
    ator.progress = 0;
    if (ator.path.length > 0) ator.activity = 'walking';
    else ator.activity = 'idle';
  }

  private celulaCorredor(): Cell | undefined {
    if (this.corredor.length === 0) return undefined;
    return this.rng.pick(this.corredor);
  }
}

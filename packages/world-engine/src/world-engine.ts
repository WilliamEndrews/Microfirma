/**
 * WORLD ENGINE - a simulacao autoritativa do escritorio.
 *
 * DECISAO ARQUITETURAL (ADR-0006): esta simulacao roda no SERVIDOR, nao no
 * navegador. Se o mundo fosse calculado no cliente:
 *  - dois usuarios da mesma empresa veriam escritorios diferentes;
 *  - o Replay seria irreproduzivel;
 *  - nao haveria auditoria possivel do que foi mostrado a quem.
 * O navegador e um terminal burro e bonito. Aqui, na Fase 0, o mesmo codigo
 * roda no browser apenas por conveniencia de demonstracao - a interface publica
 * (ingest / tick / snapshot) e identica a que sera exposta por WebSocket.
 *
 * O engine e deterministico: dado o mesmo layout, a mesma seed e a mesma
 * sequencia de (eventos, dt), produz exatamente os mesmos quadros.
 *
 * Ele NAO decide o que e importante - isso e do Narrative Scheduler. Aqui so
 * existe cinematica: quem anda para onde, em quanto tempo, com qual animacao.
 */

import type {
  ActorState,
  AgentDescriptor,
  Cell,
  DeskAmbient,
  DomainEvent,
  NarrativeIntent,
  OfficeLayout,
  Prop,
  Room,
  RoomAmbient,
  WorldDelta,
  WorldSnapshot,
} from '@microfirma/contracts';
import { buildNavGrid, findPath, isWalkable, seatCellFor, type NavGrid } from './navgrid.js';
import { NarrativeScheduler, type NarrativeConfig } from './narrative-scheduler.js';
import { createRng, type Rng } from './prng.js';

/** Velocidade de caminhada, em celulas por segundo. Calibrada para legibilidade. */
const VELOCIDADE_CELULAS_POR_S = 2.6;

/** Papel operacional do ator dentro do mundo. */
type ActorRole = 'client' | 'janitor' | 'technician';

interface Actor {
  agentId: string;
  role: ActorRole;
  isInternal: boolean;
  x: number;
  y: number;
  facing: 0 | 1 | 2 | 3;
  activity: ActorState['activity'];
  /** Rota pendente (celulas restantes). */
  path: Cell[];
  /** Instante (relogio do mundo) em que a atividade atual termina. 0 = indefinida. */
  ateMs: number;
  /** Duracao total da atividade atual, para calcular progresso. */
  duracaoMs: number;
  homeDesk?: Prop;
  seat?: Cell;
  intent?: NarrativeIntent;
  causedByEventId?: string;
  /** Alvo de servico dos agentes internos (agentId atendido). */
  atendendo?: string;
}

export interface WorldEngineOptions {
  layout: OfficeLayout;
  agents: AgentDescriptor[];
  seed: number;
  narrative?: Partial<NarrativeConfig>;
}

export class WorldEngine {
  readonly layout: OfficeLayout;
  private readonly nav: NavGrid;
  private readonly rng: Rng;
  private readonly scheduler: NarrativeScheduler;
  private readonly agentes = new Map<string, AgentDescriptor>();
  private readonly atores = new Map<string, Actor>();
  private readonly mesaPorAgente = new Map<string, Prop>();

  private tick_ = 0;
  private tMundo = 0;

  private readonly salaDescanso?: Room;
  private readonly salaReuniao?: Room;
  private readonly entrada: Cell;

  constructor(opts: WorldEngineOptions) {
    this.layout = opts.layout;
    this.nav = buildNavGrid(opts.layout);
    this.rng = createRng(opts.seed).fork('world');
    this.scheduler = new NarrativeScheduler(opts.narrative);

    for (const p of opts.layout.props) {
      if (p.kind === 'desk' && p.ownerAgentId) this.mesaPorAgente.set(p.ownerAgentId, p);
    }

    this.salaDescanso = opts.layout.rooms.find((r) => r.kind === 'break');
    this.salaReuniao =
      opts.layout.rooms.find((r) => r.kind === 'war_room') ??
      opts.layout.rooms.find((r) => r.kind === 'meeting');
    this.entrada =
      opts.layout.rooms.find((r) => r.kind === 'reception')?.door ??
      opts.layout.corridors[0] ?? { x: 1, y: 1 };

    for (const agente of opts.agents) this.registrarAgente(agente);

    // Equipe interna da MicroFirma. Sao atores de verdade no mundo, mas o seu
    // comportamento e 100% codigo (behavior tree simples): chamar LLM para
    // decidir "ir varrer" seria queimar dinheiro sem ganho algum (ADR-0005).
    this.criarAtorInterno('microfirma-zelador', 'janitor');
    this.criarAtorInterno('microfirma-tecnico', 'technician');
  }

  /** Registra um agente descoberto em runtime (deploy novo = cena de RH). */
  registrarAgente(agente: AgentDescriptor): void {
    this.agentes.set(agente.agentId, agente);
    if (this.atores.has(agente.agentId)) return;

    const mesa = this.mesaPorAgente.get(agente.agentId);
    const assento = mesa ? seatCellFor(this.nav, mesa.cell) : null;
    const inicio = assento ?? this.entrada;

    this.atores.set(agente.agentId, {
      agentId: agente.agentId,
      role: 'client',
      isInternal: false,
      x: inicio.x,
      y: inicio.y,
      facing: 0,
      activity: 'idle',
      path: [],
      ateMs: 0,
      duracaoMs: 0,
      ...(mesa ? { homeDesk: mesa } : {}),
      ...(assento ? { seat: assento } : {}),
    });
  }

  ingest(eventos: DomainEvent | DomainEvent[]): void {
    const lista = Array.isArray(eventos) ? eventos : [eventos];
    for (const e of lista) {
      if (e.type === 'agent.discovered') this.registrarAgente(e.agent);
      this.scheduler.ingest(e);
    }
  }

  /** Um passo de simulacao. dtMs tipico: 100 ms (10 Hz). */
  tick(dtMs: number): WorldDelta {
    this.tick_++;
    this.tMundo += dtMs;

    const { intents, chatter } = this.scheduler.tick(dtMs);
    for (const intencao of intents) this.aplicarIntencao(intencao);

    this.decidirServicosInternos();

    for (const ator of this.atores.values()) this.avancarAtor(ator, dtMs);

    return {
      kind: 'delta',
      tick: this.tick_,
      tMundo: this.tMundo,
      alpha: 1, // ao vivo: tempo do mundo = tempo real. Alpha != 1 so em Replay.
      actors: [...this.atores.values()].map((a) => this.projetarAtor(a)),
      desks: this.projetarMesas(),
      rooms: this.projetarSalas(),
      kpis: this.scheduler.kpis(),
      chatter,
    };
  }

  snapshot(): WorldSnapshot {
    return {
      kind: 'snapshot',
      tick: this.tick_,
      tMundo: this.tMundo,
      alpha: 1,
      layout: this.layout,
      actors: [...this.atores.values()].map((a) => this.projetarAtor(a)),
      desks: this.projetarMesas(),
      rooms: this.projetarSalas(),
      kpis: this.scheduler.kpis(),
    };
  }

  /** O humano respondeu a uma aprovacao: o agente destrava e volta a mesa. */
  resolverAprovacao(agentId: string): void {
    this.scheduler.resolveApproval(agentId);
    const ator = this.atores.get(agentId);
    if (ator && ator.activity === 'waiting_approval') {
      ator.activity = 'idle';
      ator.ateMs = 0;
      delete ator.intent;
    }
  }

  // -------------------------------------------------------------------------
  // Intencoes -> cinematica
  // -------------------------------------------------------------------------

  private aplicarIntencao(intencao: NarrativeIntent): void {
    const ator = this.atores.get(intencao.agentId);
    if (!ator) return;
    // Encenacao em curso com prioridade maior ou igual nao e interrompida:
    // animacao cortada no meio e a principal fonte de "parece quebrado".
    if (ator.intent && ator.intent.priority >= intencao.priority && ator.ateMs > this.tMundo) {
      return;
    }

    ator.intent = intencao;
    if (intencao.causedByEventId) ator.causedByEventId = intencao.causedByEventId;

    const destino = this.destinoDe(ator, intencao);
    if (destino) this.mandarPara(ator, destino);
    ator.duracaoMs = intencao.minDurationMs;
    ator.ateMs = this.tMundo + intencao.minDurationMs;
  }

  private destinoDe(ator: Actor, intencao: NarrativeIntent): Cell | null {
    switch (intencao.behavior) {
      case 'go_to_desk':
      case 'work':
        return ator.seat ?? null;
      case 'go_to_break':
        return this.salaDescanso ? this.celulaLivreEm(this.salaDescanso) : null;
      case 'go_to_door':
        return isWalkable(this.nav, this.entrada) ? this.entrada : null;
      case 'meet':
        return this.salaReuniao ? this.celulaLivreEm(this.salaReuniao) : null;
      default:
        return null;
    }
  }

  private mandarPara(ator: Actor, destino: Cell): void {
    const origem = { x: Math.round(ator.x), y: Math.round(ator.y) };
    const rota = findPath(this.nav, origem, destino);
    if (rota === null) {
      // Sem rota: o ator nao teleporta. Ele permanece onde esta e o problema
      // aparece no log - falha visivel e melhor que mundo inconsistente.
      console.warn(`[world] sem rota de ${origem.x},${origem.y} para ${destino.x},${destino.y}`);
      ator.path = [];
      return;
    }
    ator.path = rota;
    if (rota.length > 0) ator.activity = 'walking';
  }

  private avancarAtor(ator: Actor, dtMs: number): void {
    // 1) deslocamento
    if (ator.path.length > 0) {
      const alvo = ator.path[0] as Cell;
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

    // 2) chegou: assume a atividade final da intencao
    const atividadeFinal = this.atividadeFinalDe(ator);
    if (ator.activity === 'walking') ator.activity = atividadeFinal;

    // 3) fim de atividade temporizada
    if (ator.ateMs > 0 && this.tMundo >= ator.ateMs) {
      this.concluirAtividade(ator);
    } else if (ator.ateMs === 0 && ator.activity !== 'waiting_approval') {
      ator.activity = ator.activity === 'resting' ? 'resting' : atividadeFinal;
    }
  }

  private atividadeFinalDe(ator: Actor): ActorState['activity'] {
    switch (ator.intent?.behavior) {
      case 'go_to_desk':
      case 'work':
        return 'working';
      case 'go_to_break':
        return 'resting';
      case 'go_to_door':
        return 'waiting_approval';
      case 'meet':
        return 'talking';
      case 'sweep':
        return 'sweeping';
      case 'repair':
        return 'repairing';
      default:
        return ator.role === 'client' ? 'idle' : 'idle';
    }
  }

  private concluirAtividade(ator: Actor): void {
    // Servicos internos aplicam seu efeito no ESTADO ao terminar a animacao.
    // A ordem importa: o efeito acontece quando o usuario ve acontecer.
    if (ator.role === 'janitor' && ator.activity === 'sweeping' && ator.atendendo) {
      this.scheduler.clearLitter(ator.atendendo);
      delete ator.atendendo;
    }
    if (ator.role === 'technician' && ator.activity === 'repairing' && ator.atendendo) {
      this.scheduler.repairLight(ator.atendendo);
      delete ator.atendendo;
    }
    if (ator.activity === 'waiting_approval') return; // so sai por acao humana

    ator.activity = 'idle';
    ator.ateMs = 0;
    ator.duracaoMs = 0;
    delete ator.intent;
  }

  // -------------------------------------------------------------------------
  // Equipe interna: behavior tree deterministica, sem LLM
  // -------------------------------------------------------------------------

  private decidirServicosInternos(): void {
    const zelador = this.atores.get('microfirma-zelador');
    if (zelador && !zelador.atendendo && zelador.path.length === 0 && zelador.ateMs === 0) {
      const alvo = this.agenteComMaior((a) => this.scheduler.ambientFor(a).litter, 2);
      if (alvo) this.despacharServico(zelador, alvo, 'sweep', 2500);
    }

    const tecnico = this.atores.get('microfirma-tecnico');
    if (tecnico && !tecnico.atendendo && tecnico.path.length === 0 && tecnico.ateMs === 0) {
      const alvo = this.agenteComMaior(
        (a) => (this.scheduler.ambientFor(a).lightBroken ? 1 : 0),
        1,
      );
      if (alvo) this.despacharServico(tecnico, alvo, 'repair', 3200);
    }
  }

  /** Agente com maior valor da metrica, acima de um limiar. Empate: menor id. */
  private agenteComMaior(metrica: (agentId: string) => number, limiar: number): string | null {
    let melhor: string | null = null;
    let melhorValor = limiar - 1;
    for (const id of [...this.agentes.keys()].sort()) {
      const v = metrica(id);
      if (v >= limiar && v > melhorValor) {
        melhor = id;
        melhorValor = v;
      }
    }
    return melhor;
  }

  private despacharServico(
    interno: Actor,
    agenteAlvo: string,
    behavior: 'sweep' | 'repair',
    duracaoMs: number,
  ): void {
    const mesa = this.mesaPorAgente.get(agenteAlvo);
    const destino = mesa ? seatCellFor(this.nav, mesa.cell) : null;
    if (!destino) return;

    interno.atendendo = agenteAlvo;
    interno.intent = {
      intentId: `interno-${behavior}-${agenteAlvo}-${this.tick_}`,
      agentId: interno.agentId,
      behavior,
      target: mesa?.propId,
      minDurationMs: duracaoMs,
      priority: 0.6,
      representsEvents: 1,
    };
    this.mandarPara(interno, destino);
    interno.duracaoMs = duracaoMs;
    interno.ateMs = this.tMundo + duracaoMs + this.estimarTempoDeRota(interno);
  }

  private estimarTempoDeRota(ator: Actor): number {
    return (ator.path.length / VELOCIDADE_CELULAS_POR_S) * 1000;
  }

  private criarAtorInterno(agentId: string, role: ActorRole): void {
    this.atores.set(agentId, {
      agentId,
      role,
      isInternal: true,
      x: this.entrada.x,
      y: this.entrada.y,
      facing: 0,
      activity: 'idle',
      path: [],
      ateMs: 0,
      duracaoMs: 0,
    });
  }

  // -------------------------------------------------------------------------
  // Projecoes para o protocolo de mundo
  // -------------------------------------------------------------------------

  private projetarAtor(ator: Actor): ActorState {
    const ambiente = ator.isInternal ? null : this.scheduler.ambientFor(ator.agentId);
    const progresso =
      ator.duracaoMs > 0 && ator.ateMs > 0
        ? clamp01(1 - (ator.ateMs - this.tMundo) / ator.duracaoMs)
        : 0;

    return {
      agentId: ator.agentId,
      x: ator.x,
      y: ator.y,
      facing: ator.facing,
      activity: ator.activity,
      progress: progresso,
      health: !ambiente
        ? 'healthy'
        : ambiente.incident > 0.6
          ? 'failing'
          : ambiente.heat > 0.5 || ambiente.lightBroken
            ? 'degraded'
            : 'healthy',
      isInternal: ator.isInternal,
      ...(ator.causedByEventId ? { causedByEventId: ator.causedByEventId } : {}),
    };
  }

  private projetarMesas(): DeskAmbient[] {
    return this.layout.props
      .filter((p) => p.kind === 'desk')
      .map((mesa) => {
        const dono = mesa.ownerAgentId;
        const a = dono ? this.scheduler.ambientFor(dono) : null;
        return {
          propId: mesa.propId,
          ...(dono ? { ownerAgentId: dono } : {}),
          heat: a?.heat ?? 0,
          queuePile: a?.queuePile ?? 0,
          litter: a?.litter ?? 0,
        };
      });
  }

  private projetarSalas(): RoomAmbient[] {
    const kpis = this.scheduler.kpis();
    // Apagao por orcamento: estourar o teto de custo apaga as luzes do predio.
    // E a forma mais direta de comunicar "voce esta gastando alem do previsto".
    const apagao = kpis.costUsdToday > kpis.budgetUsdToday;

    return this.layout.rooms.map((sala) => {
      let luzQueimada = apagao;
      let incidente = 0;
      for (const mesa of this.layout.props) {
        if (mesa.kind !== 'desk' || mesa.roomId !== sala.roomId || !mesa.ownerAgentId) continue;
        const a = this.scheduler.ambientFor(mesa.ownerAgentId);
        if (a.lightBroken) luzQueimada = true;
        incidente = Math.max(incidente, a.incident);
      }
      return { roomId: sala.roomId, lightBroken: luzQueimada, incident: incidente };
    });
  }

  /** Celula livre dentro de uma sala, escolhida de forma estavel pela seed. */
  private celulaLivreEm(sala: Room): Cell | null {
    const candidatas: Cell[] = [];
    for (let y = sala.rect.y0; y < sala.rect.y1; y++) {
      for (let x = sala.rect.x0; x < sala.rect.x1; x++) {
        if (isWalkable(this.nav, { x, y })) candidatas.push({ x, y });
      }
    }
    if (candidatas.length === 0) return null;
    return this.rng.pick(candidatas);
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

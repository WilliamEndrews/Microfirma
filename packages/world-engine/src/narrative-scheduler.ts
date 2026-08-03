/**
 * MOTOR DE TEMPO NARRATIVO - o Narrative Scheduler
 *
 * ESTE E O CORACAO DO PRODUTO. Se este arquivo estiver errado, a MicroFirma
 * parece um brinquedo quebrado, independentemente da qualidade da arte.
 *
 * O PROBLEMA (ignorado pelas duas consultorias iniciais):
 * um agente real executa uma tool call em 40 ms; uma cadeia completa em 900 ms.
 * Um boneco andando ate a impressora precisa de ~3 s para ser LEGIVEL ao olho
 * humano. Ou seja: existe uma incompatibilidade de 2 a 4 ordens de grandeza
 * entre o tempo do sistema e o tempo da narrativa. Mapear evento -> animacao
 * 1:1 produz teletransporte, animacoes canceladas no meio e epilepsia visual.
 *
 * A SOLUCAO, em tres mecanismos:
 *
 *  1. AGREGACAO - eventos do mesmo agente dentro de uma janela viram UMA
 *     unidade narrativa (`representsEvents` guarda quantos fatos ela resume).
 *
 *  2. DIVIDA NARRATIVA (`debtMs`) - toda encenacao tem duracao minima de
 *     legibilidade. A encenacao naturalmente atrasa em relacao ao mundo real;
 *     essa defasagem e medida. Quando ela passa de `maxDebtMs`, o agente entra
 *     em MODO AMBIENTE: para de encenar deslocamentos e passa a comunicar seu
 *     estado por meios continuos (brilho da mesa, calor, pilha de fila). Nada
 *     e perdido - muda a LINGUAGEM de representacao, nao o conteudo.
 *
 *  3. ORCAMENTO DE ATENCAO (`attentionBudget`) - o ser humano acompanha ~6
 *     acoes simultaneas. Acima disso, so os fatos de maior prioridade sao
 *     encenados (incidente ganha do cotidiano); o resto vira ambiente.
 *
 * NAO usamos dilatacao temporal (alpha != 1) no modo ao vivo. Diminuir o tempo
 * do mundo para "caber" os eventos faria a visualizacao divergir da realidade
 * de forma cumulativa e sem limite. Alpha existe apenas para Replay/Foco.
 *
 * Spec completa: docs/specs/motor-de-tempo-narrativo.md
 */

import type { DomainEvent, NarrativeIntent, WorldKpis } from '@microfirma/contracts';

export interface NarrativeConfig {
  /** Duracao minima, em ms, para que uma encenacao seja compreensivel. */
  minLegibleMs: number;
  /** Quantas encenacoes simultaneas o usuario consegue acompanhar. */
  attentionBudget: number;
  /** Defasagem maxima tolerada antes de cair para modo ambiente. */
  maxDebtMs: number;
  /** Janela de coalescencia de eventos por agente. */
  aggregationWindowMs: number;
  /** Ociosidade a partir da qual o agente vai para a sala de descanso. */
  idleToRestMs: number;
  /** Quantos runs concluidos geram 1 unidade de "lixo" na mesa. */
  runsPorLixo: number;
  /** Orcamento diario em USD. Estourar aciona apagao progressivo. */
  budgetUsdToday: number;
}

export const CONFIG_PADRAO: NarrativeConfig = {
  minLegibleMs: 1200,
  attentionBudget: 6,
  maxDebtMs: 4000,
  aggregationWindowMs: 1500,
  idleToRestMs: 25_000,
  runsPorLixo: 4,
  budgetUsdToday: 50,
};

/** Estado ambiente por agente: a linguagem continua de representacao. */
export interface AgentAmbient {
  /** 0..1 - "a mesa esquenta": retries, loops, erros repetidos. */
  heat: number;
  /** Unidades de lixo acumuladas = trabalho concluido nao coletado. */
  litter: number;
  /** Folhas na pilha = profundidade de fila observada. */
  queuePile: number;
  /** 0..1 - severidade de incidente ativo na area do agente. */
  incident: number;
  /** Luz queimada nesta area (erro de dependencia externa). */
  lightBroken: boolean;
}

export interface Chatter {
  agentId: string;
  text: string;
  eventId?: string;
}

export interface NarrativeOutput {
  intents: NarrativeIntent[];
  chatter: Chatter[];
}

/** Estado interno acumulado por agente. Nada aqui e exposto diretamente. */
interface AgentTrack {
  agentId: string;
  activeRuns: number;
  runsConcluidos: number;
  /** Tempo interno (ms) do ultimo evento relevante. */
  ultimaAtividadeMs: number;
  /** Eventos aguardando decisao de encenacao na janela atual. */
  eventosPendentes: number;
  /** Evento que originou a pendencia - preserva o caminho pixel -> span. */
  eventoOrigem?: string;
  janelaAbertaEmMs: number;
  debtMs: number;
  modoAmbiente: boolean;
  ambient: AgentAmbient;
  aprovacaoPendente: boolean;
  descansando: boolean;
}

export class NarrativeScheduler {
  private readonly cfg: NarrativeConfig;
  private readonly tracks = new Map<string, AgentTrack>();
  /** Relogio interno em ms. Avanca somente via tick(): 100% deterministico. */
  private agoraMs = 0;
  private proximoIntentId = 1;
  /** Encenacoes em voo: intentId -> instante previsto de termino. */
  private readonly emVoo = new Map<string, number>();
  private custoUsdHoje = 0;
  private tokensRecentes: Array<{ t: number; tokens: number }> = [];
  private errosRecentes: number[] = [];
  private chatterPendente: Chatter[] = [];

  constructor(cfg: Partial<NarrativeConfig> = {}) {
    this.cfg = { ...CONFIG_PADRAO, ...cfg };
  }

  /**
   * Absorve um evento de dominio. NAO decide encenacao aqui - apenas acumula.
   * Decidir no tick mantem o sistema quantizado no tempo e reproduzivel.
   */
  ingest(evento: DomainEvent): void {
    if (evento.type === 'agent.discovered') {
      this.track(evento.agent.agentId);
      return;
    }

    const t = this.track(evento.agentId);
    t.ultimaAtividadeMs = this.agoraMs;
    t.descansando = false;

    switch (evento.type) {
      case 'run.started': {
        t.activeRuns++;
        this.acumular(t, evento.eventId);
        break;
      }
      case 'run.finished': {
        t.activeRuns = Math.max(0, t.activeRuns - 1);
        t.runsConcluidos++;
        // Trabalho concluido gera "lixo": a metafora do volume de producao.
        if (t.runsConcluidos % this.cfg.runsPorLixo === 0) {
          t.ambient.litter = Math.min(6, t.ambient.litter + 1);
        }
        if (evento.status !== 'ok') {
          t.ambient.heat = Math.min(1, t.ambient.heat + 0.12);
        }
        break;
      }
      case 'tool.called': {
        // Ferramenta e trabalho de rotina: nao merece encenacao propria,
        // apenas confirma que o agente esta ocupado.
        if (!evento.ok) t.ambient.heat = Math.min(1, t.ambient.heat + 0.08);
        break;
      }
      case 'llm.completed': {
        this.custoUsdHoje += evento.costUsd;
        this.tokensRecentes.push({
          t: this.agoraMs,
          tokens: evento.inputTokens + evento.outputTokens,
        });
        break;
      }
      case 'error.raised': {
        this.errosRecentes.push(this.agoraMs);
        const incremento =
          evento.severity === 'critical' ? 0.45 : evento.severity === 'error' ? 0.25 : 0.1;
        t.ambient.heat = Math.min(1, t.ambient.heat + incremento);
        t.ambient.incident = Math.min(1, t.ambient.incident + incremento);
        // Falha de dependencia externa = luz queimada. O Tecnico sera acionado.
        if (evento.kind.includes('5xx') || evento.kind.includes('timeout')) {
          t.ambient.lightBroken = true;
        }
        this.falar(t.agentId, `${evento.kind} (${evento.severity})`, evento.eventId);
        this.acumular(t, evento.eventId);
        break;
      }
      case 'approval.requested': {
        t.aprovacaoPendente = true;
        this.falar(t.agentId, evento.question, evento.eventId);
        this.acumular(t, evento.eventId);
        break;
      }
      case 'queue.observed': {
        t.ambient.queuePile = Math.min(8, evento.depth);
        break;
      }
      default:
        break;
    }
  }

  /**
   * Avanca o relogio e decide o que sera encenado.
   * @param dtMs passo de tempo real, em ms (tipicamente 100 ms = 10 Hz)
   */
  tick(dtMs: number): NarrativeOutput {
    this.agoraMs += dtMs;
    this.decairAmbiente(dtMs);
    this.expirarJanelas();

    const intents: NarrativeIntent[] = [];
    const emVooAtual = this.contarEmVoo();
    let orcamentoLivre = Math.max(0, this.cfg.attentionBudget - emVooAtual);

    // Candidatos ordenados por prioridade. Deterministico: prioridade desc,
    // depois agentId asc (nunca depende da ordem do Map).
    const candidatos = [...this.tracks.values()]
      .map((t) => ({ track: t, prioridade: this.prioridadeDe(t) }))
      .filter((c) => c.prioridade > 0)
      .sort(
        (a, b) => b.prioridade - a.prioridade || a.track.agentId.localeCompare(b.track.agentId),
      );

    for (const { track, prioridade } of candidatos) {
      // Amortiza a divida antes de decidir: um agente que ja esta atrasado
      // nao recebe mais encenacoes, ele "conta" pelo ambiente.
      track.debtMs = Math.max(0, track.debtMs - dtMs);
      track.modoAmbiente = track.debtMs > this.cfg.maxDebtMs;

      if (track.modoAmbiente) {
        // O fato nao e descartado: ele engorda o ambiente.
        if (track.eventosPendentes > 0) {
          track.ambient.heat = Math.min(1, track.ambient.heat + 0.02 * track.eventosPendentes);
          track.eventosPendentes = 0;
        }
        continue;
      }

      const intencao = this.montarIntencao(track, prioridade, orcamentoLivre);
      if (!intencao) continue;

      intents.push(intencao);
      this.emVoo.set(intencao.intentId, this.agoraMs + intencao.minDurationMs);
      track.debtMs += intencao.minDurationMs;
      track.eventosPendentes = 0;
      delete track.eventoOrigem;
      orcamentoLivre = Math.max(0, orcamentoLivre - 1);
    }

    const chatter = this.chatterPendente.slice(0, 3);
    this.chatterPendente = [];
    return { intents, chatter };
  }

  /** Estado ambiente do agente, para o WorldEngine projetar em mesas e salas. */
  ambientFor(agentId: string): AgentAmbient {
    return this.track(agentId).ambient;
  }

  /** O agente esta representado por meios continuos em vez de encenacao? */
  isAmbientMode(agentId: string): boolean {
    return this.track(agentId).modoAmbiente;
  }

  /** Defasagem atual da narrativa para esse agente, em ms. Util para diagnostico. */
  debtFor(agentId: string): number {
    return this.track(agentId).debtMs;
  }

  /** O Zelador limpou a mesa: consome o lixo acumulado. */
  clearLitter(agentId: string): void {
    this.track(agentId).ambient.litter = 0;
  }

  /** O Tecnico trocou a lampada: encerra o incidente visual daquela area. */
  repairLight(agentId: string): void {
    const t = this.track(agentId);
    t.ambient.lightBroken = false;
    t.ambient.incident = Math.max(0, t.ambient.incident - 0.5);
  }

  kpis(): WorldKpis {
    const janela5min = this.agoraMs - 5 * 60_000;
    this.errosRecentes = this.errosRecentes.filter((t) => t >= janela5min);
    const janela1min = this.agoraMs - 60_000;
    this.tokensRecentes = this.tokensRecentes.filter((x) => x.t >= janela1min);

    let activeRuns = 0;
    let pendingApprovals = 0;
    for (const t of this.tracks.values()) {
      activeRuns += t.activeRuns;
      if (t.aprovacaoPendente) pendingApprovals++;
    }

    return {
      activeRuns,
      costUsdToday: this.custoUsdHoje,
      budgetUsdToday: this.cfg.budgetUsdToday,
      errorsLast5Min: this.errosRecentes.length,
      tokensPerMinute: this.tokensRecentes.reduce((s, x) => s + x.tokens, 0),
      pendingApprovals,
    };
  }

  /** Resolve a aprovacao (o humano respondeu): o agente volta ao trabalho. */
  resolveApproval(agentId: string): void {
    this.track(agentId).aprovacaoPendente = false;
  }

  // -------------------------------------------------------------------------
  // internos
  // -------------------------------------------------------------------------

  private track(agentId: string): AgentTrack {
    let t = this.tracks.get(agentId);
    if (!t) {
      t = {
        agentId,
        activeRuns: 0,
        runsConcluidos: 0,
        ultimaAtividadeMs: this.agoraMs,
        eventosPendentes: 0,
        janelaAbertaEmMs: -1,
        debtMs: 0,
        modoAmbiente: false,
        aprovacaoPendente: false,
        descansando: false,
        ambient: { heat: 0, litter: 0, queuePile: 0, incident: 0, lightBroken: false },
      };
      this.tracks.set(agentId, t);
    }
    return t;
  }

  private acumular(t: AgentTrack, eventId: string): void {
    if (t.eventosPendentes === 0) {
      t.janelaAbertaEmMs = this.agoraMs;
      t.eventoOrigem = eventId;
    }
    t.eventosPendentes++;
  }

  /** Fecha janelas de coalescencia que ja podem ser decididas. */
  private expirarJanelas(): void {
    for (const t of this.tracks.values()) {
      if (t.eventosPendentes > 0 && t.janelaAbertaEmMs < 0) t.janelaAbertaEmMs = this.agoraMs;
    }
  }

  private contarEmVoo(): number {
    for (const [id, fim] of this.emVoo) {
      if (fim <= this.agoraMs) this.emVoo.delete(id);
    }
    return this.emVoo.size;
  }

  /**
   * Prioridade de encenacao. Ordem deliberada:
   *  aprovacao pendente > incidente > trabalho novo > ir descansar.
   * Aprovacao vem primeiro porque e a unica situacao em que o sistema esta
   * BLOQUEADO esperando um humano - custo real de negocio.
   */
  private prioridadeDe(t: AgentTrack): number {
    if (t.aprovacaoPendente) return 0.95;
    if (t.ambient.incident > 0.4) return 0.8;
    if (t.eventosPendentes > 0) return 0.5;
    const ocioso = this.agoraMs - t.ultimaAtividadeMs;
    if (!t.descansando && t.activeRuns === 0 && ocioso > this.cfg.idleToRestMs) return 0.2;
    return 0;
  }

  private montarIntencao(
    t: AgentTrack,
    prioridade: number,
    orcamentoLivre: number,
  ): NarrativeIntent | null {
    if (orcamentoLivre <= 0 && prioridade < 0.8) return null; // so o urgente furra a fila

    const base = {
      intentId: `intent-${this.proximoIntentId++}`,
      agentId: t.agentId,
      priority: prioridade,
      representsEvents: Math.max(1, t.eventosPendentes),
      ...(t.eventoOrigem ? { causedByEventId: t.eventoOrigem } : {}),
    };

    if (t.aprovacaoPendente) {
      return { ...base, behavior: 'go_to_door', minDurationMs: this.cfg.minLegibleMs * 2 };
    }
    if (t.ambient.incident > 0.4) {
      return { ...base, behavior: 'meet', minDurationMs: this.cfg.minLegibleMs * 2.5 };
    }
    if (t.eventosPendentes > 0) {
      // Mais eventos agregados = sessao de trabalho mais longa. Assim a duracao
      // da encenacao carrega informacao real de volume, nao e enfeite.
      const escala = 1 + Math.min(3, Math.log2(1 + t.eventosPendentes));
      return { ...base, behavior: 'go_to_desk', minDurationMs: this.cfg.minLegibleMs * escala };
    }
    t.descansando = true;
    return { ...base, behavior: 'go_to_break', minDurationMs: this.cfg.minLegibleMs * 3 };
  }

  /** Decaimento continuo: calor e incidente esfriam sozinhos com o tempo. */
  private decairAmbiente(dtMs: number): void {
    const fator = dtMs / 1000;
    for (const t of this.tracks.values()) {
      t.ambient.heat = Math.max(0, t.ambient.heat - 0.04 * fator);
      t.ambient.incident = Math.max(0, t.ambient.incident - 0.02 * fator);
    }
  }

  private falar(agentId: string, text: string, eventId?: string): void {
    this.chatterPendente.push(eventId ? { agentId, text, eventId } : { agentId, text });
  }
}

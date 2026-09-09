/**
 * SESSAO DE ESCRITORIO - a simulacao autoritativa, sem uma linha de rede.
 *
 * Esta classe e deliberadamente ignorante sobre WebSocket, HTTP, `ws` e
 * qualquer detalhe de transporte. Ela sabe fazer tres coisas:
 *
 *   1. montar um escritorio a partir de uma seed (layout + elenco + engine);
 *   2. avancar o tempo um passo e devolver a MENSAGEM que os clientes devem
 *      receber (delta no caso comum, snapshot quando e keyframe);
 *   3. aplicar um comando ja validado vindo de um cliente.
 *
 * Por que essa separacao importa: com ela, todo o comportamento do servidor -
 * cadencia de keyframe, efeito de pausa, reseed, aprovacao humana - e testavel
 * em milissegundos, deterministicamente, sem abrir porta nem esperar socket.
 * O arquivo `server.ts` que a envolve fica reduzido a plumbing burro, que e
 * exatamente onde bugs sao baratos.
 *
 * ADR-0006: o navegador nao simula. Aqui e a fonte da verdade.
 */

import {
  PROTOCOL_VERSION,
  type AgentDescriptor,
  type ClientCommand,
  type DomainEvent,
  type OfficeLayout,
  type SessionLogHeader,
  type SessionWelcome,
  type TickRecord,
  type WorldDelta,
  type WorldSnapshot,
} from '@microfirma/contracts';
import {
  serializarHeader,
  serializarTick,
} from '@microfirma/contracts';
import {
  WorldEngine,
  validarLayout,
  type Violacao,
} from '@microfirma/world-engine';
import { SyntheticStream } from '@microfirma/synthetic';
import {
  AGENTE_PLACEHOLDER,
  assinaturaElencoDe,
  montarMundoIso,
  resolverColisaoLab,
} from '@microfirma/iso-office/planta';

/**
 * Fonte de eventos de dominio. Tudo que alimenta a engine vem daqui.
 * `SyntheticStream` e `OtlpIngestor` implementam esta interface, e a sessao
 * nao sabe (nem precisa saber) qual esta em uso.
 */
export interface FonteEventos {
  /** Consome eventos acumulados ate agora. */
  poll(maxMs: number): DomainEvent[];
  /** Agentes que a fonte conhece, para registro inicial na engine. */
  readonly agents: AgentDescriptor[];
}

/**
 * Adaptador: SyntheticStream ja tem `poll()` e `agents`, mas o tipo de
 * `agents` e mais rico que o que `FonteEventos` precisa. Este wrapper nao
 * copia dados - so estreita o tipo.
 */
function fonteSintetica(stream: SyntheticStream): FonteEventos {
  return {
    poll: (ms) => stream.poll(ms),
    agents: stream.agents,
  };
}

/** Placeholder OTLP ate o primeiro span: 1 Boss + 1 copa (`AGENTE_PLACEHOLDER`). */

export interface OfficeSessionOptions {
  seed: number;
  tenantId?: string;
  /** Passo de simulacao em ms. 100 = 10 Hz, igual a Fase 0. */
  tickMs?: number;
  /**
   * A cada quantos ticks um snapshot completo e reenviado.
   * Existe por dois motivos concretos: (a) quem conecta no meio do caminho
   * precisa de um quadro completo, e (b) se um delta for perdido, o estado do
   * cliente volta ao correto sozinho em no maximo este intervalo.
   */
  keyframeEveryTicks?: number;
  /**
   * Fonte de eventos externa (ex.: OtlpIngestor). Se omitida, usa
   * SyntheticStream - o modo demo/offline.
   */
  fonteEventos?: FonteEventos;
  /**
   * Se fornecido, a sessao grava cada tick (eventos + quadro) neste stream
   * em formato NDJSON. O header e escrito na construcao.
   */
  gravarEm?: NodeJS.WritableStream;
  /**
   * Multiplica a carga do SyntheticStream (modo SimFirma). Ignorado quando
   * fonteEventos e fornecida. Padrao 1.
   */
  carga?: number;
}

/**
 * Mensagem de mundo produzida por um passo de simulacao. E exatamente o tipo
 * que o contrato de transporte manda pela rede - sem DTO intermediario.
 */
export type WorldMessage = WorldSnapshot | WorldDelta;

export class OfficeSession {
  readonly tenantId: string;
  readonly tickMs: number;
  readonly keyframeEveryTicks: number;

  private seed_: number;
  private fonte: FonteEventos;
  private engine!: WorldEngine;
  private layout_!: OfficeLayout;
  private violacoes_: Violacao[] = [];
  private gravador: NodeJS.WritableStream | null;

  private ticks = 0;
  private pausado = false;
  /** Forca snapshot no proximo tick (apos reseed a planta mudou por completo). */
  private snapshotPendente = true;
  /** Elenco com o qual a planta atual foi montada. */
  private elencoAssinatura = '';

  constructor(opts: OfficeSessionOptions) {
    this.tenantId = opts.tenantId ?? 'demo';
    this.tickMs = opts.tickMs ?? 100;
    this.keyframeEveryTicks = opts.keyframeEveryTicks ?? 100; // ~10s a 10 Hz
    this.seed_ = opts.seed;
    this.fonte =
      opts.fonteEventos ??
      fonteSintetica(new SyntheticStream({ seed: opts.seed, comRoteiro: true, carga: opts.carga }));
    this.gravador = opts.gravarEm ?? null;
    this.construirMundo(opts.seed);
    this.escreverHeaderGravacao();
  }

  get seed(): number {
    return this.seed_;
  }

  get paused(): boolean {
    return this.pausado;
  }

  get layout(): OfficeLayout {
    return this.layout_;
  }

  /** Violacoes de invariante do layout atual. Vazio e o unico valor aceitavel. */
  get layoutViolations(): Violacao[] {
    return this.violacoes_;
  }

  /** Identificador estavel da sessao. Deriva da seed: reproduzivel de proposito. */
  get sessionId(): string {
    return `office-${this.seed_}`;
  }

  /**
   * Roda a simulacao em fast-forward ate o tempo do mundo especificado.
   * Ignora pausa e nao grava no SessionLog. Usado no modo SimFirma para
   * capacity planning e cenarios what-if.
   */
  simular(ateMs: number): { ticks: number; tMundoMs: number; snapshot: WorldSnapshot } {
    const inicio = this.ticks;
    while (this.ticks * this.tickMs < ateMs) {
      const eventos = this.fonte.poll(this.tickMs);
      this.engine.ingest(eventos);
      this.engine.tick(this.tickMs);
      this.ticks++;
    }
    return {
      ticks: this.ticks - inicio,
      tMundoMs: this.ticks * this.tickMs,
      snapshot: this.engine.snapshot(),
    };
  }

  /** Handshake. Enviado uma vez, antes do primeiro quadro. */
  welcome(): SessionWelcome {
    return {
      kind: 'welcome',
      sessionId: this.sessionId,
      tenantId: this.tenantId,
      seed: this.seed_,
      tickMs: this.tickMs,
      keyframeEveryTicks: this.keyframeEveryTicks,
      protocolVersion: PROTOCOL_VERSION,
    };
  }

  /** Quadro completo do estado atual, para quem acabou de conectar. */
  snapshot(): WorldSnapshot {
    return this.engine.snapshot();
  }

  /**
   * Um passo de simulacao.
   *
   * Devolve `null` quando pausado - e importante que seja `null` e nao um
   * delta repetido: repetir quadro faria o cliente reanimar interpolacoes e a
   * cena "tremeria" parada. Pausado significa literalmente nada a dizer.
   */
  tick(): WorldMessage | null {
    if (this.pausado) return null;

    const eventos = this.fonte.poll(this.tickMs);
    if (this.elencoMudou()) {
      this.construirMundo(this.seed_);
      this.snapshotPendente = true;
    }
    this.engine.ingest(eventos);
    const delta = this.engine.tick(this.tickMs);
    this.ticks++;

    let quadro: WorldMessage;
    if (this.snapshotPendente || this.ticks % this.keyframeEveryTicks === 0) {
      this.snapshotPendente = false;
      quadro = this.engine.snapshot();
    } else {
      quadro = delta;
    }

    this.gravarTick(eventos, quadro);
    return quadro;
  }

  /**
   * Aplica um comando JA VALIDADO (ver `parseClientCommand` no contrato).
   * Esta funcao confia no tipo porque a borda de rede fez a desconfianca.
   */
  apply(comando: ClientCommand): void {
    switch (comando.type) {
      case 'resolve_approval':
        this.engine.resolverAprovacao(comando.agentId);
        return;
      case 'set_paused':
        this.pausado = comando.paused;
        return;
      case 'reseed':
        this.reseed(comando.seed);
        return;
    }
  }

  /**
   * Troca a semente e reconstroi o escritorio inteiro. O proximo tick devolve
   * snapshot (nao delta), porque a planta mudou e nenhum delta descreve isso.
   */
  reseed(seed: number): void {
    this.seed_ = seed;
    this.ticks = 0;
    this.snapshotPendente = true;
    this.construirMundo(seed);
  }

  private elencoAtual(): AgentDescriptor[] {
    return this.fonte.agents.length > 0 ? this.fonte.agents : [AGENTE_PLACEHOLDER];
  }

  private elencoMudou(): boolean {
    return assinaturaElencoDe(this.elencoAtual()) !== this.elencoAssinatura;
  }

  private construirMundo(seed: number): void {
    const agentes = this.elencoAtual();
    this.elencoAssinatura = assinaturaElencoDe(agentes);

    const mundo = montarMundoIso(seed, agentes);
    this.layout_ = mundo.layout;
    this.violacoes_ = validarLayout(this.layout_);

    this.engine = new WorldEngine({
      layout: this.layout_,
      agents: agentes,
      seed,
      resolverColisao: resolverColisaoLab(),
    });
  }

  private escreverHeaderGravacao(): void {
    if (!this.gravador) return;
    const agentes = this.elencoAtual();
    const header: SessionLogHeader = {
      format: 'microfirma-session-log',
      version: 1,
      seed: this.seed_,
      tenantId: this.tenantId,
      tickMs: this.tickMs,
      keyframeEveryTicks: this.keyframeEveryTicks,
      agents: agentes,
      layout: this.layout_,
      startedAtMs: Date.now(),
    };
    this.gravador.write(serializarHeader(header) + '\n');
  }

  private gravarTick(eventos: DomainEvent[], quadro: WorldMessage): void {
    if (!this.gravador) return;
    const record: TickRecord = {
      tick: this.ticks,
      events: eventos,
      frame: quadro,
    };
    this.gravador.write(serializarTick(record) + '\n');
  }
}

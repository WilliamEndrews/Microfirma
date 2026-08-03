/**
 * INGESTOR OTLP - ponte entre o receptor de telemetria e a simulacao.
 *
 * O `WorldEngine` aceita `DomainEvent[]` em `ingest()`. O `OtlpIngestor` e a
 * classe que transforma spans OTLP crus nesses eventos e os acumula ate que
 * a `OfficeSession` os consuma com `poll()`.
 *
 * Por que existe como classe e nao como funcao solta: porque o ingest OTLP
 * tem estado - agentes ja descobertos (para nao reemitir `agent.discovered` a
 * cada span), deduplicacao de eventos por `eventId`, e janela deslizante de
 * spans para permitir que a simulacao consuma atrasada (batch vs real-time).
 *
 * ADR-0002: "nenhum pixel sem fato". O ingestor e a borda que garante que
 * todo evento que entra tem `eventId`, `traceId` e `tsReal` - sem isso, o
 * caminho de volta pixel -> span nao existe.
 */

import type { AgentDescriptor, DomainEvent } from '@microfirma/contracts';
import {
  traduzirLoteOtlp,
  type OtlpExportRequest,
} from '@microfirma/contracts';

/**
 * Estatisticas do ingestor, para painel de observabilidade do proprio servidor.
 * Nao sao KPIs do mundo - sao metricas de saude do ingest.
 */
export interface IngestStats {
  spansRecebidos: number;
  spansDescartados: number;
  eventosGerados: number;
  agentesConhecidos: number;
}

export interface OtlpIngestorOptions {
  tenantId?: string;
  /**
   * Se true, reemite `agent.discovered` toda vez que um span com nome de
   * agente chega. Por padrao e false: o agente e descoberto uma vez e a
   * engine ja o conhece. True e util em testes de regressao.
   */
  redescobrirAgentes?: boolean;
}

export class OtlpIngestor {
  private readonly tenantId: string;
  private readonly redescobrir: boolean;

  /** Eventos prontos para consumo, em ordem temporal. */
  private buffer: DomainEvent[] = [];

  /** EventIds ja vistos, para deduplicacao. */
  private vistos = new Set<string>();

  /** Agentes ja descobertos, para evitar reemissao. */
  private agentesConhecidos = new Set<string>();

  /** Descritores completos dos agentes descobertos. */
  private agentesDescobertos = new Map<string, AgentDescriptor>();

  /** Estatisticas acumuladas desde a criacao. */
  private stats: IngestStats = {
    spansRecebidos: 0,
    spansDescartados: 0,
    eventosGerados: 0,
    agentesConhecidos: 0,
  };

  constructor(opts: OtlpIngestorOptions = {}) {
    this.tenantId = opts.tenantId ?? 'default';
    this.redescobrir = opts.redescobrirAgentes ?? false;
  }

  /**
   * Recebe um lote OTLP cru (JSON), traduz para DomainEvents e acumula no buffer.
   * Devolve o numero de eventos adicionados (pos deduplicacao).
   */
  ingerir(lote: OtlpExportRequest): number {
    let spansNoLote = 0;
    for (const rs of lote.resourceSpans ?? []) {
      for (const scope of rs.scopeSpans ?? []) {
        spansNoLote += scope.spans?.length ?? 0;
      }
    }
    this.stats.spansRecebidos += spansNoLote;

    const candidatos = traduzirLoteOtlp(lote, this.tenantId);

    let adicionados = 0;
    for (const evt of candidatos) {
      // Deduplicacao por eventId: um mesmo span pode chegar duas vezes
      // (retry de export, batch sobreposto).
      if (this.vistos.has(evt.eventId)) {
        this.stats.spansDescartados++;
        continue;
      }
      this.vistos.add(evt.eventId);

      // Filtra agent.discovered duplicado (a menos que redescobrir esteja on).
      if (evt.type === 'agent.discovered') {
        if (!this.redescobrir && this.agentesConhecidos.has(evt.agent.agentId)) {
          continue;
        }
        this.agentesConhecidos.add(evt.agent.agentId);
        this.agentesDescobertos.set(evt.agent.agentId, evt.agent);
        this.stats.agentesConhecidos = this.agentesConhecidos.size;
      }

      this.buffer.push(evt);
      adicionados++;
      this.stats.eventosGerados++;
    }

    // Ordena o buffer por tsReal para que a engine consuma em ordem temporal.
    // Spans de batches diferentes podem estar fora de ordem.
    this.buffer.sort((a, b) => a.tsReal - b.tsReal);

    return adicionados;
  }

  /**
   * Consome eventos acumulados. Igual ao `poll()` do SyntheticStream:
   * devolve todos os eventos pendentes e limpa o buffer.
   *
   * O parametro `maxMs` NAO filtra por tempo aqui - ele existe apenas para
   * manter a assinatura compativel com `SyntheticStream.poll()`, permitindo
   * que a `OfficeSession` troque a fonte de eventos sem mudar codigo.
   */
  poll(_maxMs: number): DomainEvent[] {
    const pendentes = this.buffer;
    this.buffer = [];
    return pendentes;
  }

  /** Agentes descobertos ate agora, como AgentDescriptor para a engine. */
  get agents(): AgentDescriptor[] {
    return [...this.agentesDescobertos.values()];
  }

  /** Estatisticas acumuladas. */
  get estatisticas(): IngestStats {
    return { ...this.stats };
  }

  /** Numero de eventos aguardando consumo. */
  get pendentes(): number {
    return this.buffer.length;
  }

  /** Reseta o estado do ingestor (para testes). */
  reset(): void {
    this.buffer = [];
    this.vistos.clear();
    this.agentesConhecidos.clear();
    this.agentesDescobertos.clear();
    this.stats = {
      spansRecebidos: 0,
      spansDescartados: 0,
      eventosGerados: 0,
      agentesConhecidos: 0,
    };
  }
}

/**
 * @microfirma/synthetic - GERADOR DE TELEMETRIA SINTETICA
 *
 * Por que este pacote existe antes de qualquer integracao real (Fase 0)?
 *
 * Porque o maior risco do projeto NAO e tecnico, e de percepcao: um CTO que
 * ache que isto e "um brinquedo" nunca vai colocar a MicroFirma na frente do
 * board. Esse risco se mata com uma demonstracao convincente - e uma demo nao
 * precisa de cliente, precisa de dados plausiveis.
 *
 * Ele tambem e infraestrutura permanente, nao codigo descartavel:
 *  - testes de carga do Narrative Scheduler (o que acontece com 500 agentes?);
 *  - testes de regressao visual deterministicos;
 *  - modo "SimFirma" (e se o trafego decuplicar?), que e uma feature vendavel.
 *
 * Os eventos gerados aqui sao EXATAMENTE do mesmo tipo que os vindos do
 * pipeline OTel real. O engine nao sabe distinguir - e essa e a prova de que a
 * fronteira entre ingest e simulacao esta no lugar certo.
 */

import type { AgentDescriptor, AgentRole, DomainEvent } from '@microfirma/contracts';
import { avatarSeedDe, createRng, type Rng } from '@microfirma/world-engine';

/** Perfil de comportamento de um agente sintetico. */
interface PerfilAgente {
  descriptor: AgentDescriptor;
  /** Probabilidade, por segundo, de iniciar um novo run. */
  taxaPorSegundo: number;
  /** Duracao media de um run, em ms. */
  duracaoMediaMs: number;
  /** Fracao de runs que falham. */
  taxaErro: number;
  /** Custo medio por chamada de LLM, em USD. */
  custoMedioUsd: number;
  modelo: string;
}

/** Elenco padrao da demo: papeis reconheciveis e complementares. */
const ELENCO: Array<{
  id: string;
  nome: string;
  role: AgentRole;
  framework: string;
  taxa: number;
  duracao: number;
  erro: number;
  custo: number;
  modelo: string;
}> = [
  { id: 'agent-triagem', nome: 'Triagem', role: 'support', framework: 'langgraph', taxa: 0.55, duracao: 2600, erro: 0.04, custo: 0.004, modelo: 'gpt-4o-mini' },
  { id: 'agent-pesquisa', nome: 'Pesquisa', role: 'researcher', framework: 'langgraph', taxa: 0.3, duracao: 6200, erro: 0.07, custo: 0.021, modelo: 'gpt-4o' },
  { id: 'agent-analise', nome: 'Analise', role: 'analyst', framework: 'crewai', taxa: 0.25, duracao: 7800, erro: 0.05, custo: 0.03, modelo: 'claude-sonnet' },
  { id: 'agent-codigo', nome: 'Engenharia', role: 'engineer', framework: 'openai-sdk', taxa: 0.2, duracao: 9400, erro: 0.12, custo: 0.045, modelo: 'gpt-4o' },
  { id: 'agent-fiscal', nome: 'Fiscal', role: 'finance', framework: 'semantic-kernel', taxa: 0.12, duracao: 5200, erro: 0.03, custo: 0.018, modelo: 'gpt-4o-mini' },
  { id: 'agent-revisor', nome: 'Revisor', role: 'guardian', framework: 'langgraph', taxa: 0.18, duracao: 3100, erro: 0.02, custo: 0.009, modelo: 'gpt-4o-mini' },
  { id: 'agent-maestro', nome: 'Maestro', role: 'orchestrator', framework: 'langgraph', taxa: 0.4, duracao: 4200, erro: 0.06, custo: 0.012, modelo: 'gpt-4o' },
];

const FERRAMENTAS = ['buscar_crm', 'consultar_erp', 'ler_documento', 'executar_sql', 'enviar_email', 'chamar_api_parceiro'];

/** Um run em andamento no gerador. */
interface RunEmCurso {
  runId: string;
  agentId: string;
  iniciouEmMs: number;
  terminaEmMs: number;
  proximaFerramentaEmMs: number;
  falhara: boolean;
}

/**
 * Roteiro da demo. Momentos plantados de proposito, porque uma demo tem que
 * CONTAR uma historia: normalidade -> incidente -> intervencao humana -> volta
 * ao normal. Sem roteiro, o espectador olha bonecos andando e nao entende nada.
 */
interface Beat {
  emMs: number;
  descricao: string;
  aplicar: (gen: SyntheticStream) => DomainEvent[];
}

export interface SyntheticOptions {
  seed: number;
  tenantId?: string;
  /** Quantos agentes do elenco usar (1..7). */
  quantidadeAgentes?: number;
  /** Ativa o roteiro de demonstracao (incidente + aprovacao). */
  comRoteiro?: boolean;
}

export class SyntheticStream {
  readonly agents: AgentDescriptor[];
  private readonly perfis: PerfilAgente[];
  private readonly rng: Rng;
  private readonly tenantId: string;
  private readonly runs: RunEmCurso[] = [];
  private readonly beats: Beat[];
  private agoraMs = 0;
  private contador = 0;

  constructor(opts: SyntheticOptions) {
    this.rng = createRng(opts.seed).fork('synthetic');
    this.tenantId = opts.tenantId ?? 'tenant-demo';
    const quantos = Math.max(1, Math.min(ELENCO.length, opts.quantidadeAgentes ?? ELENCO.length));

    this.perfis = ELENCO.slice(0, quantos).map((e) => ({
      descriptor: {
        agentId: e.id,
        displayName: e.nome,
        role: e.role,
        framework: e.framework,
        primaryModel: e.modelo,
        discoveredVia: 'synthetic',
        avatarSeed: avatarSeedDe(e.id),
      },
      taxaPorSegundo: e.taxa,
      duracaoMediaMs: e.duracao,
      taxaErro: e.erro,
      custoMedioUsd: e.custo,
      modelo: e.modelo,
    }));
    this.agents = this.perfis.map((p) => p.descriptor);
    this.beats = opts.comRoteiro === false ? [] : this.montarRoteiro();
  }

  /**
   * Avanca o gerador e devolve os eventos ocorridos nesse intervalo.
   * Deterministico: a mesma sequencia de dt produz a mesma telemetria.
   */
  poll(dtMs: number): DomainEvent[] {
    const eventos: DomainEvent[] = [];
    const anterior = this.agoraMs;
    this.agoraMs += dtMs;

    // Roteiro plantado tem precedencia: e a espinha narrativa da demo.
    for (const beat of this.beats) {
      if (beat.emMs > anterior && beat.emMs <= this.agoraMs) eventos.push(...beat.aplicar(this));
    }

    // Inicio de novos runs (processo de Poisson discretizado).
    for (const perfil of this.perfis) {
      const p = (perfil.taxaPorSegundo * dtMs) / 1000;
      if (!this.rng.chance(p)) continue;
      const runId = `run-${++this.contador}`;
      const falhara = this.rng.chance(perfil.taxaErro);
      const duracao = perfil.duracaoMediaMs * this.rng.range(0.5, 1.8);
      this.runs.push({
        runId,
        agentId: perfil.descriptor.agentId,
        iniciouEmMs: this.agoraMs,
        terminaEmMs: this.agoraMs + duracao,
        proximaFerramentaEmMs: this.agoraMs + this.rng.range(200, 900),
        falhara,
      });
      eventos.push({
        type: 'run.started',
        eventId: this.novoId('ev'),
        tenantId: this.tenantId,
        tsReal: this.agoraMs,
        agentId: perfil.descriptor.agentId,
        runId,
        label: this.rng.pick(['atender ticket', 'gerar relatorio', 'validar cadastro', 'revisar codigo']),
      });
    }

    // Progresso dos runs: ferramentas, LLM e conclusao.
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const run = this.runs[i] as RunEmCurso;
      const perfil = this.perfilDe(run.agentId);
      if (!perfil) {
        this.runs.splice(i, 1);
        continue;
      }

      while (run.proximaFerramentaEmMs <= this.agoraMs && run.proximaFerramentaEmMs < run.terminaEmMs) {
        const okFerramenta = !run.falhara || this.rng.chance(0.6);
        eventos.push({
          type: 'tool.called',
          eventId: this.novoId('ev'),
          tenantId: this.tenantId,
          tsReal: run.proximaFerramentaEmMs,
          agentId: run.agentId,
          runId: run.runId,
          toolName: this.rng.pick(FERRAMENTAS),
          durationMs: this.rng.range(30, 850),
          ok: okFerramenta,
        });
        eventos.push({
          type: 'llm.completed',
          eventId: this.novoId('ev'),
          tenantId: this.tenantId,
          tsReal: run.proximaFerramentaEmMs,
          agentId: run.agentId,
          runId: run.runId,
          model: perfil.modelo,
          inputTokens: this.rng.int(400, 4200),
          outputTokens: this.rng.int(80, 900),
          costUsd: perfil.custoMedioUsd * this.rng.range(0.6, 1.9),
          latencyMs: this.rng.range(220, 2400),
        });
        run.proximaFerramentaEmMs += this.rng.range(600, 2400);
      }

      if (run.terminaEmMs <= this.agoraMs) {
        if (run.falhara) {
          eventos.push({
            type: 'error.raised',
            eventId: this.novoId('ev'),
            tenantId: this.tenantId,
            tsReal: run.terminaEmMs,
            agentId: run.agentId,
            runId: run.runId,
            kind: this.rng.pick(['http_5xx', 'timeout', 'rate_limit', 'tool_failure']),
            severity: this.rng.chance(0.25) ? 'critical' : 'error',
          });
        }
        eventos.push({
          type: 'run.finished',
          eventId: this.novoId('ev'),
          tenantId: this.tenantId,
          tsReal: run.terminaEmMs,
          agentId: run.agentId,
          runId: run.runId,
          status: run.falhara ? 'error' : 'ok',
          durationMs: run.terminaEmMs - run.iniciouEmMs,
        });
        this.runs.splice(i, 1);
      }
    }

    // Profundidade de fila: observada periodicamente, como um scrape de metrica.
    if (Math.floor(anterior / 2000) !== Math.floor(this.agoraMs / 2000)) {
      for (const perfil of this.perfis) {
        const ativos = this.runs.filter((r) => r.agentId === perfil.descriptor.agentId).length;
        eventos.push({
          type: 'queue.observed',
          eventId: this.novoId('ev'),
          tenantId: this.tenantId,
          tsReal: this.agoraMs,
          agentId: perfil.descriptor.agentId,
          depth: Math.max(0, ativos - 1 + this.rng.int(0, 2)),
        });
      }
    }

    return eventos.sort((a, b) => a.tsReal - b.tsReal);
  }

  private montarRoteiro(): Beat[] {
    const alvo = 'agent-codigo';
    return [
      {
        emMs: 18_000,
        descricao: 'Rajada de falhas: a dependencia externa do agente de Engenharia cai.',
        aplicar: (gen) =>
          Array.from({ length: 6 }, (_, i) => ({
            type: 'error.raised' as const,
            eventId: gen.novoId('roteiro'),
            tenantId: gen.tenantId,
            tsReal: gen.agoraMs + i * 120,
            agentId: alvo,
            kind: 'http_5xx',
            severity: i > 3 ? ('critical' as const) : ('error' as const),
          })),
      },
      {
        emMs: 30_000,
        descricao: 'O agente Fiscal bloqueia e pede aprovacao humana.',
        aplicar: (gen) => [
          {
            type: 'approval.requested',
            eventId: gen.novoId('roteiro'),
            tenantId: gen.tenantId,
            tsReal: gen.agoraMs,
            agentId: 'agent-fiscal',
            approvalId: 'apr-1',
            question: 'Autorizar pagamento acima do limite? (valor redigido)',
          },
        ],
      },
      {
        emMs: 44_000,
        descricao: 'Pico de carga: o escritorio entra em modo ambiente.',
        aplicar: (gen) =>
          gen.perfis.flatMap((p) =>
            Array.from({ length: 8 }, (_, i) => ({
              type: 'run.started' as const,
              eventId: gen.novoId('pico'),
              tenantId: gen.tenantId,
              tsReal: gen.agoraMs + i * 40,
              agentId: p.descriptor.agentId,
              runId: `pico-${p.descriptor.agentId}-${i}`,
              label: 'lote de processamento',
            })),
          ),
      },
    ];
  }

  private perfilDe(agentId: string): PerfilAgente | undefined {
    return this.perfis.find((p) => p.descriptor.agentId === agentId);
  }

  private novoId(prefixo: string): string {
    return `${prefixo}-${++this.contador}`;
  }
}

/** Grafo de colaboracao plausivel para o elenco padrao. Alimenta o layout. */
export function colaboracaoDoElenco(): Array<{ a: string; b: string; interactions: number }> {
  return [
    { a: 'agent-maestro', b: 'agent-triagem', interactions: 180 },
    { a: 'agent-maestro', b: 'agent-pesquisa', interactions: 140 },
    { a: 'agent-maestro', b: 'agent-analise', interactions: 120 },
    { a: 'agent-pesquisa', b: 'agent-analise', interactions: 95 },
    { a: 'agent-analise', b: 'agent-revisor', interactions: 70 },
    { a: 'agent-codigo', b: 'agent-revisor', interactions: 65 },
    { a: 'agent-fiscal', b: 'agent-revisor', interactions: 30 },
    { a: 'agent-triagem', b: 'agent-codigo', interactions: 25 },
  ];
}

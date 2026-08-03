/**
 * AGENTE ARQUITETO (ADR-0004 / ADR-0005)
 *
 * Interface que define "quem planeja o escritorio". O LLM NUNCA gera
 * coordenadas - ele devolve um `SpaceProgram` (programa de necessidades),
 * e o solver deterministico transforma em geometria.
 *
 * Duas implementacoes:
 *   - DeterministicArchitect: a versao de referencia (planSpaceProgram).
 *     Sem LLM, sem rede, sem custo. Sempre funciona.
 *   - LlmArchitect: chama um LLM para gerar o SpaceProgram. Se o LLM
 *     devolver algo invalido (validado por schema), cai para o deterministico.
 *     LLM como enfeite, nunca como dependencia critica (ADR-0005).
 */

import type { AgentDescriptor, SpaceProgram } from '@microfirma/contracts';
import { SpaceProgram as SpaceProgramSchema } from '@microfirma/contracts';
import { planSpaceProgram, type CollaborationEdge, type PlanOptions } from './space-program.js';

/**
 * Interface do Arquiteto. Qualquer implementacao (deterministica, LLM, etc.)
 * deve satisfazer este contrato.
 */
export interface AgenteArquiteto {
  /** Nome identificador da implementacao. */
  readonly nome: string;
  /**
   * Planeja o escritorio a partir dos agentes descobertos.
   * Devolve um SpaceProgram VALIDO (passa no schema zod).
   * Se a implementacao interna falhar (ex.: LLM devolveu lixo),
   * deve cair para o deterministico.
   */
  planejar(agents: AgentDescriptor[], opts: PlanOptions): SpaceProgram;
}

/**
 * Arquiteto deterministico - a implementacao de referencia.
 *
 * Usa `planSpaceProgram` diretamente. Sempre funciona, sem custo, sem rede.
 * E o fallback de qualquer outra implementacao.
 */
export class DeterministicArchitect implements AgenteArquiteto {
  readonly nome = 'deterministic';

  planejar(agents: AgentDescriptor[], opts: PlanOptions): SpaceProgram {
    return planSpaceProgram(agents, opts);
  }
}

/**
 * Arquiteto LLM - chama um modelo para gerar o SpaceProgram.
 *
 * Fluxo:
 *   1. Monta um prompt com os agentes, colaboracao e regras de negocio.
 *   2. Envia para o LLM (via funcao injetada).
 *   3. Parseia a resposta como JSON e valida contra o schema zod.
 *   4. Se valido: devolve. Se invalido: loga o erro e cai para o deterministico.
 *
 * A funcao `chamarLlm` e injetada (dependency injection): o caller decide
 * qual modelo, qual API, qual prompt system. Isso mantem o world-engine
 * livre de dependencias de rede e testavel em milissegundos.
 */
export class LlmArchitect implements AgenteArquiteto {
  readonly nome = 'llm';

  private readonly chamarLlm: (prompt: string) => Promise<string>;
  private readonly fallback: DeterministicArchitect;

  constructor(opts: {
    /** Funcao que envia o prompt para o LLM e devolve a resposta como string. */
    chamarLlm: (prompt: string) => Promise<string>;
  }) {
    this.chamarLlm = opts.chamarLlm;
    this.fallback = new DeterministicArchitect();
  }

  async planejarAsync(agents: AgentDescriptor[], opts: PlanOptions): Promise<SpaceProgram> {
    const prompt = this.montarPrompt(agents, opts);

    let resposta: string;
    try {
      resposta = await this.chamarLlm(prompt);
    } catch (erro) {
      console.warn('[LlmArchitect] Falha ao chamar LLM, caindo para deterministico:', erro);
      return this.fallback.planejar(agents, opts);
    }

    let json: unknown;
    try {
      json = JSON.parse(resposta);
    } catch {
      console.warn('[LlmArchitect] Resposta do LLM nao e JSON valido, caindo para deterministico');
      return this.fallback.planejar(agents, opts);
    }

    const resultado = SpaceProgramSchema.safeParse(json);
    if (!resultado.success) {
      console.warn('[LlmArchitect] SpaceProgram do LLM rejeitado pelo schema:', resultado.error.issues);
      return this.fallback.planejar(agents, opts);
    }

    return resultado.data;
  }

  /**
   * Versao sincrona: usa o fallback deterministico. A versao async
   * (`planejarAsync`) e a que chama o LLM. Esta existe para satisfazer
   * a interface `AgenteArquiteto` que e sincrona.
   */
  planejar(agents: AgentDescriptor[], opts: PlanOptions): SpaceProgram {
    return this.fallback.planejar(agents, opts);
  }

  private montarPrompt(agents: AgentDescriptor[], opts: PlanOptions): string {
    const regras = [
      'Regras de negocio (OBRIGATORIAS):',
      '- Todo agente precisa de exatamente uma mesa.',
      '- Papeis sensiveis (orchestrator, finance, guardian) preferem sala privada.',
      '- Toda planta tem obrigatoriamente 1 sala de descanso e 1 recepcao.',
      '- Se houver 4+ agentes, adiciona 1 sala de reuniao.',
      '- Se houver 8+ agentes, adiciona 1 war room (para incidentes).',
      '- NAO gere coordenadas. Apenas o programa de necessidades.',
      '',
      'Formato de saida: JSON valido conforme o schema SpaceProgram.',
      'Campos obrigatorios: officeId, seed, grid {width, height}, zones[], adjacency[], theme.',
      '',
      `officeId: ${opts.officeId}`,
      `seed: ${opts.seed}`,
      '',
      'Agentes descobertos:',
      ...agents.map((a) => `  - ${a.agentId}: ${a.displayName} (${a.role}, ${a.framework})`),
      '',
      'Grafo de colaboracao (agentes que interagem muito devem ficar proximos):',
      ...(opts.collaboration ?? []).map(
        (e: CollaborationEdge) => `  - ${e.a} <-> ${e.b}: ${e.interactions} interacoes`,
      ),
    ];
    return regras.join('\n');
  }
}

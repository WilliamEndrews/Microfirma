/**
 * AGENTE DECORADOR (ADR-0008)
 *
 * Interface que define "quem escolhe a decoracao do escritorio". Hoje `TEMAS`
 * e uma constante em `themes.ts`. O Decorador e a abstracao que permite:
 *   - DeterministicDecorator: escolhe o tema por seed (comportamento atual).
 *   - LlmDecorator: pede a um LLM para escolher tema + paleta com base no
 *     proposito do escritorio (ex.: "fintech" -> cool-lab, "studio criativo"
 *     -> warm-studio). Se invalido, cai para o deterministico.
 *
 * O Decorador devolve um `Tema`, que `planSpaceProgram` injeta no `SpaceProgram`.
 */

import type { AgentDescriptor } from '@microfirma/contracts';
import { TEMAS, buscarTema, type Tema } from './themes.js';
import { createRng } from './prng.js';

/**
 * Interface do Decorador. Qualquer implementacao deve satisfazer este contrato.
 */
export interface AgenteDecorador {
  readonly nome: string;
  /**
   * Escolhe um tema para o escritorio.
   * @param agents - agentes descobertos (podem informar a escolha)
   * @param seed - semente da sessao (para reprodutibilidade)
   */
  decorar(agents: AgentDescriptor[], seed: number): Tema;
}

/**
 * Decorador deterministico - escolhe o tema por seed.
 *
 * Usa um RNG seeded para garantir que a mesma seed sempre escolha o mesmo tema.
 * E o fallback de qualquer outra implementacao.
 */
export class DeterministicDecorator implements AgenteDecorador {
  readonly nome = 'deterministic';

  decorar(agents: AgentDescriptor[], seed: number): Tema {
    const rng = createRng(seed).fork('decorador');
    return rng.pick(TEMAS);
  }
}

/**
 * Decorador LLM - pede ao modelo para escolher tema + paleta.
 *
 * Fluxo:
 *   1. Monta um prompt descrevendo os agentes e o proposito do escritorio.
 *   2. Envia para o LLM (via funcao injetada).
 *   3. Parseia a resposta e valida (nome do tema deve existir em TEMAS,
 *      palette deve ter 4 cores hex validas, greenery entre 0 e 1).
 *   4. Se valido: devolve. Se invalido: cai para o deterministico.
 */
export class LlmDecorator implements AgenteDecorador {
  readonly nome = 'llm';

  private readonly chamarLlm: (prompt: string) => Promise<string>;
  private readonly fallback: DeterministicDecorator;

  constructor(opts: {
    chamarLlm: (prompt: string) => Promise<string>;
  }) {
    this.chamarLlm = opts.chamarLlm;
    this.fallback = new DeterministicDecorator();
  }

  async decorarAsync(agents: AgentDescriptor[], seed: number): Promise<Tema> {
    const prompt = this.montarPrompt(agents);

    let resposta: string;
    try {
      resposta = await this.chamarLlm(prompt);
    } catch (erro) {
      console.warn('[LlmDecorator] Falha ao chamar LLM, caindo para deterministico:', erro);
      return this.fallback.decorar(agents, seed);
    }

    let json: unknown;
    try {
      json = JSON.parse(resposta);
    } catch {
      console.warn('[LlmDecorator] Resposta do LLM nao e JSON, caindo para deterministico');
      return this.fallback.decorar(agents, seed);
    }

    const tema = this.validarTema(json);
    if (!tema) {
      console.warn('[LlmDecorator] Tema do LLM invalido, caindo para deterministico');
      return this.fallback.decorar(agents, seed);
    }

    return tema;
  }

  decorar(agents: AgentDescriptor[], seed: number): Tema {
    return this.fallback.decorar(agents, seed);
  }

  private montarPrompt(agents: AgentDescriptor[]): string {
    const roles = agents.map((a) => a.role);
    const temFinanceiro = roles.includes('finance');
    const temOrquestrador = roles.includes('orchestrator');
    const temPesquisador = roles.includes('researcher');

    const sugestao = temFinanceiro
      ? 'cool-lab (tons frios, transmite confianca e precisao)'
      : temPesquisador
        ? 'warm-studio (tons quentes, transmite criatividade)'
        : temOrquestrador
          ? 'midnight-ops (tons escuros, transmite seriedade operacional)'
          : 'nordic-calm (tons neutros, versatil)';

    return [
      'Voce e o Decorador de um escritorio de agentes AI.',
      'Escolha um tema de decoracao que reflita o proposito do escritorio.',
      '',
      'Temas disponiveis:',
      ...TEMAS.map((t) => `  - ${t.name}: palette=${t.palette.join(', ')}, greenery=${t.greenery}`),
      '',
      'Agentes no escritorio:',
      ...agents.map((a) => `  - ${a.displayName} (${a.role})`),
      '',
      `Sugestao baseada nos papeis: ${sugestao}`,
      '',
      'Responda em JSON: { "name": "...", "palette": ["#...", "#...", "#...", "#..."], "greenery": 0.X }',
      'O nome deve ser um dos temas listados OU um nome novo (se novo, a palette e obrigatoria).',
    ].join('\n');
  }

  private validarTema(json: unknown): Tema | null {
    if (typeof json !== 'object' || json === null) return null;
    const obj = json as Record<string, unknown>;

    const name = typeof obj.name === 'string' ? obj.name : '';
    const palette = Array.isArray(obj.palette)
      ? obj.palette.filter((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
      : [];
    const greenery = typeof obj.greenery === 'number' ? Math.max(0, Math.min(1, obj.greenery)) : 0.4;

    if (palette.length < 4) {
      // Se a paleta e invalida, tenta usar o tema pelo nome
      if (name) return buscarTema(name);
      return null;
    }

    return { name: name || 'custom', palette: palette as string[], greenery };
  }
}

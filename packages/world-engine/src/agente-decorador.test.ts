/**
 * Testes do Agente Decorador (ADR-0008).
 */

import { describe, it, expect } from 'vitest';
import {
  DeterministicDecorator,
  LlmDecorator,
  type AgenteDecorador,
} from './agente-decorador.js';
import { TEMAS } from './themes.js';
import type { AgentDescriptor } from '@microfirma/contracts';

const agentes: AgentDescriptor[] = [
  { agentId: 'a1', displayName: 'Triagem', role: 'researcher', framework: 'langgraph', discoveredVia: 'otel', avatarSeed: 1 },
  { agentId: 'a2', displayName: 'Financeiro', role: 'finance', framework: 'crewai', discoveredVia: 'otel', avatarSeed: 2 },
];

describe('DeterministicDecorator', () => {
  const dec = new DeterministicDecorator();

  it('nome e "deterministic"', () => {
    expect(dec.nome).toBe('deterministic');
  });

  it('devolve um tema valido', () => {
    const tema = dec.decorar(agentes, 42);
    expect(TEMAS.some((t) => t.name === tema.name)).toBe(true);
  });

  it('mesma seed = mesmo tema', () => {
    const t1 = dec.decorar(agentes, 42);
    const t2 = dec.decorar(agentes, 42);
    expect(t1.name).toBe(t2.name);
  });

  it('seeds diferentes podem dar temas diferentes', () => {
    const temas = new Set<string>();
    for (let s = 0; s < 100; s++) {
      temas.add(dec.decorar(agentes, s).name);
    }
    expect(temas.size).toBeGreaterThan(1);
  });

  it('satisfaz interface AgenteDecorador', () => {
    const _: AgenteDecorador = dec;
    expect(_.nome).toBe('deterministic');
  });
});

describe('LlmDecorator', () => {
  it('decorar (sync) usa fallback deterministico', () => {
    const dec = new LlmDecorator({ chamarLlm: async () => '{}' });
    const tema = dec.decorar(agentes, 42);
    expect(TEMAS.some((t) => t.name === tema.name)).toBe(true);
  });

  it('decorarAsync com LLM valido devolve tema do LLM', async () => {
    const temaLlm = {
      name: 'cool-lab',
      palette: ['#EEF2F6', '#C9D6E3', '#7A93AC', '#2E3B4E'],
      greenery: 0.25,
    };
    const dec = new LlmDecorator({ chamarLlm: async () => JSON.stringify(temaLlm) });
    const tema = await dec.decorarAsync(agentes, 42);
    expect(tema.name).toBe('cool-lab');
    expect(tema.palette.length).toBe(4);
  });

  it('decorarAsync com tema por nome usa paleta do tema', async () => {
    const dec = new LlmDecorator({ chamarLlm: async () => JSON.stringify({ name: 'warm-studio' }) });
    const tema = await dec.decorarAsync(agentes, 42);
    expect(tema.name).toBe('warm-studio');
  });

  it('decorarAsync com JSON invalido cai para deterministico', async () => {
    const dec = new LlmDecorator({ chamarLlm: async () => 'not json' });
    const tema = await dec.decorarAsync(agentes, 42);
    expect(TEMAS.some((t) => t.name === tema.name)).toBe(true);
  });

  it('decorarAsync com erro de rede cai para deterministico', async () => {
    const dec = new LlmDecorator({ chamarLlm: async () => { throw new Error('network'); } });
    const tema = await dec.decorarAsync(agentes, 42);
    expect(TEMAS.some((t) => t.name === tema.name)).toBe(true);
  });

  it('decorarAsync com paleta custom valida', async () => {
    const custom = {
      name: 'custom-theme',
      palette: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00'],
      greenery: 0.5,
    };
    const dec = new LlmDecorator({ chamarLlm: async () => JSON.stringify(custom) });
    const tema = await dec.decorarAsync(agentes, 42);
    expect(tema.name).toBe('custom-theme');
    expect(tema.palette).toEqual(custom.palette);
  });
});

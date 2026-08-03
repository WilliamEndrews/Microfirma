/**
 * Testes de propriedade da geracao de escritorio (space-program + solver).
 *
 * A promessa do produto e "design nunca igual, invariantes absolutas"
 * (ver docstring de `layout-validation.ts`). Estes testes verificam
 * exatamente essa promessa: determinismo por seed, e zero violacoes de
 * invariante em muitas seeds e tamanhos de elenco diferentes.
 */
import { describe, expect, it } from 'vitest';
import type { AgentDescriptor, AgentRole } from '@microfirma/contracts';
import { planSpaceProgram } from './space-program.js';
import { solveLayout } from './layout-solver.js';
import { validarLayout } from './layout-validation.js';

const PAPEIS: AgentRole[] = [
  'orchestrator',
  'researcher',
  'analyst',
  'support',
  'engineer',
  'finance',
  'guardian',
];

function elenco(tamanho: number): AgentDescriptor[] {
  return Array.from({ length: tamanho }, (_, i) => ({
    agentId: `agent-${i}`,
    displayName: `Agente ${i}`,
    role: PAPEIS[i % PAPEIS.length] as AgentRole,
    framework: 'test',
    discoveredVia: 'synthetic' as const,
    avatarSeed: i,
  }));
}

function gerarLayout(seed: number, tamanho: number) {
  const programa = planSpaceProgram(elenco(tamanho), { officeId: 'office-test', seed });
  return solveLayout(programa);
}

describe('geracao de escritorio - determinismo', () => {
  it('mesma seed e mesmo elenco produzem exatamente o mesmo layout', () => {
    const a = gerarLayout(42, 6);
    const b = gerarLayout(42, 6);
    expect(b).toEqual(a);
  });

  it('seeds diferentes tendem a produzir layouts diferentes', () => {
    const a = gerarLayout(1, 6);
    const b = gerarLayout(2, 6);
    expect(a).not.toEqual(b);
  });
});

describe('geracao de escritorio - invariantes geometricas', () => {
  const seeds = Array.from({ length: 30 }, (_, i) => i * 101 + 7);
  const tamanhos = [1, 2, 4, 7, 8, 12, 20];

  it.each(seeds)('seed %i com elenco de 7 agentes: zero violacoes', (seed) => {
    const layout = gerarLayout(seed, 7);
    expect(validarLayout(layout)).toEqual([]);
  });

  it.each(tamanhos)('elenco de %i agente(s) (seed fixa): zero violacoes', (tamanho) => {
    const layout = gerarLayout(999, tamanho);
    expect(validarLayout(layout)).toEqual([]);
  });
});

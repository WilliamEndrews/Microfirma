/**
 * Testes de propriedade da geracao de escritorio (space-program + solver).
 *
 * A promessa do produto e "design nunca igual, invariantes absolutas"
 * (ver docstring de `layout-validation.ts`). Estes testes verificam
 * exatamente essa promessa: determinismo por seed, e zero violacoes de
 * invariante em muitas seeds e tamanhos de elenco diferentes.
 */
import { describe, expect, it } from 'vitest';
import type { AgentDescriptor, AgentRole, OfficeLayout } from '@microfirma/contracts';
import { planSpaceProgram } from './space-program.js';
import { solveLayout } from './layout-solver.js';
import { validarLayout } from './layout-validation.js';
import { buildNavGrid, footprintCells, isWalkable } from './navgrid.js';

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

describe('footprint multi-celula', () => {
  it('sofa 2x1 da copa bloqueia as duas celulas no navgrid, nao so a ancora', () => {
    // Elenco pequeno gera copa apertada (tapete e sofa disputam o mesmo
    // centro da sala), entao o footprint 2x1 so aparece com folga de espaco -
    // elenco grande garante isso de forma deterministica.
    let encontrado = false;
    for (let seed = 0; seed < 20 && !encontrado; seed++) {
      const layout = gerarLayout(seed, 20);
      const sofaGrande = layout.props.find((p) => p.kind === 'sofa' && p.footprint.w > 1);
      if (!sofaGrande) continue;
      encontrado = true;
      const nav = buildNavGrid(layout);
      const celulas = footprintCells(sofaGrande);
      expect(celulas.length).toBe(2);
      for (const c of celulas) expect(isWalkable(nav, c)).toBe(false);
    }
    // Se nunca aconteceu em 20 seeds, o refinamento do sofa 2x1 nunca coube -
    // sinal de regressao no solver, nao apenas ma sorte de seed.
    expect(encontrado).toBe(true);
  });

  it('valida que um footprint que estoura a parede da sala e rejeitado', () => {
    const layout = gerarLayout(999, 7);
    const sala = layout.rooms[0]!;
    const propInvalido: OfficeLayout['props'][number] = {
      propId: 'sofa-invalido-teste',
      kind: 'sofa',
      cell: { x: sala.rect.x1 - 1, y: sala.rect.y0 + 1 },
      roomId: sala.roomId,
      facing: 0,
      footprint: { w: 2, h: 1 }, // segunda celula cai fora da sala (x1 e exclusivo)
    };
    const layoutInvalido: OfficeLayout = { ...layout, props: [...layout.props, propInvalido] };
    const violacoes = validarLayout(layoutInvalido);
    expect(
      violacoes.some((v) => v.regra === 'prop-dentro-da-sala' && v.detalhe.includes('sofa-invalido-teste')),
    ).toBe(true);
  });

  it('valida que footprints sobrepostos contam como props empilhados', () => {
    const layout = gerarLayout(999, 7);
    const mesa = layout.props.find((p) => p.kind === 'desk')!;
    const propSobreposto: OfficeLayout['props'][number] = {
      propId: 'chair-sobreposta-teste',
      kind: 'chair',
      cell: mesa.cell,
      roomId: mesa.roomId,
      facing: 0,
      footprint: { w: 1, h: 1 },
    };
    const layoutInvalido: OfficeLayout = { ...layout, props: [...layout.props, propSobreposto] };
    const violacoes = validarLayout(layoutInvalido);
    expect(violacoes.some((v) => v.regra === 'sem-props-empilhados')).toBe(true);
  });
});

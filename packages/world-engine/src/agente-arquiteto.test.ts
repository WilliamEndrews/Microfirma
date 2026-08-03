/**
 * Testes do Agente Arquiteto (ADR-0004/0005).
 */

import { describe, it, expect } from 'vitest';
import {
  DeterministicArchitect,
  LlmArchitect,
  type AgenteArquiteto,
} from './agente-arquiteto.js';
import { SpaceProgram as SpaceProgramSchema } from '@microfirma/contracts';
import type { AgentDescriptor } from '@microfirma/contracts';

const agentes: AgentDescriptor[] = [
  { agentId: 'a1', displayName: 'Triagem', role: 'researcher', framework: 'langgraph', discoveredVia: 'otel', avatarSeed: 1 },
  { agentId: 'a2', displayName: 'Financeiro', role: 'finance', framework: 'crewai', discoveredVia: 'otel', avatarSeed: 2 },
  { agentId: 'a3', displayName: 'Analista', role: 'analyst', framework: 'autogen', discoveredVia: 'otel', avatarSeed: 3 },
  { agentId: 'a4', displayName: 'Guardiao', role: 'guardian', framework: 'langgraph', discoveredVia: 'otel', avatarSeed: 4 },
];

const opts = { officeId: 'office-test', seed: 42 };

describe('DeterministicArchitect', () => {
  const arq = new DeterministicArchitect();

  it('nome e "deterministic"', () => {
    expect(arq.nome).toBe('deterministic');
  });

  it('devolve SpaceProgram valido', () => {
    const programa = arq.planejar(agentes, opts);
    const validacao = SpaceProgramSchema.safeParse(programa);
    expect(validacao.success).toBe(true);
  });

  it('agentes sensiveis (finance, guardian) tem sala privada', () => {
    const programa = arq.planejar(agentes, opts);
    const privados = programa.zones.filter((z) => z.kind === 'private');
    expect(privados.length).toBe(2); // finance + guardian
  });

  it('com 4+ agentes, tem sala de reuniao', () => {
    const programa = arq.planejar(agentes, opts);
    expect(programa.zones.some((z) => z.kind === 'meeting')).toBe(true);
  });

  it('mesma seed = mesmo programa', () => {
    const p1 = arq.planejar(agentes, opts);
    const p2 = arq.planejar(agentes, opts);
    expect(JSON.stringify(p1)).toBe(JSON.stringify(p2));
  });

  it('satisfaz interface AgenteArquiteto', () => {
    const _: AgenteArquiteto = arq;
    expect(_.nome).toBe('deterministic');
  });
});

describe('LlmArchitect', () => {
  it('planejar (sync) usa fallback deterministico', () => {
    const arq = new LlmArchitect({ chamarLlm: async () => '{}' });
    const programa = arq.planejar(agentes, opts);
    expect(programa.zones.length).toBeGreaterThan(0);
  });

  it('planejarAsync com LLM valido devolve SpaceProgram do LLM', async () => {
    const programaLlm = {
      officeId: 'office-test',
      seed: 42,
      grid: { width: 40, height: 30 },
      zones: [
        { zoneId: 'z1', name: 'Area', kind: 'open' as const, areaWeight: 1, agentIds: ['a1', 'a3'] },
        { zoneId: 'z2', name: 'Fin', kind: 'private' as const, areaWeight: 1, agentIds: ['a2'] },
        { zoneId: 'z3', name: 'Guard', kind: 'private' as const, areaWeight: 1, agentIds: ['a4'] },
        { zoneId: 'z-break', name: 'Break', kind: 'break' as const, areaWeight: 1, agentIds: [] },
        { zoneId: 'z-recep', name: 'Recep', kind: 'reception' as const, areaWeight: 1, agentIds: [] },
        { zoneId: 'z-meet', name: 'Meet', kind: 'meeting' as const, areaWeight: 1, agentIds: [] },
      ],
      adjacency: [],
      theme: { name: 'cool-lab', palette: ['#EEF2F6', '#C9D6E3', '#7A93AC', '#2E3B4E'], greenery: 0.25 },
    };

    const arq = new LlmArchitect({ chamarLlm: async () => JSON.stringify(programaLlm) });
    const resultado = await arq.planejarAsync(agentes, opts);
    expect(resultado.officeId).toBe('office-test');
    expect(resultado.zones.length).toBe(6);
    expect(resultado.theme.name).toBe('cool-lab');
  });

  it('planejarAsync com LLM invalido cai para deterministico', async () => {
    const arq = new LlmArchitect({ chamarLlm: async () => 'not json' });
    const resultado = await arq.planejarAsync(agentes, opts);
    expect(resultado.zones.length).toBeGreaterThan(0);
    // Deve ter zonas privadas (comportamento do deterministico)
    expect(resultado.zones.some((z) => z.kind === 'private')).toBe(true);
  });

  it('planejarAsync com erro de rede cai para deterministico', async () => {
    const arq = new LlmArchitect({ chamarLlm: async () => { throw new Error('network'); } });
    const resultado = await arq.planejarAsync(agentes, opts);
    expect(resultado.zones.length).toBeGreaterThan(0);
  });

  it('planejarAsync com schema invalido cai para deterministico', async () => {
    const arq = new LlmArchitect({ chamarLlm: async () => JSON.stringify({ foo: 'bar' }) });
    const resultado = await arq.planejarAsync(agentes, opts);
    // fallback deterministico sempre tem zonas
    expect(resultado.zones.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { AgentDescriptor } from '@microfirma/contracts';
import { ordenarElencoCliente } from './espaco-agencia';
import {
  agenciaDeLayout,
  elencoParaPlanta,
  montarMundoIso,
} from './montar-mundo';

function agente(id: string, role: AgentDescriptor['role']): AgentDescriptor {
  return {
    agentId: id,
    displayName: id,
    role,
    framework: 'test',
    discoveredVia: 'manual',
    avatarSeed: 1,
  };
}

describe('montarMundoIso', () => {
  it('1 agente => 1 Boss Room + 1 copa, mesa com owner real', () => {
    const mundo = montarMundoIso(7, [agente('agent_triador_01', 'researcher')]);
    expect(mundo.layout.rooms.filter((r) => r.kind === 'boss_room')).toHaveLength(1);
    expect(mundo.layout.rooms.filter((r) => r.kind === 'break')).toHaveLength(1);
    expect(mundo.layout.rooms.filter((r) => r.kind === 'private')).toHaveLength(0);
    const mesas = mundo.layout.props.filter((p) => p.kind === 'desk');
    expect(mesas.some((m) => m.ownerAgentId === 'agent_triador_01')).toBe(true);
  });

  it('3 agentes => 1 boss + 2 priv + copa; finance vira boss', () => {
    const elenco = [
      agente('agent_analista_02', 'analyst'),
      agente('agent_gerente_03', 'finance'),
      agente('agent_triador_01', 'researcher'),
    ];
    expect(ordenarElencoCliente(elenco)[0]!.agentId).toBe('agent_gerente_03');
    const mundo = montarMundoIso(20260907, elenco);
    expect(mundo.layout.rooms.filter((r) => r.kind === 'boss_room')).toHaveLength(1);
    expect(mundo.layout.rooms.filter((r) => r.kind === 'private')).toHaveLength(2);
    expect(mundo.layout.rooms.filter((r) => r.kind === 'break')).toHaveLength(1);
    const donos = mundo.layout.props
      .filter((p) => p.kind === 'desk' && p.ownerAgentId)
      .map((p) => p.ownerAgentId)
      .sort();
    expect(donos).toEqual(['agent_analista_02', 'agent_gerente_03', 'agent_triador_01']);
  });

  it('mesma seed + elenco e deterministico', () => {
    const elenco = [agente('a', 'analyst'), agente('b', 'finance')];
    const x = montarMundoIso(42, elenco);
    const y = montarMundoIso(42, elenco);
    expect(x.layout.officeId).toBe(y.layout.officeId);
    expect(x.agencia.slots.map((s) => s.proto.tema.id)).toEqual(
      y.agencia.slots.map((s) => s.proto.tema.id),
    );
  });

  it('officeId muda quando o elenco muda (mesmo seed)', () => {
    const a = montarMundoIso(1, [agente('sozinho', 'analyst')]);
    const b = montarMundoIso(1, [agente('sozinho', 'analyst'), agente('outro', 'finance')]);
    expect(a.layout.officeId).not.toBe(b.layout.officeId);
  });

  it('agenciaDeLayout reconstitui slots e temas', () => {
    const mundo = montarMundoIso(9, [agente('x', 'guardian')]);
    const deVolta = agenciaDeLayout(mundo.layout);
    expect(deVolta.slots).toHaveLength(mundo.agencia.slots.length);
    expect(deVolta.corredorY).toBe(mundo.agencia.corredorY);
    expect(deVolta.slots.map((s) => s.proto.tema.id).sort()).toEqual(
      mundo.agencia.slots.map((s) => s.proto.tema.id).sort(),
    );
  });

  it('placeholder sozinho ainda gera boss+copa', () => {
    const mundo = montarMundoIso(3, []);
    expect(elencoParaPlanta([])[0]!.agentId).toBe('microfirma-placeholder');
    expect(mundo.layout.rooms.some((r) => r.kind === 'boss_room')).toBe(true);
    expect(mundo.layout.rooms.some((r) => r.kind === 'break')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { SyntheticStream } from '@microfirma/synthetic';
import { montarMundoIso } from '@microfirma/iso-office';

describe('world-source planta iso', () => {
  it('elenco sintetico padrao: 1 Boss + privativos + copa, mesa por agente', () => {
    const stream = new SyntheticStream({ seed: 20260802, comRoteiro: true });
    const mundo = montarMundoIso(20260802, stream.agents);
    const clientes = stream.agents.filter((a) => !a.agentId.startsWith('microfirma-'));
    expect(clientes.length).toBeGreaterThanOrEqual(3);
    expect(mundo.layout.rooms.filter((r) => r.kind === 'boss_room')).toHaveLength(1);
    expect(mundo.layout.rooms.filter((r) => r.kind === 'private')).toHaveLength(clientes.length - 1);
    expect(mundo.layout.rooms.filter((r) => r.kind === 'break')).toHaveLength(1);
    const donos = new Set(
      mundo.layout.props
        .filter((p) => p.kind === 'desk' && p.ownerAgentId)
        .map((p) => p.ownerAgentId),
    );
    for (const a of clientes) expect(donos.has(a.agentId)).toBe(true);
  });

  it('1 agente sintetico: 1 Boss Room + 1 copa', () => {
    const stream = new SyntheticStream({
      seed: 1,
      comRoteiro: false,
      elencoCustomizado: [
        {
          id: 'agent-triagem',
          nome: 'Triagem',
          role: 'guardian',
          framework: 'langgraph',
          taxa: 0.4,
          duracao: 2600,
          erro: 0.04,
          custo: 0.004,
          modelo: 'gpt-4o-mini',
        },
      ],
    });
    const mundo = montarMundoIso(1, stream.agents);
    expect(mundo.layout.rooms.filter((r) => r.kind === 'boss_room')).toHaveLength(1);
    expect(mundo.layout.rooms.filter((r) => r.kind === 'private')).toHaveLength(0);
    expect(mundo.layout.rooms.filter((r) => r.kind === 'break')).toHaveLength(1);
    expect(
      mundo.layout.props.some((p) => p.kind === 'desk' && p.ownerAgentId === 'agent-triagem'),
    ).toBe(true);
  });
});

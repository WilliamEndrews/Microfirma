import { describe, expect, it } from 'vitest';
import { planSpaceProgram } from './space-program.js';
import { solveLayout } from './layout-solver.js';
import type { AgentDescriptor, AgentRole } from '@microfirma/contracts';

function elenco(tamanho: number): AgentDescriptor[] {
  const papeis: AgentRole[] = ['orchestrator', 'researcher', 'analyst'];
  return Array.from({ length: tamanho }, (_, i) => ({
    agentId: `agent-${i}`,
    displayName: `Agente ${i}`,
    role: papeis[i % papeis.length] as AgentRole,
    framework: 'test',
    discoveredVia: 'synthetic' as const,
    avatarSeed: i,
  }));
}

describe('ProtoComodo (Construtor cola a biblia)', () => {
  it('layouts novos nao emitem walls; cada sala com proto tem temaId e calibracao', () => {
    const layout = solveLayout(planSpaceProgram(elenco(1), { officeId: 'o', seed: 999 }));
    expect(layout.walls).toEqual([]);

    const priv = layout.rooms.find((s) => s.kind === 'private');
    const copa = layout.rooms.find((s) => s.kind === 'break');
    expect(priv?.temaId).toBe('nordic-privativo');
    expect(priv?.tileSetId).toBe('nordic-calm');
    expect(priv?.calibracao?.ancoraPiso).toEqual({ x: 64, y: 68 });
    expect(copa?.temaId).toBe('break-default');
    expect(copa?.tileSetId).toBe('warm-studio');
  });

  it('porta encosta no corredor (pathfinding), rect = grade do proto', () => {
    const layout = solveLayout(planSpaceProgram(elenco(1), { officeId: 'o', seed: 999 }));
    const corredor = new Set(layout.corridors.map((c) => `${c.x},${c.y}`));
    for (const sala of layout.rooms) {
      expect(sala.rect.x1 - sala.rect.x0).toBe(3);
      expect(sala.rect.y1 - sala.rect.y0).toBe(3);
      const vizinhos = [
        `${sala.door.x},${sala.door.y - 1}`,
        `${sala.door.x},${sala.door.y + 1}`,
      ];
      expect(vizinhos.some((k) => corredor.has(k))).toBe(true);
    }
  });
});

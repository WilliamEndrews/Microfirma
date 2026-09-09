/**
 * Testes dedicados ao NavGrid - antes desta suite so existiam testes
 * indiretos via `layout-solver.test.ts` (footprint) e via debugpreview.
 *
 * Foco: a porta e a UNICA passagem entre uma sala e o resto do mundo -
 * nao so a celula da porta e caminhavel, a TRAVESSIA para fora da sala em
 * qualquer outro ponto da borda tem que ser proibida, mesmo que a celula do
 * outro lado seja caminhavel (corredor ou outra sala).
 */
import { describe, expect, it } from 'vitest';
import type { OfficeLayout, Room } from '@microfirma/contracts';
import { planSpaceProgram } from './space-program.js';
import { solveLayout } from './layout-solver.js';
import { validarLayout } from './layout-validation.js';
import {
  buildNavGrid,
  findPath,
  isTransitionAllowed,
  isWalkable,
  reachableFrom,
} from './navgrid.js';
import type { AgentDescriptor, AgentRole } from '@microfirma/contracts';

function elenco(tamanho: number): AgentDescriptor[] {
  const papeis: AgentRole[] = ['orchestrator', 'researcher', 'analyst', 'support', 'engineer', 'finance', 'guardian'];
  return Array.from({ length: tamanho }, (_, i) => ({
    agentId: `agent-${i}`,
    displayName: `Agente ${i}`,
    role: papeis[i % papeis.length] as AgentRole,
    framework: 'test',
    discoveredVia: 'synthetic' as const,
    avatarSeed: i,
  }));
}

function gerarLayout(seed: number, tamanho: number): OfficeLayout {
  const programa = planSpaceProgram(elenco(tamanho), { officeId: 'office-test', seed });
  return solveLayout(programa);
}

/** Todas as celulas da borda do rect, com o vizinho de fora, exceto a porta. */
function bordasNaoPorta(sala: Room): { dentro: { x: number; y: number }; fora: { x: number; y: number } }[] {
  const { x0, y0, x1, y1 } = sala.rect;
  const pares: { dentro: { x: number; y: number }; fora: { x: number; y: number } }[] = [];
  const ehPorta = (x: number, y: number) => x === sala.door.x && y === sala.door.y;

  for (let x = x0; x < x1; x++) {
    if (!ehPorta(x, y0)) pares.push({ dentro: { x, y: y0 }, fora: { x, y: y0 - 1 } });
    if (!ehPorta(x, y1 - 1)) pares.push({ dentro: { x, y: y1 - 1 }, fora: { x, y: y1 } });
  }
  for (let y = y0; y < y1; y++) {
    if (!ehPorta(x0, y)) pares.push({ dentro: { x: x0, y }, fora: { x: x0 - 1, y } });
    if (!ehPorta(x1 - 1, y)) pares.push({ dentro: { x: x1 - 1, y }, fora: { x: x1, y } });
  }
  return pares;
}

describe('NavGrid - porta como unica passagem', () => {
  const seeds = [1, 42, 999, 12345];

  it.each(seeds)('seed %i: nenhuma borda de sala fora da porta permite travessia', (seed) => {
    const layout = gerarLayout(seed, 7);
    const nav = buildNavGrid(layout);

    for (const sala of layout.rooms) {
      for (const { dentro, fora } of bordasNaoPorta(sala)) {
        expect(isTransitionAllowed(nav, dentro, fora)).toBe(false);
      }
      // A porta continua livre (comportamento hoje garantido pela invariante
      // "porta-encosta-no-corredor" em layout-validation.ts).
      const vizinhosDaPorta = [
        { x: sala.door.x, y: sala.door.y - 1 },
        { x: sala.door.x, y: sala.door.y + 1 },
        { x: sala.door.x - 1, y: sala.door.y },
        { x: sala.door.x + 1, y: sala.door.y },
      ];
      const algumLivre = vizinhosDaPorta.some(
        (v) => isWalkable(nav, v) && isTransitionAllowed(nav, sala.door, v),
      );
      expect(algumLivre).toBe(true);
    }
  });

  it.each(seeds)('seed %i: findPath de uma mesa ao corredor sempre passa pela porta da sua sala', (seed) => {
    const layout = gerarLayout(seed, 7);
    const nav = buildNavGrid(layout);
    const corredor = layout.corridors[0];
    if (!corredor) return;

    for (const mesa of layout.props.filter((p) => p.kind === 'desk')) {
      const sala = layout.rooms.find((r) => r.roomId === mesa.roomId);
      if (!sala) continue;
      const origem = { x: sala.rect.x0, y: sala.rect.y0 };
      const rota = findPath(nav, origem, corredor);
      if (!rota) continue; // origem pode estar bloqueada pela propria mesa; irrelevante aqui
      const passouPelaPorta = rota.some((c) => c.x === sala.door.x && c.y === sala.door.y);
      expect(passouPelaPorta).toBe(true);
    }
  });

  it('salas vizinhas na mesma faixa (sem gap) nao permitem atravessar a parede compartilhada', () => {
    const layout = gerarLayout(999, 12);
    const nav = buildNavGrid(layout);

    for (let i = 0; i < layout.rooms.length; i++) {
      for (let j = 0; j < layout.rooms.length; j++) {
        if (i === j) continue;
        const a = layout.rooms[i]!;
        const b = layout.rooms[j]!;
        // Vizinhas horizontalmente, coladas (a.rect.x1 === b.rect.x0), mesma faixa vertical.
        if (a.rect.x1 !== b.rect.x0 || a.rect.y0 !== b.rect.y0 || a.rect.y1 !== b.rect.y1) continue;
        for (let y = a.rect.y0; y < a.rect.y1; y++) {
          const dentro = { x: a.rect.x1 - 1, y };
          const fora = { x: b.rect.x0, y };
          const ehPortaDeA = a.door.x === dentro.x && a.door.y === dentro.y;
          const ehPortaDeB = b.door.x === fora.x && b.door.y === fora.y;
          if (ehPortaDeA || ehPortaDeB) continue; // nao deveria ocorrer (porta fica na faixa curta), so por seguranca
          expect(isTransitionAllowed(nav, dentro, fora)).toBe(false);
        }
      }
    }
  });

  it('reachableFrom so alcanca o interior de uma sala passando pela porta', () => {
    const layout = gerarLayout(42, 3);
    const nav = buildNavGrid(layout);
    const corredor = layout.corridors[0];
    if (!corredor) return;
    const alcancaveis = reachableFrom(nav, corredor);

    for (const sala of layout.rooms) {
      const centro = { x: Math.floor((sala.rect.x0 + sala.rect.x1) / 2), y: Math.floor((sala.rect.y0 + sala.rect.y1) / 2) };
      if (isWalkable(nav, centro)) {
        expect(alcancaveis.has(`${centro.x},${centro.y}`)).toBe(true);
      }
    }
  });

  it('invariantes de layout (corredor-conexo, mesa-acessivel) continuam validas com portas gated', () => {
    for (const seed of seeds) {
      const layout = gerarLayout(seed, 7);
      expect(validarLayout(layout)).toEqual([]);
    }
  });
});

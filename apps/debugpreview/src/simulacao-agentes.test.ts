import { describe, expect, it } from 'vitest';
import { isWalkable } from '@microfirma/world-engine';
import { celulasOcupadasPorProps, construirEspacoAgencia } from './espaco-agencia';
import { montarAgencia } from './montar-agencia';
import { SimulacaoAgentes } from './simulacao-agentes';
import { seedDoPedido } from './selecionar-pedido';

describe('SimulacaoAgentes', () => {
  it('path so usa celulas walkable', () => {
    const seed = seedDoPedido({ salas: 2 });
    const agencia = montarAgencia({ salas: 2 }, seed)!;
    const cenario = construirEspacoAgencia(agencia);
    const sim = new SimulacaoAgentes(cenario, seed);

    for (let i = 0; i < 200; i++) {
      sim.tick(50);
      const debug = sim.debugInfo();
      for (const path of debug.paths.values()) {
        for (const c of path) {
          expect(isWalkable(cenario.nav, c)).toBe(true);
        }
      }
    }
  });

  it('agente completa ciclo de fases ao longo do tempo', () => {
    const seed = seedDoPedido({ salas: 1 });
    const agencia = montarAgencia({ salas: 1 }, seed)!;
    const cenario = construirEspacoAgencia(agencia);
    const sim = new SimulacaoAgentes(cenario, seed);

    const vistos = new Set<string>();
    for (let i = 0; i < 800; i++) {
      const atores = sim.tick(50);
      for (const a of atores) vistos.add(a.activity);
    }

    expect(vistos.has('working')).toBe(true);
    expect(vistos.has('walking')).toBe(true);
    expect(vistos.has('resting')).toBe(true);
  });

  it('agente ocioso passeia e para em frente a um ponto de interesse', () => {
    const seed = seedDoPedido({ salas: 3 });
    const agencia = montarAgencia({ salas: 3 }, seed)!;
    const cenario = construirEspacoAgencia(agencia);
    const sim = new SimulacaoAgentes(cenario, seed);

    const pois = new Map(
      cenario.agentes.map((a) => [
        a.agentId,
        new Set(a.pontosInteresse.map((p) => `${p.cell.x},${p.cell.y}`)),
      ]),
    );
    const visitados = new Set<string>();
    const longeDoAssento = new Set<string>();

    for (let i = 0; i < 1600; i++) {
      for (const a of sim.tick(50)) {
        const meta = cenario.agentes.find((m) => m.agentId === a.agentId)!;
        if (a.activity === 'idle' && pois.get(a.agentId)?.has(`${a.x},${a.y}`)) {
          visitados.add(a.agentId);
        }
        if (meta.seat && Math.hypot(a.x - meta.seat.x, a.y - meta.seat.y) > 1.5) {
          longeDoAssento.add(a.agentId);
        }
      }
    }

    expect(visitados.size).toBeGreaterThan(0);
    expect(longeDoAssento.size).toBe(cenario.agentes.length);
  });

  it('agente parado nunca ocupa a celula de um asset', () => {
    const seed = seedDoPedido({ salas: 3 });
    const agencia = montarAgencia({ salas: 3 }, seed)!;
    const cenario = construirEspacoAgencia(agencia);
    const sim = new SimulacaoAgentes(cenario, seed);
    const ocupadas = celulasOcupadasPorProps(cenario.layout.props);

    for (let i = 0; i < 1600; i++) {
      for (const a of sim.tick(50)) {
        // Trabalhar usa a celula continua do posto, autorada junto da mesa.
        if (a.activity === 'walking' || a.activity === 'working') continue;
        expect(ocupadas.has(`${Math.round(a.x)},${Math.round(a.y)}`)).toBe(false);
      }
    }
  });

  it('posicao do agente permanece em celulas validas', () => {
    const seed = seedDoPedido({ salas: 2 });
    const agencia = montarAgencia({ salas: 2 }, seed)!;
    const cenario = construirEspacoAgencia(agencia);
    const sim = new SimulacaoAgentes(cenario, seed);

    for (let i = 0; i < 300; i++) {
      const atores = sim.tick(50);
      for (const a of atores) {
        const meta = cenario.agentes.find((m) => m.agentId === a.agentId);
        if (a.activity === 'working' && meta?.seatFrac) {
          expect(a.x).toBeCloseTo(meta.seatFrac.x);
          expect(a.y).toBeCloseTo(meta.seatFrac.y);
          continue;
        }
        const cx = Math.round(a.x);
        const cy = Math.round(a.y);
        expect(isWalkable(cenario.nav, { x: cx, y: cy })).toBe(true);
      }
    }
  });
});

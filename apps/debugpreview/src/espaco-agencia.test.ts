import { describe, expect, it } from 'vitest';
import { isWalkable } from '@microfirma/world-engine';
import { montarAgencia } from './montar-agencia';
import { construirEspacoAgencia, celulasWalkableNaSala } from './espaco-agencia';
import { seedDoPedido } from './selecionar-pedido';

describe('construirEspacoAgencia', () => {
  it('porta norte fica na borda sul da sala (y1-1)', () => {
    const seed = seedDoPedido({ salas: 2 });
    const agencia = montarAgencia({ salas: 2 }, seed)!;
    const cenario = construirEspacoAgencia(agencia);

    const salasNorte = cenario.layout.rooms.filter((r) => r.rect.y1 <= agencia.corredorY);
    expect(salasNorte.length).toBeGreaterThan(0);
    for (const sala of salasNorte) {
      expect(sala.door.y).toBe(sala.rect.y1 - 1);
    }
  });

  it('porta sul fica na borda norte da sala (y0)', () => {
    const seed = seedDoPedido({ salas: 2 });
    const agencia = montarAgencia({ salas: 2 }, seed)!;
    const cenario = construirEspacoAgencia(agencia);

    const salasSul = cenario.layout.rooms.filter((r) => r.rect.y0 > agencia.corredorY);
    for (const sala of salasSul) {
      expect(sala.door.y).toBe(sala.rect.y0);
    }
  });

  it('boss tem mesa e assento walkable', () => {
    const seed = seedDoPedido({ salas: 1 });
    const agencia = montarAgencia({ salas: 1 }, seed)!;
    const cenario = construirEspacoAgencia(agencia);
    const boss = cenario.agentes.find((a) => a.agentId === 'agent-boss');
    expect(boss).toBeDefined();
    if (boss?.desk) {
      expect(isWalkable(cenario.nav, boss.desk.cell)).toBe(false);
    }
    if (boss?.seat) {
      expect(isWalkable(cenario.nav, boss.seat)).toBe(true);
    }
  });

  it('corredor conecta salas (celulas walkable)', () => {
    const seed = seedDoPedido({ salas: 3 });
    const agencia = montarAgencia({ salas: 3 }, seed)!;
    const cenario = construirEspacoAgencia(agencia);
    expect(cenario.layout.corridors.length).toBeGreaterThan(0);
    for (const c of cenario.layout.corridors) {
      expect(isWalkable(cenario.nav, c)).toBe(true);
    }
  });

  it('copa tem celulas walkable', () => {
    const seed = seedDoPedido({ salas: 2 });
    const agencia = montarAgencia({ salas: 2 }, seed)!;
    const cenario = construirEspacoAgencia(agencia);
    const copa = cenario.layout.rooms.find((r) => r.kind === 'break');
    expect(copa).toBeDefined();
    const celulas = celulasWalkableNaSala(cenario.nav, copa!.rect);
    expect(celulas.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  seedDaGeracao,
  seedDoPedido,
  selecionarPedido,
} from './selecionar-pedido';

describe('selecionarPedido', () => {
  it('mesma seed produz a mesma lista', () => {
    const seed = seedDaGeracao({ salas: 2 }, 3, 99);
    const a = selecionarPedido({ salas: 2 }, seed);
    const b = selecionarPedido({ salas: 2 }, seed);
    expect(a.map((p) => p.tema.id)).toEqual(b.map((p) => p.tema.id));
  });

  it('seeds diferentes tendem a divergir no conjunto de temas', () => {
    const pedido = { salas: 3 };
    const ids = new Set<string>();
    for (let g = 1; g <= 24; g++) {
      const seed = seedDaGeracao(pedido, g, g * 17 + 3);
      const lista = selecionarPedido(pedido, seed);
      ids.add(
        lista
          .map((p) => p.tema.id)
          .slice()
          .sort()
          .join('|'),
      );
    }
    expect(ids.size).toBeGreaterThan(1);
  });

  it('1 Boss Room + (N-1) privativos + 1 copa obrigatoria', () => {
    const seed = seedDoPedido({ salas: 3 });
    const lista = selecionarPedido({ salas: 3 }, seed);
    const boss = lista.filter((p) => p.zonaKind === 'boss_room');
    const priv = lista.filter((p) => p.zonaKind === 'private');
    const copas = lista.filter((p) => p.zonaKind === 'break');
    expect(boss).toHaveLength(1);
    expect(priv).toHaveLength(2);
    expect(copas).toHaveLength(1);
    expect(boss.every((p) => p.tema.zonaKind === 'boss_room')).toBe(true);
    expect(priv.every((p) => p.tema.zonaKind === 'private')).toBe(true);
    expect(copas.every((p) => p.tema.zonaKind === 'break')).toBe(true);
  });

  it('com 1 sala so Boss Room + 1 copa', () => {
    const lista = selecionarPedido({ salas: 1 }, seedDoPedido({ salas: 1 }));
    expect(lista.filter((p) => p.zonaKind === 'boss_room')).toHaveLength(1);
    expect(lista.filter((p) => p.zonaKind === 'private')).toHaveLength(0);
    expect(lista.filter((p) => p.zonaKind === 'break')).toHaveLength(1);
  });

  it('marca unicoNaAgencia sem repetir enquanto houver alternativa', () => {
    const seed = seedDaGeracao({ salas: 2 }, 1, 1);
    const lista = selecionarPedido({ salas: 2 }, seed);
    const unicos = lista.filter((p) => p.tema.unicoNaAgencia).map((p) => p.tema.id);
    expect(new Set(unicos).size).toBe(unicos.length);
  });
});

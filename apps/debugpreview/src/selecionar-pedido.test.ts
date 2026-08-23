import { describe, expect, it } from 'vitest';
import { seedDoPedido, selecionarPedido } from './selecionar-pedido';

describe('selecionarPedido', () => {
  it('mesmo pedido produz a mesma lista', () => {
    const a = selecionarPedido({ salas: 2, copas: 1 });
    const b = selecionarPedido({ salas: 2, copas: 1 });
    expect(a.map((p) => p.tema.id)).toEqual(b.map((p) => p.tema.id));
    expect(seedDoPedido({ salas: 2, copas: 1 })).toBe(seedDoPedido({ salas: 2, copas: 1 }));
  });

  it('respeita quantidades e zonaKind', () => {
    const lista = selecionarPedido({ salas: 3, copas: 1 });
    const priv = lista.filter((p) => p.zonaKind === 'private');
    const copas = lista.filter((p) => p.zonaKind === 'break');
    expect(priv).toHaveLength(3);
    expect(copas).toHaveLength(1);
    expect(priv.every((p) => p.tema.zonaKind === 'private')).toBe(true);
    expect(copas.every((p) => p.tema.zonaKind === 'break')).toBe(true);
  });

  it('marca unicoNaAgencia sem repetir enquanto houver alternativa', () => {
    const lista = selecionarPedido({ salas: 2, copas: 1 });
    const unicos = lista.filter((p) => p.tema.unicoNaAgencia).map((p) => p.tema.id);
    expect(new Set(unicos).size).toBe(unicos.length);
  });
});

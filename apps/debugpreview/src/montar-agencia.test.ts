import { describe, expect, it } from 'vitest';
import { gradeDoProto } from '@microfirma/world-engine';
import { montarAgencia } from './montar-agencia';
import { seedDoPedido } from './selecionar-pedido';

function overlap(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

describe('montarAgencia', () => {
  it('mesmo pedido produz o mesmo empacotamento', () => {
    const a = montarAgencia({ salas: 2, copas: 1 });
    const b = montarAgencia({ salas: 2, copas: 1 });
    expect(a).toEqual(b);
    expect(seedDoPedido({ salas: 2, copas: 1 })).toBe(a!.seed);
  });

  it('cada slot ocupa exatamente a grade do tema', () => {
    const agencia = montarAgencia({ salas: 3, copas: 1 });
    expect(agencia).not.toBeNull();
    expect(agencia!.slots.filter((s) => s.proto.zonaKind === 'private')).toHaveLength(3);
    expect(agencia!.slots.filter((s) => s.proto.zonaKind === 'break')).toHaveLength(1);

    for (const slot of agencia!.slots) {
      const grade = gradeDoProto(slot.proto.tema);
      expect(slot.rect.x1 - slot.rect.x0).toBe(grade.w);
      expect(slot.rect.y1 - slot.rect.y0).toBe(grade.h);
    }
  });

  it('slots nao se sobrepoem e ha corredor entre vizinhos e na espinha', () => {
    const agencia = montarAgencia({ salas: 3, copas: 1 });
    expect(agencia).not.toBeNull();
    const slots = agencia!.slots;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        expect(overlap(slots[i]!.rect, slots[j]!.rect)).toBe(false);
      }
    }

    expect(agencia!.pisoCorredor).toBe('Concrete');
    expect(agencia!.corridors.length).toBeGreaterThan(0);

    const ys = new Set(agencia!.corridors.map((c) => c.y));
    expect(ys.size).toBeGreaterThanOrEqual(1);

    const porFaixa = new Map<string, typeof slots>();
    for (const s of slots) {
      const chave = s.rect.y1 <= agencia!.corredorY ? 'norte' : 'sul';
      const lista = porFaixa.get(chave) ?? [];
      lista.push(s);
      porFaixa.set(chave, lista);
    }
    for (const faixa of porFaixa.values()) {
      faixa.sort((a, b) => a.rect.x0 - b.rect.x0);
      for (let i = 0; i < faixa.length - 1; i++) {
        const a = faixa[i]!;
        const b = faixa[i + 1]!;
        expect(b.rect.x0).toBe(a.rect.x1 + 1);
        expect(
          agencia!.corridors.some((c) => c.x === a.rect.x1),
        ).toBe(true);
      }
    }
  });

  it('pedido vazio devolve null', () => {
    expect(montarAgencia({ salas: 0, copas: 0 })).toBeNull();
  });

  it('encaixa 4 salas + 2 copas sem perder slot', () => {
    const agencia = montarAgencia({ salas: 4, copas: 2 });
    expect(agencia!.slots).toHaveLength(6);
    expect(agencia!.grid.width).toBeGreaterThanOrEqual(10);
  });
});

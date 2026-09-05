import { describe, expect, it } from 'vitest';
import { gradeDoProto } from '@microfirma/world-engine';
import { construirEspacoAgencia } from './espaco-agencia';
import { montarAgencia } from './montar-agencia';
import { seedDaGeracao, seedDoPedido } from './selecionar-pedido';

function overlap(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

describe('montarAgencia', () => {
  it('mesma seed produz o mesmo empacotamento', () => {
    const seed = seedDaGeracao({ salas: 2 }, 2, 42);
    const a = montarAgencia({ salas: 2 }, seed);
    const b = montarAgencia({ salas: 2 }, seed);
    expect(a).toEqual(b);
    expect(a!.seed).toBe(seed);
  });

  it('sem seed usa seedDoPedido (reproduzivel)', () => {
    const a = montarAgencia({ salas: 2 });
    const b = montarAgencia({ salas: 2 });
    expect(a).toEqual(b);
    expect(seedDoPedido({ salas: 2 })).toBe(a!.seed);
  });

  it('cada slot ocupa exatamente a grade do tema e respeita leis', () => {
    const seed = seedDoPedido({ salas: 3 });
    const agencia = montarAgencia({ salas: 3 }, seed);
    expect(agencia).not.toBeNull();
    expect(agencia!.slots.filter((s) => s.proto.zonaKind === 'boss_room')).toHaveLength(1);
    expect(agencia!.slots.filter((s) => s.proto.zonaKind === 'private')).toHaveLength(2);
    expect(agencia!.slots.filter((s) => s.proto.zonaKind === 'break')).toHaveLength(1);

    for (const slot of agencia!.slots) {
      const grade = gradeDoProto(slot.proto.tema);
      expect(slot.rect.x1 - slot.rect.x0).toBe(grade.w);
      expect(slot.rect.y1 - slot.rect.y0).toBe(grade.h);
    }
  });

  it('slots nao se sobrepoem e ha corredor entre vizinhos e na espinha', () => {
    const seed = seedDaGeracao({ salas: 3 }, 1, 7);
    const agencia = montarAgencia({ salas: 3 }, seed);
    expect(agencia).not.toBeNull();
    const slots = agencia!.slots;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        expect(overlap(slots[i]!.rect, slots[j]!.rect)).toBe(false);
      }
    }

    expect(agencia!.pisoCorredor).toBe('Concrete');
    expect(agencia!.corridors.length).toBeGreaterThan(0);

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
        expect(agencia!.corridors.some((c) => c.x === a.rect.x1)).toBe(true);
      }
    }
  });

  it('pedido vazio devolve null', () => {
    expect(montarAgencia({ salas: 0 })).toBeNull();
  });

  it('encaixa 4 salas (1 boss + 3 priv + 1 copa) sem perder slot', () => {
    const seed = seedDaGeracao({ salas: 4 }, 1, 1);
    const agencia = montarAgencia({ salas: 4 }, seed);
    expect(agencia!.slots).toHaveLength(5);
    expect(agencia!.grid.width).toBeGreaterThanOrEqual(10);
  });

  it('agencia montada gera cenario espacial com agentes', () => {
    const seed = seedDoPedido({ salas: 2 });
    const agencia = montarAgencia({ salas: 2 }, seed);
    const cenario = construirEspacoAgencia(agencia!);
    expect(cenario.layout.rooms.length).toBe(agencia!.slots.length);
    expect(cenario.agentes.length).toBeGreaterThan(0);
    expect(cenario.nav.cells.length).toBe(agencia!.grid.width * agencia!.grid.height);
  });

  it.each([1, 3, 6, 10])('todas as portas encostam no corredor (%i salas)', (salas) => {
    const agencia = montarAgencia({ salas }, 9000 + salas)!;
    const cenario = construirEspacoAgencia(agencia);
    const corredores = new Set(cenario.layout.corridors.map((c) => `${c.x},${c.y}`));
    for (const room of cenario.layout.rooms) {
      const norte = room.rect.y1 <= agencia.corredorY;
      const vizinho = { x: room.door.x, y: room.door.y + (norte ? 1 : -1) };
      expect(corredores.has(`${vizinho.x},${vizinho.y}`)).toBe(true);
    }
  });
});

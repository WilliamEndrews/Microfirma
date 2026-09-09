import { describe, expect, it } from 'vitest';
import { gradeDoProto } from '@microfirma/world-engine';
import { compilarCenaIso } from './cena-isometrica';
import { montarAgencia } from './montar-agencia';
import { oclusorNaFrente } from './oclusao-parede';

describe('oclusorNaFrente', () => {
  it('a ultima Wall_L da sala norte cobre o ator no corredor (ponta sul)', () => {
    // Vertice no ultimo tile da coluna (y1-1); a face ocupa +1 em y e chega
    // no proprio corredor. O teste pontual `depth > ator` falha aqui — era
    // o vazamento na metade da Wall_L da primeira sala.
    const ultimaNorte = {
      depth: 1 + 4 - 0.35,
      alcanceDepth: 1,
      extensao: { x: -1, y: 1 },
    };
    const atorNoCorredor = 1 + 5;
    expect(ultimaNorte.depth > atorNoCorredor).toBe(false);
    expect(oclusorNaFrente(ultimaNorte, atorNoCorredor, 0.6)).toBe(true);
  });

  it('nao puxa uma Wall_L que esta claramente atras do ator', () => {
    const paredeDoFundo = {
      depth: 1 + 1 - 0.35,
      alcanceDepth: 1,
      extensao: { x: -1, y: 1 },
    };
    expect(oclusorNaFrente(paredeDoFundo, 1 + 5, 0.6)).toBe(false);
  });

  it('faixa pre-composta usa a coluna inteira como alcance', () => {
    const faixaNorte = {
      depth: 1 + 1 - 0.35,
      alcanceDepth: 4,
      extensao: { x: -1, y: 1 },
    };
    expect(oclusorNaFrente(faixaNorte, 1 + 5, 0.6)).toBe(true);
  });
});

describe('compilarCenaIso / alcance da Wall_L norte', () => {
  it('ultima Wall_L da primeira sala norte alcança o corredor', () => {
    const agencia = montarAgencia({ salas: 3 }, 20260830)!;
    const norte = agencia.slots.find((s) => s.rect.y1 <= agencia.corredorY);
    expect(norte).toBeDefined();
    const { h } = gradeDoProto(norte!.proto.tema);
    const cena = compilarCenaIso(agencia);
    const ultima = cena.commands.find(
      (c) => c.kind === 'vertex' && c.id === `${norte!.proto.key}:wallL:${h - 1}`,
    );
    expect(ultima?.kind).toBe('vertex');
    if (ultima?.kind !== 'vertex') return;

    expect(ultima.vy).toBe(norte!.rect.y1 - 1);
    expect(ultima.vy).toBe(agencia.corredorY - 1);
    expect(ultima.depth).toBe(ultima.vx + ultima.vy - 0.35);

    const ator = { x: norte!.rect.x0, y: agencia.corredorY };
    expect(
      oclusorNaFrente(
        { depth: ultima.depth, alcanceDepth: 1, extensao: { x: -1, y: 1 } },
        ator.x + ator.y,
        0.6,
      ),
    ).toBe(true);
  });
});

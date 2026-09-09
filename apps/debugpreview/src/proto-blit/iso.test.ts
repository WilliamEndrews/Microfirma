import { describe, expect, it } from 'vitest';
import {
  FACE_PAD_IN,
  FACE_PAD_OUT,
  PE_WALL_L_DEFAULT,
  faceParedeIso,
  iso,
  losangoPisoDaFace,
  pontoNaMascaraVertical,
  pontoNoPoligono,
  prismaFaceColuna,
} from './iso';

describe('faceParedeIso calibrado', () => {
  it('padOut cobre o pe tipico Wall_L (~95px)', () => {
    expect(FACE_PAD_OUT).toBeCloseTo(PE_WALL_L_DEFAULT.x / 64, 5);
    expect(FACE_PAD_IN).toBe(0.35);
  });

  it('poligono L inclui exterior do PNG e exclui celula de tras', () => {
    const face = faceParedeIso('L', 2, 4, 160);
    expect(pontoNoPoligono(iso(2, 4), face)).toBe(true);
    expect(pontoNoPoligono(iso(2 - FACE_PAD_OUT / 2, 4.5), face)).toBe(true);
    expect(pontoNoPoligono(iso(2, 2), face)).toBe(false);
  });
});

describe('mascara vertical da parede (oclusao)', () => {
  it('prisma de um tile e identico a faceParedeIso', () => {
    const a = faceParedeIso('L', 2, 4, 160);
    const b = prismaFaceColuna('L', 2, 4, 5, 160);
    expect(b).toEqual(a);
  });

  it('centro do losango do piso nao fura o ator; meio da parede sim', () => {
    const vx = 2;
    const vy = 4;
    const piso = losangoPisoDaFace('L', vx, vy);
    const centroPiso = {
      x: (piso[0]!.x + piso[1]!.x + piso[2]!.x + piso[3]!.x) / 4,
      y: (piso[0]!.y + piso[1]!.y + piso[2]!.y + piso[3]!.y) / 4,
    };
    expect(pontoNoPoligono(centroPiso, faceParedeIso('L', vx, vy, 160))).toBe(true);
    expect(pontoNaMascaraVertical(centroPiso, 'L', vx, vy, vy + 1, 160)).toBe(false);

    const meioParede = iso(vx - FACE_PAD_OUT / 2, vy + 0.5);
    meioParede.y -= 80;
    expect(pontoNaMascaraVertical(meioParede, 'L', vx, vy, vy + 1, 160)).toBe(true);
  });

  it('na encruzilhada o piso da face L vizinha nao mascara o corredor', () => {
    // Sala a leste da folga: Wall_L em x=3. O losango (padOut) cobre a celula
    // 2 — a encruzilhada. O piso dessa face nao pode recortar quem passa la.
    const vx = 3;
    const vy = 4;
    const peCorredor = iso(2.5, 4.5);
    expect(pontoNoPoligono(peCorredor, losangoPisoDaFace('L', vx, vy))).toBe(true);
    expect(pontoNaMascaraVertical(peCorredor, 'L', vx, vy, vy + 1, 160)).toBe(false);
  });
});

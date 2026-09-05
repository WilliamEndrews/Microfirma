import { describe, expect, it } from 'vitest';
import {
  FACE_PAD_IN,
  FACE_PAD_OUT,
  PE_WALL_L_DEFAULT,
  faceParedeIso,
  iso,
  pontoNoPoligono,
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

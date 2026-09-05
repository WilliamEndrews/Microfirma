import { describe, expect, it } from 'vitest';
import { espelharGyLocal } from './iso';

describe('espelharGyLocal', () => {
  it('mantem gy quando nao espelha', () => {
    expect(espelharGyLocal(0, 4, false)).toBe(0);
    expect(espelharGyLocal(3, 4, false)).toBe(3);
  });

  it('inverte gy dentro da grade', () => {
    expect(espelharGyLocal(0, 4, true)).toBe(3);
    expect(espelharGyLocal(3, 4, true)).toBe(0);
    expect(espelharGyLocal(1, 3, true)).toBe(1);
  });

  it('porta e parede R ficam na mesma linha apos espelho', () => {
    const h = 5;
    const gyPorta = espelharGyLocal(0, h, true);
    expect(gyPorta).toBe(h - 1);
    expect(gyPorta).toBeLessThan(h);
  });
});

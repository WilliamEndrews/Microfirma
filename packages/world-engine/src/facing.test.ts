import { describe, expect, it } from 'vitest';
import { facingDeDelta } from './facing.js';

describe('facingDeDelta', () => {
  it('cobre os quatro eixos do grid', () => {
    expect(facingDeDelta(0, 1)).toBe(0);
    expect(facingDeDelta(-1, 0)).toBe(1);
    expect(facingDeDelta(0, -1)).toBe(2);
    expect(facingDeDelta(1, 0)).toBe(3);
  });

  it('escolhe a diagonal visual mais proxima para deltas fracionarios', () => {
    expect(facingDeDelta(0.7, 0.2)).toBe(3);
    expect(facingDeDelta(-0.1, -0.8)).toBe(2);
  });

  it('preserva fallback quando nao existe deslocamento', () => {
    expect(facingDeDelta(0, 0, 1)).toBe(1);
  });
});

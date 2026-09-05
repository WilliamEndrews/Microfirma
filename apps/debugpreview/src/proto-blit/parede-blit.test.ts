import { describe, expect, it } from 'vitest';
import { iso } from './iso';
import { posicaoMountParede, verticeDaFace } from './parede-blit';

describe('parede-blit', () => {
  const peL = { x: 95, y: 83 };
  const peR = { x: 32, y: 83 };

  it('face L usa vertice local (0, gy) como no lab', () => {
    expect(verticeDaFace('L', 0, 2)).toEqual({ vx: 0, vy: 2 });
    expect(verticeDaFace('R', 3, 0)).toEqual({ vx: 3, vy: 0 });
  });

  it('posicao global de face L equivale a origem da sala + vertice local', () => {
    const slotX0 = 6;
    const slotY0 = 5;
    const item = {
      assetId: 'projector-screen',
      face: 'L' as const,
      gx: 0,
      gy: 4,
      dx: -56,
      dy: -3,
    };
    const local = posicaoMountParede(slotX0, slotY0, item, peL, item.dx, item.dy);
    const slotBase = iso(slotX0, slotY0);
    const v = verticeDaFace('L', item.gx, item.gy);
    const global = {
      x: slotBase.x + item.dx + iso(v.vx, v.vy).x - peL.x,
      y: slotBase.y + item.dy + iso(v.vx, v.vy).y - peL.y,
    };
    expect(local).toEqual(global);
    expect(local).toEqual({
      x: iso(slotX0, slotY0 + item.gy).x + item.dx - peL.x,
      y: iso(slotX0, slotY0 + item.gy).y + item.dy - peL.y,
    });
  });

  it('face R permanece ancorada no vertice norte local', () => {
    const item = {
      assetId: 'clock-wall',
      face: 'R' as const,
      gx: 2,
      gy: 0,
      dx: -25,
      dy: -17,
    };
    const pos = posicaoMountParede(1, 1, item, peR, item.dx, item.dy);
    expect(pos).toEqual({
      x: iso(3, 1).x - 25 - peR.x,
      y: iso(3, 1).y - 17 - peR.y,
    });
  });
});

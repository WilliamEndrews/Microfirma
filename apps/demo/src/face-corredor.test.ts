import { describe, expect, it } from 'vitest';
import type { Room } from '@microfirma/contracts';
import { faceTocaCorredor } from './face-corredor';

const corredorY = 4;
const corridors = [
  { x: 1, y: corredorY },
  { x: 2, y: corredorY },
  { x: 3, y: corredorY },
];

const salaNorte: Room = {
  roomId: 'room-n',
  zoneId: 'n',
  name: 'norte',
  kind: 'open',
  rect: { x0: 1, y0: 1, x1: 4, y1: corredorY },
  door: { x: 2, y: corredorY - 1 },
};

const salaSul: Room = {
  roomId: 'room-s',
  zoneId: 's',
  name: 'sul',
  kind: 'private',
  rect: { x0: 1, y0: corredorY + 1, x1: 4, y1: 8 },
  door: { x: 2, y: corredorY + 1 },
};

describe('faceTocaCorredor', () => {
  it('sul da faixa norte e norte da faixa sul tocam o corredor', () => {
    expect(faceTocaCorredor(salaNorte, 'sul', corridors)).toBe(true);
    expect(faceTocaCorredor(salaSul, 'norte', corridors)).toBe(true);
  });

  it('fachada norte da faixa norte e sul do predio nao tocam o corredor', () => {
    expect(faceTocaCorredor(salaNorte, 'norte', corridors)).toBe(false);
    expect(faceTocaCorredor(salaSul, 'sul', corridors)).toBe(false);
  });
});

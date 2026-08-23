/** Constantes e geometria isometrica 2:1 — espelho do tinyhouse-lab. */

export const LARGURA_TILE = 128;
export const ALTURA_TILE = 64;
export const DIR_TILES = 'Floor_Wall_Tiles_128';
export const PORTA_VIDRO = 'Doors/Office_Glass_Door_Ani/Office_Glass_Door_1.png';
export const ASSET_BASE = '/tinyhouse-pixel-salvaje/TinyHouse/';

export type Pt = { x: number; y: number };

export function iso(gx: number, gy: number): Pt {
  return {
    x: ((gx - gy) * LARGURA_TILE) / 2,
    y: ((gx + gy) * ALTURA_TILE) / 2,
  };
}

export function origemDoItem(p: {
  gx: number;
  gy: number;
  qx?: number;
  qy?: number;
  passo?: number;
}): { ox: number; oy: number; passo: number } {
  const passo = p.passo == null ? 1 : p.passo;
  const qx = p.qx || 0;
  const qy = p.qy || 0;
  return { ox: p.gx + qx * passo, oy: p.gy + qy * passo, passo };
}

/** Bounding box da grade no espaco iso (sem origem de tela). */
export function boundsGrade(w: number, h: number): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const pts = [iso(0, 0), iso(w, 0), iso(w, h), iso(0, h)];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Tamanho de canvas e origem local para um proto w x h (1 andar). */
export function encaixeProto(w: number, h: number): {
  width: number;
  height: number;
  origem: Pt;
} {
  const { minX, minY, maxX, maxY } = boundsGrade(w, h);
  const padX = 56;
  const padTop = 100;
  const padBottom = 48;
  const width = Math.ceil(maxX - minX + padX * 2);
  const height = Math.ceil(maxY - minY + padTop + padBottom);
  return {
    width,
    height,
    origem: {
      x: Math.round((width - (minX + maxX)) / 2),
      y: Math.round(padTop - minY),
    },
  };
}

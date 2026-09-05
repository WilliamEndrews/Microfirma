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

export type RectSala = { x0: number; y0: number; x1: number; y1: number };

/**
 * Silhueta 2D do prisma da sala: diamante do piso extrudado para cima.
 * Paredes estruturais so podem pintar dentro deste volume; isso impede que
 * Wall_L de uma sala da frente cubra anexos da parede oeste da sala de tras.
 */
export function prismaIso(rect: RectSala, alturaPx: number): Pt[] {
  const nw = iso(rect.x0, rect.y0);
  const ne = iso(rect.x1, rect.y0);
  const se = iso(rect.x1, rect.y1);
  const sw = iso(rect.x0, rect.y1);
  return [
    { x: sw.x, y: sw.y },
    { x: se.x, y: se.y },
    { x: ne.x, y: ne.y },
    { x: ne.x, y: ne.y - alturaPx },
    { x: nw.x, y: nw.y - alturaPx },
    { x: sw.x, y: sw.y - alturaPx },
  ];
}

export function pontoNoPoligono(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    const intersect =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + Number.EPSILON) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Pe tipico Wall_L_128 (peDir). A maior parte do PNG fica a oeste do vertice;
 * padOut cobre esse lado externo; padIn e a espessura para dentro da sala.
 * Sem padOut o clip corta a face visivel (rasgo).
 */
export const PE_WALL_L_DEFAULT = { x: 95, y: 83 };
/** Celulas a oeste da face L (= pe.x / (LARGURA_TILE/2)). */
export const FACE_PAD_OUT = PE_WALL_L_DEFAULT.x / (LARGURA_TILE / 2);
/** Celulas a leste da face L (espessura interna). */
export const FACE_PAD_IN = 0.35;
/** @deprecated use FACE_PAD_OUT — mantido para imports legados. */
export const FACE_PAD = FACE_PAD_OUT;
export const FACE_PAD_R = 0.35;

/**
 * Volume de pintura de um tile de parede. Wall_L = face oeste da celula
 * (padOut para fora + padIn para dentro); Wall_R = face norte.
 * Limitado a vy..vy+1 para nao invadir a celula de tras na coluna oeste.
 */
export function faceParedeIso(
  face: 'L' | 'R',
  vx: number,
  vy: number,
  alturaPx: number,
  pad: number | { out?: number; in?: number } = face === 'L'
    ? { out: FACE_PAD_OUT, in: FACE_PAD_IN }
    : FACE_PAD_R,
): Pt[] {
  if (face === 'L') {
    const padOut = typeof pad === 'number' ? pad : (pad.out ?? FACE_PAD_OUT);
    const padIn = typeof pad === 'number' ? FACE_PAD_IN : (pad.in ?? FACE_PAD_IN);
    const nw = iso(vx - padOut, vy);
    const sw = iso(vx - padOut, vy + 1);
    const se = iso(vx + padIn, vy + 1);
    const ne = iso(vx + padIn, vy);
    return [
      { x: sw.x, y: sw.y },
      { x: se.x, y: se.y },
      { x: ne.x, y: ne.y },
      { x: ne.x, y: ne.y - alturaPx },
      { x: nw.x, y: nw.y - alturaPx },
      { x: sw.x, y: sw.y - alturaPx },
    ];
  }
  const padR = typeof pad === 'number' ? pad : FACE_PAD_R;
  const nw = iso(vx, vy);
  const ne = iso(vx + 1, vy);
  const se = iso(vx + 1, vy + padR);
  const sw = iso(vx, vy + padR);
  return [
    { x: sw.x, y: sw.y },
    { x: se.x, y: se.y },
    { x: ne.x, y: ne.y },
    { x: ne.x, y: ne.y - alturaPx },
    { x: nw.x, y: nw.y - alturaPx },
    { x: sw.x, y: sw.y - alturaPx },
  ];
}

/** Inverte gy local (0..h-1) quando a sala espelha para a porta ficar no corredor. */
export function espelharGyLocal(gy: number, h: number, espelhar: boolean): number {
  return espelhar ? h - 1 - gy : gy;
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

/**
 * Constantes e math da folha Klimmos Iso Male.
 * Folha 512x320 = 8 frames (cols) x 4 direcoes (rows), frame 64x80.
 */

export const FRAME_W = 64;
export const FRAME_H = 80;
export const COLS = 8;
export const ROWS = 4;
export const SHEET_W = FRAME_W * COLS; // 512
export const SHEET_H = FRAME_H * ROWS; // 320

/** Linhas da folha, confirmadas visualmente no pack. */
export const DIR_ROW = {
  SW: 0,
  SE: 1,
  NE: 2,
  NW: 3,
} as const;

export type DirRow = (typeof DIR_ROW)[keyof typeof DIR_ROW];

export type AnimacaoKlimmos = 'Idle' | 'Walk' | 'Sit';

export function rectFrame(dirRow: DirRow | number, frame: number): {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
} {
  const col = ((frame % COLS) + COLS) % COLS;
  const row = ((dirRow % ROWS) + ROWS) % ROWS;
  return {
    sx: col * FRAME_W,
    sy: row * FRAME_H,
    sw: FRAME_W,
    sh: FRAME_H,
  };
}

/** Indice de frame ciclico a partir do tempo. */
export function frameDeTempo(tMs: number, msPorFrame: number): number {
  if (msPorFrame <= 0) return 0;
  return Math.floor(tMs / msPorFrame) % COLS;
}

export function msPorFrameDaAnim(anim: AnimacaoKlimmos): number {
  return anim === 'Walk' ? 100 : 150;
}

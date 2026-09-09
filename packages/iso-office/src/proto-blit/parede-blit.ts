/**
 * Blit de anexos de parede identico ao tinyhouse-lab.
 * Coordenadas locais da sala + origem iso do slot.
 */

import type { CalibracaoSala } from '@microfirma/contracts';
import { iso, type Pt } from './iso';
import type { PecaPalcoItem } from './types';

type Cal = CalibracaoSala & {
  peWallR: Pt;
  peWallL: Pt;
};

export function itemEParede(p: PecaPalcoItem): boolean {
  return !!(p && (p.papel === 'wall' || p.face === 'R' || p.face === 'L'));
}

export function peDaFace(face: 'R' | 'L' | undefined, cal: Cal): Pt {
  return face === 'L' ? cal.peWallL : cal.peWallR;
}

/** Vertice local da face NW (R) ou oeste (L), como no lab. */
export function verticeDaFace(
  face: 'R' | 'L' | undefined,
  gx: number,
  gy: number,
): { vx: number; vy: number } {
  return face === 'L' ? { vx: 0, vy: gy } : { vx: gx, vy: 0 };
}

export function mountParedeValido(item: PecaPalcoItem, w: number, h: number): boolean {
  if (!itemEParede(item)) return false;
  if (item.face === 'R') return item.gx >= 0 && item.gx < w;
  return item.gy >= 0 && item.gy < h;
}

/** Canto superior-esquerdo do sprite antes de aplicar a origem global da cena. */
export function posicaoMountParede(
  slotX0: number,
  slotY0: number,
  item: PecaPalcoItem,
  pe: Pt,
  dx = 0,
  dy = 0,
): Pt {
  const slotBase = iso(slotX0, slotY0);
  const v = verticeDaFace(item.face, item.gx, item.gy);
  const p = iso(v.vx, v.vy);
  return {
    x: slotBase.x + dx + p.x - pe.x,
    y: slotBase.y + dy + p.y - pe.y,
  };
}

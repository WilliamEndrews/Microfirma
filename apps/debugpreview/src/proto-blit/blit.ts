import type { SpecAsset } from './catalogo';
import type { PecaPalcoItem } from './types';
import type { Pt } from './iso';
import { iso, origemDoItem } from './iso';
import type { Bbox } from './assets';

export function blitTile(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  origem: Pt,
  gx: number,
  gy: number,
  ancora: Pt,
  tam?: number,
): Pt {
  const passo = tam == null ? 1 : tam;
  const c = iso(gx + passo / 2, gy + passo / 2);
  const x = origem.x + c.x - ancora.x;
  const y = origem.y + c.y - ancora.y;
  ctx.drawImage(img, x, y);
  return { x, y };
}

export function blitNoPe(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  telaX: number,
  telaY: number,
  pe: Pt,
): { x: number; y: number; tela: Pt } {
  const x = telaX - pe.x;
  const y = telaY - pe.y;
  ctx.drawImage(img, x, y);
  return { x, y, tela: { x: telaX, y: telaY } };
}

export function blitNaVertice(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  origem: Pt,
  vx: number,
  vy: number,
  pe: Pt,
): { x: number; y: number; tela: Pt } {
  const v = iso(vx, vy);
  return blitNoPe(ctx, img, origem.x + v.x, origem.y + v.y, pe);
}

export function blitObjeto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  origem: Pt,
  bbox: Bbox,
  gx: number,
  gy: number,
): void {
  const c = iso(gx + 0.5, gy + 0.5);
  const x = origem.x + c.x - (bbox.x + bbox.w / 2);
  const y = origem.y + c.y - (bbox.y + bbox.h);
  ctx.drawImage(img, x, y);
}

type CalObj = {
  objetos?: Record<
    string,
    { modo?: string; ancora?: Pt; pe?: Pt }
  >;
};

function specDoItem(spec: SpecAsset, cal: CalObj) {
  const mapa = cal.objetos || {};
  return mapa[spec.kind] || mapa[spec.assetId] || null;
}

export function blitCatalogo(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  bbox: Bbox,
  spec: SpecAsset,
  item: PecaPalcoItem,
  cal: CalObj,
  origem: Pt,
): void {
  const o = specDoItem(spec, cal);
  const { ox, oy, passo } = origemDoItem(item);
  if (o && o.modo === 'canto' && o.pe) {
    blitNaVertice(ctx, img, origem, ox, oy, o.pe);
    return;
  }
  if (o && o.modo === 'centro' && o.ancora) {
    blitTile(ctx, img, origem, ox, oy, o.ancora, passo);
    return;
  }
  blitObjeto(ctx, img, origem, bbox, ox, oy);
}

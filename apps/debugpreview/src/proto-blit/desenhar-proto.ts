/**
 * Desenha um ProtoComodo (tema do arquiteto) com o mesmo blit do lab.
 * Sem overlays de edicao (losango/subdiv/diagnostico).
 */

import type { TemaArquiteto } from '@microfirma/world-engine';
import { gradeDoProto } from '@microfirma/world-engine';
import { bboxDe, carregar } from './assets';
import { blitCatalogo, blitNaVertice, blitNoPe, blitTile } from './blit';
import { calibracaoDoTema, coresDoTema, specPorId, type SpecAsset } from './catalogo';
import { DIR_TILES, PORTA_VIDRO, encaixeProto, iso, type Pt } from './iso';
import type { PecaPalcoItem } from './types';

export type { PecaPalcoItem } from './types';

function itemEParede(p: PecaPalcoItem): boolean {
  return !!(p && (p.papel === 'wall' || p.face === 'R' || p.face === 'L'));
}

function peDaFace(
  face: 'R' | 'L' | undefined,
  cal: ReturnType<typeof calibracaoDoTema>,
): Pt {
  return face === 'L' ? cal.peWallL : cal.peWallR;
}

function verticeDaFace(face: 'R' | 'L' | undefined, gx: number, gy: number): { vx: number; vy: number } {
  return face === 'L' ? { vx: 0, vy: gy } : { vx: gx, vy: 0 };
}

async function blitSpecNoPalco(
  ctx: CanvasRenderingContext2D,
  origem: Pt,
  spec: SpecAsset,
  item: PecaPalcoItem,
  cal: ReturnType<typeof calibracaoDoTema>,
): Promise<void> {
  if (spec.camadas && spec.camadas.length) {
    for (const cam of spec.camadas) {
      const s = specPorId(cam.assetId);
      if (!s || s.camadas || !s.fileName) continue;
      try {
        const img = await carregar(s.fileName);
        const bbox = await bboxDe(s.fileName);
        const o = { x: origem.x + (cam.dx || 0), y: origem.y + (cam.dy || 0) };
        blitCatalogo(ctx, img, bbox, s, item, cal, o);
      } catch {
        /* png ausente */
      }
    }
    return;
  }
  if (!spec.fileName) return;
  try {
    const img = await carregar(spec.fileName);
    const bbox = await bboxDe(spec.fileName);
    blitCatalogo(ctx, img, bbox, spec, item, cal, origem);
  } catch {
    /* png ausente */
  }
}

async function blitPecaParede(
  ctx: CanvasRenderingContext2D,
  origem: Pt,
  item: PecaPalcoItem,
  spec: SpecAsset,
  cal: ReturnType<typeof calibracaoDoTema>,
): Promise<void> {
  const pe = peDaFace(item.face, cal);
  const v = verticeDaFace(item.face, item.gx, item.gy);
  const dx = item.dx || 0;
  const dy = item.dy || 0;

  async function blitUma(s: SpecAsset | undefined, odx: number, ody: number) {
    if (!s || s.camadas || !s.fileName) return;
    try {
      const img = await carregar(s.fileName);
      const o = { x: origem.x + odx, y: origem.y + ody };
      blitNaVertice(ctx, img, o, v.vx, v.vy, pe);
    } catch {
      /* png ausente */
    }
  }

  if (spec.camadas && spec.camadas.length) {
    for (const cam of spec.camadas) {
      await blitUma(specPorId(cam.assetId), dx + (cam.dx || 0), dy + (cam.dy || 0));
    }
    return;
  }
  await blitUma(spec, dx, dy);
}

export function medidaProto(tema: TemaArquiteto): { width: number; height: number; origem: Pt; grade: { w: number; h: number } } {
  const grade = gradeDoProto(tema);
  const enc = encaixeProto(grade.w, grade.h);
  return { ...enc, grade };
}

/**
 * Blit completo do proto (piso, NW, porta, palco) com origem iso compartilhada.
 * Coordenadas do palco continuam locais (0..w, 0..h).
 */
export async function desenharProtoEm(
  ctx: CanvasRenderingContext2D,
  tema: TemaArquiteto,
  origem: Pt,
): Promise<{ w: number; h: number }> {
  ctx.imageSmoothingEnabled = false;

  const grade = gradeDoProto(tema);
  const cal = calibracaoDoTema(tema);
  const cores = coresDoTema(tema);
  const ancoraPiso = cal.ancoraPiso ?? { x: 64, y: 68 };
  const peR = cal.peWallR;
  const peL = cal.peWallL;
  const peP = cal.pePorta;
  const folga = cal.folgaPorta ?? { x: 11, y: 4 };

  const pisoSrc = `${DIR_TILES}/Floor_128_${cores.piso}.png`;
  const wallLSrc = `${DIR_TILES}/Wall_L_128_${cores.parede}.png`;
  const wallRSrc = `${DIR_TILES}/Wall_R_128_${cores.parede}.png`;

  const [piso, wallL, wallR, porta] = await Promise.all([
    carregar(pisoSrc),
    carregar(wallLSrc),
    carregar(wallRSrc),
    carregar(PORTA_VIDRO),
  ]);

  const w = grade.w;
  const h = grade.h;
  const celulas: { gx: number; gy: number }[] = [];
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) celulas.push({ gx, gy });
  }
  const gxPorta = Math.floor((w - 1) / 2);

  for (const c of celulas) blitTile(ctx, piso, origem, c.gx, c.gy, ancoraPiso);
  for (let gx = 0; gx < w; gx++) blitNaVertice(ctx, wallR, origem, gx, 0, peR);
  {
    const vMeio = iso(gxPorta, 0);
    blitNoPe(ctx, porta, origem.x + vMeio.x + folga.x, origem.y + vMeio.y + folga.y, peP);
  }
  for (let gy = 0; gy < h; gy++) blitNaVertice(ctx, wallL, origem, 0, gy, peL);

  const palco = (tema.palco || []) as PecaPalcoItem[];

  const itensParede = palco.filter((p) => {
    if (!itemEParede(p)) return false;
    if (p.face === 'R') return p.gx >= 0 && p.gx < w;
    return p.gy >= 0 && p.gy < h;
  });
  for (const item of itensParede) {
    const spec = specPorId(item.assetId);
    if (!spec) continue;
    await blitPecaParede(ctx, origem, item, spec, cal);
  }

  const itens = palco
    .map((p) => ({ ...p, spec: specPorId(p.assetId) }))
    .filter(
      (p): p is PecaPalcoItem & { spec: SpecAsset } =>
        !itemEParede(p) && !!p.spec && p.gx >= 0 && p.gy >= 0 && p.gx < w && p.gy < h,
    );
  itens.sort((a, b) => {
    const da = a.gx + a.gy + (a.spec.papel === 'decor' ? 0.5 : 0);
    const db = b.gx + b.gy + (b.spec.papel === 'decor' ? 0.5 : 0);
    return da - db;
  });
  for (const item of itens) {
    await blitSpecNoPalco(ctx, origem, item.spec, item, cal);
  }

  void wallL;
  return { w, h };
}

/**
 * Desenha o proto em (offsetX, offsetY) no canvas (canto superior-esquerdo do slot).
 * Retorna a altura usada (encaixe + rotulo).
 */
export async function desenharProto(
  ctx: CanvasRenderingContext2D,
  tema: TemaArquiteto,
  offsetX: number,
  offsetY: number,
  rotulo?: string,
): Promise<{ width: number; height: number }> {
  const { width, height, origem: origemLocal } = medidaProto(tema);
  const labelH = 22;
  const origem: Pt = {
    x: offsetX + origemLocal.x,
    y: offsetY + labelH + origemLocal.y,
  };

  ctx.imageSmoothingEnabled = false;
  if (rotulo) {
    ctx.fillStyle = 'rgba(126, 200, 255, 0.9)';
    ctx.font = '11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText(rotulo, offsetX + 8, offsetY + 14);
  }

  await desenharProtoEm(ctx, tema, origem);
  return { width, height: height + labelH };
}

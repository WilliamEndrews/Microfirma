/**
 * Compoe camadas modulares numa folha 512x320 por animacao.
 */

import { ordemBlit, urlCamada, carregarImagem } from './carregar.js';
import { SHEET_H, SHEET_W, type AnimacaoKlimmos } from './folha.js';
import type { LookKlimmos } from './presets.js';

export type FolhaComposta = HTMLCanvasElement;

export async function comporFolha(
  look: LookKlimmos,
  anim: AnimacaoKlimmos,
  baseUrl?: string,
): Promise<FolhaComposta> {
  const camadas = ordemBlit(look);
  const imgs = await Promise.all(
    camadas.map((c) => carregarImagem(urlCamada(anim, c, baseUrl))),
  );

  const canvas = document.createElement('canvas');
  canvas.width = SHEET_W;
  canvas.height = SHEET_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d indisponivel para compose Klimmos');
  ctx.imageSmoothingEnabled = false;
  for (const img of imgs) {
    ctx.drawImage(img, 0, 0);
  }
  return canvas;
}

export async function comporTodasAnims(
  look: LookKlimmos,
  baseUrl?: string,
): Promise<Record<AnimacaoKlimmos, FolhaComposta>> {
  const [Idle, Walk, Sit] = await Promise.all([
    comporFolha(look, 'Idle', baseUrl),
    comporFolha(look, 'Walk', baseUrl),
    comporFolha(look, 'Sit', baseUrl),
  ]);
  return { Idle, Walk, Sit };
}

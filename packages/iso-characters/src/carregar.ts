/**
 * Paths e carregamento de camadas Klimmos sob assets-source (Vite publicDir).
 */

import type { AnimacaoKlimmos } from './folha.js';
import type { LookKlimmos } from './presets.js';

export const KLIMMOS_BASE = '/klimmos-iso-male';

const PASTA_ANIM: Record<AnimacaoKlimmos, string> = {
  Idle: '01_Idle',
  Walk: '02_Walk',
  Sit: '03_Sit',
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export type CamadaArquivo = {
  pasta: string;
  prefixo: string;
  indice: number;
};

export function camadasDoLook(look: LookKlimmos): CamadaArquivo[] {
  return [
    { pasta: '01_Base_Bodies', prefixo: 'Male_BaseBody', indice: look.body },
    { pasta: '05_Shoes', prefixo: 'Male_Shoes', indice: look.shoes },
    { pasta: '04_Bottom_Clothing', prefixo: 'Male_BottomClothing', indice: look.bottom },
    { pasta: '03_Top_Clothing', prefixo: 'Male_TopClothing', indice: look.top },
    { pasta: '02_Hairstyles', prefixo: 'Male_Hairstyle', indice: look.hair },
  ];
}

/** Ordem de blit: body, shoes, bottom, top, hair — com tops 13-15 acima do hair. */
export function ordemBlit(look: LookKlimmos): CamadaArquivo[] {
  const base = camadasDoLook(look);
  const body = base[0]!;
  const shoes = base[1]!;
  const bottom = base[2]!;
  const top = base[3]!;
  const hair = base[4]!;
  if (look.top >= 13 && look.top <= 15) {
    return [body, shoes, bottom, hair, top];
  }
  return [body, shoes, bottom, top, hair];
}

export function urlCamada(
  anim: AnimacaoKlimmos,
  camada: CamadaArquivo,
  baseUrl = KLIMMOS_BASE,
): string {
  const pastaAnim = PASTA_ANIM[anim];
  const file = `${camada.prefixo}_${pad2(camada.indice)}_${anim}.png`;
  const root = baseUrl.replace(/\/$/, '');
  return `${root}/${pastaAnim}/${camada.pasta}/${file}`;
}

export function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`falha ao carregar personagem: ${url}`));
    img.src = url;
  });
}

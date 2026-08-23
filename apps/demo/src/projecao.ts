/**
 * PROJECAO ISOMETRICA E ESCALA DO MUNDO - fonte unica de verdade.
 *
 * Calibracao visual: laboratorio `scripts/iso-validation/tinyhouse.html`.
 * Numeros gravados em `calibracao-tinyhouse.json` (pes de parede/porta e
 * ancora de mesa/bebedouro). Piso ancora no centro da face (64, 68).
 * Paredes e bebedouro de canto pregam o pe no vertice. Mesa principal
 * alinha o canvas 128 ao piso (nao o pe da bbox).
 * Porta plano B: folha 1:1 sobre Wall_R, sem substituir o tile.
 *
 * Antes deste modulo, `LARGURA_TILE`/`ALTURA_TILE` estavam duplicados em
 * office-renderer-2d.ts, sprite-factory.ts e asset-atlas.ts.
 *
 * ---------------------------------------------------------------------------
 * MEDIDAS DE 2026-08-16 (scripts/iso-validation/medir-tinyhouse.js)
 * ---------------------------------------------------------------------------
 *
 * Todos os tiles de ESTRUTURA do TinyHouse (piso, Wall_L, Wall_R, porta de
 * vidro) sao canvas 128x128. O diamante do piso ocupa y=36..107 (bbox 128x72);
 * a FACE do diamante (2:1, 64px de altura) vai de y=36 ate y=100; a laje tem
 * 8px em y=100..107. Centro da face: (64, 68).
 *
 * Paredes: bbox 72x115. Pe de chao Wall_R (32, 83), Wall_L (95, 83). Porta de
 * vidro: pe (46, 101), folha centrada com folga (11, 4). Door_1_Beige e
 * spritesheet 640x128 (5 frames) - nao blitar o PNG inteiro.
 *
 * Mesa Office_Main_Table_Base: canvas 128x128, bbox 102x77 - cabe em 1 celula.
 * Cadeira Basic_Office_Chair_A: canvas 64x64, bbox 33x50.
 *
 * ---------------------------------------------------------------------------
 * A REGRA DE ESCALA
 * ---------------------------------------------------------------------------
 *
 * O pack publica sprites em canvases de 8, 16, 32, 64 e 128px. Esses tiers
 * sao BOUNDING BOXES, nao escalas: o artista desenhou tudo no MESMO
 * pixel-scale. Um pixel do MacBook (canvas 32) vale o mesmo que um pixel da
 * mesa (canvas 128) e o mesmo que um pixel do piso.
 *
 *   ERRADO:  escala = LARGURA_TILE / canvasSize
 *   CERTO:   escala = LARGURA_TILE / PX_POR_CELULA  (fator UNICO e global)
 *
 * Regua vertical (porta 122px ~ 2,05m; cadeira 50px ~ 0,95m): ~56 px/m.
 * Aresta do grid em tela: hypot(64, 32) = 71.55px -> 1.28 m/celula.
 * Sala 3x3 = 3.83 m x 3.83 m ~ 14.7 m2 (escritorio privativo de 1 pessoa).
 */

import calibracaoJson from './calibracao-tinyhouse.json';
import type { CalibracaoSala } from '@microfirma/contracts';

/** Resolucao nativa do tile do pack TinyHouse, em pixels de canvas. */
export const PX_POR_CELULA = 128;

/**
 * Largura do tile na tela. Igual a `PX_POR_CELULA` = renderizacao 1:1,
 * sem reamostragem. O enquadramento do mundo maior e o zoom da camera.
 */
export const LARGURA_TILE = PX_POR_CELULA;

/** Altura do tile. Projecao 2:1 exata, igual a do pack. */
export const ALTURA_TILE = LARGURA_TILE / 2;

/** Fator de escala GLOBAL aplicado a todo sprite externo. */
export const ESCALA_ASSET = LARGURA_TILE / PX_POR_CELULA;

/** Regua vertical medida nos sprites de porta e cadeira. */
export const PX_POR_METRO = 56;

/** Aresta de uma celula do grid, em metros de chao. */
export const METROS_POR_CELULA =
  Math.hypot(LARGURA_TILE / 2, ALTURA_TILE / 2) / PX_POR_METRO;

/**
 * Altura do personagem como fracao da largura do tile.
 * 0.75 x 128 = 96px ~ 1,75m na regua de 56 px/m.
 */
export const ALTURA_PERSONAGEM_RELATIVA = 0.75;

/** Altura do sprite do personagem em pixels de tela. */
export const ALTURA_PERSONAGEM = Math.round(LARGURA_TILE * ALTURA_PERSONAGEM_RELATIVA);

/**
 * Calibracao olhometro gravada. Fonte compartilhada com o laboratorio
 * (`scripts/iso-validation/tinyhouse.html`). Ajuste SEMPRE no lab primeiro,
 * copie os numeros para `calibracao-tinyhouse.json`, depois volte aqui.
 */
export const CALIBRACAO = calibracaoJson;

/** Pe do chao no PNG: Wall_R extremo oeste, Wall_L extremo norte, porta oeste. */
export const PE_WALL_R = CALIBRACAO.peWallR;
export const PE_WALL_L = CALIBRACAO.peWallL;
export const PE_PORTA = CALIBRACAO.pePorta;
export const FOLGA_PORTA = CALIBRACAO.folgaPorta;
export const PORTA_COMO_FOLHA = CALIBRACAO.portaComoFolha;

/**
 * Converte pe-no-vertice (lab) em ancora de centro de celula (desenharTile).
 *
 * iso(gx+0.5, gy+0.5) - iso(gx, gy) = (0, ALTURA_TILE/2).
 * Origem = vertice - pe  <=>  origem = centro - (pe.x, pe.y + 32).
 * Folga da porta desloca o pe ao longo da base da Wall_R.
 */
export function ancoraDePe(
  pe: { x: number; y: number },
  folga: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  return {
    x: pe.x - folga.x,
    y: pe.y + ALTURA_TILE / 2 - folga.y,
  };
}

/** Ancoras por papel. Piso permanece no centro da FACE do diamante. */
export const ANCORA_PISO = CALIBRACAO.ancoraPiso;
export const ANCORA_WALL_R = ancoraDePe(PE_WALL_R);
export const ANCORA_WALL_L = ancoraDePe(PE_WALL_L);
export const ANCORA_PORTA = ancoraDePe(PE_PORTA, FOLGA_PORTA);

/** Como um Prop.kind ancora no piso: centro da celula, ou canto/parede. */
export type ModoObjeto = 'centro' | 'canto';

export interface SpecObjeto {
  modo: ModoObjeto;
  /** Pixel do PNG que cai no centro da face (modo centro). */
  ancora?: { x: number; y: number };
  /** Pixel do PNG que cai no vertice NW da celula (modo canto). */
  pe?: { x: number; y: number };
}

const OBJETOS_FALLBACK: Record<string, SpecObjeto> = {
  desk: { modo: 'centro', ancora: { x: 64, y: 68 } },
  water: { modo: 'canto', pe: { x: 64, y: 63 } },
};

/**
 * Calibracao de mobiliario por kind. Sem entrada: o renderer usa o pe da
 * bbox (comportamento antigo). Mesa e bebedouro vem do JSON do lab.
 */
export function specObjeto(kind: string, cal?: CalibracaoSala): SpecObjeto | undefined {
  const mapa = (cal?.objetos ?? (CALIBRACAO as { objetos?: Record<string, SpecObjeto> }).objetos);
  return mapa?.[kind] ?? OBJETOS_FALLBACK[kind];
}

/**
 * Empurrao extra do sill da porta, em pixels de canvas, depois da ancora.
 * A folga ja entra em ANCORA_PORTA. Manter zero: nao empilhar deslocamento.
 */
export const VAO_PORTA = { x: 0, y: 0 } as const;

/** Alias historico - mesmo ponto que ANCORA_PISO. */
export const ANCORA_TILE = ANCORA_PISO;

export type PapelTile = 'floor' | 'wall_l' | 'wall_r' | 'door';

/** Ancora de blit para um papel de tile estrutural. */
export function ancoraDoPapel(papel: PapelTile, cal?: CalibracaoSala): { x: number; y: number } {
  const piso = cal?.ancoraPiso ?? ANCORA_PISO;
  const wallR = cal ? ancoraDePe(cal.peWallR) : ANCORA_WALL_R;
  const wallL = cal ? ancoraDePe(cal.peWallL) : ANCORA_WALL_L;
  const porta = cal
    ? ancoraDePe(cal.pePorta, cal.folgaPorta ?? { x: 0, y: 0 })
    : ANCORA_PORTA;
  switch (papel) {
    case 'wall_l':
      return wallL;
    case 'wall_r':
      return wallR;
    case 'door':
      return { x: porta.x + VAO_PORTA.x, y: porta.y + VAO_PORTA.y };
    default:
      return piso;
  }
}

/** Converte coordenada de grade em coordenada de tela (isometrico 2:1). */
export function iso(gx: number, gy: number): { x: number; y: number } {
  return { x: ((gx - gy) * LARGURA_TILE) / 2, y: ((gx + gy) * ALTURA_TILE) / 2 };
}

/** Losango (diamante) de uma celula, com recuo opcional para dentro. */
export function losango(gx: number, gy: number, recuo = 0): Array<{ x: number; y: number }> {
  const a = recuo;
  const b = 1 - recuo;
  return [iso(gx + a, gy + a), iso(gx + b, gy + a), iso(gx + b, gy + b), iso(gx + a, gy + b)];
}

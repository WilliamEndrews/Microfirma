/**
 * PROJECAO ISOMETRICA E ESCALA DO MUNDO - fonte unica de verdade.
 *
 * Antes deste modulo, `LARGURA_TILE`/`ALTURA_TILE` estavam duplicados em
 * office-renderer-2d.ts, sprite-factory.ts e asset-atlas.ts. Tres copias da
 * mesma constante e uma garantia de divergencia silenciosa - mudar o tamanho
 * do tile num arquivo e esquecer nos outros produz sprites fora de escala,
 * que foi exatamente o bug que motivou esta refatoracao.
 *
 * ---------------------------------------------------------------------------
 * A REGRA DE ESCALA (le isto antes de mexer em qualquer numero abaixo)
 * ---------------------------------------------------------------------------
 *
 * O pack TinyHouse (@pixel_Salvaje) publica sprites em canvases de 8, 16, 32,
 * 64 e 128px. Esses tiers sao apenas BOUNDING BOXES, nao escalas: o artista
 * desenhou tudo no MESMO pixel-scale. Um pixel do MacBook (canvas 32) vale o
 * mesmo que um pixel da mesa (canvas 128) e o mesmo que um pixel do piso.
 *
 * Consequencia pratica, e o erro que ja cometemos aqui uma vez:
 *
 *   ERRADO:  escala = LARGURA_TILE / canvasSize   (normaliza tudo para o
 *            mesmo tamanho na tela; um notebook fica do tamanho de uma mesa)
 *   CERTO:   escala = LARGURA_TILE / PX_POR_CELULA (fator UNICO e global,
 *            identico para todos os assets, seja qual for o canvas)
 *
 * ---------------------------------------------------------------------------
 * ANCORAGEM NO PERSONAGEM (medida, nao chutada)
 * ---------------------------------------------------------------------------
 *
 * Medindo os sprites do pack pixel a pixel, com a porta e a cadeira como
 * reguas humanas conhecidas:
 *
 *   porta de vidro ... 122px de altura ~ 2,05m  -> ~59 px/m
 *   cadeira office ...  50px de altura ~ 0,95m  -> ~53 px/m
 *
 * O pack foi desenhado a ~56 px por metro. Disso deriva todo o resto:
 *
 *   1 celula  = 128px de largura       = ~2,3m
 *   1 pessoa  = 1,75m -> ~98px         = 0,75 x largura do tile
 *
 * Por isso `ALTURA_PERSONAGEM_RELATIVA = 0.75`: o personagem NAO tem altura
 * arbitraria, ele e derivado da mesma regua que dimensiona a mobilia.
 */

/**
 * Resolucao nativa do tile do pack TinyHouse, em pixels.
 * O piso e um diamante de 128x64 EXATO (2:1), verificado pixel a pixel,
 * mais 8px de espessura de laje desenhados abaixo do diamante.
 */
export const PX_POR_CELULA = 128;

/**
 * Largura do tile na tela. Igual a `PX_POR_CELULA` = renderizacao 1:1,
 * sem reamostragem, que e o unico modo de preservar pixel art intacto.
 * O enquadramento do mundo maior e resolvido com zoom de camera, nao
 * encolhendo sprites (downscale nao-integral serrilha e borra pixel art).
 */
export const LARGURA_TILE = PX_POR_CELULA;

/** Altura do tile. Projecao 2:1 exata, igual a do pack. */
export const ALTURA_TILE = LARGURA_TILE / 2;

/**
 * Fator de escala GLOBAL aplicado a todo sprite externo, independente do
 * tamanho do canvas em que foi autorado. Ver "A REGRA DE ESCALA" acima.
 */
export const ESCALA_ASSET = LARGURA_TILE / PX_POR_CELULA;

/**
 * Altura do personagem como fracao da largura do tile.
 * 0.75 x 128 = 96px ~ 1,75m na regua de ~56 px/m do pack.
 */
export const ALTURA_PERSONAGEM_RELATIVA = 0.75;

/** Altura do sprite do personagem em pixels de tela. */
export const ALTURA_PERSONAGEM = Math.round(LARGURA_TILE * ALTURA_PERSONAGEM_RELATIVA);

/**
 * Ancora do canvas 128x128 do TinyHouse dentro da celula.
 *
 * O diamante do piso ocupa y=36..107 no canvas; a face superior (a que
 * define a celula) vai de y=36 ate y=100, logo seu centro esta em y=68.
 * Horizontalmente o canvas e simetrico, entao o centro e x=64.
 *
 * Piso, Wall_L e Wall_R foram autorados no MESMO canvas 128x128 e alinhados
 * entre si pelo artista. Blitar os tres nesta mesma ancora faz com que se
 * componham corretamente sem calculo adicional - e assim que o proprio
 * programa TinyHouse do autor monta os cenarios.
 */
export const ANCORA_TILE = { x: 64, y: 68 } as const;

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

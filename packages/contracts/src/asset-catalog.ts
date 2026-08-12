/**
 * CONTRATO 7 - CATALOGO DE ASSETS PRE-RENDERIZADOS
 *
 * Registro das obras de arte que o renderer pode usar no lugar de sprites
 * gerados proceduralmente (ADR-0012). Cada asset carrega a propria
 * licenca, fonte e metadados espaciais (footprint, ancora), mantendo o
 * contrato `Prop` inalterado: `Prop.kind` continua sendo semantico e o
 * `assetId` e uma variante visual opcional.
 */

import { z } from 'zod';
import { Decor, Footprint, Prop } from './layout.js';

/** Footprint reexportado por compatibilidade - a definicao canonica vive em layout.ts,
 *  porque e o mesmo formato usado por `Prop.footprint` (solver/navgrid). */
export { Footprint };

/** Deslocamento da ancora do sprite em pixels, relativo ao centro do tile. */
export const AnchorOffset = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
});
export type AnchorOffset = z.infer<typeof AnchorOffset>;

/**
 * Uma entrada de asset. Ligada semanticamente a um `Prop.kind` OU a um
 * `Decor.kind` (os dois enums nao se sobrepoem) - um unico catalogo cobre
 * mobilia posicionada por celula e decoracao de superficie nao-colidivel,
 * porque a estrutura de proveniencia/licenca/footprint/ancora e identica.
 */
export const AssetEntry = z.object({
  assetId: z.string().min(1),
  kind: z.union([Prop.shape.kind, Decor.shape.kind]),
  packId: z.string().min(1),
  fileName: z.string().min(1),
  /** Quantos tiles de grade o objeto ocupa. */
  footprint: Footprint.default({ w: 1, h: 1 }),
  /** Offset em pixels para corrigir assentamento no piso. */
  anchor: AnchorOffset.default({ x: 0, y: 0 }),
  /** Licenca declarada independente do pack, para rastreabilidade legal. */
  license: z.string().min(1).default('CC0-1.0'),
  /** URL canonica de atribuicao/licenca do asset individual. */
  sourceUrl: z.string().optional(),
  /** Tags para selecao tematica e subset do catalogo. */
  tags: z.array(z.string()).default([]),
});
export type AssetEntry = z.infer<typeof AssetEntry>;

/** Informacoes de um pack de origem. */
export const AssetPack = z.object({
  packId: z.string().min(1),
  name: z.string().min(1),
  author: z.string().min(1).optional(),
  sourceUrl: z.string().min(1),
  license: z.string().min(1),
  /** Caminho relativo ao public/ ou raiz do app, SEM leading slash, sem trailing slash. */
  basePath: z.string().min(1),
});
export type AssetPack = z.infer<typeof AssetPack>;

/** Manifesto completo. Pode evoluir para JSON e ser gerado por pipeline. */
export const AssetManifest = z.object({
  version: z.string().default('1.0.0'),
  packs: z.array(AssetPack),
  assets: z.array(AssetEntry),
});
export type AssetManifest = z.infer<typeof AssetManifest>;

/** Pack Kenney Furniture Kit (CC0). Mobilia estrutural base (mesas, cadeiras, sofas, armarios, estantes). */
export const KENNEY_FURNITURE_PACK: AssetPack = {
  packId: 'kenney-furniture-kit',
  name: 'Kenney Furniture Kit',
  author: 'Kenney',
  sourceUrl: 'https://kenney.nl/assets/furniture-kit',
  license: 'CC0-1.0',
  basePath: 'kenney-furniture-kit/Isometric',
};

/** Pack Kenney Nature Kit (CC0). Plantas, vasos, arvores - candidato a vegetacao 3D. */
export const KENNEY_NATURE_PACK: AssetPack = {
  packId: 'kenney-nature-kit',
  name: 'Kenney Nature Kit',
  author: 'Kenney',
  sourceUrl: 'https://kenney.nl/assets/nature-kit',
  license: 'CC0-1.0',
  basePath: 'kenney-nature-kit',
};

/** Pack Kenney Foliage Pack (CC0). Vegetacao como sprite 2D plano (ADR-0012, secao 3b). */
export const KENNEY_FOLIAGE_PACK: AssetPack = {
  packId: 'kenney-foliage-pack',
  name: 'Kenney Foliage Pack',
  author: 'Kenney',
  sourceUrl: 'https://kenney.nl/assets/foliage-pack',
  license: 'CC0-1.0',
  basePath: 'kenney-foliage-pack/PNG/Default size',
};

/** Pack Kenney Isometric Tiles Landscape (CC0). Candidato a piso/terreno base compartilhado. */
export const KENNEY_ISOMETRIC_TILES_PACK: AssetPack = {
  packId: 'kenney-isometric-tiles-landscape',
  name: 'Kenney Isometric Tiles Landscape',
  author: 'Kenney',
  sourceUrl: 'https://kenney.nl/assets/isometric-tiles-landscape',
  license: 'CC0-1.0',
  basePath: 'kenney-isometric-tiles-landscape',
};

/** Pack SBS Isometric Floor Tiles (CC0/Public Domain). Piso em projecao 2:1 verdadeira. */
export const SBS_FLOOR_TILES_PACK: AssetPack = {
  packId: 'sbs-isometric-floor-tiles',
  name: 'Isometric Tiles - Floor Pack (Large 256x128)',
  author: 'Screaming Brain Studios',
  sourceUrl: 'https://screamingbrainstudios.itch.io/isotilepack',
  license: 'CC0-1.0',
  basePath: 'sbs-isometric-floor-tiles',
};

/** Pack Omie's Assets Office Set (CC0, declarado na pagina do produto). Decor de superficie fino. */
export const OMIES_OFFICE_SET_PACK: AssetPack = {
  packId: 'omies-assets-office-set',
  name: "Omie's Assets Office Set (Office Cubicle Set)",
  author: "Omie's Assets",
  sourceUrl: 'https://omies-assets.itch.io/omies-assets-office-set',
  license: 'CC0-1.0',
  basePath: 'omies-assets-office-set',
};

/**
 * Registro de todos os packs conhecidos, processados ou nao. Fonte unica de
 * verdade para `packId` valido - qualquer referencia a um `packId` fora desta
 * lista (em `INITIAL_CATALOG.assets` ou no mapa de temas do Agente Decorador)
 * e um erro de dados, nao apenas visual.
 */
export const KNOWN_PACKS: readonly AssetPack[] = [
  KENNEY_FURNITURE_PACK,
  KENNEY_NATURE_PACK,
  KENNEY_FOLIAGE_PACK,
  KENNEY_ISOMETRIC_TILES_PACK,
  SBS_FLOOR_TILES_PACK,
  OMIES_OFFICE_SET_PACK,
];

/**
 * Catalogo inicial - step 1 do ADR-0012.
 * Os offsets de ancora serao ajustados empiricamente apos screenshot.
 *
 * Cobertura por pack, hoje:
 *  - kenney-furniture-kit: mobilia estrutural base (mesa, cadeira, estante, sofa)
 *    + decor de superficie (`kind` de `Decor`: laptop, monitor, teclado, mouse,
 *    livros, radio) - o mesmo pack ja tinha esses itens em `Isometric/`, entao
 *    o passo 5 do ADR-0012 (array `decor[]`) NAO precisou do Omie's Assets nem
 *    do pipeline Blender para uma primeira versao util.
 *  - kenney-nature-kit: variedade de vegetacao (`kind: 'plant'`) - o pack ja vem
 *    com uma pasta `Isometric/` pre-renderizada pelo fornecedor, na mesma
 *    convencao de sufixo `_SW` do Furniture Kit, entao nao precisou de
 *    pipeline Blender proprio (mesma verificacao feita para o Furniture Kit).
 *
 * Deliberadamente ausentes:
 *  - kenney-foliage-pack e sbs-isometric-floor-tiles: nao correspondem a um
 *    `Prop.kind` existente (sao piso e folhagem 2D "de chao", nao mobiliario
 *    posicionado por celula); entram no catalogo quando o renderer ganhar um
 *    caminho de piso/decor de superficie orientado a assets (ver ADR-0012,
 *    decisao 6, e pendencias em docs/plano-mestre-mvp.md).
 *  - kenney-isometric-tiles-landscape: mesmo motivo (piso), nao processado ainda.
 *  - omies-assets-office-set: pack so tem modelos FBX + texturas PBR, sem
 *    sprites isometricos pre-renderizados pelo fornecedor - precisa do
 *    pipeline Blender (ainda nao construido) antes de virar `AssetEntry`.
 *    Registrado em KNOWN_PACKS para reserva de `packId`, sem entradas em `assets`.
 *
 * NOTA para quem for consumir isto no renderer: `asset-atlas.ts` hoje mapeia
 * no maximo 1 asset por `kind` (o ultimo do array vence) - varios `plant`
 * abaixo nao geram variedade visual automatica ainda. Selecao determinada
 * por prop/seed e trabalho futuro (ver pendencias do ADR-0012).
 */
export const INITIAL_CATALOG: AssetManifest = {
  version: '1.0.0',
  packs: [KENNEY_FURNITURE_PACK, KENNEY_NATURE_PACK],
  assets: [
    {
      assetId: 'table-sw',
      kind: 'desk',
      packId: 'kenney-furniture-kit',
      fileName: 'table_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/furniture-kit',
      tags: ['furniture', 'desk', 'base'],
    },
    {
      assetId: 'chair-desk-sw',
      kind: 'chair',
      packId: 'kenney-furniture-kit',
      fileName: 'chairDesk_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/furniture-kit',
      tags: ['furniture', 'chair', 'base'],
    },
    {
      assetId: 'plant-small-1-sw',
      kind: 'plant',
      packId: 'kenney-furniture-kit',
      fileName: 'plantSmall1_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/furniture-kit',
      tags: ['decoration', 'plant', 'base'],
    },
    {
      assetId: 'bookcase-open-sw',
      kind: 'bookshelf',
      packId: 'kenney-furniture-kit',
      fileName: 'bookcaseOpen_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/furniture-kit',
      tags: ['furniture', 'storage', 'base'],
    },
    {
      assetId: 'lounge-sofa-sw',
      kind: 'sofa',
      packId: 'kenney-furniture-kit',
      fileName: 'loungeSofa_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/furniture-kit',
      tags: ['furniture', 'sofa', 'base'],
    },
    // Variedade de vegetacao (kenney-nature-kit/Isometric, sufixo _SW).
    {
      assetId: 'plant-bush-small-sw',
      kind: 'plant',
      packId: 'kenney-nature-kit',
      fileName: 'plant_bushSmall_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/nature-kit',
      tags: ['decoration', 'plant', 'variety'],
    },
    {
      assetId: 'pot-small-sw',
      kind: 'plant',
      packId: 'kenney-nature-kit',
      fileName: 'pot_small_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/nature-kit',
      tags: ['decoration', 'plant', 'variety'],
    },
    {
      assetId: 'flower-purple-a-sw',
      kind: 'plant',
      packId: 'kenney-nature-kit',
      fileName: 'flower_purpleA_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/nature-kit',
      tags: ['decoration', 'plant', 'variety'],
    },
    {
      assetId: 'flower-red-a-sw',
      kind: 'plant',
      packId: 'kenney-nature-kit',
      fileName: 'flower_redA_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/nature-kit',
      tags: ['decoration', 'plant', 'variety'],
    },
    {
      assetId: 'mushroom-tan-sw',
      kind: 'plant',
      packId: 'kenney-nature-kit',
      fileName: 'mushroom_tan_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/nature-kit',
      tags: ['decoration', 'plant', 'variety'],
    },
    // Decor de superficie (kenney-furniture-kit/Isometric, sufixo _SW) - passo 5 do ADR-0012.
    {
      assetId: 'laptop-sw',
      kind: 'laptop',
      packId: 'kenney-furniture-kit',
      fileName: 'laptop_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/furniture-kit',
      tags: ['decor', 'surface', 'base'],
    },
    {
      assetId: 'computer-screen-sw',
      kind: 'monitor',
      packId: 'kenney-furniture-kit',
      fileName: 'computerScreen_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/furniture-kit',
      tags: ['decor', 'surface', 'base'],
    },
    {
      assetId: 'computer-keyboard-sw',
      kind: 'keyboard',
      packId: 'kenney-furniture-kit',
      fileName: 'computerKeyboard_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/furniture-kit',
      tags: ['decor', 'surface', 'base'],
    },
    {
      assetId: 'computer-mouse-sw',
      kind: 'mouse',
      packId: 'kenney-furniture-kit',
      fileName: 'computerMouse_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/furniture-kit',
      tags: ['decor', 'surface', 'base'],
    },
    {
      assetId: 'books-sw',
      kind: 'books',
      packId: 'kenney-furniture-kit',
      fileName: 'books_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/furniture-kit',
      tags: ['decor', 'surface', 'base'],
    },
    {
      assetId: 'radio-sw',
      kind: 'radio',
      packId: 'kenney-furniture-kit',
      fileName: 'radio_SW.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'CC0-1.0',
      sourceUrl: 'https://kenney.nl/assets/furniture-kit',
      tags: ['decor', 'surface', 'base'],
    },
  ],
};

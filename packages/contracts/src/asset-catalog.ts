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
import { Prop } from './layout.js';

/** Footprint em celulas do grid (largura x profundidade). */
export const Footprint = z.object({
  w: z.number().int().min(1).default(1),
  h: z.number().int().min(1).default(1),
});
export type Footprint = z.infer<typeof Footprint>;

/** Deslocamento da ancora do sprite em pixels, relativo ao centro do tile. */
export const AnchorOffset = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
});
export type AnchorOffset = z.infer<typeof AnchorOffset>;

/** Uma entrada de asset. Ligada semanticamente a um Prop.kind. */
export const AssetEntry = z.object({
  assetId: z.string().min(1),
  kind: Prop.shape.kind,
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
 * Apenas os 5 primeiros sprites validados contra a grade isometrica 2:1.
 * Os offsets de ancora serao ajustados empiricamente apos screenshot.
 */
export const INITIAL_CATALOG: AssetManifest = {
  version: '1.0.0',
  packs: [KENNEY_FURNITURE_PACK],
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
  ],
};

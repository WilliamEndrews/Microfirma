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
  /**
   * Largura do tile-base isometrico do pack em pixels (ex.: 128 para packs
   * Kenney). O renderer usa isto para escalar o sprite ao tile do MicroFirma
   * (LARGURA_TILE=44): escala = 44 / tileWidth. Sem isto, sprites sao
   * desenhados em resolucao nativa e ficam desproporcionais ao grid.
   */
  tileWidth: z.number().int().min(1).default(128),
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
  tileWidth: 128,
};

/** Pack Kenney Nature Kit (CC0). Plantas, vasos, arvores - candidato a vegetacao 3D. */
export const KENNEY_NATURE_PACK: AssetPack = {
  packId: 'kenney-nature-kit',
  name: 'Kenney Nature Kit',
  author: 'Kenney',
  sourceUrl: 'https://kenney.nl/assets/nature-kit',
  license: 'CC0-1.0',
  basePath: 'kenney-nature-kit/Isometric',
  tileWidth: 128,
};

/** Pack Kenney Foliage Pack (CC0). Vegetacao como sprite 2D plano (ADR-0012, secao 3b). */
export const KENNEY_FOLIAGE_PACK: AssetPack = {
  packId: 'kenney-foliage-pack',
  name: 'Kenney Foliage Pack',
  author: 'Kenney',
  sourceUrl: 'https://kenney.nl/assets/foliage-pack',
  license: 'CC0-1.0',
  basePath: 'kenney-foliage-pack/PNG/Default size',
  tileWidth: 128,
};

/** Pack Kenney Isometric Tiles Landscape (CC0). Candidato a piso/terreno base compartilhado. */
export const KENNEY_ISOMETRIC_TILES_PACK: AssetPack = {
  packId: 'kenney-isometric-tiles-landscape',
  name: 'Kenney Isometric Tiles Landscape',
  author: 'Kenney',
  sourceUrl: 'https://kenney.nl/assets/isometric-tiles-landscape',
  license: 'CC0-1.0',
  basePath: 'kenney-isometric-tiles-landscape',
  tileWidth: 128,
};

/** Pack SBS Isometric Floor Tiles (CC0/Public Domain). Piso em projecao 2:1 verdadeira. */
export const SBS_FLOOR_TILES_PACK: AssetPack = {
  packId: 'sbs-isometric-floor-tiles',
  name: 'Isometric Tiles - Floor Pack (Large 256x128)',
  author: 'Screaming Brain Studios',
  sourceUrl: 'https://screamingbrainstudios.itch.io/isotilepack',
  license: 'CC0-1.0',
  basePath: 'sbs-isometric-floor-tiles',
  tileWidth: 256,
};

/** Pack Omie's Assets Office Set (CC0, declarado na pagina do produto). Decor de superficie fino. */
export const OMIES_OFFICE_SET_PACK: AssetPack = {
  packId: 'omies-assets-office-set',
  name: "Omie's Assets Office Set (Office Cubicle Set)",
  author: "Omie's Assets",
  sourceUrl: 'https://omies-assets.itch.io/omies-assets-office-set',
  license: 'CC0-1.0',
  basePath: 'omies-assets-office-set',
  tileWidth: 128,
};

/**
 * Pack TinyHouse por Pixel_Salvaje - pack COMERCIAL pago, autorizado para uso
 * no projeto. Tile base isometrico 2:1 de 128px. Contem:
 *  - Pasta Office/ com mobilia de escritorio dedicada (mesas, cadeiras, PCs,
 *    impressora, copiadora, divisoria, porta de vidro, bebedouro, shredder).
 *  - Pasta Desks/ com mesas de escritorio (Office_Main_Table, Office_Normal_Table).
 *  - Pasta Chairs/ com cadeiras de escritorio (Basic_Office_Chair, Office_Main_Chair).
 *  - Pasta Computer/ com iMacs, PCs, MacBooks, telas.
 *  - Pasta Floor_Wall_Tiles_128/ com 40+ cores de piso (diamante 128x72) E
 *    paredes (Wall_L/Wall_R, 72x115) - resolve o problema de paredes transparentes.
 *  - Pasta Plants/, Sofa/, Books/, Carpets/, Lamp/, Doors/ com variedade.
 *
 * Este pack substitui o Kenney Furniture Kit como fonte primaria de mobilia
 * porque o Kenney e voltado para casa (banheiros, camas, estantes domesticas),
 * enquanto o TinyHouse tem uma pasta Office/ dedicada com itens que um
 * escritorio real tem (copiadora, divisoria, porta de vidro, shredder, etc.).
 */
export const TINYHOUSE_PACK: AssetPack = {
  packId: 'tinyhouse-pixel-salvaje',
  name: 'TinyHouse 0.17',
  author: 'Pixel_Salvaje',
  sourceUrl: 'https://pixelsalvaje.itch.io/tinyhouse',
  license: 'commercial-paid',
  basePath: 'tinyhouse-pixel-salvaje/TinyHouse',
  tileWidth: 128,
};

/**
 * Registro de todos os packs conhecidos, processados ou nao. Fonte unica de
 * verdade para `packId` valido - qualquer referencia a um `packId` fora desta
 * lista (em `INITIAL_CATALOG.assets` ou no mapa de temas do Agente Decorador)
 * e um erro de dados, nao apenas visual.
 */
export const KNOWN_PACKS: readonly AssetPack[] = [
  TINYHOUSE_PACK,
  KENNEY_FURNITURE_PACK,
  KENNEY_NATURE_PACK,
  KENNEY_FOLIAGE_PACK,
  KENNEY_ISOMETRIC_TILES_PACK,
  SBS_FLOOR_TILES_PACK,
  OMIES_OFFICE_SET_PACK,
];

/**
 * Catalogo inicial - ADR-0012.
 *
 * REFORMULACAO: TinyHouse (Pixel_Salvaje) substitui Kenney Furniture Kit como
 * fonte primaria de mobilia. O TinyHouse tem uma pasta Office/ dedicada com
 * itens de escritorio reais (copiadora, divisoria, porta de vidro, shredder,
 * bebedouro), alem de floor tiles e wall tiles isometricos proprios.
 *
 * O Kenney Furniture Kit fica registrado em KNOWN_PACKS para referencia, mas
 * seus assets nao sao mais mapeados em INITIAL_CATALOG.assets - o TinyHouse
 * cobre todos os kinds de Prop com qualidade superior e contexto de escritorio.
 *
 * Cobertura por kind:
 *  - desk: Office_Main_Table_Base (128x128, mesa de escritorio com gavetas)
 *  - chair: Basic_Office_Chair_A (64x64, cadeira de escritorio)
 *  - bookshelf: Rack (256x256, estante de armazenamento office)
 *  - sofa: Sofa_3_A_Tile (128x128, sofa)
 *  - plant: Plant_2 (64x64, planta office)
 *  - cabinet: Office_Wood_Closet (64x64, armario office)
 *  - laptop: Macbook_1_Open_Tile (32x32, MacBook aberto)
 *  - monitor: NewImac_B_Tile (64x64, iMac moderno)
 *  - keyboard: NewKeyboard_Tile (64x64, teclado)
 *  - mouse: (sem equivalente direto no TinyHouse, fallback procedural)
 *  - books: Books_Pile (128x128, pilha de livros)
 *  - radio: (sem equivalente direto, fallback procedural)
 *
 * Piso e paredes:
 *  - Floor tiles: Floor_128_WoodLight (128x72 diamante isometrico)
 *  - Wall tiles: Wall_L_128_WoodLight + Wall_R_128_WoodLight (72x115 cada)
 *
 * NOTA: `asset-atlas.ts` mapeia no maximo 1 asset por `kind` (ultimo vence).
 * Variedade deterministica por seed e trabalho futuro.
 */
export const INITIAL_CATALOG: AssetManifest = {
  version: '2.0.0',
  packs: [TINYHOUSE_PACK],
  assets: [
    // === MOBILIA ESTRUTURAL (Prop) ===
    {
      assetId: 'office-main-table',
      kind: 'desk',
      packId: 'tinyhouse-pixel-salvaje',
      fileName: 'Desks/Office_Main_Table_Desk/Office_Main_Table_Base.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'commercial-paid',
      sourceUrl: 'https://pixelsalvaje.itch.io/tinyhouse',
      tags: ['furniture', 'desk', 'office'],
    },
    {
      assetId: 'basic-office-chair',
      kind: 'chair',
      packId: 'tinyhouse-pixel-salvaje',
      fileName: 'Chairs/Basic_Office_Chair_A.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'commercial-paid',
      sourceUrl: 'https://pixelsalvaje.itch.io/tinyhouse',
      tags: ['furniture', 'chair', 'office'],
    },
    {
      assetId: 'office-rack',
      kind: 'bookshelf',
      packId: 'tinyhouse-pixel-salvaje',
      fileName: 'Office/Rack.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'commercial-paid',
      sourceUrl: 'https://pixelsalvaje.itch.io/tinyhouse',
      tags: ['furniture', 'storage', 'office'],
    },
    {
      assetId: 'sofa-3',
      kind: 'sofa',
      packId: 'tinyhouse-pixel-salvaje',
      fileName: 'Sofa/Sofa_3_A_Tile.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'commercial-paid',
      sourceUrl: 'https://pixelsalvaje.itch.io/tinyhouse',
      tags: ['furniture', 'sofa'],
    },
    {
      assetId: 'office-wood-closet',
      kind: 'cabinet',
      packId: 'tinyhouse-pixel-salvaje',
      fileName: 'Office/Office_Wood_Closet.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'commercial-paid',
      sourceUrl: 'https://pixelsalvaje.itch.io/tinyhouse',
      tags: ['furniture', 'cabinet', 'office'],
    },
    {
      assetId: 'plant-2',
      kind: 'plant',
      packId: 'tinyhouse-pixel-salvaje',
      fileName: 'Plants/Plant_2.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'commercial-paid',
      sourceUrl: 'https://pixelsalvaje.itch.io/tinyhouse',
      tags: ['decoration', 'plant', 'office'],
    },
    // === DECOR DE SUPERFICIE (Decor) ===
    {
      assetId: 'macbook-open',
      kind: 'laptop',
      packId: 'tinyhouse-pixel-salvaje',
      fileName: 'Computer/MacBook_Ani/Macbook_1_Open_Tile.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'commercial-paid',
      sourceUrl: 'https://pixelsalvaje.itch.io/tinyhouse',
      tags: ['decor', 'surface', 'computer'],
    },
    {
      assetId: 'imac-new',
      kind: 'monitor',
      packId: 'tinyhouse-pixel-salvaje',
      fileName: 'Computer/NewImac_B_Tile.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'commercial-paid',
      sourceUrl: 'https://pixelsalvaje.itch.io/tinyhouse',
      tags: ['decor', 'surface', 'computer'],
    },
    {
      assetId: 'new-keyboard',
      kind: 'keyboard',
      packId: 'tinyhouse-pixel-salvaje',
      fileName: 'Computer/NewKeyboard_Tile.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'commercial-paid',
      sourceUrl: 'https://pixelsalvaje.itch.io/tinyhouse',
      tags: ['decor', 'surface', 'computer'],
    },
    {
      assetId: 'books-pile',
      kind: 'books',
      packId: 'tinyhouse-pixel-salvaje',
      fileName: 'Books/Books_Pile.png',
      footprint: { w: 1, h: 1 },
      anchor: { x: 0, y: 0 },
      license: 'commercial-paid',
      sourceUrl: 'https://pixelsalvaje.itch.io/tinyhouse',
      tags: ['decor', 'surface', 'books'],
    },
  ],
};

// ---------------------------------------------------------------------------
// TILESETS DE PISO E PAREDE
// ---------------------------------------------------------------------------

/**
 * Papeis de tile na construcao do ambiente. Diferente de `Prop.kind`, que e
 * mobiliario posicionado por celula, um tile e ESTRUTURA: existe em toda
 * celula (piso) ou em arestas de celula (paredes).
 *
 *  - `floor`  - diamante do piso, uma por celula
 *  - `wall_l` - parede na aresta OESTE da celula (face voltada a camera-esquerda)
 *  - `wall_r` - parede na aresta NORTE da celula (face voltada a camera-direita)
 *  - `door`   - vao de porta, substitui a parede na celula da porta
 */
export const TileKind = z.enum(['floor', 'wall_l', 'wall_r', 'door']);
export type TileKind = z.infer<typeof TileKind>;

/**
 * Conjunto coordenado de piso + paredes + porta.
 *
 * Por que um tileset e uma unidade, e nao 4 assets soltos: piso e paredes
 * precisam combinar visualmente. Escolher `Floor_128_WoodLight` com
 * `Wall_L_128_DarkBlue` da um resultado incoerente. Agrupando, o Agente
 * Decorador escolhe UM tileset (decisao de alto nivel, que ele sabe tomar)
 * em vez de 4 arquivos (decisao de detalhe, que ele erra).
 *
 * Todos os arquivos de um tileset compartilham o canvas 128x128 e a mesma
 * ancoragem, entao o renderer os compoe sem calculo por-asset.
 */
export const TileSet = z.object({
  tileSetId: z.string().min(1),
  packId: z.string().min(1),
  /** Caminho relativo ao `basePath` do pack, por papel de tile. */
  files: z.record(TileKind, z.string().min(1)),
});
export type TileSet = z.infer<typeof TileSet>;

const DIR_TILES = 'Floor_Wall_Tiles_128';
const PORTA_VIDRO = 'Doors/Office_Glass_Door_Ani/Office_Glass_Door_1.png';

/** Monta um tileset do TinyHouse a partir dos nomes de variante de piso e parede. */
function tileSetTinyHouse(tileSetId: string, piso: string, parede: string): TileSet {
  return {
    tileSetId,
    packId: 'tinyhouse-pixel-salvaje',
    files: {
      floor: `${DIR_TILES}/Floor_128_${piso}.png`,
      wall_l: `${DIR_TILES}/Wall_L_128_${parede}.png`,
      wall_r: `${DIR_TILES}/Wall_R_128_${parede}.png`,
      door: PORTA_VIDRO,
    },
  };
}

/**
 * Tilesets disponiveis, um por tema visual. Os nomes de variante foram
 * conferidos no pack: cada par piso/parede existe de fato em
 * `Floor_Wall_Tiles_128/` nas tres formas (Floor, Wall_L, Wall_R).
 *
 * O pack traz 40+ variantes; estas 6 cobrem os temas atuais. Adicionar um
 * tema novo e uma linha aqui, nao codigo de renderer - que e exatamente a
 * separacao que o ADR-0012 pede (dados de catalogo vs. logica de desenho).
 */
export const TILESETS: readonly TileSet[] = [
  tileSetTinyHouse('nordic-calm', 'WoodLight', 'BrokenWhite'),
  tileSetTinyHouse('warm-studio', 'WoodBright', 'BeigeYellow'),
  tileSetTinyHouse('cool-lab', 'Concrete', 'White'),
  tileSetTinyHouse('forest-deep', 'Natural', 'Green'),
  tileSetTinyHouse('sunset-loft', 'WoodHard', 'Orange'),
  tileSetTinyHouse('midnight-ops', 'Dark', 'DarkBlue'),
];

/**
 * Resolve o tileset de um tema, caindo para o primeiro se o tema for
 * desconhecido - o Agente Decorador pode inventar nomes de tema, e um nome
 * inventado deve degradar para um ambiente valido, nunca para tela vazia.
 */
export function resolverTileSet(nomeTema: string): TileSet {
  return TILESETS.find((t) => t.tileSetId === nomeTema) ?? (TILESETS[0] as TileSet);
}

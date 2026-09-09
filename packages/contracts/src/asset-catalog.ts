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

export const UsoAsset = z.enum(['obrigatorio', 'aleatorio', 'off']);
export type UsoAsset = z.infer<typeof UsoAsset>;

export const PapelAsset = z.enum(['prop', 'decor', 'wall']);
export type PapelAsset = z.infer<typeof PapelAsset>;

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
  /** Intencao do Construtor (biblia do laboratorio). */
  uso: UsoAsset.default('aleatorio'),
  /** Onde planta: piso, superficie ou face de parede. */
  papel: PapelAsset.default('prop'),
  /**
   * Bloqueia passagem no NavGrid. Ausente = usa o default por `kind`
   * (`BLOQUEIO_PADRAO_POR_KIND` em `navgrid.ts`), preservando o
   * comportamento atual sem exigir migracao do catalogo inteiro. Existe
   * para permitir excecoes asset-a-asset (ex.: uma estante grande que deve
   * bloquear mesmo que `bookshelf` nao bloqueie por padrao).
   */
  colide: z.boolean().optional(),
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
   * (LARGURA_TILE=128): escala = 128 / tileWidth. Sem isto, sprites sao
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
 *  - Pasta Floor_Wall_Tiles_128/ com 40+ cores de piso. Canvas 128x128;
 *    bbox do diamante 128x72 (y=36..107, face 2:1 em y=36..100, laje 8px).
 *    Paredes Wall_L/Wall_R: mesmo canvas, bbox 72x115 (espessura de 8px
 *    alem do passo isometrico de 64px - bleed do asset, nao erro de ancora).
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
 * Klimmos Cozy Isometric Modular Male Character Kit.
 * Personagens (Idle/Walk/Sit), nao mobiliario — sem AssetEntry no catalogo ativo.
 * Runtime: `@microfirma/iso-characters`. Folha 512x320, frame 64x80.
 */
export const KLIMMOS_ISO_MALE_PACK: AssetPack = {
  packId: 'klimmos-iso-male',
  name: 'Cozy Iso Modular Male Character Kit',
  author: 'Klimmos',
  sourceUrl: 'https://klimmos.itch.io',
  license: 'commercial-paid',
  basePath: 'klimmos-iso-male',
  tileWidth: 64,
};

/**
 * Registro de todos os packs conhecidos, processados ou nao. Fonte unica de
 * verdade para `packId` valido - qualquer referencia a um `packId` fora desta
 * lista (em `INITIAL_CATALOG.assets` ou no mapa de temas do Agente Decorador)
 * e um erro de dados, nao apenas visual.
 */
export const KNOWN_PACKS: readonly AssetPack[] = [
  TINYHOUSE_PACK,
  KLIMMOS_ISO_MALE_PACK,
  KENNEY_FURNITURE_PACK,
  KENNEY_NATURE_PACK,
  KENNEY_FOLIAGE_PACK,
  KENNEY_ISOMETRIC_TILES_PACK,
  SBS_FLOOR_TILES_PACK,
  OMIES_OFFICE_SET_PACK,
];

const LICENCA_TH = 'commercial-paid';
const ORIGEM_TH = 'https://pixelsalvaje.itch.io/tinyhouse';
const PACK_TH = 'tinyhouse-pixel-salvaje';

const DECOR_KINDS = new Set(['laptop', 'monitor', 'keyboard', 'mouse', 'books', 'radio']);
const OBRIGATORIOS_VISUAIS = new Set(['office-main-table', 'basic-office-chair']);

/** Entrada TinyHouse 1x1 com proveniencia padrao. */
function th(
  assetId: string,
  kind: AssetEntry['kind'],
  fileName: string,
  tags: string[],
): AssetEntry {
  const papel: AssetEntry['papel'] = DECOR_KINDS.has(kind)
    ? 'decor'
    : tags.includes('wall')
      ? 'wall'
      : 'prop';
  return {
    assetId,
    kind,
    packId: PACK_TH,
    fileName,
    footprint: { w: 1, h: 1 },
    anchor: { x: 0, y: 0 },
    license: LICENCA_TH,
    sourceUrl: ORIGEM_TH,
    tags,
    uso: OBRIGATORIOS_VISUAIS.has(assetId) ? 'obrigatorio' : 'aleatorio',
    papel,
  };
}

/**
 * Kinds que o solver sempre tenta colocar (1 mesa + 1 cadeira por agente).
 * Sem isto o escritorio deixa de ser um plano de controle espacial.
 */
export const PROP_OBRIGATORIOS = ['desk', 'chair'] as const;
// Biblia visual: `uso`/`papel` em cada AssetEntry (espelha catalogo-laboratorio.json).
// Temas do arquiteto: world-engine/src/biblia/temas-arquiteto.json.

/**
 * Kinds opcionais: o solver tenta se houver celula livre fora da circulacao
 * da porta. Nao falha o layout se nao couber.
 */
export const PROP_OPCIONAIS: Readonly<{
  cantos: readonly AssetEntry['kind'][];
  paredesLargas: readonly AssetEntry['kind'][];
  break: readonly AssetEntry['kind'][];
  meeting: readonly AssetEntry['kind'][];
  reception: readonly AssetEntry['kind'][];
  open: readonly AssetEntry['kind'][];
}> = {
  cantos: ['plant'],
  paredesLargas: ['cabinet', 'bookshelf'],
  break: ['sofa', 'water', 'coffee', 'rug'],
  meeting: ['board', 'lamp'],
  reception: ['printer'],
  open: ['printer'],
};

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
 * Cobertura por kind (sprite de repouso; spritesheets de animacao NAO entram):
 *  - desk / chair / bookshelf / sofa / cabinet / plant: ver assets abaixo
 *  - printer: Printer_Ani_1 (frame parado)
 *  - water: Water_Dispenser_1
 *  - coffee: Office_Kitchen_Table; copa TinyHouse (mesa, bancada, pia, fogao, microondas)
 *  - board: Board_Full no chao; AC/relogio/poster/janela no lab como papel wall
 *  - lamp: Lamp_8_B_Tile (projetor como variante)
 *  - rug: Carpet_3_Tile (almofada Pillow_11 como variante)
 *  - laptop / monitor / keyboard / books: Computer/ e Books/
 *  - mouse: WacomTablet (pack nao tem mouse classico de mesa)
 *  - radio: Telephone; calculadora / headset / porta-lapis como variantes
 *    de comunicacao de mesa. Pack nao tem Fax PNG.
 *  - meter: Fire_Extinguisher / Rumba (equipamento; solver nao coloca meter)
 *
 * OBRIGATORIOS no space program: desk + chair (1 por agente).
 * OPCIONAIS: plant, cabinet/bookshelf, sofa, water, coffee, rug, board, lamp,
 * printer. O solver so tenta se a celula estiver livre (nao encosta na
 * circulacao da porta). Ver PROP_OBRIGATORIOS / PROP_OPCIONAIS.
 *
 * Piso e paredes (medido 2026-08-16, scripts/iso-validation/medir-tinyhouse.js):
 *  - Floor_128_WoodLight: canvas 128x128, bbox 128x72, ancora de face (64, 68)
 *  - Wall_L / Wall_R: canvas 128x128, bbox 72x115, mesma ancora
 *  - Office_Glass_Door_1: canvas 128x128, bbox 51x122 - blit como TILE, nao objeto
 *  - Door_1_Beige: spritesheet 640x128 (5 frames) - nao blitar inteiro
 *
 * NOTA: o Construtor escolhe `Prop.assetId` por seed + `uso`. O atlas ainda
 * mapeia 1 asset por `kind` (ultimo vence) so como fallback sem assetId.
 */
export const INITIAL_CATALOG: AssetManifest = {
  version: '2.4.0',
  packs: [TINYHOUSE_PACK],
  assets: [
    // Variantes ANTES do canonico: o atlas ainda pega o ultimo de cada kind.
    th('office-drawing-table', 'desk', 'Office/Drawing_Table.png', ['furniture', 'desk', 'variant']),
    th('office-normal-table', 'desk', 'Desks/Office_Normal_Table_Ani/Office_Normal_Table_Base.png', [
      'furniture', 'desk', 'variant',
    ]),
    th('office-main-table', 'desk', 'Desks/Office_Main_Table_Desk/Office_Main_Table_Base.png', [
      'furniture', 'desk', 'office',
    ]),
    th('kitchen-stool', 'chair', 'Kitchen/Kitchen_Stool.png', ['furniture', 'chair', 'break', 'variant']),
    th('basic-office-chair-b', 'chair', 'Chairs/Basic_Office_Chair_B.png', ['furniture', 'chair', 'variant']),
    th('basic-office-chair', 'chair', 'Chairs/Basic_Office_Chair_A.png', ['furniture', 'chair', 'office']),
    th('office-long-rack', 'bookshelf', 'Office/Long_Rack.png', ['furniture', 'storage', 'variant']),
    th('office-rack', 'bookshelf', 'Office/Rack.png', ['furniture', 'storage', 'office']),
    th('sofa-3', 'sofa', 'Sofa/Sofa_3_A_Tile.png', ['furniture', 'sofa']),
    th('kitchen-cabinet-wood-2', 'cabinet', 'Kitchen/Kitchen Furnitures Colors/Kitchen_Furniture_Wood/Kitchen_Furniture_Wood_2.png', [
      'furniture', 'cabinet', 'break', 'variant',
    ]),
    th('kitchen-drawers-wood', 'cabinet', 'Kitchen/Kitchen Furnitures Colors/Kitchen_Furniture_Wood/Kitchen_Furniture_Wood_3.png', [
      'furniture', 'cabinet', 'break', 'variant',
    ]),
    th('kitchen-drawer-low', 'cabinet', 'Kitchen/Kitchen Furnitures Colors/Kitchen_Furniture_Wood/Kitchen_Furniture_Wood_7.png', [
      'furniture', 'cabinet', 'break', 'variant',
    ]),
    th('kitchen-drawers-a', 'cabinet', 'Kitchen/Kitchen_A_Tile.png', [
      'furniture', 'cabinet', 'break', 'variant',
    ]),
    th('kitchen-fridge', 'cabinet', 'Kitchen/Fridge/Fridge_2_A_Tile.png', [
      'furniture', 'cabinet', 'break', 'variant',
    ]),
    th('kitchen-cabinet-wood', 'cabinet', 'Kitchen/Kitchen Furnitures Colors/Kitchen_Furniture_Wood/Kitchen_Furniture_Wood_4.png', [
      'furniture', 'cabinet', 'break', 'variant',
    ]),
    th('carton-box', 'cabinet', 'Office/Carton_Box.png', ['furniture', 'box', 'variant']),
    th('white-box', 'cabinet', 'Office/White_Box.png', ['furniture', 'box', 'variant']),
    th('kitchen-box', 'cabinet', 'Kitchen/Box_2.png', ['furniture', 'box', 'variant']),
    th('trash-empty', 'cabinet', 'Office/Trash_Empty.png', ['furniture', 'trash', 'variant']),
    th('trash-square', 'cabinet', 'Office/Trash_Square.png', ['furniture', 'trash', 'variant']),
    th('trash-full', 'cabinet', 'Office/Trash_Full.png', ['furniture', 'trash', 'variant']),
    th('office-metal-closet', 'cabinet', 'Office/Office_Metallic_Closet_Ani/Metallic_Closet_Base.png', [
      'furniture', 'cabinet', 'variant',
    ]),
    th('office-wood-closet', 'cabinet', 'Office/Office_Wood_Closet_Ani/Office_Wood_Closet.png', [
      'furniture', 'cabinet', 'office',
    ]),
    th('plant-1', 'plant', 'Plants/Plant_1.png', ['decoration', 'plant', 'variant']),
    th('cactus-1', 'plant', 'Plants/Cactus_1.png', ['decoration', 'plant', 'variant']),
    th('plant-2', 'plant', 'Plants/Plant_2.png', ['decoration', 'plant', 'office']),
    th('copy-machine-dark', 'printer', 'Office/Copy_Machine_Dark_Ani/CopyMachine_0017_Frame-1.png', [
      'equipment', 'printer', 'variant',
    ]),
    th('document-shredder', 'printer', 'Office/Document_Shredder_Ani/Document_Shredder_1.png', [
      'equipment', 'printer', 'variant',
    ]),
    th('copy-machine', 'printer', 'Office/Copy_Machine_White_Ani/Copy_Machine_1.png', [
      'equipment', 'printer', 'variant',
    ]),
    th('office-printer', 'printer', 'Office/Printer_Ani/Printer_Ani_1.png', ['equipment', 'printer', 'office']),
    th('projector-stand', 'lamp', 'Office/Projector_Stand.png', ['equipment', 'lamp', 'meeting', 'variant']),
    th('office-projector', 'lamp', 'Office/Projector_Ani/Projector_Ani_1.png', ['equipment', 'lamp', 'meeting', 'variant']),
    th('fire-extinguisher', 'meter', 'Office/Fire_Extinguisher.png', ['equipment', 'meter', 'safety', 'variant']),
    th('rumba-robot', 'meter', 'Office/Rumba_Robot.png', ['equipment', 'meter', 'variant']),
    th('kitchen-rug', 'rug', 'Kitchen/Kitchen_Rug.png', ['decoration', 'rug', 'break', 'variant']),
    th('floor-pillow', 'rug', 'Sofa/Pillow_11.png', ['decoration', 'rug', 'break', 'variant']),
    th('water-dispenser', 'water', 'Office/Water_Dispenser_Ani/Water_Dispenser_1.png', [
      'equipment', 'water', 'office',
    ]),
    th('kitchen-table', 'coffee', 'Kitchen/Kitchen_Table.png', ['furniture', 'coffee', 'break', 'variant']),
    th('kitchen-counter-wood', 'coffee', 'Kitchen/Kitchen Furnitures Colors/Kitchen_Furniture_Wood/Kitchen_Furniture_Wood_1.png', [
      'furniture', 'coffee', 'break', 'variant',
    ]),
    th('kitchen-sink', 'coffee', 'Kitchen/Sink.png', ['furniture', 'coffee', 'break', 'variant']),
    th('kitchen-oven', 'coffee', 'Kitchen/Oven.png', ['furniture', 'coffee', 'break', 'variant']),
    th('kitchen-stove', 'coffee', 'Kitchen/Stoves.png', ['furniture', 'coffee', 'break', 'variant']),
    th('kitchen-microwave', 'coffee', 'Kitchen/Kitchen Furnitures Colors/Kitchen_Furniture_Wood/Kitchen_Furniture_Wood_6.png', [
      'furniture', 'coffee', 'break', 'variant',
    ]),
    th('kitchen-dishwasher', 'coffee', 'Kitchen/DishWasher/Dishwasher_1.png', [
      'furniture', 'coffee', 'break', 'variant',
    ]),
    th('office-kitchen-table', 'coffee', 'Office/Office_Kitchen_Table.png', ['furniture', 'coffee', 'break']),
    th('kitchen-cabinet-glass', 'board', 'Kitchen/Kitchen Furnitures Colors/Kitchen_Furniture_Wood/Kitchen_Furniture_Wood_5.png', [
      'furniture', 'board', 'wall', 'break', 'variant',
    ]),
    th('kitchen-shelf', 'board', 'Kitchen/Shelf.png', ['furniture', 'board', 'wall', 'break', 'variant']),
    th('kitchen-window', 'board', 'Kitchen/Kitchen_Window.png', ['furniture', 'board', 'wall', 'break', 'variant']),
    th('office-ac', 'board', 'Office/AC.png', ['furniture', 'board', 'wall', 'variant']),
    th('clock-wall', 'board', 'Office/Clock_Ani/Clock_1.png', ['furniture', 'board', 'wall', 'variant']),
    th('picture-frame', 'board', 'Office/Picture_Frame.png', ['furniture', 'board', 'wall', 'variant']),
    th('office-diploma', 'board', 'Office/Diploma.png', ['furniture', 'board', 'wall', 'variant']),
    th('office-photos', 'board', 'Office/Photos_1.png', ['furniture', 'board', 'wall', 'variant']),
    th('poster-1', 'board', 'Poster/Poster_1.png', ['furniture', 'board', 'wall', 'variant']),
    th('corkboard-2', 'board', 'Office/Corkboard_2.png', ['furniture', 'board', 'wall', 'variant']),
    th('corkboard', 'board', 'Office/Corkboard_1.png', ['furniture', 'board', 'variant']),
    th('projector-screen', 'board', 'Office/Projector_Screen_Ani/Projector_Screen_Ani_1.png', [
      'furniture', 'board', 'wall', 'meeting', 'variant',
    ]),
    th('office-window', 'board', 'Windows/Window_7_A_Tile.png', ['furniture', 'board', 'wall', 'window', 'variant']),
    th('office-partition', 'board', 'Office/Office_Partition.png', ['furniture', 'board', 'variant']),
    th('board-full', 'board', 'Office/Board_Full.png', ['furniture', 'board', 'meeting']),
    th('lamp-floor', 'lamp', 'Lamp/Lamp_8_B_Tile.png', ['furniture', 'lamp']),
    th('carpet-tile', 'rug', 'Carpets/Carpet_3_Tile.png', ['decoration', 'rug']),
    // Decor de superficie
    th('macbook-closed', 'laptop', 'Computer/MacBook_Ani/Macbook_1_Closed_Tile.png', ['decor', 'surface', 'variant']),
    th('macbook-open', 'laptop', 'Computer/MacBook_Ani/Macbook_1_Open_Tile.png', ['decor', 'surface', 'computer']),
    th('imac-new', 'monitor', 'Computer/NewImac_B_Tile.png', ['decor', 'surface', 'computer']),
    th('old-keyboard', 'keyboard', 'Computer/OldKeyboard_Tile.png', ['decor', 'surface', 'computer', 'variant']),
    th('new-keyboard', 'keyboard', 'Computer/NewKeyboard_Tile.png', ['decor', 'surface', 'computer']),
    th('wacom-tablet', 'mouse', 'Computer/WacomTablet.png', ['decor', 'surface', 'computer']),
    th('books-pile', 'books', 'Books/Books_Pile.png', ['decor', 'surface', 'books']),
    th('ring-binder', 'books', 'Books/Ring_Binder_Blue.png', ['decor', 'surface', 'variant']),
    th('rolled-papers', 'books', 'Office/Rolled_Papers.png', ['decor', 'surface', 'variant']),
    th('office-calculator', 'radio', 'Office/Calculator.png', ['decor', 'surface', 'variant']),
    th('office-headset', 'radio', 'Office/Headset.png', ['decor', 'surface', 'variant']),
    th('pencil-holder', 'radio', 'Office/Pencil_Holder.png', ['decor', 'surface', 'variant']),
    th('office-phone', 'radio', 'Office/Telephone.png', ['decor', 'surface', 'phone']),
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
export function montarTileSet(tileSetId: string, piso: string, parede: string): TileSet {
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

function tileSetTinyHouse(tileSetId: string, piso: string, parede: string): TileSet {
  return montarTileSet(tileSetId, piso, parede);
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

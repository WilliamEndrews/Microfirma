/**
 * ATLAS DE ASSETS PRE-RENDERIZADOS - ADR-0012
 *
 * Carrega do pack TinyHouse:
 *  - mobilia e decor (`INITIAL_CATALOG.assets`), indexados por kind semantico;
 *  - tiles de piso/parede/porta (`TILESETS`), indexados por papel de tile;
 *  - `Glass_Wall` como extra (`glassWall()`), nao como 5o papel de tileset.
 *
 * ---------------------------------------------------------------------------
 * ESCALA: UM FATOR GLOBAL, NUNCA POR-ASSET
 * ---------------------------------------------------------------------------
 * O TinyHouse publica canvases de 8/16/32/64/128px. Esses tiers sao BOUNDING
 * BOXES, nao escalas - o artista desenhou tudo no mesmo pixel-scale. Logo
 * existe um unico `ESCALA_ASSET` (ver projecao.ts) aplicado a todos.
 *
 * Uma versao anterior deste arquivo usava `escala = LARGURA_TILE / canvasSize`,
 * o que normalizava tudo para o mesmo tamanho na tela e fazia um notebook de
 * canvas 32 ficar do tamanho de uma mesa de canvas 128. Nao repetir.
 *
 * ---------------------------------------------------------------------------
 * ANCORAGEM: DOIS MODOS
 * ---------------------------------------------------------------------------
 *  - `tile`   - blita o canvas 128x128 inteiro com a ancora do papel
 *               (`ancoraDoPapel` em projecao.ts) no centro da celula. Piso
 *               ancora na face (64, 68); paredes/porta usam pe-no-vertice
 *               gravado em calibracao-tinyhouse.json (laboratorio iso).
 *  - `objeto` - usa a caixa alfa do sprite e alinha seu centro-inferior ao
 *               centro da celula. Funciona para qualquer tamanho de canvas,
 *               que e o que mobilia e decor precisam.
 *
 * O canvas NAO e recortado (trim): recortar destruiria a informacao de
 * posicao que o modo `tile` depende. A caixa alfa e guardada como metadado.
 */

import { INITIAL_CATALOG, resolverTileSet, type TileKind, type TileSet } from '@microfirma/contracts';
import type { DecorKind, PropKind } from './sprite-factory';
import { ESCALA_ASSET } from './projecao';

export type AtlasKind = PropKind | DecorKind;

/** Caixa do conteudo visivel dentro do canvas, em pixels do canvas. */
export interface CaixaAlfa {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LoadedAsset {
  /** Canvas COMPLETO, sem recorte. */
  image: HTMLCanvasElement;
  assetId: string;
  fileName: string;
  /** Caixa do conteudo visivel; usada para ancorar objetos pelo pe. */
  caixa: CaixaAlfa;
  /** Fator de escala global. Identico para todos os assets. */
  scale: number;
}

export interface AssetAtlas {
  /** Resolve quando todas as imagens carregaram (ou falharam). */
  ready: Promise<void>;
  /** Asset de mobilia/decor por kind semantico (last-wins, fallback). */
  get(kind: AtlasKind): LoadedAsset | undefined;
  /** Variante visual escolhida pelo Construtor. */
  getById(assetId: string): LoadedAsset | undefined;
  /** Tile de estrutura por papel e tileset. */
  tile(kind: TileKind, tileSetId?: string): LoadedAsset | undefined;
  /** Divisoria de vidro (face do corredor). Nao e papel de tileset. */
  glassWall(): LoadedAsset | undefined;
}

function urlDoPack(packId: string, fileName: string, baseUrl: string): string {
  const pack = INITIAL_CATALOG.packs.find((p) => p.packId === packId);
  const base = pack ? `${baseUrl}${pack.basePath}/` : `${baseUrl}/`;
  // Os nomes de arquivo do pack tem espacos e parenteses em algumas pastas;
  // encodar por segmento preserva as barras e evita 404 silencioso.
  return base + fileName.split('/').map(encodeURIComponent).join('/');
}

/** Mede a caixa do conteudo opaco e devolve o canvas intacto + a caixa. */
function medirEConverter(img: HTMLImageElement): { canvas: HTMLCanvasElement; caixa: CaixaAlfa } {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const caixaCheia: CaixaAlfa = { x: 0, y: 0, w, h };
  if (!ctx) return { canvas, caixa: caixaCheia };
  ctx.drawImage(img, 0, 0);

  let dados: Uint8ClampedArray;
  try {
    dados = ctx.getImageData(0, 0, w, h).data;
  } catch {
    // Canvas contaminado (cross-origin): sem medicao, usa a caixa cheia.
    return { canvas, caixa: caixaCheia };
  }

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (dados[(y * w + x) * 4 + 3]! > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return { canvas, caixa: caixaCheia }; // imagem vazia
  return {
    canvas,
    caixa: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
  };
}

/**
 * @param baseUrl prefixo servido pelo Vite (`publicDir` = assets-source/)
 * @param temaOuSets nome de tema (1 tileset) ou lista emitida pelo Construtor
 */
export function carregarAtlas(baseUrl = '', temaOuSets: string | TileSet[] = ''): AssetAtlas {
  const porKind = new Map<AtlasKind, LoadedAsset>();
  const porId = new Map<string, LoadedAsset>();
  const porTile = new Map<string, LoadedAsset>();
  const cargas: Promise<void>[] = [];
  const tileSets: TileSet[] = Array.isArray(temaOuSets)
    ? temaOuSets
    : [resolverTileSet(temaOuSets)];
  if (tileSets.length === 0) tileSets.push(resolverTileSet(''));
  const tileSetPadrao = tileSets[0]!.tileSetId;

  /** Dispara uma carga e registra o resultado no mapa indicado. */
  function carregar<K>(
    destino: Map<K, LoadedAsset>,
    chave: K,
    assetId: string,
    packId: string,
    fileName: string,
    extra?: (loaded: LoadedAsset) => void,
  ): void {
    const img = new Image();
    img.decoding = 'async';
    img.src = urlDoPack(packId, fileName, baseUrl);
    cargas.push(
      new Promise<void>((resolve) => {
        img.onload = () => {
          const { canvas, caixa } = medirEConverter(img);
          const loaded: LoadedAsset = { image: canvas, assetId, fileName, caixa, scale: ESCALA_ASSET };
          destino.set(chave, loaded);
          extra?.(loaded);
          resolve();
        };
        img.onerror = () => {
          // Falha e silenciosa por design: o renderer tem fallback e a tela
          // nao deve ficar vazia por causa de um arquivo faltando.
          console.warn(`[atlas] falhou ao carregar ${fileName}`);
          resolve();
        };
      }),
    );
  }

  for (const asset of INITIAL_CATALOG.assets) {
    carregar(
      porId,
      asset.assetId,
      asset.assetId,
      asset.packId,
      asset.fileName,
      (loaded) => porKind.set(asset.kind as AtlasKind, loaded),
    );
  }

  for (const tileSet of tileSets) {
    for (const [papel, arquivo] of Object.entries(tileSet.files)) {
      carregar(
        porTile,
        `${tileSet.tileSetId}:${papel}`,
        `${tileSet.tileSetId}-${papel}`,
        tileSet.packId,
        arquivo,
      );
    }
  }

  const porExtra = new Map<string, LoadedAsset>();
  carregar(
    porExtra,
    'wall-glass',
    'office-glass-wall',
    'tinyhouse-pixel-salvaje',
    'Office/Glass_Wall.png',
  );

  return {
    ready: Promise.all(cargas).then(() => undefined),
    get: (kind) => porKind.get(kind),
    getById: (assetId) => porId.get(assetId),
    tile: (kind, tileSetId) => porTile.get(`${tileSetId ?? tileSetPadrao}:${kind}`),
    glassWall: () => porExtra.get('wall-glass'),
  };
}

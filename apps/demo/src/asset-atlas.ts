/**
 * ATLAS DE ASSETS PRE-RENDERIZADOS - step 1 do ADR-0012
 *
 * Carrega os PNGs listados em INITIAL_CATALOG (packages/contracts) e os
 * mapeia por PropKind. Mantem o fallback procedural automatico: se a imagem
 * falhar ou nao existir, o renderer continua usando o sprite gerado em
 * canvas por sprite-factory.ts.
 *
 * LIMITACAO CONHECIDA: `byKind` guarda no maximo 1 asset por `PropKind` - se
 * o catalogo tiver varios `AssetEntry` para o mesmo `kind` (ex.: varias
 * plantas do kenney-nature-kit), o ultimo do array de `INITIAL_CATALOG.assets`
 * vence e os demais ficam so como dados, sem uso visual ainda. Selecao
 * deterministica por prop/seed entre variantes do mesmo `kind` e trabalho
 * futuro (ver pendencias do ADR-0012) - nao construir aqui sem necessidade.
 */

import { INITIAL_CATALOG } from '@microfirma/contracts';
import type { PropKind } from './sprite-factory';

export interface LoadedAsset {
  image: HTMLImageElement;
  assetId: string;
  fileName: string;
  anchor: { x: number; y: number };
}

export interface AssetAtlas {
  /** Promise resolvida quando todas as imagens tiverem sido carregadas (ou falhado). */
  ready: Promise<void>;
  /** Retorna o asset carregado para um kind, ou undefined se nao houver/falhou. */
  get(kind: PropKind): LoadedAsset | undefined;
  /** Url final de um asset, util para depuracao. */
  url(kind: PropKind): string | undefined;
}

function buildAssetUrl(packId: string, fileName: string, baseUrl: string): string {
  const pack = INITIAL_CATALOG.packs.find((p) => p.packId === packId);
  if (!pack) return `${baseUrl}/${fileName}`;
  return `${baseUrl}${pack.basePath}/${fileName}`;
}

export function carregarAtlas(baseUrl = ''): AssetAtlas {
  const byKind = new Map<PropKind, LoadedAsset>();
  const loads: Promise<void>[] = [];

  for (const asset of INITIAL_CATALOG.assets) {
    const kind = asset.kind as PropKind;
    const url = buildAssetUrl(asset.packId, asset.fileName, baseUrl);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;

    byKind.set(kind, {
      image: img,
      assetId: asset.assetId,
      fileName: asset.fileName,
      anchor: { x: asset.anchor.x, y: asset.anchor.y },
    });

    loads.push(
      new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => {
          byKind.delete(kind);
          resolve();
        };
      }),
    );
  }

  return {
    ready: Promise.all(loads).then(() => undefined),
    get: (kind: PropKind) => byKind.get(kind),
    url: (kind: PropKind) => {
      const a = byKind.get(kind);
      if (!a) return undefined;
      return a.image.src;
    },
  };
}

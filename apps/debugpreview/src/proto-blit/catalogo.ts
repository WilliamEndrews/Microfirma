import catalogoJson from '../../../../scripts/iso-validation/catalogo-laboratorio.json';
import calibracaoJson from '../../../demo/src/calibracao-tinyhouse.json';
import { CALIBRACAO_PADRAO, type TemaArquiteto } from '@microfirma/world-engine';
import type { CalibracaoSala } from '@microfirma/contracts';

export type SpecAsset = {
  assetId: string;
  kind: string;
  nome: string;
  fileName?: string;
  papel?: string;
  uso?: string;
  camadas?: { assetId: string; dx?: number; dy?: number }[];
};

export type TilesetLab = {
  tileSetId: string;
  piso: string;
  parede: string;
};

type CatalogoLab = {
  tilesets: TilesetLab[];
  assets: SpecAsset[];
};

export const CATALOGO = catalogoJson as CatalogoLab;

export const CALIBRACAO_LAB = {
  ...CALIBRACAO_PADRAO,
  ...(calibracaoJson as Partial<CalibracaoSala>),
} as CalibracaoSala & {
  rodada?: number;
  plano?: string;
  objetos?: Record<string, { modo?: string; ancora?: { x: number; y: number }; pe?: { x: number; y: number } }>;
};

const porId = new Map(CATALOGO.assets.map((a) => [a.assetId, a]));

export function specPorId(assetId: string): SpecAsset | undefined {
  return porId.get(assetId);
}

export function calibracaoDoTema(tema: TemaArquiteto): typeof CALIBRACAO_LAB {
  if (tema.calibracao && typeof tema.calibracao === 'object') {
    return { ...CALIBRACAO_LAB, ...tema.calibracao };
  }
  return CALIBRACAO_LAB;
}

/** Cores de piso/parede exatamente como o lab ao carregar um tema. */
export function coresDoTema(tema: TemaArquiteto): { piso: string; parede: string; tileSetId: string } {
  const ts =
    CATALOGO.tilesets.find((t) => t.tileSetId === tema.tilesetAtivo) || CATALOGO.tilesets[0]!;
  const piso =
    (tema.pisoLivre != null && tema.pisoLivre !== ''
      ? tema.pisoLivre
      : null) ??
    tema.piso ??
    ts.piso;
  const parede =
    (tema.paredeLivre != null && tema.paredeLivre !== ''
      ? tema.paredeLivre
      : null) ??
    tema.parede ??
    ts.parede;
  return { piso, parede, tileSetId: ts.tileSetId };
}

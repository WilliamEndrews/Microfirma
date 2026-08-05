/**
 * SISTEMA DE TEMAS (ADR-0008 / Agente Decorador)
 *
 * Cada tema define uma paleta de cores que o renderer usa para piso, paredes,
 * mobiliario e vegetacao. O tema e escolhido durante `planSpaceProgram` e
 * travelado dentro do `OfficeLayout` - o renderer le de la, nao de constantes
 * hardcoded.
 *
 * Em producao, o Agente Decorador (LLM) escolhe o tema. Aqui ficam as
 * implementacoes deterministicas de referencia.
 */

export interface Tema {
  name: string;
  palette: string[];
  greenery: number;
}

export const TEMAS: readonly Tema[] = [
  { name: 'nordic-calm', palette: ['#F4F1EC', '#D9CFC1', '#8FA6A1', '#3B4A4A'], greenery: 0.45 },
  { name: 'warm-studio', palette: ['#F7EFE5', '#E4C7A8', '#C08457', '#4A3728'], greenery: 0.6 },
  { name: 'cool-lab', palette: ['#EEF2F6', '#C9D6E3', '#7A93AC', '#2E3B4E'], greenery: 0.25 },
  { name: 'forest-deep', palette: ['#E8EDE6', '#A8C0A0', '#5C7A5A', '#2A3B2A'], greenery: 0.75 },
  { name: 'sunset-loft', palette: ['#FAF0E6', '#E8B894', '#C97864', '#3D2B2B'], greenery: 0.35 },
  { name: 'midnight-ops', palette: ['#DDE3EA', '#9BA8BC', '#4A5C7A', '#1A2332'], greenery: 0.2 },
] as const;

/**
 * Paleta resolvida: converte as cores hex do tema em valores numericos 0xRRGGBB
 * que o renderer usa, derivando todas as cores necessarias a partir das 4 cores
 * base do tema.
 */
export type MaterialPiso = 'carpete' | 'madeira' | 'azulejo' | 'cimento';

export interface PaletaResolvida {
  fundo: number;
  corredor: number;
  piso: Record<string, number>;
  /** Material de piso por tipo de sala. */
  materialPiso: Record<string, MaterialPiso>;
  parede: number;
  paredeTopo: number;
  rodape: number;
  janela: number;
  janelaFrente: number;
  mesaTopo: number;
  mesaLado: number;
  mesaPerna: number;
  monitorCorpo: number;
  monitorTela: number;
  teclado: number;
  cadeira: number;
  cadeiraEncosto: number;
  planta: number;
  plantaTronco: number;
  vaso: number;
  sofa: number;
  sofaEncosto: number;
  sofaAlmofada: number;
  tapete: number;
  quadro: number;
  quadroBorda: number;
  penumbra: number;
  ator: number[];
  atorPele: number;
  atorCabelo: number;
  internoZelador: number;
  internoTecnico: number;
  perigo: number;
}

function hexParaNum(hex: string): number {
  const h = hex.replace('#', '');
  return parseInt(h, 16);
}

function escurecer(matiz: number, fator: number): number {
  const r = Math.floor(((matiz >> 16) & 0xff) * fator);
  const g = Math.floor(((matiz >> 8) & 0xff) * fator);
  const b = Math.floor((matiz & 0xff) * fator);
  return (r << 16) | (g << 8) | b;
}

function clarear(matiz: number, fator: number): number {
  const r = Math.min(255, Math.floor(((matiz >> 16) & 0xff) + (255 - ((matiz >> 16) & 0xff)) * fator));
  const g = Math.min(255, Math.floor(((matiz >> 8) & 0xff) + (255 - ((matiz >> 8) & 0xff)) * fator));
  const b = Math.min(255, Math.floor((matiz & 0xff) + (255 - (matiz & 0xff)) * fator));
  return (r << 16) | (g << 8) | b;
}

/**
 * Resolve um tema (nome + palette hex) para a paleta numerica usada pelo renderer.
 * Se o tema nao for encontrado, usa nordic-calm como fallback.
 */
export function resolverPaleta(tema: { name: string; palette: string[]; greenery: number }): PaletaResolvida {
  const p = tema.palette.length >= 4
    ? tema.palette
    : TEMAS[0]!.palette;

  const c0 = hexParaNum(p[0]!); // base clara
  const c1 = hexParaNum(p[1]!); // media
  const c2 = hexParaNum(p[2]!); // escura
  const c3 = hexParaNum(p[3]!); // muito escura

  return {
    fundo: c0,
    corredor: escurecer(c0, 0.94),
    piso: {
      open: clarear(c0, 0.02),
      private: escurecer(c0, 0.96),
      break: escurecer(clarear(c0, 0.01), 0.97),
      meeting: escurecer(c0, 0.95),
      war_room: escurecer(c0, 0.93),
      reception: clarear(c0, 0.03),
    },
    materialPiso: {
      open: 'carpete',
      private: 'madeira',
      break: 'carpete',
      meeting: 'azulejo',
      war_room: 'cimento',
      reception: 'madeira',
    },
    parede: c1,
    paredeTopo: clarear(c1, 0.1),
    rodape: escurecer(c1, 0.88),
    janela: clarear(c1, 0.25),
    janelaFrente: clarear(c0, 0.3),
    mesaTopo: c1,
    mesaLado: escurecer(c1, 0.82),
    mesaPerna: escurecer(c1, 0.7),
    monitorCorpo: escurecer(c3, 0.9),
    monitorTela: 0x2a3a5a,
    teclado: escurecer(c0, 0.6),
    cadeira: escurecer(c2, 0.85),
    cadeiraEncosto: escurecer(c2, 0.75),
    planta: clarear(c2, 0.15),
    plantaTronco: escurecer(c2, 0.5),
    vaso: escurecer(c2, 0.7),
    sofa: c2,
    sofaEncosto: escurecer(c2, 0.88),
    sofaAlmofada: clarear(c2, 0.08),
    tapete: clarear(c0, 0.12),
    quadro: c3,
    quadroBorda: escurecer(c3, 0.7),
    penumbra: 0x101828,
    ator: [0x4f6df5, 0x2fa8a0, 0xe0873f, 0x9a5fd0, 0xd0566f, 0x3f8f52, 0x5a6b8c],
    atorPele: 0xf6e0c8,
    atorCabelo: 0x4a3728,
    internoZelador: 0x2f7f6f,
    internoTecnico: 0xb4762a,
    perigo: 0xd94f4f,
  };
}

/**
 * Encontra um tema pelo nome. Retorna nordic-calm se nao encontrado.
 */
export function buscarTema(name: string): Tema {
  return TEMAS.find((t) => t.name === name) ?? TEMAS[0]!;
}

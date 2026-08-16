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
 *
 * MAPA DE TEMAS -> PACKS (ADR-0012, decisao 6, step 2 do plano mestre):
 * cada tema aponta para um conjunto de `packId`s de mobilia ESTRUTURAL
 * (`packages/contracts/src/asset-catalog.ts` e a fonte unica de verdade de
 * quais `packId`s existem - ver `KNOWN_PACKS`). Piso e vegetacao sao BASE
 * COMPARTILHADA, fixos entre todos os temas (evita costura visual entre
 * salas do mesmo escritorio - motivo documentado na ADR).
 *
 * Estado honesto em 2026-08-10: o catalogo processado ainda tem UM UNICO
 * pack de mobilia estrutural completo (`kenney-furniture-kit`), entao todo
 * tema aponta para ele hoje. A reducao de 6 para 2-3 temas com
 * DIFERENCIACAO DE FORMA (nao so de cor) so faz sentido depois que
 * `mreliptik-office-low-poly` ou outro pack estrutural adicional entrar no
 * catalogo (ver `assets-source/README.md`, secao "Pendentes"). Este mapa
 * existe desde ja para o codigo (solver, renderer, Decorador) parar de
 * assumir "so ha um pack" implicitamente - a decisao de QUAL pack fica
 * inteiramente neste arquivo, nao espalhada.
 */

/** Conjunto de packs que um tema usa para mobilia estrutural. */
export interface TemaPacks {
  /** `packId`s de mobilia estrutural, em ordem de preferencia do solver. */
  structural: string[];
}

/**
 * Base compartilhada: piso e vegetacao NAO variam por tema. Sao os unicos
 * elementos presentes em toda sala e ao lado de toda mesa; variar entre
 * temas produziria costura visual nas transicoes entre salas do mesmo
 * escritorio (ADR-0012, decisao 6).
 */
export const PACOTES_BASE_COMPARTILHADA = {
  floor: 'tinyhouse-pixel-salvaje',
  vegetation: 'tinyhouse-pixel-salvaje',
} as const;

/** Pack estrutural padrao - unico disponivel e completo hoje (ver comentario acima). */
const PACOTES_ESTRUTURAIS_PADRAO: TemaPacks = { structural: ['tinyhouse-pixel-salvaje'] };

export interface Tema {
  name: string;
  palette: string[];
  greenery: number;
  /**
   * Opcional: temas customizados vindos do LlmDecorator (nome/paleta livres,
   * fora de `TEMAS`) nao precisam declarar packs - `resolverPacksDoTema` cai
   * para `PACOTES_ESTRUTURAIS_PADRAO` nesse caso.
   */
  packs?: TemaPacks;
}

export const TEMAS: readonly Tema[] = [
  { name: 'nordic-calm', palette: ['#F4F1EC', '#D9CFC1', '#8FA6A1', '#3B4A4A'], greenery: 0.45, packs: PACOTES_ESTRUTURAIS_PADRAO },
  { name: 'warm-studio', palette: ['#F7EFE5', '#E4C7A8', '#C08457', '#4A3728'], greenery: 0.6, packs: PACOTES_ESTRUTURAIS_PADRAO },
  { name: 'cool-lab', palette: ['#EEF2F6', '#C9D6E3', '#7A93AC', '#2E3B4E'], greenery: 0.25, packs: PACOTES_ESTRUTURAIS_PADRAO },
  { name: 'forest-deep', palette: ['#E8EDE6', '#A8C0A0', '#5C7A5A', '#2A3B2A'], greenery: 0.75, packs: PACOTES_ESTRUTURAIS_PADRAO },
  { name: 'sunset-loft', palette: ['#FAF0E6', '#E8B894', '#C97864', '#3D2B2B'], greenery: 0.35, packs: PACOTES_ESTRUTURAIS_PADRAO },
  { name: 'midnight-ops', palette: ['#DDE3EA', '#9BA8BC', '#4A5C7A', '#1A2332'], greenery: 0.2, packs: PACOTES_ESTRUTURAIS_PADRAO },
] as const;

/**
 * Resolve os packs de um tema. Temas customizados (LLM, sem `packs`
 * declarado) caem para o padrao - nunca retorna lista vazia, porque o
 * renderer sempre precisa de PELO MENOS um pack estrutural para desenhar.
 */
export function resolverPacksDoTema(tema: Pick<Tema, 'packs'>): TemaPacks {
  return tema.packs ?? PACOTES_ESTRUTURAIS_PADRAO;
}

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
  paredeExterna: number;
  paredeInterna: number;
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
    paredeExterna: escurecer(c2, 0.9),
    paredeInterna: clarear(c1, 0.05),
    paredeTopo: clarear(c1, 0.15),
    rodape: c2,
    janela: clarear(c0, 0.35),
    janelaFrente: clarear(c0, 0.45),
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

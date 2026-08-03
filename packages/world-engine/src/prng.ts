/**
 * GERADOR PSEUDOALEATORIO DETERMINISTICO
 *
 * Por que nao usar Math.random()? Porque o determinismo e um requisito de
 * ARQUITETURA, nao um detalhe (ADR-0004 e ADR-0005):
 *
 *  1. Replay: rever o dia de ontem tem que produzir o mesmo escritorio.
 *  2. Testes: invariantes de layout so sao testaveis se o mundo e reproduzivel.
 *  3. Suporte: "manda a seed" reproduz o bug do cliente na maquina do dev.
 *
 * Algoritmo: mulberry32. 32 bits de estado, rapido, distribuicao boa o
 * suficiente para geracao de ambiente (nao e criptografico - e nem precisa ser).
 */

export interface Rng {
  /** Proximo float em [0, 1). */
  next(): number;
  /** Inteiro em [min, max] inclusivo. */
  int(min: number, max: number): number;
  /** Float em [min, max). */
  range(min: number, max: number): number;
  /** true com probabilidade p. */
  chance(p: number): boolean;
  /** Escolhe um item do array (array vazio lanca erro - falha alto e cedo). */
  pick<T>(items: readonly T[]): T;
  /** Copia embaralhada (Fisher-Yates), sem mutar a entrada. */
  shuffle<T>(items: readonly T[]): T[];
  /** Deriva um novo Rng independente a partir deste, com rotulo estavel. */
  fork(label: string): Rng;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    range: (min, max) => next() * (max - min) + min,
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('Rng.pick: array vazio');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    shuffle: (items) => {
      const copia = [...items];
      for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = copia[i] as (typeof copia)[number];
        copia[i] = copia[j] as (typeof copia)[number];
        copia[j] = tmp;
      }
      return copia;
    },
    // fork usa o estado atual + hash do rotulo: sub-fluxos independentes e
    // estaveis. Assim mudar a decoracao nao desloca o sorteio do layout.
    fork: (label) => createRng((state ^ hashString(label)) >>> 0),
  };

  return rng;
}

/**
 * Hash estavel de string para inteiro 32 bits (FNV-1a).
 * Usado tambem para derivar o `avatarSeed` de um agentId: o mesmo agente
 * recebe o mesmo personagem em qualquer maquina, para sempre.
 */
export function hashString(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

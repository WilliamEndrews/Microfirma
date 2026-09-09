/**
 * Looks modulares por agente. Indices 1-based como nos filenames do pack.
 */

export type LookKlimmos = {
  body: number; // 1..4
  hair: number; // 1..10
  top: number; // 1..15
  bottom: number; // 1..10
  shoes: number; // 1..10
};

export const BODY_MAX = 4;
export const HAIR_MAX = 10;
export const TOP_MAX = 15;
export const BOTTOM_MAX = 10;
export const SHOES_MAX = 10;

/** Tops que ficam acima do cabelo (README do pack). */
export const TOPS_ACIMA_CABELO = new Set([13, 14, 15]);

const PRESETS_FIXOS: Record<string, LookKlimmos> = {
  'agent-boss': { body: 2, hair: 4, top: 8, bottom: 3, shoes: 2 },
  'agent-priv-0': { body: 1, hair: 2, top: 3, bottom: 1, shoes: 1 },
  'agent-priv-1': { body: 3, hair: 6, top: 5, bottom: 4, shoes: 3 },
  'agent-priv-2': { body: 4, hair: 8, top: 11, bottom: 6, shoes: 5 },
};

function hashAgentId(agentId: string): number {
  let h = 2166136261;
  for (let i = 0; i < agentId.length; i++) {
    h ^= agentId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function wrap(n: number, max: number): number {
  return ((n % max) + max) % max || max;
}

/** Look fixo conhecido ou derivado deterministicamente do agentId. */
export function lookDoAgente(agentId: string): LookKlimmos {
  const fixo = PRESETS_FIXOS[agentId];
  if (fixo) return fixo;
  const h = hashAgentId(agentId);
  return {
    body: wrap(h, BODY_MAX),
    hair: wrap(h >>> 3, HAIR_MAX),
    top: wrap(h >>> 6, TOP_MAX),
    bottom: wrap(h >>> 10, BOTTOM_MAX),
    shoes: wrap(h >>> 14, SHOES_MAX),
  };
}

export function agentesPresetConhecidos(): readonly string[] {
  return Object.keys(PRESETS_FIXOS);
}

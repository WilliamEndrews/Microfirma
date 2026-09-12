/**
 * Persistencia local (v1) de looks e apelidos dos agentes Klimmos.
 * Nao faz parte do wire/telemetria — override consciente de UX no Demo.
 */

import {
  lookDoAgente,
  validarLook,
  type LookKlimmos,
} from '@microfirma/iso-characters';

const CHAVE = 'microfirma.demo.wardrobe.v1';

export type WardrobePersistido = {
  looks: Record<string, LookKlimmos>;
  nomes: Record<string, string>;
};

export function carregarWardrobe(): WardrobePersistido {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (!raw) return { looks: {}, nomes: {} };
    const parsed = JSON.parse(raw) as Partial<WardrobePersistido>;
    const looks: Record<string, LookKlimmos> = {};
    for (const [id, look] of Object.entries(parsed.looks ?? {})) {
      if (look && validarLook(look as LookKlimmos)) looks[id] = look as LookKlimmos;
    }
    const nomes: Record<string, string> = {};
    for (const [id, nome] of Object.entries(parsed.nomes ?? {})) {
      if (typeof nome === 'string' && nome.trim()) nomes[id] = nome.trim().slice(0, 24);
    }
    return { looks, nomes };
  } catch {
    return { looks: {}, nomes: {} };
  }
}

export function salvarWardrobe(data: WardrobePersistido): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(data));
  } catch {
    /* quota / private mode — ignora */
  }
}

export function lookInicial(agentId: string, looks: Record<string, LookKlimmos>): LookKlimmos {
  return looks[agentId] ?? lookDoAgente(agentId);
}

/**
 * Uma sala iso a partir dos protos `landing-0`…`landing-3` da biblia.
 * Nao passa por selecionarPedido / montarMundoIso / space-program.
 */

import { Room, type Room as RoomTipo } from '@microfirma/contracts';
import {
  BIBLIA_TEMAS,
  gradeDoProto,
  type TemaArquiteto,
} from '@microfirma/world-engine';
import type { AgenciaMontada } from './montar-agencia';

/** Ordem de morfismo: longe (0) → perto (3). */
export const IDS_QUADROS_LANDING = [
  'landing-0',
  'landing-1',
  'landing-2',
  'landing-3',
] as const;

export type IdQuadroLanding = (typeof IDS_QUADROS_LANDING)[number];

export type SalaLanding = {
  agencia: AgenciaMontada;
  room: RoomTipo;
  tema: TemaArquiteto;
};

export function listarQuadrosLanding(
  temas: readonly TemaArquiteto[] = BIBLIA_TEMAS.temas,
): TemaArquiteto[] {
  const porId = new Map(temas.map((t) => [t.id, t]));
  const lista: TemaArquiteto[] = [];
  for (const id of IDS_QUADROS_LANDING) {
    const tema = porId.get(id);
    if (!tema || tema.zonaKind !== 'landing') {
      throw new Error(`listarQuadrosLanding: proto ${id} ausente na biblia`);
    }
    lista.push(tema);
  }
  return lista;
}

function salaDeTema(tema: TemaArquiteto): SalaLanding {
  const { w, h } = gradeDoProto(tema);
  const x0 = 1;
  const y0 = 1;
  const x1 = x0 + w;
  const y1 = y0 + h;
  const zoneId = `landing-${tema.id}`;
  const room = Room.parse({
    roomId: 'room-landing',
    zoneId,
    name: tema.nome,
    kind: 'landing',
    rect: { x0, y0, x1, y1 },
    door: { x: x0 + Math.floor(w / 2), y: y1 - 1 },
    tileSetId: tema.tilesetAtivo,
    piso: tema.pisoLivre ?? undefined,
    parede: tema.paredeLivre ?? undefined,
    temaId: tema.id,
    calibracao: tema.calibracao ?? undefined,
  });
  const agencia: AgenciaMontada = {
    seed: 0,
    grid: { width: w + 2, height: h + 2 },
    corredorY: h + 2,
    pisoCorredor: 'Concrete',
    corridors: [],
    slots: [
      {
        proto: { key: zoneId, zonaKind: 'landing', tema },
        rect: { x0, y0, x1, y1 },
      },
    ],
  };
  return { agencia, room, tema };
}

export function montarSalaLanding(
  temaId: IdQuadroLanding | string = 'landing-0',
  temas: readonly TemaArquiteto[] = BIBLIA_TEMAS.temas,
): SalaLanding {
  const tema = temas.find((t) => t.id === temaId && t.zonaKind === 'landing');
  if (!tema) {
    throw new Error(`montarSalaLanding: proto ${temaId} ausente na biblia`);
  }
  return salaDeTema(tema);
}

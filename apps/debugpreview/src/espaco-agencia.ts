/**
 * Adaptador AgenciaMontada → OfficeLayout + NavGrid + metadados espaciais.
 *
 * Aqui o preview **pode** usar `colarProto` (diferente de `montarAgencia`,
 * que so empacota retangulos). O resultado alimenta pathfinding e a
 * simulacao de atores; o painter visual continua lendo o palco do tema.
 */

import type { Cell, OfficeLayout, Prop, Room } from '@microfirma/contracts';
import {
  buildNavGrid,
  colarProto,
  gradeDoProto,
  seatCellFor,
  type NavGrid,
  type PostoTrabalho,
  type TemaArquiteto,
} from '@microfirma/world-engine';
import type { AgenciaMontada } from './montar-agencia';
import { resolverSpecLab } from './proto-blit/catalogo';
import type { ZonaPedido } from './selecionar-pedido';

const COLAR_OPTS = { resolverSpec: resolverSpecLab };

export type AgenteEspacial = {
  agentId: string;
  zonaKind: ZonaPedido;
  roomId: string;
  door: Cell;
  desk?: Prop;
  seat?: Cell;
  seatFrac?: { x: number; y: number; facing: 0 | 1 | 2 | 3 };
  roomRect: Room['rect'];
};

export type LayoutDaAgencia = {
  layout: OfficeLayout;
  corredorY: number;
};

export type CenarioEspacial = LayoutDaAgencia & {
  agentes: AgenteEspacial[];
  nav: NavGrid;
  entrada: Cell;
};

function ladoDoSlot(rect: Room['rect'], corredorY: number): 'norte' | 'sul' {
  return rect.y1 <= corredorY ? 'norte' : 'sul';
}

function postoParaGridWorld(
  posto: PostoTrabalho,
  sala: Room,
): { x: number; y: number; facing: 0 | 1 | 2 | 3 } {
  const passo = posto.passo ?? 1;
  // ActorState e desenhado em iso(x + .5, y + .5). Compensamos esse centro
  // para que o ator caia exatamente no centro da subdivisao marcada no lab.
  const lx = posto.gx + (posto.qx ?? 0) * passo + passo * 0.5 - 0.5;
  const ly = posto.gy + (posto.qy ?? 0) * passo + passo * 0.5 - 0.5;
  return {
    x: sala.rect.x0 + lx,
    y: sala.rect.y0 + ly,
    facing: posto.facing ?? 2,
  };
}

function resolverPostoAgente(
  tema: TemaArquiteto,
  agentId: string,
  sala: Room,
): { x: number; y: number; facing: 0 | 1 | 2 | 3 } | undefined {
  const postos = tema.postosTrabalho;
  if (!postos?.length) return undefined;
  const posto =
    postos.find((p) => p.agentSlot === agentId) ??
    postos.find((p) => p.agentSlot === 'default') ??
    postos[0];
  if (!posto) return undefined;
  return postoParaGridWorld(posto, sala);
}

function salaDeSlot(
  slot: AgenciaMontada['slots'][number],
  corredorY: number,
): Room {
  const { w } = gradeDoProto(slot.proto.tema);
  const lado = ladoDoSlot(slot.rect, corredorY);
  const portaX = slot.rect.x0 + Math.floor((w - 1) / 2);
  const portaY = lado === 'norte' ? slot.rect.y1 - 1 : slot.rect.y0;

  return {
    roomId: `room-${slot.proto.key}`,
    zoneId: slot.proto.key,
    name: slot.proto.tema.nome,
    kind: slot.proto.zonaKind,
    rect: { ...slot.rect },
    door: { x: portaX, y: portaY },
  };
}

function agentIdsDoSlot(zonaKind: ZonaPedido, indicePriv: number): string[] {
  if (zonaKind === 'boss_room') return ['agent-boss'];
  if (zonaKind === 'private') return [`agent-priv-${indicePriv}`];
  return [];
}

export function construirEspacoAgencia(agencia: AgenciaMontada): CenarioEspacial {
  const rooms: Room[] = [];
  const props: Prop[] = [];
  const wallMounts: OfficeLayout['wallMounts'] = [];
  let indicePriv = 0;

  for (const slot of agencia.slots) {
    const sala = salaDeSlot(slot, agencia.corredorY);
    rooms.push(sala);

    const agentIds =
      slot.proto.zonaKind === 'private'
        ? agentIdsDoSlot('private', indicePriv++)
        : agentIdsDoSlot(slot.proto.zonaKind, 0);

    // O palco visual e espacial preserva a orientacao autorada no lab.
    // A porta/soleira e orientada separadamente conforme a faixa.
    const resultado = colarProto(sala, slot.proto.tema, agentIds, false, COLAR_OPTS);
    props.push(...resultado.props);
    wallMounts.push(...resultado.mounts);
  }

  const layout: OfficeLayout = {
    officeId: `debugpreview-${agencia.seed}`,
    seed: agencia.seed >>> 0,
    grid: { ...agencia.grid },
    rooms,
    props,
    decor: [],
    corridors: agencia.corridors.map((c) => ({ ...c })),
    theme: { name: 'debugpreview', palette: [], greenery: 0.3 },
    walls: [],
    wallMounts,
    corridorTileSetId: 'Concrete',
  };

  const nav = buildNavGrid(layout);

  const bossRoom = rooms.find((r) => r.kind === 'boss_room');
  const entrada = bossRoom?.door ?? agencia.corridors[0] ?? { x: 1, y: 1 };

  const agentes: AgenteEspacial[] = [];
  indicePriv = 0;
  for (const slot of agencia.slots) {
    if (slot.proto.zonaKind === 'break') continue;

    const sala = rooms.find((r) => r.zoneId === slot.proto.key);
    if (!sala) continue;

    const agentId =
      slot.proto.zonaKind === 'boss_room' ? 'agent-boss' : `agent-priv-${indicePriv++}`;

    const desk = props.find((p) => p.kind === 'desk' && p.ownerAgentId === agentId);
    const posto = resolverPostoAgente(slot.proto.tema, agentId, sala);
    const seat = desk ? (seatCellFor(nav, desk.cell) ?? undefined) : undefined;

    agentes.push({
      agentId,
      zonaKind: slot.proto.zonaKind,
      roomId: sala.roomId,
      door: { ...sala.door },
      desk,
      seat,
      seatFrac: posto,
      roomRect: { ...sala.rect },
    });
  }

  return {
    layout,
    corredorY: agencia.corredorY,
    agentes,
    nav,
    entrada,
  };
}

/** Celulas walkable dentro de uma sala (para destino na copa). */
export function celulasWalkableNaSala(
  nav: NavGrid,
  rect: Room['rect'],
): Cell[] {
  const out: Cell[] = [];
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const c = { x, y };
      if (nav.cells[y * nav.width + x] === 1) out.push(c);
    }
  }
  return out;
}

/**
 * Montagem unica da planta iso (cliente e servidor).
 *
 * Seed + elenco -> selecionarPedido + montarAgencia + construirEspacoAgencia.
 * Deterministico: mesma entrada, mesma planta (ADR-0006).
 */

import type { AgentDescriptor, OfficeLayout } from '@microfirma/contracts';
import { BIBLIA_TEMAS } from '@microfirma/world-engine';
import { resolverSpecLab } from './proto-blit/catalogo';
import {
  assinaturaElenco,
  construirEspacoAgencia,
  ordenarElencoCliente,
  type CenarioEspacial,
} from './espaco-agencia';
import { montarAgencia, type AgenciaMontada } from './montar-agencia';
import type { ZonaPedido } from './selecionar-pedido';
import { resolverColisaoDoCatalogo, type ResolverColisao } from '@microfirma/world-engine';

export const COLAR_LAB = { resolverSpec: resolverSpecLab };

export function resolverColisaoLab(): ResolverColisao {
  return resolverColisaoDoCatalogo(COLAR_LAB);
}

export type MundoIso = {
  agencia: AgenciaMontada;
  cenario: CenarioEspacial;
  layout: OfficeLayout;
};

/**
 * Placeholder ate o primeiro span OTLP. 1 Boss + 1 copa, mesa do placeholder.
 */
export const AGENTE_PLACEHOLDER: AgentDescriptor = {
  agentId: 'microfirma-placeholder',
  displayName: 'Aguardando telemetria',
  role: 'unknown',
  framework: 'unknown',
  discoveredVia: 'manual',
  avatarSeed: 0,
};

export function elencoParaPlanta(agentes: readonly AgentDescriptor[]): AgentDescriptor[] {
  const clientes = ordenarElencoCliente(agentes);
  return clientes.length > 0 ? clientes : [AGENTE_PLACEHOLDER];
}

export function montarMundoIso(
  seed: number,
  agentes: readonly AgentDescriptor[],
): MundoIso {
  const elenco = elencoParaPlanta(agentes);
  const nClientes = elenco.filter((a) => a.agentId !== 'microfirma-placeholder').length;
  const salas = Math.max(1, nClientes);
  const agencia = montarAgencia({ salas }, seed);
  if (!agencia) {
    throw new Error(`montarMundoIso: pedido invalido seed=${seed} salas=${salas}`);
  }
  const cenario = construirEspacoAgencia(agencia, elenco);
  return { agencia, cenario, layout: cenario.layout };
}

export function agenciaDeLayout(layout: OfficeLayout): AgenciaMontada {
  const corredorY = layout.corridors[0]?.y ?? 1;
  const slots: AgenciaMontada['slots'] = [];
  for (const room of layout.rooms) {
    const zonaKind = room.kind as ZonaPedido;
    if (zonaKind !== 'private' && zonaKind !== 'break' && zonaKind !== 'boss_room') continue;
    const tema = temaDoZoneId(room.zoneId, zonaKind);
    if (!tema) continue;
    slots.push({
      proto: { key: room.zoneId, zonaKind, tema },
      rect: { ...room.rect },
    });
  }
  return {
    seed: layout.seed,
    grid: { ...layout.grid },
    slots,
    corridors: layout.corridors.map((c) => ({ x: c.x, y: c.y })),
    corredorY,
    pisoCorredor: 'Concrete',
  };
}

/** Ids na ordem da planta: boss, depois privativos (para re-colar no renderer). */
export function elencoIdsDoLayout(layout: OfficeLayout, agencia: AgenciaMontada): string[] {
  const ids: string[] = [];
  const boss = layout.rooms.find((r) => r.kind === 'boss_room');
  if (boss) {
    const mesa = layout.props.find(
      (p) => p.kind === 'desk' && p.roomId === boss.roomId && p.ownerAgentId,
    );
    if (mesa?.ownerAgentId) ids.push(mesa.ownerAgentId);
  }
  for (const slot of agencia.slots) {
    if (slot.proto.zonaKind !== 'private') continue;
    const sala = layout.rooms.find((r) => r.zoneId === slot.proto.key);
    if (!sala) continue;
    const mesa = layout.props.find(
      (p) => p.kind === 'desk' && p.roomId === sala.roomId && p.ownerAgentId,
    );
    if (mesa?.ownerAgentId) ids.push(mesa.ownerAgentId);
  }
  return ids;
}

function temaDoZoneId(zoneId: string, kind: ZonaPedido) {
  const prefix = `${kind}-`;
  if (!zoneId.startsWith(prefix)) {
    return BIBLIA_TEMAS.temas.find((t) => t.id === zoneId);
  }
  const rest = zoneId.slice(prefix.length);
  const dash = rest.indexOf('-');
  const temaId = dash >= 0 ? rest.slice(dash + 1) : rest;
  return BIBLIA_TEMAS.temas.find((t) => t.id === temaId);
}

export function assinaturaElencoDe(agentes: readonly AgentDescriptor[]): string {
  return assinaturaElenco(elencoParaPlanta(agentes).map((a) => a.agentId));
}

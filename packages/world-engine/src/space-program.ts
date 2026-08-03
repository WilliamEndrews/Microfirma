/**
 * PROGRAMA DE NECESSIDADES (etapa 1 de 2 da geracao de escritorio)
 *
 * Esta e a etapa que, em producao, sera executada pelo Agente Arquiteto (LLM).
 * A implementacao abaixo e a versao deterministica de referencia: ela produz
 * exatamente o mesmo tipo de artefato que o LLM produzira (`SpaceProgram`),
 * o que nos da duas vantagens enormes:
 *
 *  1. o solver geometrico ja pode ser desenvolvido e testado sem LLM nenhum;
 *  2. quando o LLM entrar, ele e apenas uma implementacao alternativa desta
 *     mesma interface - e podemos comparar as duas (e cair para esta se o
 *     LLM devolver algo invalido). LLM como enfeite, nunca como dependencia
 *     critica de caminho quente (ADR-0005).
 *
 * O LLM NUNCA gera coordenadas. Ver ADR-0004.
 */

import type { AgentDescriptor, SpaceProgram, ZoneRequest } from '@microfirma/contracts';
import { ROOM_PREFERENCE } from '@microfirma/contracts';
import { createRng, hashString } from './prng.js';
import { TEMAS } from './themes.js';

/** Aresta do grafo de colaboracao real, extraido da telemetria. */
export interface CollaborationEdge {
  a: string;
  b: string;
  /** Numero de interacoes observadas (handoffs, chamadas encadeadas). */
  interactions: number;
}

export interface PlanOptions {
  officeId: string;
  seed: number;
  /** Grafo de colaboracao. Se vazio, a adjacencia cai para afinidade de papel. */
  collaboration?: CollaborationEdge[];
  /** Quantos agentes cabem numa area aberta antes de abrir uma segunda. */
  maxAgentsPorAreaAberta?: number;
}

/** Temas de decoracao disponiveis. Em producao, escolhidos pelo Agente Decorador. */

/**
 * Monta o programa de necessidades a partir dos agentes descobertos.
 *
 * Regras de negocio (as mesmas que irao no prompt do Agente Arquiteto):
 *  - todo agente precisa de exatamente uma mesa;
 *  - papeis sensiveis (financeiro, orquestrador, guardiao) preferem sala privada;
 *  - toda planta tem obrigatoriamente 1 sala de descanso e 1 recepcao;
 *  - se houver 4+ agentes, adiciona 1 sala de reuniao;
 *  - se houver 8+ agentes, adiciona 1 war room (para incidentes).
 */
export function planSpaceProgram(agents: AgentDescriptor[], opts: PlanOptions): SpaceProgram {
  const rng = createRng(opts.seed).fork('space-program');
  const maxPorArea = opts.maxAgentsPorAreaAberta ?? 6;

  const privados = agents.filter((a) => ROOM_PREFERENCE[a.role] === 'private');
  const abertos = agents.filter((a) => ROOM_PREFERENCE[a.role] !== 'private');

  const zones: ZoneRequest[] = [];

  // Uma sala privada por agente de papel sensivel.
  for (const agente of privados) {
    zones.push({
      zoneId: `zone-priv-${agente.agentId}`,
      name: `Sala ${agente.displayName}`,
      kind: 'private',
      areaWeight: 1,
      agentIds: [agente.agentId],
    });
  }

  // Areas abertas em blocos, agrupando agentes que colaboram entre si.
  const ordenados = ordenarPorColaboracao(
    abertos.map((a) => a.agentId),
    opts.collaboration ?? [],
  );
  for (let i = 0; i < ordenados.length; i += maxPorArea) {
    const bloco = ordenados.slice(i, i + maxPorArea);
    zones.push({
      zoneId: `zone-open-${i / maxPorArea + 1}`,
      name: bloco.length > 2 ? `Area Aberta ${i / maxPorArea + 1}` : 'Estacao de Trabalho',
      kind: 'open',
      areaWeight: 1 + bloco.length * 0.35,
      agentIds: bloco,
    });
  }

  // Salas obrigatorias e condicionais.
  zones.push({
    zoneId: 'zone-break',
    name: 'Sala de Descanso',
    kind: 'break',
    areaWeight: 1.4,
    agentIds: [],
  });
  zones.push({
    zoneId: 'zone-reception',
    name: 'Recepcao',
    kind: 'reception',
    areaWeight: 1.1,
    agentIds: [],
  });
  if (agents.length >= 4) {
    zones.push({
      zoneId: 'zone-meeting',
      name: 'Sala de Reuniao',
      kind: 'meeting',
      areaWeight: 1.3,
      agentIds: [],
    });
  }
  if (agents.length >= 8) {
    zones.push({
      zoneId: 'zone-war',
      name: 'War Room',
      kind: 'war_room',
      areaWeight: 1.2,
      agentIds: [],
    });
  }

  // Grid dimensionado pela demanda: cresce em passos discretos, nunca "quase cabe".
  const largura = clamp(28 + zones.length * 4, 32, 96);
  const altura = clamp(20 + Math.ceil(zones.length / 2) * 2, 24, 64);

  return {
    officeId: opts.officeId,
    seed: opts.seed,
    grid: { width: largura, height: altura },
    zones,
    adjacency: adjacenciaEntreZonas(zones, opts.collaboration ?? []),
    theme: (() => {
      const tema = rng.pick(TEMAS);
      return { name: tema.name, palette: [...tema.palette], greenery: tema.greenery };
    })(),
  };
}

/**
 * Ordena agentes de forma que quem colabora fique vizinho na lista - e, por
 * consequencia, vizinho de mesa. E aqui que o layout ganha SIGNIFICADO: a
 * planta do escritorio passa a ser um diagrama legivel do sistema real.
 */
function ordenarPorColaboracao(agentIds: string[], arestas: CollaborationEdge[]): string[] {
  if (agentIds.length <= 2 || arestas.length === 0) return [...agentIds];

  const peso = new Map<string, number>();
  for (const e of arestas) {
    peso.set(chave(e.a, e.b), (peso.get(chave(e.a, e.b)) ?? 0) + e.interactions);
  }

  const restantes = new Set(agentIds);
  // Comeca pelo agente mais conectado: ancora estavel e independente da ordem
  // em que os agentes foram descobertos.
  const grau = (id: string) =>
    agentIds.reduce((soma, outro) => soma + (peso.get(chave(id, outro)) ?? 0), 0);
  let atual = [...restantes].sort((a, b) => grau(b) - grau(a) || a.localeCompare(b))[0] as string;

  const saida: string[] = [];
  while (restantes.size > 0) {
    saida.push(atual);
    restantes.delete(atual);
    if (restantes.size === 0) break;
    atual = [...restantes].sort(
      (a, b) =>
        (peso.get(chave(atual, b)) ?? 0) - (peso.get(chave(atual, a)) ?? 0) || a.localeCompare(b),
    )[0] as string;
  }
  return saida;
}

/** Converte colaboracao entre AGENTES em adjacencia desejada entre ZONAS. */
function adjacenciaEntreZonas(
  zones: ZoneRequest[],
  arestas: CollaborationEdge[],
): SpaceProgram['adjacency'] {
  const zonaDoAgente = new Map<string, string>();
  for (const z of zones) for (const id of z.agentIds) zonaDoAgente.set(id, z.zoneId);

  const acumulado = new Map<string, number>();
  let maximo = 0;
  for (const e of arestas) {
    const za = zonaDoAgente.get(e.a);
    const zb = zonaDoAgente.get(e.b);
    if (!za || !zb || za === zb) continue;
    const k = chave(za, zb);
    const v = (acumulado.get(k) ?? 0) + e.interactions;
    acumulado.set(k, v);
    maximo = Math.max(maximo, v);
  }

  const saida: SpaceProgram['adjacency'] = [];
  for (const [k, v] of acumulado) {
    const [a, b] = k.split('\u0000') as [string, string];
    saida.push({ a, b, weight: maximo === 0 ? 0 : v / maximo });
  }
  // A sala de descanso deve ficar perto de todo mundo: e o Watercooler.
  const descanso = zones.find((z) => z.kind === 'break');
  if (descanso) {
    for (const z of zones.filter((z) => z.kind === 'open')) {
      saida.push({ a: descanso.zoneId, b: z.zoneId, weight: 0.5 });
    }
  }
  return saida.sort((x, y) => y.weight - x.weight || x.a.localeCompare(y.a));
}

/** Chave simetrica de par: par(a,b) === par(b,a). */
function chave(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Deriva o avatar de um agente do seu id: estavel para sempre, sem banco. */
export function avatarSeedDe(agentId: string): number {
  return hashString(agentId);
}

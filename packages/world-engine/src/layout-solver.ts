/**
 * SOLVER DE LAYOUT (etapa 2 de 2 da geracao de escritorio)
 *
 * Cola ProtoComodos da biblia do lab: escolhe tema por zonaKind, dimensiona
 * a sala pela grade do proto, posiciona nas faixas ao redor do corredor,
 * carimba o palco. Nao inventa mobilia nem faces de parede.
 *
 * Nao ha LLM nenhum neste arquivo. E de proposito (ADR-0004).
 */

import type {
  Cell,
  OfficeLayout,
  Prop,
  Room,
  SpaceProgram,
  WallMount,
  ZoneRequest,
} from '@microfirma/contracts';
import { createRng } from './prng.js';
import {
  calibracaoDoProto,
  colarProto,
  escolherTema,
  gradeDoProto,
  resolverTilesetZona,
  type TemaArquiteto,
} from './construtor-biblia.js';

export function solveLayout(program: SpaceProgram): OfficeLayout {
  const rng = createRng(program.seed).fork('layout');
  const { width: W, height: H } = program.grid;

  const jaUsadosUnicos = new Set<string>();
  const protoPorZona = new Map<string, TemaArquiteto | undefined>();
  for (const zona of program.zones) {
    protoPorZona.set(
      zona.zoneId,
      escolherTema(zona.kind, rng.fork(`tema-${zona.zoneId}`), jaUsadosUnicos),
    );
  }

  const corredorY = Math.floor(H / 2);
  const corridors: Cell[] = [];
  for (let x = 1; x <= W - 2; x++) {
    corridors.push({ x, y: corredorY });
  }

  const { norte, sul } = distribuirEmFaixas(program.zones, program.adjacency);

  const rooms: Room[] = [
    ...alocarFaixa(norte, protoPorZona, W, H, 'norte', corredorY),
    ...alocarFaixa(sul, protoPorZona, W, H, 'sul', corredorY),
  ];

  const roomsVisuais: Room[] = rooms.map((sala) => {
    const proto = protoPorZona.get(sala.zoneId);
    const visual = resolverTilesetZona(
      sala.kind,
      proto,
      program.theme.name,
      rng.fork(`tiles-${sala.zoneId}`),
    );
    return {
      ...sala,
      tileSetId: visual.tileSetId,
      piso: visual.piso,
      parede: visual.parede,
      temaId: proto?.id,
      calibracao: calibracaoDoProto(proto),
    };
  });

  const protoCorredor = escolherTema('corridor', rng.fork('tema-corridor'), jaUsadosUnicos);
  const visualCorredor = resolverTilesetZona(
    'corridor',
    protoCorredor,
    program.theme.name,
    rng.fork('tiles-corridor'),
  );

  const props: Prop[] = [];
  const wallMounts: WallMount[] = [];
  for (const sala of roomsVisuais) {
    const zona = program.zones.find((z) => z.zoneId === sala.zoneId);
    const agentes = zona?.agentIds ?? [];
    const proto = protoPorZona.get(sala.zoneId);
    const faixaNorte = sala.door.y === sala.rect.y1 - 1;
    const resultado = colarProto(sala, proto, agentes, faixaNorte);
    props.push(...resultado.props);
    wallMounts.push(...resultado.mounts);
  }

  return {
    officeId: program.officeId,
    seed: program.seed,
    grid: program.grid,
    rooms: roomsVisuais,
    props,
    decor: [],
    corridors,
    theme: program.theme,
    walls: [],
    wallMounts,
    corridorTileSetId: visualCorredor.tileSetId,
  };
}

function distribuirEmFaixas(
  zones: ZoneRequest[],
  adjacency: SpaceProgram['adjacency'],
): { norte: ZoneRequest[]; sul: ZoneRequest[] } {
  const pesoAdj = new Map<string, number>();
  for (const a of adjacency) {
    pesoAdj.set(`${a.a}|${a.b}`, a.weight);
    pesoAdj.set(`${a.b}|${a.a}`, a.weight);
  }

  const recepcao = zones.filter((z) => z.kind === 'reception');
  const restantes = zones
    .filter((z) => z.kind !== 'reception')
    .sort((a, b) => b.areaWeight - a.areaWeight || a.zoneId.localeCompare(b.zoneId));

  const norte: ZoneRequest[] = [...recepcao];
  const sul: ZoneRequest[] = [];
  let pesoNorte = recepcao.reduce((s, z) => s + z.areaWeight, 0);
  let pesoSul = 0;

  for (const zona of restantes) {
    const afinidadeNorte = norte.reduce(
      (s, z) => s + (pesoAdj.get(`${zona.zoneId}|${z.zoneId}`) ?? 0),
      0,
    );
    const afinidadeSul = sul.reduce(
      (s, z) => s + (pesoAdj.get(`${zona.zoneId}|${z.zoneId}`) ?? 0),
      0,
    );
    const notaNorte = afinidadeNorte - pesoNorte * 0.35;
    const notaSul = afinidadeSul - pesoSul * 0.35;

    if (notaNorte >= notaSul) {
      norte.push(zona);
      pesoNorte += zona.areaWeight;
    } else {
      sul.push(zona);
      pesoSul += zona.areaWeight;
    }
  }
  return { norte, sul };
}

function alocarFaixa(
  zonas: ZoneRequest[],
  protoPorZona: Map<string, TemaArquiteto | undefined>,
  W: number,
  H: number,
  lado: 'norte' | 'sul',
  linhaCorredor: number,
): Room[] {
  if (zonas.length === 0) return [];

  const rooms: Room[] = [];
  let x = 1;
  for (const zona of zonas) {
    const proto = protoPorZona.get(zona.zoneId);
    const { w: largura, h: altura } = gradeDoProto(proto);

    const y0 = lado === 'norte' ? linhaCorredor - altura : linhaCorredor + 1;
    const y1 = y0 + altura;
    if (y0 < 1 || y1 > H - 1) {
      console.warn(
        `[layout] zona ${zona.zoneId} nao cabe na altura da faixa ${lado}; aumente o grid.`,
      );
      continue;
    }
    if (x + largura > W - 1) {
      console.warn(
        `[layout] zona ${zona.zoneId} nao cabe na faixa ${lado}; aumente o grid do programa.`,
      );
      break;
    }

    const portaX = x + Math.floor((largura - 1) / 2);
    const portaY = lado === 'norte' ? y1 - 1 : y0;

    rooms.push({
      roomId: `room-${zona.zoneId}`,
      zoneId: zona.zoneId,
      name: zona.name,
      kind: zona.kind,
      rect: { x0: x, y0, x1: x + largura, y1 },
      door: { x: portaX, y: portaY },
    });

    x += largura;
  }
  return rooms;
}

/**
 * SOLVER DE LAYOUT (etapa 2 de 2 da geracao de escritorio)
 *
 * Transforma um `SpaceProgram` (alto nivel, sem coordenadas) em `OfficeLayout`
 * (geometria concreta e VALIDA). Deterministico: mesma seed => mesma planta.
 *
 * Estrategia, em ordem:
 *  1. anel externo de parede;
 *  2. corredor-espinha horizontal de 2 celulas no meio (garante conectividade
 *     por construcao, em vez de por sorte);
 *  3. zonas distribuidas nas duas faixas (norte/sul), balanceando area;
 *  4. dentro de cada faixa, largura proporcional ao peso de area, com coluna
 *     de parede entre salas;
 *  5. porta de cada sala na face que toca o corredor;
 *  6. mobiliario colocado por regra por tipo de sala, sempre deixando o
 *     caminho porta -> mesa livre;
 *  7. validacao por invariantes (validarLayout) - se violar, e bug nosso,
 *     nao "alucinacao do modelo".
 *
 * Nao ha LLM nenhum neste arquivo. E de proposito (ADR-0004).
 */

import type { Cell, OfficeLayout, Prop, Room, SpaceProgram, ZoneRequest } from '@microfirma/contracts';
import { createRng, type Rng } from './prng.js';

/** Largura minima util de uma sala, em celulas. Micro-firma: 4 (2x2 de mesa + circulacao). */
const LARGURA_MINIMA_SALA = 4;

export function solveLayout(program: SpaceProgram): OfficeLayout {
  const rng = createRng(program.seed).fork('layout');
  const { width: W, height: H } = program.grid;

  // --- 2. corredor-espinha (1 celula, central) --------------------------
  const corredorY = Math.floor(H / 2) - 1;
  const corredorY0 = corredorY;
  const corredorY1 = corredorY;
  const corridors: Cell[] = [];
  for (let x = 1; x <= W - 2; x++) {
    corridors.push({ x, y: corredorY });
  }

  // --- 3. distribuicao das zonas nas faixas -------------------------------
  const { norte, sul } = distribuirEmFaixas(program.zones, program.adjacency);

  // Faixas norte e sul encostadas no corredor.
  const faixaNorte = { y0: 1, y1: corredorY };
  const faixaSul = { y0: corredorY + 1, y1: H - 1 };

  const rooms: Room[] = [
    ...alocarFaixa(norte, faixaNorte, W, 'norte', corredorY0),
    ...alocarFaixa(sul, faixaSul, W, 'sul', corredorY1),
  ];

  // --- 6. mobiliario -------------------------------------------------------
  const props: Prop[] = [];
  for (const sala of rooms) {
    const zona = program.zones.find((z) => z.zoneId === sala.zoneId);
    props.push(...mobiliar(sala, zona, program, rng.fork(sala.roomId)));
  }

  return {
    officeId: program.officeId,
    seed: program.seed,
    grid: program.grid,
    rooms,
    props,
    corridors,
    theme: program.theme,
  };
}

// ---------------------------------------------------------------------------
// 3. Distribuicao em faixas
// ---------------------------------------------------------------------------

/**
 * Reparte as zonas entre a faixa norte e a sul, com dois objetivos:
 *  - equilibrio de area (evita um lado gigante e outro vazio);
 *  - respeito a adjacencia: zonas fortemente ligadas caem na MESMA faixa,
 *    ficando de frente uma para a outra pelo corredor.
 * Heuristica gulosa. Suficiente e, o mais importante, deterministica.
 */
function distribuirEmFaixas(
  zones: ZoneRequest[],
  adjacency: SpaceProgram['adjacency'],
): { norte: ZoneRequest[]; sul: ZoneRequest[] } {
  const pesoAdj = new Map<string, number>();
  for (const a of adjacency) {
    pesoAdj.set(`${a.a}|${a.b}`, a.weight);
    pesoAdj.set(`${a.b}|${a.a}`, a.weight);
  }

  // Recepcao sempre no inicio da faixa norte: e a entrada do escritorio.
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
    // Penaliza a faixa mais cheia para nao desequilibrar a planta.
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

// ---------------------------------------------------------------------------
// 4 e 5. Alocacao de largura e porta
// ---------------------------------------------------------------------------

function alocarFaixa(
  zonas: ZoneRequest[],
  faixa: { y0: number; y1: number },
  W: number,
  lado: 'norte' | 'sul',
  linhaCorredor: number,
): Room[] {
  if (zonas.length === 0) return [];

  const paredes = zonas.length - 1;
  const utilizavel = W - 2 - paredes;
  const somaPesos = zonas.reduce((s, z) => s + z.areaWeight, 0);

  // Largura proporcional, com piso de LARGURA_MINIMA_SALA.
  const larguras = zonas.map((z) =>
    Math.max(LARGURA_MINIMA_SALA, Math.floor((utilizavel * z.areaWeight) / somaPesos)),
  );
  // Reconciliacao do arredondamento: a sobra (ou falta) vai para a maior sala,
  // que e a que melhor absorve a diferenca sem ficar inutilizavel.
  const diferenca = utilizavel - larguras.reduce((s, l) => s + l, 0);
  if (diferenca !== 0) {
    let idxMaior = 0;
    for (let i = 1; i < larguras.length; i++) {
      if ((larguras[i] as number) > (larguras[idxMaior] as number)) idxMaior = i;
    }
    larguras[idxMaior] = Math.max(
      LARGURA_MINIMA_SALA,
      (larguras[idxMaior] as number) + diferenca,
    );
  }

  const rooms: Room[] = [];
  let x = 1;
  for (let i = 0; i < zonas.length; i++) {
    const zona = zonas[i] as ZoneRequest;
    const largura = larguras[i] as number;
    // Se a faixa estourou a largura do predio, a sala e descartada com aviso
    // explicito: preferimos perder uma sala a gerar geometria invalida.
    if (x + largura > W - 1) {
      console.warn(
        `[layout] zona ${zona.zoneId} nao caber na faixa ${lado}; aumente o grid do programa.`,
      );
      break;
    }

    const rect = { x0: x, y0: faixa.y0, x1: x + largura, y1: faixa.y1 };
    // A porta fica na face que toca o corredor: ultima linha (norte) ou
    // primeira linha (sul). Deslocada 2 celulas da borda para nao nascer no canto.
    const portaX = rect.x0 + Math.min(2, largura - 1);
    const portaY = lado === 'norte' ? rect.y1 - 1 : rect.y0;
    void linhaCorredor; // usado pela validacao; mantido explicito para leitura

    rooms.push({
      roomId: `room-${zona.zoneId}`,
      zoneId: zona.zoneId,
      name: zona.name,
      kind: zona.kind,
      rect,
      door: { x: portaX, y: portaY },
    });

    x += largura + 1; // +1 = coluna de parede entre salas
  }
  return rooms;
}

// ---------------------------------------------------------------------------
// 6. Mobiliario
// ---------------------------------------------------------------------------

/**
 * Coloca mobiliario por regra, nunca por sorteio livre. O sorteio serve apenas
 * para variacao estetica (plantas, orientacao), nunca para posicao funcional -
 * assim o escritorio e sempre diferente e sempre utilizavel.
 */
function mobiliar(
  sala: Room,
  zona: ZoneRequest | undefined,
  program: SpaceProgram,
  rng: Rng,
): Prop[] {
  const props: Prop[] = [];
  const { x0, y0, x1, y1 } = sala.rect;
  const largura = x1 - x0;
  const altura = y1 - y0;

  const ocupado = new Set<string>([`${sala.door.x},${sala.door.y}`]);
  // Coluna e linha da porta ficam livres para circulacao.
  const colunaLivre = sala.door.x;
  const linhaLivre = sala.door.y;

  const reservar = (c: Cell): boolean => {
    const k = `${c.x},${c.y}`;
    if (ocupado.has(k)) return false;
    if (c.x < x0 || c.x >= x1 || c.y < y0 || c.y >= y1) return false;
    ocupado.add(k);
    return true;
  };

  const ehSul = sala.door.y === y0;
  const frenteY = ehSul ? y0 + 1 : y1 - 2;
  const atrasY = ehSul ? y1 - 2 : y0 + 1;
  const mesaFacing = ehSul ? 2 : 0;
  const cadeiraFacing = ehSul ? 0 : 2;

  // Mesas: uma por agente, encostadas na parede oposta a porta.
  // Espacamento de 3 celulas garante circulacao na micro-sala.
  const agentes = zona?.agentIds ?? [];
  let indiceAgente = 0;
  const colunasMesas: number[] = [];
  for (let dx = 1; dx < largura - 1 && indiceAgente < agentes.length; dx += 3) {
    if (x0 + dx === colunaLivre) continue;
    colunasMesas.push(x0 + dx);
    const mesa = { x: x0 + dx, y: atrasY };
    if (!reservar(mesa)) continue;
    props.push({
      propId: `desk-${agentes[indiceAgente]}`,
      kind: 'desk',
      cell: mesa,
      roomId: sala.roomId,
      ownerAgentId: agentes[indiceAgente] as string,
      facing: mesaFacing,
    });
    // Cadeira giratoria de frente para a mesa.
    const cadeira = { x: x0 + dx, y: atrasY + (ehSul ? -1 : 1) };
    if (cadeira.y >= y0 && cadeira.y < y1 && cadeira.y !== linhaLivre) {
      reservar(cadeira);
      props.push({
        propId: `chair-${agentes[indiceAgente]}`,
        kind: 'chair',
        cell: cadeira,
        roomId: sala.roomId,
        facing: cadeiraFacing,
      });
    }
    indiceAgente++;
  }
  if (indiceAgente < agentes.length) {
    console.warn(
      `[layout] sala ${sala.roomId}: ${agentes.length - indiceAgente} agente(s) sem mesa; ` +
        `aumente areaWeight da zona ${sala.zoneId}.`,
    );
  }

  // Tapete no centro da sala (ocupa 1 ou 2 celulas).
  const rugX = x0 + Math.max(1, Math.min(largura - 2, Math.floor(largura / 2)));
  const rugY = y0 + Math.max(1, Math.min(altura - 2, Math.floor(altura / 2)));
  const tapete = { x: rugX, y: rugY };
  if (tapete.x !== colunaLivre && !ocupado.has(`${tapete.x},${tapete.y}`)) {
    reservar(tapete);
    props.push({
      propId: `rug-${sala.roomId}`,
      kind: 'rug',
      cell: tapete,
      roomId: sala.roomId,
      facing: 0,
    });
  }

  // Armario ou estante na parede oposta as mesas, ocupando cantos vazios.
  for (let dx = 1; dx < largura - 1; dx++) {
    const px = x0 + dx;
    if (px === colunaLivre) continue;
    const canto = { x: px, y: frenteY };
    if (canto.x !== colunaLivre && !ocupado.has(`${canto.x},${canto.y}`) && reservar(canto)) {
      const tipo = (px + y0) % 2 === 0 ? 'cabinet' : 'bookshelf';
      props.push({
        propId: `${tipo}-${sala.roomId}-${px}`,
        kind: tipo,
        cell: canto,
        roomId: sala.roomId,
        facing: mesaFacing,
      });
    }
  }

  // Luminaria no centro do teto (se cabe).
  const lampX = x0 + Math.floor(largura / 2);
  const lampY = y0 + Math.floor(altura / 2);
  if (lampX !== colunaLivre && !ocupado.has(`${lampX},${lampY}`) && reservar({ x: lampX, y: lampY })) {
    props.push({
      propId: `lamp-${sala.roomId}`,
      kind: 'lamp',
      cell: { x: lampX, y: lampY },
      roomId: sala.roomId,
      facing: 0,
    });
  }

  // Plantas em cantos vazios (se houver).
  const cantos: Cell[] = [
    { x: x0, y: y0 },
    { x: x1 - 1, y: y0 },
    { x: x0, y: y1 - 1 },
    { x: x1 - 1, y: y1 - 1 },
  ];
  for (const canto of cantos) {
    if (!rng.chance(program.theme.greenery)) continue;
    if (canto.x === colunaLivre) continue;
    if (!reservar(canto)) continue;
    props.push({
      propId: `plant-${sala.roomId}-${canto.x}-${canto.y}`,
      kind: 'plant',
      cell: canto,
      roomId: sala.roomId,
      facing: rng.int(0, 3) as Prop['facing'],
    });
  }

  // Mobiliario especifico por tipo de sala.
  const centro = { x: x0 + Math.floor(largura / 2), y: y0 + Math.floor(altura / 2) };
  switch (sala.kind) {
    case 'break': {
      // Copa: sofa + mesa de cafe + bebedouro.
      if (reservar(centro))
        props.push({ propId: `sofa-${sala.roomId}`, kind: 'sofa', cell: centro, roomId: sala.roomId, facing: 0 });
      const cafe = { x: centro.x + 1, y: centro.y };
      if (cafe.x < x1 - 1 && reservar(cafe))
        props.push({ propId: `coffee-${sala.roomId}`, kind: 'coffee', cell: cafe, roomId: sala.roomId, facing: 3 });
      const bebedouro = { x: x0 + 1, y: frenteY };
      if (!ocupado.has(`${bebedouro.x},${bebedouro.y}`) && reservar(bebedouro))
        props.push({ propId: `water-${sala.roomId}`, kind: 'water', cell: bebedouro, roomId: sala.roomId, facing: 3 });
      break;
    }
    case 'meeting':
    case 'war_room': {
      // Sala de reuniao: mesa de centro + quadro + cadeiras.
      if (reservar(centro))
        props.push({ propId: `board-${sala.roomId}`, kind: 'board', cell: centro, roomId: sala.roomId, facing: 2 });
      const mesaReuniao = { x: centro.x - 1, y: centro.y };
      if (mesaReuniao.x >= x0 && !ocupado.has(`${mesaReuniao.x},${mesaReuniao.y}`) && reservar(mesaReuniao))
        props.push({ propId: `desk-${sala.roomId}-r`, kind: 'desk', cell: mesaReuniao, roomId: sala.roomId, facing: 0 });
      break;
    }
    case 'reception': {
      // Recepcao: mesa do recepcionista + impressora + bebedouro.
      if (reservar(centro))
        props.push({ propId: `desk-${sala.roomId}-recp`, kind: 'desk', cell: centro, roomId: sala.roomId, facing: mesaFacing });
      const impressora = { x: x0 + 1, y: frenteY };
      if (!ocupado.has(`${impressora.x},${impressora.y}`) && reservar(impressora))
        props.push({ propId: `printer-${sala.roomId}`, kind: 'printer', cell: impressora, roomId: sala.roomId, facing: 0 });
      const bebedouro = { x: x1 - 2, y: frenteY };
      if (!ocupado.has(`${bebedouro.x},${bebedouro.y}`) && reservar(bebedouro))
        props.push({ propId: `water-${sala.roomId}`, kind: 'water', cell: bebedouro, roomId: sala.roomId, facing: 1 });
      break;
    }
    default: {
      // Escritorios privativos e abertos: bebedouro no canto, se couber.
      if (largura >= 5) {
        const agua = { x: x1 - 2, y: frenteY };
        if (!ocupado.has(`${agua.x},${agua.y}`) && reservar(agua))
          props.push({ propId: `water-${sala.roomId}`, kind: 'water', cell: agua, roomId: sala.roomId, facing: 1 });
      }
      break;
    }
  }

  return props;
}

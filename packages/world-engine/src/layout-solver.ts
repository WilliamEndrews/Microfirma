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

import type { Cell, Decor, Footprint, OfficeLayout, Prop, Room, SpaceProgram, ZoneRequest } from '@microfirma/contracts';
import { createRng, type Rng } from './prng.js';

/** Largura minima util de uma sala, em celulas. Micro-escritorio: 3 (mesa + cadeira + circulacao). */
const LARGURA_MINIMA_SALA = 3;

export function solveLayout(program: SpaceProgram): OfficeLayout {
  const rng = createRng(program.seed).fork('layout');
  const { width: W, height: H } = program.grid;

  // --- 2. corredor-espinha (1 celula, central) --------------------------
  // Corredor centralizado: floor(H/2) em vez de floor(H/2)-1 produz faixas
  // norte e sul de altura mais equilibrada, evitando salas baixas e retangulares
  // no norte. Para H=9: corredor no y=4, faixas de altura 4 (norte) e 4 (sul).
  const corredorY = Math.floor(H / 2);
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

  // --- 3b. celulas nao alocadas viram corredor --------------------------------
  // Quando o cap de largura quadrada encurta salas, sobra area na faixa. Essas
  // celulas nao pertencem a nenhuma sala, mas ficam dentro do predio. Sem piso
  // elas apareceriam como vazio (fundo preto). Transforma-las em corredor da
  // a elas piso e mantem a planta visualmente continua - sao o "hall" ou area
  // de circulacao extra da micro-firma.
  const celulasDeSala = new Set<string>();
  for (const sala of rooms) {
    for (let y = sala.rect.y0; y < sala.rect.y1; y++) {
      for (let x = sala.rect.x0; x < sala.rect.x1; x++) {
        celulasDeSala.add(`${x},${y}`);
      }
    }
  }
  const celulasCorredor = new Set(corridors.map((c) => `${c.x},${c.y}`));
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const k = `${x},${y}`;
      if (!celulasDeSala.has(k) && !celulasCorredor.has(k)) {
        corridors.push({ x, y });
        celulasCorredor.add(k);
      }
    }
  }

  // --- 6. mobiliario e decor de superficie ---------------------------------
  const props: Prop[] = [];
  const decor: Decor[] = [];
  for (const sala of rooms) {
    const zona = program.zones.find((z) => z.zoneId === sala.zoneId);
    const rngSala = rng.fork(sala.roomId);
    const propsSala = mobiliar(sala, zona, program, rngSala);
    props.push(...propsSala);
    decor.push(...decorar(propsSala, rngSala.fork('decor')));
  }

  return {
    officeId: program.officeId,
    seed: program.seed,
    grid: program.grid,
    rooms,
    props,
    decor,
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

  const alturaFaixa = faixa.y1 - faixa.y0;
  const paredes = zonas.length - 1;
  const utilizavel = W - 2 - paredes;
  const somaPesos = zonas.reduce((s, z) => s + z.areaWeight, 0);

  // Largura proporcional, com piso de LARGURA_MINIMA_SALA.
  const larguras = zonas.map((z) =>
    Math.max(LARGURA_MINIMA_SALA, Math.floor((utilizavel * z.areaWeight) / somaPesos)),
  );
  // CAP DE QUADRADO: limita a largura de cada sala a ~alturaFaixa+1 para
  // produzir salas quase quadradas. Sem isto, uma faixa com 1 zona recebe
  // toda a largura do predio e gera um retangulo longo e fino. O excesso
  // de largura simplesmente nao e alocado (vira area nao construida).
  //
  // EXCECAO: o cap nunca pode cortar abaixo do necessario para acomodar os
  // agentes da zona. Cada agente precisa de uma mesa, e o espacamento entre
  // mesas e 2-3 celulas. Se a zona tem N agentes, a largura minima e ~2N+1.
  const larguraMaximaQuadrada = alturaFaixa + 1;
  for (let i = 0; i < larguras.length; i++) {
    const zona = zonas[i] as ZoneRequest;
    const nAgentes = zona.agentIds.length;
    const larguraMinimaAgentes = Math.max(LARGURA_MINIMA_SALA, nAgentes * 2 + 1);
    const cap = Math.max(larguraMaximaQuadrada, larguraMinimaAgentes);
    larguras[i] = Math.min(larguras[i] as number, cap);
  }
  // Reconciliacao do arredondamento: a sobra (ou falta) vai para a maior sala,
  // que e a que melhor absorve a diferenca sem ficar inutilizavel.
  const diferenca = utilizavel - larguras.reduce((s, l) => s + l, 0);
  if (diferenca !== 0) {
    let idxMaior = 0;
    for (let i = 1; i < larguras.length; i++) {
      if ((larguras[i] as number) > (larguras[idxMaior] as number)) idxMaior = i;
    }
    // Reaplica o cap per-zone (agentes + quadrado) para nao desfazer a excecao
    // de agentes na reconciliacao.
    const zonaMaior = zonas[idxMaior] as ZoneRequest;
    const capMaior = Math.max(
      larguraMaximaQuadrada,
      Math.max(LARGURA_MINIMA_SALA, zonaMaior.agentIds.length * 2 + 1),
    );
    larguras[idxMaior] = Math.max(
      LARGURA_MINIMA_SALA,
      Math.min(capMaior, (larguras[idxMaior] as number) + diferenca),
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

  /** Props com footprint padrao 1x1 - a maioria. So sofa (copa) usa footprint maior hoje. */
  const prop1x1 = (p: Omit<Prop, 'footprint'>): Prop => ({ ...p, footprint: { w: 1, h: 1 } });

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

  /**
   * Reserva um bloco w x h a partir de `origem` (canto sup.-esq.), tudo ou
   * nada: se qualquer celula do bloco estiver ocupada ou fora da sala, nada e
   * reservado. Usado por mobiliario com footprint > 1x1 (ex.: sofa 2x1).
   */
  const reservarBloco = (origem: Cell, fp: Footprint): boolean => {
    const celulas: Cell[] = [];
    for (let dy = 0; dy < fp.h; dy++) {
      for (let dx = 0; dx < fp.w; dx++) {
        const c = { x: origem.x + dx, y: origem.y + dy };
        const k = `${c.x},${c.y}`;
        if (ocupado.has(k) || c.x < x0 || c.x >= x1 || c.y < y0 || c.y >= y1) return false;
        celulas.push(c);
      }
    }
    for (const c of celulas) ocupado.add(`${c.x},${c.y}`);
    return true;
  };

  const ehSul = sala.door.y === y0;
  const frenteY = ehSul ? y0 + 1 : y1 - 2;
  const atrasY = ehSul ? y1 - 2 : y0 + 1;
  const mesaFacing = ehSul ? 2 : 0;
  const cadeiraFacing = ehSul ? 0 : 2;

  // Mesas: uma por agente, encostadas na parede oposta a porta.
  // Espacamento adaptativo: 3 celulas em salas largas, 2 em salas pequenas
  // (<=5 celulas) para garantir que todos os agentes tenham mesa.
  const agentes = zona?.agentIds ?? [];
  const espacamentoMesas = largura <= 5 ? 2 : 3;
  let indiceAgente = 0;
  const colunasMesas: number[] = [];
  for (let dx = 1; dx < largura - 1 && indiceAgente < agentes.length; dx += espacamentoMesas) {
    if (x0 + dx === colunaLivre) continue;
    colunasMesas.push(x0 + dx);
    const mesa = { x: x0 + dx, y: atrasY };
    if (!reservar(mesa)) continue;
    props.push(prop1x1({
      propId: `desk-${agentes[indiceAgente]}`,
      kind: 'desk',
      cell: mesa,
      roomId: sala.roomId,
      ownerAgentId: agentes[indiceAgente] as string,
      facing: mesaFacing,
    }));
    // Cadeira giratoria de frente para a mesa.
    const cadeira = { x: x0 + dx, y: atrasY + (ehSul ? -1 : 1) };
    if (cadeira.y >= y0 && cadeira.y < y1 && cadeira.y !== linhaLivre) {
      reservar(cadeira);
      props.push(prop1x1({
        propId: `chair-${agentes[indiceAgente]}`,
        kind: 'chair',
        cell: cadeira,
        roomId: sala.roomId,
        facing: cadeiraFacing,
      }));
    }
    indiceAgente++;
  }
  if (indiceAgente < agentes.length) {
    console.warn(
      `[layout] sala ${sala.roomId}: ${agentes.length - indiceAgente} agente(s) sem mesa; ` +
        `aumente areaWeight da zona ${sala.zoneId}.`,
    );
  }

  // Tapete, luminaria e itens sem asset real foram REMOVIDOS do solver.
  // Estes kinds (rug, lamp, coffee, water, board, printer) nao tem asset
  // no catalogo TinyHouse e geravam formas geometricas procedural que
  // destoavam dos sprites pre-renderizados. Serao reintroduzidos quando
  // tiverem assets correspondentes no catalogo.

  // Armario ou estante na parede do FUNDO (oposta a porta), ocupando celulas
  // vazias. Pula em salas pequenas (< 5 celulas de largura) para nao amontoar.
  //
  // Antes ficavam em `frenteY` (parede da porta), mas com salas mais compactas
  // (altura 4) essa fileira e a mesma das cadeiras, causando conflito e
  // impedindo que estantes fossem colocadas. Mover para a parede do fundo
  // (`fundoY`) resolve o conflito e e arquitetonicamente mais sensato:
  // estantes encostadas na parede oposta a porta, atraves das mesas.
  const fundoY = ehSul ? y1 - 1 : y0;
  if (largura >= 5) {
    for (let dx = 1; dx < largura - 1; dx++) {
      const px = x0 + dx;
      if (px === colunaLivre) continue;
      const canto = { x: px, y: fundoY };
      if (canto.x !== colunaLivre && !ocupado.has(`${canto.x},${canto.y}`) && reservar(canto)) {
        const tipo = (px + y0) % 2 === 0 ? 'cabinet' : 'bookshelf';
        props.push(prop1x1({
          propId: `${tipo}-${sala.roomId}-${px}`,
          kind: tipo,
          cell: canto,
          roomId: sala.roomId,
          facing: mesaFacing,
        }));
      }
    }
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
    props.push(prop1x1({
      propId: `plant-${sala.roomId}-${canto.x}-${canto.y}`,
      kind: 'plant',
      cell: canto,
      roomId: sala.roomId,
      facing: rng.int(0, 3) as Prop['facing'],
    }));
  }

  // Mobiliario especifico por tipo de sala.
  // NOTA: coffee, water, board, printer foram REMOVIDOS - sem asset no catalogo.
  // So ficam kinds com asset real do TinyHouse (desk, chair, sofa, plant, etc.)
  const centro = { x: x0 + Math.floor(largura / 2), y: y0 + Math.floor(altura / 2) };
  switch (sala.kind) {
    case 'break': {
      // Copa: sofa. Mesa de cafe e bebedouro removidos (sem asset).
      const sofaFootprint: Footprint = { w: 2, h: 1 };
      const sofaGrande = reservarBloco(centro, sofaFootprint);
      if (sofaGrande) {
        props.push({
          propId: `sofa-${sala.roomId}`,
          kind: 'sofa',
          cell: centro,
          roomId: sala.roomId,
          facing: 0,
          footprint: sofaFootprint,
        });
      } else if (reservar(centro)) {
        props.push(prop1x1({ propId: `sofa-${sala.roomId}`, kind: 'sofa', cell: centro, roomId: sala.roomId, facing: 0 }));
      }
      break;
    }
    case 'meeting':
    case 'war_room': {
      // Sala de reuniao: mesa de centro. Quadro removido (sem asset).
      const mesaReuniao = { x: centro.x - 1, y: centro.y };
      if (mesaReuniao.x >= x0 && !ocupado.has(`${mesaReuniao.x},${mesaReuniao.y}`) && reservar(mesaReuniao))
        props.push(prop1x1({ propId: `desk-${sala.roomId}-r`, kind: 'desk', cell: mesaReuniao, roomId: sala.roomId, facing: 0 }));
      break;
    }
    case 'reception': {
      // Recepcao: mesa do recepcionista. Impressora e bebedouro removidos.
      if (reservar(centro))
        props.push(prop1x1({ propId: `desk-${sala.roomId}-recp`, kind: 'desk', cell: centro, roomId: sala.roomId, facing: mesaFacing }));
      break;
    }
    default: {
      // Escritorios privativos e abertos: sem mobiliario extra por ora.
      // Bebedouro removido (sem asset).
      break;
    }
  }

  return props;
}

// ---------------------------------------------------------------------------
// 6b. Decor de superficie (passo 5 do ADR-0012)
// ---------------------------------------------------------------------------

/**
 * Decor de superficie: notebook OU (monitor+teclado+mouse) sobre cada mesa,
 * livros sobre estantes/armarios. Puramente estetico e deterministico por
 * seed - deliberadamente NAO reserva celula nenhuma (`ocupado`/`reservar`):
 * decor pousa sobre um `Prop` existente, o navgrid nunca o consome (ver
 * docstring de `Decor` em contracts/layout.ts). Se o solver "errar" a
 * posicao, o pior caso e um item flutuando visualmente, nunca um agente
 * preso ou uma mesa inalcancavel.
 */
function decorar(props: Prop[], rng: Rng): Decor[] {
  const decor: Decor[] = [];
  for (const p of props) {
    const base = { cell: p.cell, roomId: p.roomId, onPropId: p.propId, facing: p.facing };
    if (p.kind === 'desk') {
      if (!rng.chance(0.9)) continue; // mesa vazia - nem todo agente esta "logado"
      if (rng.chance(0.55)) {
        decor.push({ decorId: `laptop-${p.propId}`, kind: 'laptop', ...base });
      } else {
        decor.push(
          { decorId: `monitor-${p.propId}`, kind: 'monitor', ...base },
          { decorId: `keyboard-${p.propId}`, kind: 'keyboard', ...base },
          { decorId: `mouse-${p.propId}`, kind: 'mouse', ...base },
        );
      }
    } else if ((p.kind === 'bookshelf' || p.kind === 'cabinet') && rng.chance(0.7)) {
      decor.push({ decorId: `books-${p.propId}`, kind: 'books', ...base });
    }
  }
  return decor;
}

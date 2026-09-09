/**
 * MALHA DE NAVEGACAO E PATHFINDING
 *
 * Duas responsabilidades, deliberadamente separadas:
 *  - NavGrid: o que e caminhavel (derivado do layout, imutavel);
 *  - findPath: A* sobre essa malha.
 *
 * Decisao de projeto: movimento em 4 direcoes, nao 8. Motivo estetico e tecnico
 * ao mesmo tempo - diagonais em grid isometrico produzem sobreposicao visual
 * feia com mobiliario, e 4 direcoes casam com spritesheets de 4 orientacoes,
 * reduzindo o custo de arte em ~50% (ADR-0008).
 *
 * Custo: A* com heap binario. Um escritorio tipico tem < 3000 celulas, logo
 * cada busca custa microssegundos. Recalculo de rota nunca sera o gargalo -
 * o gargalo e o numero de atores desenhados (ver LOD no renderizador).
 *
 * PORTA COMO UNICA PASSAGEM (evolucao): alem de "caminhavel/bloqueado" por
 * celula, o NavGrid guarda `blockedEdges` - pares de celulas adjacentes cuja
 * TRAVESSIA e proibida, mesmo que ambas sejam caminhaveis. E assim que a
 * porta se torna a unica entrada de uma sala: toda a borda do `rect` da sala
 * fica com a travessia para fora bloqueada, exceto no par (porta, vizinho).
 * Isso vale tanto para sala->corredor quanto para sala->sala (salas vizinhas
 * na mesma faixa nao tem gap nenhum na producao - ver `layout-solver.ts`
 * `alocarFaixa`), sem o codigo precisar saber o que esta do outro lado.
 */

import type { Cell, OfficeLayout, Prop, Room } from '@microfirma/contracts';

export interface NavGrid {
  width: number;
  height: number;
  /** 1 = caminhavel, 0 = bloqueado. Indexado por y * width + x. */
  cells: Uint8Array;
  /**
   * Pares de celulas adjacentes cuja travessia e proibida (fronteira de
   * sala fora da porta). Chave canonica via `edgeKey` - ver essa funcao.
   * Vazio para grids sem salas (ex.: agencia sem protos).
   */
  blockedEdges: Set<string>;
}

/**
 * Default de bloqueio por `kind`, quando o Prop nao traz `assetId` ou o
 * catalogo nao decide (`AssetEntry.colide`) para aquele asset. Identico ao
 * antigo `PROPS_BLOQUEANTES` - preserva o comportamento atual.
 */
const BLOQUEIO_PADRAO_POR_KIND: Record<Prop['kind'], boolean> = {
  desk: true,
  sofa: true,
  board: true,
  printer: true,
  meter: true,
  plant: true,
  chair: false,
  cabinet: false,
  bookshelf: false,
  water: false,
  coffee: false,
  lamp: false,
  rug: false,
};

/** Resolve, por Prop, se ele bloqueia o NavGrid. Ausencia de decisao explicita usa o default por kind. */
export type ResolverColisao = (p: Prop) => boolean | undefined;

export function buildNavGrid(layout: OfficeLayout, opts: { resolverColisao?: ResolverColisao } = {}): NavGrid {
  const { width, height } = layout.grid;
  const cells = new Uint8Array(width * height); // tudo bloqueado por padrao

  const liberar = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    cells[y * width + x] = 1;
  };

  for (const sala of layout.rooms) {
    for (let y = sala.rect.y0; y < sala.rect.y1; y++) {
      for (let x = sala.rect.x0; x < sala.rect.x1; x++) liberar(x, y);
    }
  }
  for (const c of layout.corridors) liberar(c.x, c.y);

  // Mobiliario bloqueia DEPOIS de liberar o piso.
  for (const p of layout.props) {
    if (!propBloqueia(p, opts.resolverColisao)) continue;
    for (const c of footprintCells(p)) bloquear(cells, width, height, c);
  }

  const blockedEdges = new Set<string>();
  for (const sala of layout.rooms) bloquearFronteiraDaSala(sala, blockedEdges);

  return { width, height, cells, blockedEdges };
}

/**
 * True se o Prop bloqueia passagem: o `resolverColisao` injetado (tipicamente
 * lendo `AssetEntry.colide` do catalogo pelo `assetId`) tem prioridade;
 * sem decisao explicita, cai no default por `kind`.
 */
export function propBloqueia(p: Prop, resolverColisao?: ResolverColisao): boolean {
  const decisao = resolverColisao?.(p);
  if (decisao !== undefined) return decisao;
  return BLOQUEIO_PADRAO_POR_KIND[p.kind] ?? false;
}

function bloquear(cells: Uint8Array, width: number, height: number, c: Cell): void {
  if (c.x < 0 || c.y < 0 || c.x >= width || c.y >= height) return;
  cells[c.y * width + c.x] = 0;
}

/** Chave canonica (independente de ordem) para o par de celulas adjacentes. */
function edgeKey(a: Cell, b: Cell): string {
  const ka = `${a.x},${a.y}`;
  const kb = `${b.x},${b.y}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/**
 * Bloqueia a travessia de toda celula da borda do `rect` da sala para fora
 * dela, exceto no ponto da porta - que e deliberadamente deixado de fora do
 * `blockedEdges` (logo, sua travessia so depende de `isWalkable`, como hoje).
 * Nao importa o que ha do lado de fora (corredor, outra sala, nada): a
 * unica celula por onde se entra/sai e `sala.door`.
 */
function bloquearFronteiraDaSala(sala: Room, blockedEdges: Set<string>): void {
  const { x0, y0, x1, y1 } = sala.rect;
  const eAPorta = (c: Cell) => c.x === sala.door.x && c.y === sala.door.y;

  for (let x = x0; x < x1; x++) {
    marcarSeNaoForPorta({ x, y: y0 }, { x, y: y0 - 1 }, eAPorta, blockedEdges);
    marcarSeNaoForPorta({ x, y: y1 - 1 }, { x, y: y1 }, eAPorta, blockedEdges);
  }
  for (let y = y0; y < y1; y++) {
    marcarSeNaoForPorta({ x: x0, y }, { x: x0 - 1, y }, eAPorta, blockedEdges);
    marcarSeNaoForPorta({ x: x1 - 1, y }, { x: x1, y }, eAPorta, blockedEdges);
  }
}

function marcarSeNaoForPorta(
  dentro: Cell,
  fora: Cell,
  eAPorta: (c: Cell) => boolean,
  blockedEdges: Set<string>,
): void {
  if (eAPorta(dentro)) return; // a porta e a unica travessia livre desta celula
  blockedEdges.add(edgeKey(dentro, fora));
}

/** True se a travessia entre duas celulas adjacentes e permitida (fora de fronteira de sala, ou pela porta). */
export function isTransitionAllowed(nav: NavGrid, a: Cell, b: Cell): boolean {
  return !nav.blockedEdges.has(edgeKey(a, b));
}

/**
 * Todas as celulas cobertas pelo footprint de um prop, a partir de `cell`
 * (canto superior-esquerdo), sem rotacao por `facing` - ver contracts/layout.ts.
 * Compartilhado por navgrid e layout-validation para nao divergir.
 */
export function footprintCells(p: { cell: Cell; footprint: { w: number; h: number } }): Cell[] {
  const { w, h } = p.footprint;
  const out: Cell[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      out.push({ x: p.cell.x + dx, y: p.cell.y + dy });
    }
  }
  return out;
}

export function isWalkable(nav: NavGrid, c: Cell): boolean {
  if (c.x < 0 || c.y < 0 || c.x >= nav.width || c.y >= nav.height) return false;
  return nav.cells[c.y * nav.width + c.x] === 1;
}

/** Conjunto de celulas alcancaveis a partir de uma origem (BFS). Usado na validacao. */
export function reachableFrom(nav: NavGrid, origem: Cell): Set<string> {
  const visitados = new Set<string>();
  if (!isWalkable(nav, origem)) return visitados;

  const fila: Cell[] = [origem];
  visitados.add(`${origem.x},${origem.y}`);
  while (fila.length > 0) {
    const atual = fila.shift() as Cell;
    for (const v of vizinhos(atual)) {
      const k = `${v.x},${v.y}`;
      if (visitados.has(k) || !isWalkable(nav, v) || !isTransitionAllowed(nav, atual, v)) continue;
      visitados.add(k);
      fila.push(v);
    }
  }
  return visitados;
}

/**
 * A* de `de` ate `para`. Retorna a rota SEM a celula de origem, ou null se
 * inalcancavel. Quando o destino esta bloqueado (ex.: a propria mesa), o
 * chamador deve pedir uma celula vizinha - ver `seatCellFor`.
 */
export function findPath(nav: NavGrid, de: Cell, para: Cell): Cell[] | null {
  if (!isWalkable(nav, de) || !isWalkable(nav, para)) return null;
  if (de.x === para.x && de.y === para.y) return [];

  const total = nav.width * nav.height;
  const idx = (c: Cell) => c.y * nav.width + c.x;
  const custoG = new Float64Array(total).fill(Infinity);
  const anterior = new Int32Array(total).fill(-1);
  const fechado = new Uint8Array(total);

  const heap = new MinHeap();
  custoG[idx(de)] = 0;
  heap.push(idx(de), heuristica(de, para));

  while (heap.size > 0) {
    const atualIdx = heap.pop() as number;
    if (fechado[atualIdx]) continue;
    fechado[atualIdx] = 1;

    const atual: Cell = { x: atualIdx % nav.width, y: Math.floor(atualIdx / nav.width) };
    if (atual.x === para.x && atual.y === para.y) {
      return reconstruir(anterior, atualIdx, nav.width);
    }

    for (const v of vizinhos(atual)) {
      if (!isWalkable(nav, v) || !isTransitionAllowed(nav, atual, v)) continue;
      const vi = idx(v);
      if (fechado[vi]) continue;
      const g = (custoG[atualIdx] as number) + 1;
      if (g < (custoG[vi] as number)) {
        custoG[vi] = g;
        anterior[vi] = atualIdx;
        heap.push(vi, g + heuristica(v, para));
      }
    }
  }
  return null;
}

/**
 * Celula onde o agente se posiciona para usar um objeto bloqueante (a cadeira
 * diante da mesa, por exemplo). Preferencia deterministica: sul, norte, oeste,
 * leste - assim a mesma mesa sempre gera o mesmo assento.
 */
export function seatCellFor(nav: NavGrid, objeto: Cell): Cell | null {
  for (const v of vizinhos(objeto)) {
    if (isWalkable(nav, v) && isTransitionAllowed(nav, objeto, v)) return v;
  }
  return null;
}

function vizinhos(c: Cell): Cell[] {
  return [
    { x: c.x, y: c.y + 1 },
    { x: c.x, y: c.y - 1 },
    { x: c.x - 1, y: c.y },
    { x: c.x + 1, y: c.y },
  ];
}

/** Manhattan: admissivel e consistente para movimento em 4 direcoes com custo 1. */
function heuristica(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function reconstruir(anterior: Int32Array, fim: number, width: number): Cell[] {
  const rota: Cell[] = [];
  let atual = fim;
  while (atual !== -1) {
    rota.push({ x: atual % width, y: Math.floor(atual / width) });
    atual = anterior[atual] as number;
  }
  rota.reverse();
  rota.shift(); // remove a origem
  return rota;
}

/** Heap binario minimo por prioridade. Simples, alocacao unica, sem dependencias. */
class MinHeap {
  private itens: number[] = [];
  private prioridades: number[] = [];

  get size(): number {
    return this.itens.length;
  }

  push(item: number, prioridade: number): void {
    this.itens.push(item);
    this.prioridades.push(prioridade);
    let i = this.itens.length - 1;
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if ((this.prioridades[pai] as number) <= (this.prioridades[i] as number)) break;
      this.trocar(i, pai);
      i = pai;
    }
  }

  pop(): number | undefined {
    if (this.itens.length === 0) return undefined;
    const topo = this.itens[0] as number;
    const ultimoItem = this.itens.pop() as number;
    const ultimaPrio = this.prioridades.pop() as number;
    if (this.itens.length > 0) {
      this.itens[0] = ultimoItem;
      this.prioridades[0] = ultimaPrio;
      let i = 0;
      for (;;) {
        const esq = i * 2 + 1;
        const dir = esq + 1;
        let menor = i;
        if (esq < this.itens.length && (this.prioridades[esq] as number) < (this.prioridades[menor] as number)) menor = esq;
        if (dir < this.itens.length && (this.prioridades[dir] as number) < (this.prioridades[menor] as number)) menor = dir;
        if (menor === i) break;
        this.trocar(i, menor);
        i = menor;
      }
    }
    return topo;
  }

  private trocar(a: number, b: number): void {
    const ti = this.itens[a] as number;
    this.itens[a] = this.itens[b] as number;
    this.itens[b] = ti;
    const tp = this.prioridades[a] as number;
    this.prioridades[a] = this.prioridades[b] as number;
    this.prioridades[b] = tp;
  }
}

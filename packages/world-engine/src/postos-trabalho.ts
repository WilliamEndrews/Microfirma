/**
 * POSTOS DE TRABALHO: onde o agente efetivamente "trabalha" dentro da sala.
 *
 * O Lab (`tinyhouse-lab.js`, botao "marcar assento") grava `postosTrabalho`
 * no tema: um ponto exato (com sub-celula opcional) + orientacao, por
 * `agentSlot`. Antes desta peca, esse dado so influenciava o DESENHO final
 * do ator (`seatFrac`, so no Debugpreview) - o PATHFINDING sempre usava um
 * vizinho generico da mesa (`seatCellFor`), podendo apontar para uma celula
 * diferente da marcada no Lab (o ator "saltava" ao chegar). A producao
 * (`WorldEngine`) nao tinha equivalente nenhum.
 *
 * Aqui as duas coisas passam a vir da MESMA fonte: `postoParaGridWorld`
 * devolve tanto a celula inteira para o A* (`cellAlvo`) quanto a posicao
 * continua para o desenho (`render`) - nunca podem divergir, porque sao o
 * mesmo calculo.
 */
import type { Cell, Prop, Room } from '@microfirma/contracts';
import type { PostoTrabalho, TemaArquiteto } from './construtor-biblia.js';
import { isWalkable, seatCellFor, type NavGrid } from './navgrid.js';

type PontoLocal = { x: number; y: number };
type PecaMesa = { assetId: string; gx: number; gy: number };

/** Cardinal dominante para uma pessoa em `de` olhar para `para`. */
export function facingOlhandoPara(de: PontoLocal, para: PontoLocal): 0 | 1 | 2 | 3 {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 2;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 3 : 1;
  return dy > 0 ? 0 : 2;
}

/** Encontra a mesa geometricamente mais proxima do assento no palco local. */
export function mesaMaisProxima(
  posto: Pick<PostoTrabalho, 'gx' | 'gy' | 'qx' | 'qy' | 'passo'>,
  mesas: readonly PecaMesa[],
): PecaMesa | undefined {
  const passo = posto.passo ?? 1;
  const assento = {
    x: posto.gx + (posto.qx ?? 0) * passo + passo * 0.5,
    y: posto.gy + (posto.qy ?? 0) * passo + passo * 0.5,
  };
  return [...mesas].sort((a, b) => {
    const da = Math.hypot(a.gx + 0.5 - assento.x, a.gy + 0.5 - assento.y);
    const db = Math.hypot(b.gx + 0.5 - assento.x, b.gy + 0.5 - assento.y);
    return da - db;
  })[0];
}

/** Infere o facing; na mesma celula da mesa, a convencao segura e norte. */
export function inferirFacingAssento(
  posto: Pick<PostoTrabalho, 'gx' | 'gy' | 'qx' | 'qy' | 'passo'>,
  mesa: PecaMesa | undefined,
): { facing: 0 | 1 | 2 | 3; origem: 'olhar_mesa' | 'padrao_norte' } {
  if (!mesa || (mesa.gx === posto.gx && mesa.gy === posto.gy)) {
    return { facing: 2, origem: 'padrao_norte' };
  }
  const passo = posto.passo ?? 1;
  const de = {
    x: posto.gx + (posto.qx ?? 0) * passo + passo * 0.5,
    y: posto.gy + (posto.qy ?? 0) * passo + passo * 0.5,
  };
  return {
    facing: facingOlhandoPara(de, { x: mesa.gx + 0.5, y: mesa.gy + 0.5 }),
    origem: 'olhar_mesa',
  };
}

export interface PostoResolvido {
  /** Celula inteira, arredondada, usada como destino de pathfinding. */
  cellAlvo: Cell;
  /** Posicao continua + orientacao, usada so para o desenho final. */
  render: { x: number; y: number; facing: 0 | 1 | 2 | 3 };
}

/** Quantas subdivisoes de sub-celula um `passo` representa (0.5 -> 2, 1 -> 1). */
function subdivisoesDoPasso(passo: number): number {
  if (passo <= 0 || passo >= 1) return 1;
  return Math.round(1 / passo);
}

/**
 * Espelha uma sub-celula quando a sala inteira e espelhada (`espelharY`,
 * faixa norte). Mesma logica que `colarProto` aplica ao `gy` inteiro das
 * pecas do palco - aqui estendida a subdivisao para nao descolar o assento
 * marcado no Lab da cadeira desenhada.
 */
function espelharSubcelula(q: number, passo: number): number {
  return subdivisoesDoPasso(passo) - 1 - q;
}

/**
 * Converte um `PostoTrabalho` (coordenadas locais da sala, com sub-celula
 * opcional) em coordenadas absolutas do grid. `ActorState` e desenhado em
 * iso(x + .5, y + .5); compensamos esse centro para que o ator caia
 * exatamente no centro da subdivisao marcada no Lab.
 *
 * `espelharY` reproduz o mesmo espelhamento que `colarProto` aplica ao
 * palco na faixa norte (porta encostada no corredor do outro lado).
 */
export function postoParaGridWorld(posto: PostoTrabalho, sala: Room, espelharY = false): PostoResolvido {
  const passo = posto.passo ?? 1;
  const altura = sala.rect.y1 - sala.rect.y0;
  const qyBruto = posto.qy ?? 0;
  const gy = espelharY ? altura - 1 - posto.gy : posto.gy;
  const qy = espelharY ? espelharSubcelula(qyBruto, passo) : qyBruto;

  const lx = posto.gx + (posto.qx ?? 0) * passo + passo * 0.5 - 0.5;
  const ly = gy + qy * passo + passo * 0.5 - 0.5;
  const x = sala.rect.x0 + lx;
  const y = sala.rect.y0 + ly;

  return {
    cellAlvo: { x: Math.round(x), y: Math.round(y) },
    render: { x, y, facing: posto.facing ?? 2 },
  };
}

/**
 * Posto autorado no Lab para este agente, com fallback deterministico:
 * slot exato -> slot `'default'` -> primeiro posto do tema. `undefined`
 * quando o tema nao tem nenhum posto marcado (mais comum hoje - ver script
 * de relatorio `scripts/relatorio-postos-trabalho.mjs`).
 */
export function resolverPostoAgente(
  tema: TemaArquiteto | undefined,
  agentSlot: string,
  sala: Room,
  espelharY = false,
): PostoResolvido | undefined {
  const postos = tema?.postosTrabalho;
  if (!postos?.length) return undefined;
  const posto =
    postos.find((p) => p.agentSlot === agentSlot) ??
    postos.find((p) => p.agentSlot === 'default') ??
    postos[0];
  if (!posto) return undefined;
  return postoParaGridWorld(posto, sala, espelharY);
}

/**
 * Assento final de um agente numa mesa, em ordem de preferencia:
 *  1) `desk.seat` - o posto autorado no Lab, ja resolvido em `colarProto` e
 *     gravado no Prop -, se ainda caminhavel (o layout pode ter mudado);
 *  2) um Prop `chair` na mesma sala com o mesmo `ownerAgentId`, se
 *     caminhavel (temas cuja cadeira e um Prop de verdade, ex.: banquinho
 *     da copa, em vez de uma camada de pixel do combo da mesa);
 *  3) vizinho generico da mesa (`seatCellFor`) - fallback de sempre,
 *     garantido pela invariante "mesa-acessivel" de `layout-validation.ts`.
 */
export function resolverAssento(nav: NavGrid, desk: Prop, chairsDaSala?: readonly Prop[]): Cell | null {
  if (desk.seat && isWalkable(nav, desk.seat)) return desk.seat;

  const cadeira = chairsDaSala?.find(
    (c) => c.kind === 'chair' && c.ownerAgentId === desk.ownerAgentId && isWalkable(nav, c.cell),
  );
  if (cadeira) return cadeira.cell;

  return seatCellFor(nav, desk.cell);
}

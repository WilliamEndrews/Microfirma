/**
 * VALIDACAO DE LAYOUT POR INVARIANTES
 *
 * Este arquivo e a razao pela qual podemos prometer "design nunca igual" sem
 * medo: a variacao e infinita, mas as invariantes sao absolutas. Se o solver
 * violar qualquer uma delas, e bug de codigo - localizavel, testavel e
 * corrigivel. Compare com a alternativa de pedir coordenadas para um LLM, onde
 * a falha e silenciosa, aleatoria e nao reproduzivel (ADR-0004).
 *
 * As invariantes tambem sao a base dos testes de propriedade: geramos centenas
 * de escritorios com seeds diferentes e exigimos zero violacoes.
 */

import type { Cell, OfficeLayout, Rect } from '@microfirma/contracts';
import { buildNavGrid, isWalkable, reachableFrom } from './navgrid.js';

export interface Violacao {
  regra: string;
  detalhe: string;
}

export function validarLayout(layout: OfficeLayout): Violacao[] {
  const v: Violacao[] = [];
  const { width: W, height: H } = layout.grid;

  // (1) Salas dentro dos limites internos do predio.
  for (const sala of layout.rooms) {
    const r = sala.rect;
    if (r.x0 < 1 || r.y0 < 1 || r.x1 > W - 1 || r.y1 > H - 1) {
      v.push({ regra: 'sala-dentro-do-predio', detalhe: `${sala.roomId} ${JSON.stringify(r)}` });
    }
    if (r.x1 - r.x0 < 3 || r.y1 - r.y0 < 3) {
      v.push({ regra: 'sala-utilizavel', detalhe: `${sala.roomId} pequena demais` });
    }
  }

  // (2) Nenhuma sobreposicao entre salas.
  for (let i = 0; i < layout.rooms.length; i++) {
    for (let j = i + 1; j < layout.rooms.length; j++) {
      const a = layout.rooms[i]!;
      const b = layout.rooms[j]!;
      if (intersecta(a.rect, b.rect)) {
        v.push({ regra: 'sem-sobreposicao', detalhe: `${a.roomId} x ${b.roomId}` });
      }
    }
  }

  const corredor = new Set(layout.corridors.map((c) => `${c.x},${c.y}`));

  // (3) Porta dentro da sala e encostada num corredor.
  for (const sala of layout.rooms) {
    if (!dentro(sala.door, sala.rect)) {
      v.push({ regra: 'porta-na-sala', detalhe: sala.roomId });
      continue;
    }
    const vizinhos: Cell[] = [
      { x: sala.door.x, y: sala.door.y - 1 },
      { x: sala.door.x, y: sala.door.y + 1 },
      { x: sala.door.x - 1, y: sala.door.y },
      { x: sala.door.x + 1, y: sala.door.y },
    ];
    if (!vizinhos.some((n) => corredor.has(`${n.x},${n.y}`))) {
      v.push({ regra: 'porta-encosta-no-corredor', detalhe: sala.roomId });
    }
  }

  // (4) Mobiliario dentro da propria sala, sem empilhamento e fora da porta.
  const celulasOcupadas = new Map<string, string>();
  for (const p of layout.props) {
    const sala = layout.rooms.find((s) => s.roomId === p.roomId);
    if (!sala) {
      v.push({ regra: 'prop-tem-sala', detalhe: p.propId });
      continue;
    }
    if (!dentro(p.cell, sala.rect)) {
      v.push({ regra: 'prop-dentro-da-sala', detalhe: `${p.propId} fora de ${sala.roomId}` });
    }
    if (p.cell.x === sala.door.x && p.cell.y === sala.door.y) {
      v.push({ regra: 'porta-desobstruida', detalhe: p.propId });
    }
    const k = `${p.cell.x},${p.cell.y}`;
    const anterior = celulasOcupadas.get(k);
    if (anterior) {
      v.push({ regra: 'sem-props-empilhados', detalhe: `${p.propId} sobre ${anterior}` });
    } else {
      celulasOcupadas.set(k, p.propId);
    }
  }

  // (5) Todo o corredor e um unico componente conexo (ninguem fica ilhado).
  if (layout.corridors.length > 0) {
    const nav = buildNavGrid(layout);
    const inicio = layout.corridors[0]!;
    const alcancaveis = reachableFrom(nav, inicio);
    const corredorInalcancavel = layout.corridors.filter(
      (c) => !alcancaveis.has(`${c.x},${c.y}`),
    );
    if (corredorInalcancavel.length > 0) {
      v.push({
        regra: 'corredor-conexo',
        detalhe: `${corredorInalcancavel.length} celula(s) de corredor isoladas`,
      });
    }

    // (6) Toda mesa tem ao menos uma celula caminhavel vizinha alcancavel a
    //     partir do corredor - ou seja, o agente consegue sentar. Sem isto,
    //     o pathfinding falharia em runtime, e o boneco ficaria travado.
    for (const mesa of layout.props.filter((p) => p.kind === 'desk')) {
      const assentos: Cell[] = [
        { x: mesa.cell.x, y: mesa.cell.y + 1 },
        { x: mesa.cell.x, y: mesa.cell.y - 1 },
        { x: mesa.cell.x - 1, y: mesa.cell.y },
        { x: mesa.cell.x + 1, y: mesa.cell.y },
      ];
      const ok = assentos.some(
        (c) => isWalkable(nav, c) && alcancaveis.has(`${c.x},${c.y}`),
      );
      if (!ok) v.push({ regra: 'mesa-acessivel', detalhe: mesa.propId });
    }
  }

  return v;
}

/** Lanca se houver qualquer violacao. Usado no pipeline de geracao e nos testes. */
export function assertLayoutValido(layout: OfficeLayout): void {
  const violacoes = validarLayout(layout);
  if (violacoes.length > 0) {
    const resumo = violacoes.map((x) => `  - ${x.regra}: ${x.detalhe}`).join('\n');
    throw new Error(
      `Layout invalido (seed ${layout.seed}), ${violacoes.length} violacao(oes):\n${resumo}`,
    );
  }
}

function intersecta(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function dentro(c: Cell, r: Rect): boolean {
  return c.x >= r.x0 && c.x < r.x1 && c.y >= r.y0 && c.y < r.y1;
}

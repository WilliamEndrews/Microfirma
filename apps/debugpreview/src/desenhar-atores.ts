/**
 * Camada dinamica: atores + overlay debug sobre o canvas estatico da agencia.
 */

import type { ActorState, Cell } from '@microfirma/contracts';
import type { CenarioEspacial } from './espaco-agencia';
import type { DebugSim } from './simulacao-agentes';
import { iso, type Pt } from './proto-blit/iso';

const CORES_AGENTE: Record<string, string> = {
  'agent-boss': '#e8a838',
  'agent-priv-0': '#5ec4e8',
  'agent-priv-1': '#9b7fe8',
  'agent-priv-2': '#e85e9b',
};

function corDoAgente(agentId: string): string {
  if (CORES_AGENTE[agentId]) return CORES_AGENTE[agentId]!;
  let h = 0;
  for (let i = 0; i < agentId.length; i++) h = (h * 31 + agentId.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 65% 55%)`;
}

function centroIso(origem: Pt, c: Cell): Pt {
  const p = iso(c.x + 0.5, c.y + 0.5);
  return { x: origem.x + p.x, y: origem.y + p.y };
}

export function desenharAtores(
  ctx: CanvasRenderingContext2D,
  origem: Pt,
  atores: readonly ActorState[],
  tMs: number,
): void {
  ctx.imageSmoothingEnabled = false;
  const bob = Math.sin(tMs * 0.012) * 2;

  for (const ator of atores) {
    const p = iso(ator.x + 0.5, ator.y + 0.5);
    const cx = origem.x + p.x;
    const cy = origem.y + p.y + (ator.activity === 'walking' ? bob : 0);
    const cor = corDoAgente(ator.agentId);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 6, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.arc(cx, cy - 4, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (ator.activity === 'working' && ator.progress > 0) {
      const w = 18;
      const h = 3;
      const x = cx - w / 2;
      const y = cy - 20;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(x, y, w * ator.progress, h);
    }

    if (ator.activity === 'resting') {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.arc(cx, cy - 4, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

export type OpcoesDebugOverlay = {
  cenario: CenarioEspacial;
  debug: DebugSim;
};

export function desenharDebugOverlay(
  ctx: CanvasRenderingContext2D,
  origem: Pt,
  opts: OpcoesDebugOverlay,
): void {
  const { cenario, debug } = opts;
  ctx.imageSmoothingEnabled = false;

  for (const c of cenario.layout.corridors) {
    const p = centroIso(origem, c);
    ctx.fillStyle = 'rgba(126, 200, 255, 0.15)';
    ctx.strokeStyle = 'rgba(126, 200, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 8);
    ctx.lineTo(p.x + 16, p.y);
    ctx.lineTo(p.x, p.y + 8);
    ctx.lineTo(p.x - 16, p.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  for (const agente of cenario.agentes) {
    const door = centroIso(origem, agente.door);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(door.x, door.y, 4, 0, Math.PI * 2);
    ctx.fill();

    if (agente.desk) {
      const desk = centroIso(origem, agente.desk.cell);
      ctx.fillStyle = '#a78bfa';
      ctx.fillRect(desk.x - 4, desk.y - 4, 8, 8);
    }

    if (agente.seat) {
      const seat = centroIso(origem, agente.seat);
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.arc(seat.x, seat.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (agente.seatFrac) {
      const sf = iso(agente.seatFrac.x + 0.5, agente.seatFrac.y + 0.5);
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(origem.x + sf.x, origem.y + sf.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const [agentId, path] of debug.paths) {
    if (path.length === 0) continue;
    const cor = corDoAgente(agentId);
    const pos = debug.posicoes.get(agentId);
    if (!pos) continue;
    ctx.strokeStyle = cor;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    const orig = centroIso(origem, { x: Math.round(pos.x), y: Math.round(pos.y) });
    ctx.moveTo(orig.x, orig.y);
    for (const c of path) {
      const p = centroIso(origem, c);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

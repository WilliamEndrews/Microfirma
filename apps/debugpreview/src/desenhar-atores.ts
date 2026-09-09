/**
 * Camada dinamica: atores + overlay debug sobre o canvas estatico da agencia.
 */

import type { ActorState, Cell } from '@microfirma/contracts';
import {
  dimensoesPersonagem,
  type PersonagemKit,
} from '@microfirma/iso-characters';
import type { CenarioEspacial } from './espaco-agencia';
import type { OclusaoCorredor, RetanguloTela } from './oclusao-parede';
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

/** Retangulo de tela que cobre sombra + sprite (com folga para o bob). */
function retanguloAtor(
  cx: number,
  cy: number,
  dimensoes: { largura: number; altura: number },
): RetanguloTela {
  return {
    x: Math.floor(cx - dimensoes.largura / 2) - 4,
    y: Math.floor(cy - dimensoes.altura) - 4,
    w: Math.ceil(dimensoes.largura) + 8,
    h: Math.ceil(dimensoes.altura) + 20,
  };
}

export function desenharAtores(
  ctx: CanvasRenderingContext2D,
  origem: Pt,
  atores: readonly (ActorState & { speech?: string })[],
  tMs: number,
  kit: PersonagemKit | null = null,
  oclusao: OclusaoCorredor | null = null,
): void {
  ctx.imageSmoothingEnabled = false;
  const bob = Math.sin(tMs * 0.012) * 2;
  const dimensoes = dimensoesPersonagem(kit?.escalaPadrao);

  const ordenados = [...atores].sort((a, b) => a.x + a.y - (b.x + b.y));

  for (const ator of ordenados) {
    const p = iso(ator.x + 0.5, ator.y + 0.5);
    const cx = origem.x + p.x;
    const cy = origem.y + p.y + (ator.activity === 'walking' ? bob : 0);

    let desenhado = false;

    // Sombra + corpo formam a silhueta que a parede pode recortar. Os HUDs
    // (halo, barra, balao) ficam fora: informacao de leitura nunca some.
    const corpo = (alvo: CanvasRenderingContext2D): void => {
      alvo.imageSmoothingEnabled = false;
      alvo.fillStyle = 'rgba(0,0,0,0.35)';
      alvo.beginPath();
      alvo.ellipse(cx, cy + 3, dimensoes.largura * 0.16, 4, 0, 0, Math.PI * 2);
      alvo.fill();

      if (ator.activity === 'resting') alvo.globalAlpha = 0.75;
      desenhado =
        kit?.desenhar(
          alvo,
          ator.agentId,
          ator.activity,
          ator.pose,
          ator.facing,
          tMs,
          cx,
          cy,
        ) ?? false;
      alvo.globalAlpha = 1;

      if (desenhado) return;

      if (ator.activity === 'resting') alvo.globalAlpha = 0.75;
      alvo.fillStyle = corDoAgente(ator.agentId);
      alvo.beginPath();
      alvo.arc(cx, cy - 4, 9, 0, Math.PI * 2);
      alvo.fill();
      alvo.globalAlpha = 1;
      alvo.strokeStyle =
        ator.activity === 'talking' || ator.activity === 'waiting_approval'
          ? 'rgba(255,255,255,0.95)'
          : 'rgba(255,255,255,0.5)';
      alvo.lineWidth =
        ator.activity === 'talking' || ator.activity === 'waiting_approval' ? 2 : 1;
      alvo.stroke();
    };

    if (oclusao?.noCorredor(ator.x, ator.y)) {
      oclusao.recortar(
        ctx,
        origem,
        ator.x + ator.y,
        retanguloAtor(cx, cy, dimensoes),
        dimensoes.largura / 2,
        corpo,
      );
    } else {
      corpo(ctx);
    }

    if (desenhado && (ator.activity === 'talking' || ator.activity === 'waiting_approval')) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy - dimensoes.altura * 0.55, 15, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (
      (ator.activity === 'working' || ator.activity === 'waiting_approval') &&
      ator.progress > 0
    ) {
      const w = 24;
      const h = 3;
      const x = cx - w / 2;
      const y = cy - dimensoes.altura - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = ator.activity === 'waiting_approval' ? '#fbbf24' : '#4ade80';
      ctx.fillRect(x, y, w * ator.progress, h);
    }

    if (ator.speech) {
      desenharBalao(ctx, cx, cy - dimensoes.altura - 10, ator.speech);
    }
  }
}

function desenharBalao(ctx: CanvasRenderingContext2D, cx: number, cy: number, texto: string): void {
  const maxChars = 28;
  const t = texto.length > maxChars ? texto.slice(0, maxChars - 1) + '…' : texto;
  ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
  const metrics = ctx.measureText(t);
  const padX = 6;
  const padY = 4;
  const tw = metrics.width;
  const th = 12;
  const bw = tw + padX * 2;
  const bh = th + padY * 2;
  const bx = Math.round(cx - bw / 2);
  const by = Math.round(cy - bh);

  ctx.fillStyle = 'rgba(8, 18, 32, 0.92)';
  ctx.strokeStyle = 'rgba(126, 200, 255, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 4);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - 4, by + bh);
  ctx.lineTo(cx, by + bh + 5);
  ctx.lineTo(cx + 4, by + bh);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#c8e4f5';
  ctx.textBaseline = 'middle';
  ctx.fillText(t, bx + padX, by + bh / 2);
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

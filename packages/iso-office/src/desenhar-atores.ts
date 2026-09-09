/**
 * Camada dinamica: atores Klimmos sobre o canvas estatico da agencia.
 * Sem overlay de lab (D/W) e sem dependencia da simulacao local.
 */

import type { ActorState } from '@microfirma/contracts';
import {
  dimensoesPersonagem,
  type PersonagemKit,
} from '@microfirma/iso-characters';
import type { OclusaoCorredor, RetanguloTela } from './oclusao-parede';
import { iso, type Pt } from './proto-blit/iso';

function corDoAgente(agentId: string): string {
  let h = 0;
  for (let i = 0; i < agentId.length; i++) h = (h * 31 + agentId.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 65% 55%)`;
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
      ctx.strokeStyle = 'rgba(40, 30, 20, 0.55)';
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
  const t = texto.length > maxChars ? texto.slice(0, maxChars - 1) + '...' : texto;
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  const metrics = ctx.measureText(t);
  const padX = 6;
  const padY = 4;
  const tw = metrics.width;
  const th = 12;
  const bw = tw + padX * 2;
  const bh = th + padY * 2;
  const bx = Math.round(cx - bw / 2);
  const by = Math.round(cy - bh);

  ctx.fillStyle = 'rgba(255, 252, 245, 0.94)';
  ctx.strokeStyle = 'rgba(80, 70, 55, 0.35)';
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

  ctx.fillStyle = '#3a3228';
  ctx.textBaseline = 'middle';
  ctx.fillText(t, bx + padX, by + bh / 2);
}

export function projetarAtorSentado(
  ator: ActorState,
  seatFrac?: { x: number; y: number; facing: 0 | 1 | 2 | 3 },
): ActorState {
  if (ator.pose !== 'seated' || !seatFrac) return ator;
  return { ...ator, x: seatFrac.x, y: seatFrac.y, facing: seatFrac.facing };
}

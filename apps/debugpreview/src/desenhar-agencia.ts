/**
 * Desenha a agencia: piso Concrete nas celulas de corredor + proto completo
 * em cada slot (mesmo blit do lab).
 */

import { gradeDoProto } from '@microfirma/world-engine';
import type { AgenciaMontada } from './montar-agencia';
import { CALIBRACAO_LAB } from './proto-blit/catalogo';
import { carregar } from './proto-blit/assets';
import { blitTile } from './proto-blit/blit';
import { desenharProtoEm } from './proto-blit/desenhar-proto';
import { ALTURA_TILE, DIR_TILES, boundsGrade, iso, type Pt } from './proto-blit/iso';

const PAD_X = 72;
const PAD_TOP = 140;
const PAD_BOTTOM = 64;

function origemDaAgencia(agencia: AgenciaMontada): { origem: Pt; width: number; height: number } {
  const { width: W, height: H } = agencia.grid;
  const { minX, minY, maxX, maxY } = boundsGrade(W, H);
  const width = Math.ceil(maxX - minX + PAD_X * 2);
  const height = Math.ceil(maxY - minY + PAD_TOP + PAD_BOTTOM);
  return {
    width,
    height,
    origem: {
      x: Math.round((width - (minX + maxX)) / 2),
      y: Math.round(PAD_TOP - minY),
    },
  };
}

export function medidaAgencia(agencia: AgenciaMontada): { width: number; height: number } {
  const { width, height } = origemDaAgencia(agencia);
  return { width, height };
}

function rotuloDoSlot(agenciaSlot: AgenciaMontada['slots'][number]): string {
  const tema = agenciaSlot.proto.tema;
  const grade = gradeDoProto(tema);
  const zona = agenciaSlot.proto.zonaKind === 'break' ? 'copa' : 'privativo';
  const pecas = (tema.palco ?? []).length;
  const prioridade = tema.prioridade;
  return `${tema.nome} · ${zona} · ${grade.w}x${grade.h} · P${prioridade} · ${pecas} pecas · ${tema.tilesetAtivo}`;
}

export async function desenharAgencia(
  ctx: CanvasRenderingContext2D,
  agencia: AgenciaMontada,
): Promise<{ width: number; height: number }> {
  const { origem, width, height } = origemDaAgencia(agencia);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);

  const ancoraPiso = CALIBRACAO_LAB.ancoraPiso ?? { x: 64, y: 68 };
  const pisoSrc = `${DIR_TILES}/Floor_128_${agencia.pisoCorredor}.png`;
  try {
    const piso = await carregar(pisoSrc);
    const celulas = [...agencia.corridors].sort((a, b) => a.x + a.y - (b.x + b.y));
    for (const c of celulas) blitTile(ctx, piso, origem, c.x, c.y, ancoraPiso);
  } catch {
    /* png ausente */
  }

  const slots = [...agencia.slots].sort(
    (a, b) => a.rect.x0 + a.rect.y0 - (b.rect.x0 + b.rect.y0),
  );
  for (const slot of slots) {
    const base = iso(slot.rect.x0, slot.rect.y0);
    const origemSala: Pt = { x: origem.x + base.x, y: origem.y + base.y };
    await desenharProtoEm(ctx, slot.proto.tema, origemSala);
  }

  ctx.fillStyle = 'rgba(126, 200, 255, 0.9)';
  ctx.font = '11px "IBM Plex Mono", ui-monospace, monospace';
  for (const slot of slots) {
    const cx = (slot.rect.x0 + slot.rect.x1) / 2;
    const cy = slot.rect.y0;
    const p = iso(cx, cy);
    ctx.fillText(rotuloDoSlot(slot), origem.x + p.x - 40, origem.y + p.y - ALTURA_TILE);
  }

  return { width, height };
}

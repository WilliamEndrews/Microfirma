/**
 * RENDERIZADOR DO ESCRITORIO (Canvas 2D + Sprites) - FASE 2
 *
 * Papel deste arquivo: desenhar um quadro de mundo. Nada mais.
 * Ele NAO simula, NAO decide, NAO guarda regra de negocio. Recebe
 * `WorldSnapshot`/`WorldDelta` e pinta. Essa fronteira e o que permite mover a
 * simulacao para o servidor sem tocar uma linha de render (ADR-0006).
 *
 * FASE 2 - MELHORIAS (ADR-0008):
 *   - Sprites pre-renderizados substituem vetores em todos os slots de
 *     mobiliario e atores. Gradientes, sombras suaves, highlights de borda
 *     e ambient occlusion - calculados uma vez, gratis em runtime.
 *   - Theme-aware: cores derivadas do tema do layout, nao de constantes.
 *   - Camera: zoom (wheel), pan (drag), seguir agente (click), reset (duplo-click).
 *
 * Projecao: dimetrica 2:1 (a mesma de Stardew/Gather e de Age of Empires II).
 */

import type { OfficeLayout, WorldDelta, WorldSnapshot } from '@microfirma/contracts';
import { resolverPaleta, type PaletaResolvida } from '@microfirma/world-engine';
import {
  criarFabrica,
  desenharSpriteProp,
  desenharSpriteAtor,
  obterSpriteProp,
  obterSpriteAtor,
  type SpriteCache,
} from './sprite-factory';

const LARGURA_TILE = 44;
const ALTURA_TILE = 22;

export interface RendererHandle {
  /** Entrega um quadro para desenho. Chamada a 10 Hz pelo laco de simulacao. */
  push(frame: WorldSnapshot | WorldDelta): void;
  /** Destaca um agente (selecionado no painel lateral). */
  select(agentId: string | null): void;
  /** Foca a camera num agente (segue seu movimento). */
  focusAgent(agentId: string | null): void;
  /** Reset da camera (zoom e pan). */
  resetCamera(): void;
  destroy(): void;
}

interface Extensao {
  minX: number;
  minY: number;
  largura: number;
  altura: number;
}

interface Camera {
  zoom: number;
  panX: number;
  panY: number;
  seguirAgente: string | null;
}

export async function criarRenderer(
  canvas: HTMLCanvasElement,
  layout: OfficeLayout,
): Promise<RendererHandle> {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D indisponivel neste ambiente.');

  const palco = canvas.parentElement ?? canvas;
  const ext = extensaoDoMundo(layout);
  const paleta = resolverPaleta(layout.theme);
  const sprites = criarFabrica(paleta);

  let estatico: HTMLCanvasElement | null = null;
  let escalaDoEstatico = 0;

  const camera: Camera = { zoom: 1, panX: 0, panY: 0, seguirAgente: null };

  let escalaBase = 1;
  let deslocX = 0;
  let deslocY = 0;
  let dpr = 1;

  let quadro: WorldSnapshot | WorldDelta | null = null;
  let selecionado: string | null = null;
  let fase = 0;
  let ultimoMs = performance.now();
  let vivo = true;
  let raf = 0;

  let arrastando = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragPanStartX = 0;
  let dragPanStartY = 0;

  const ajustar = (): void => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const larguraCss = Math.max(1, palco.clientWidth);
    const alturaCss = Math.max(1, palco.clientHeight);

    canvas.width = Math.round(larguraCss * dpr);
    canvas.height = Math.round(alturaCss * dpr);

    escalaBase = Math.min(larguraCss / ext.largura, alturaCss / ext.altura) * 0.94;
    deslocX = (larguraCss - ext.largura * escalaBase) / 2 - ext.minX * escalaBase;
    deslocY = (alturaCss - ext.altura * escalaBase) / 2 - ext.minY * escalaBase;

    const ef = escalaBase * camera.zoom;
    if (ef !== escalaDoEstatico) {
      estatico = construirEstatico(layout, ext, ef * dpr, paleta, sprites);
      escalaDoEstatico = ef;
    }
  };

  ajustar();
  const observador = new ResizeObserver(ajustar);
  observador.observe(palco);

  // --- Eventos de camera ---
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const fator = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const novoZoom = Math.max(0.4, Math.min(4, camera.zoom * fator));
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const ea = escalaBase * camera.zoom;
    const ed = escalaBase * novoZoom;
    const wx = (cx - deslocX - camera.panX) / ea;
    const wy = (cy - deslocY - camera.panY) / ea;
    camera.panX = cx - deslocX - wx * ed;
    camera.panY = cy - deslocY - wy * ed;
    camera.zoom = novoZoom;
    if (Math.abs(ed - escalaDoEstatico) > 0.5) {
      estatico = construirEstatico(layout, ext, ed * dpr, paleta, sprites);
      escalaDoEstatico = ed;
    }
  };

  const onPointerDown = (e: PointerEvent): void => {
    arrastando = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragPanStartX = camera.panX;
    dragPanStartY = camera.panY;
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!arrastando) return;
    camera.panX = dragPanStartX + (e.clientX - dragStartX);
    camera.panY = dragPanStartY + (e.clientY - dragStartY);
    camera.seguirAgente = null;
  };

  const onPointerUp = (e: PointerEvent): void => {
    arrastando = false;
    canvas.releasePointerCapture(e.pointerId);
  };

  const onDoubleClick = (): void => {
    camera.zoom = 1;
    camera.panX = 0;
    camera.panY = 0;
    camera.seguirAgente = null;
    ajustar();
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('dblclick', onDoubleClick);

  const laco = (agora: number): void => {
    if (!vivo) return;
    fase += Math.min(64, agora - ultimoMs) / 1000;
    ultimoMs = agora;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = cor(paleta.fundo);
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const escalaEfetiva = escalaBase * camera.zoom;
    const panEfetivoX = deslocX + camera.panX;
    const panEfetivoY = deslocY + camera.panY;

    if (camera.seguirAgente && quadro) {
      const ator = quadro.actors.find((a) => a.agentId === camera.seguirAgente);
      if (ator) {
        const pos = iso(ator.x + 0.5, ator.y + 0.5);
        const alvoX = canvas.width / dpr / 2 - pos.x * escalaEfetiva;
        const alvoY = canvas.height / dpr / 2 - pos.y * escalaEfetiva;
        camera.panX += (alvoX - deslocX - camera.panX) * 0.08;
        camera.panY += (alvoY - deslocY - camera.panY) * 0.08;
      }
    }

    if (estatico) {
      ctx.drawImage(
        estatico,
        Math.round((panEfetivoX + ext.minX * escalaEfetiva) * dpr),
        Math.round((panEfetivoY + ext.minY * escalaEfetiva) * dpr),
      );
    }

    if (quadro) {
      ctx.setTransform(escalaEfetiva * dpr, 0, 0, escalaEfetiva * dpr, panEfetivoX * dpr, panEfetivoY * dpr);
      desenharPenumbra(ctx, layout, quadro, fase, paleta);
      desenharAmbiente(ctx, layout, quadro, fase, paleta);
      desenharAtores(ctx, quadro, selecionado, fase, paleta, sprites);
    }

    raf = requestAnimationFrame(laco);
  };
  raf = requestAnimationFrame(laco);

  return {
    push: (f) => { quadro = f; },
    select: (id) => { selecionado = id; },
    focusAgent: (id) => { camera.seguirAgente = id; },
    resetCamera: () => {
      camera.zoom = 1;
      camera.panX = 0;
      camera.panY = 0;
      camera.seguirAgente = null;
      ajustar();
    },
    destroy: () => {
      vivo = false;
      cancelAnimationFrame(raf);
      observador.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('dblclick', onDoubleClick);
    },
  };
}

// ---------------------------------------------------------------------------
// Projecao
// ---------------------------------------------------------------------------

function iso(gx: number, gy: number): { x: number; y: number } {
  return { x: ((gx - gy) * LARGURA_TILE) / 2, y: ((gx + gy) * ALTURA_TILE) / 2 };
}

function losango(gx: number, gy: number, recuo = 0) {
  const a = recuo;
  const b = 1 - recuo;
  return [iso(gx + a, gy + a), iso(gx + b, gy + a), iso(gx + b, gy + b), iso(gx + a, gy + b)];
}

function extensaoDoMundo(layout: OfficeLayout): Extensao {
  const { width: w, height: h } = layout.grid;
  return {
    minX: (-h * LARGURA_TILE) / 2,
    minY: 0,
    largura: ((w + h) * LARGURA_TILE) / 2,
    altura: ((w + h) * ALTURA_TILE) / 2,
  };
}

function caminho(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
}

function cantosDaSala(rect: { x0: number; y0: number; x1: number; y1: number }) {
  return [iso(rect.x0, rect.y0), iso(rect.x1, rect.y0), iso(rect.x1, rect.y1), iso(rect.x0, rect.y1)];
}

// ---------------------------------------------------------------------------
// Camada estatica: piso + paredes + mobiliario (sprites)
// ---------------------------------------------------------------------------

const ALTURA_PAREDE = 30;

function construirEstatico(
  layout: OfficeLayout,
  ext: Extensao,
  escalaFisica: number,
  paleta: PaletaResolvida,
  sprites: SpriteCache,
): HTMLCanvasElement {
  const alvo = document.createElement('canvas');
  alvo.width = Math.max(1, Math.ceil(ext.largura * escalaFisica));
  alvo.height = Math.max(1, Math.ceil(ext.altura * escalaFisica));
  const g = alvo.getContext('2d');
  if (!g) return alvo;
  g.setTransform(escalaFisica, 0, 0, escalaFisica, -ext.minX * escalaFisica, -ext.minY * escalaFisica);
  desenharPiso(g, layout, paleta);
  desenharCenarioEstatico(g, layout, paleta, sprites);
  return alvo;
}

function desenharPiso(ctx: CanvasRenderingContext2D, layout: OfficeLayout, paleta: PaletaResolvida): void {
  for (const c of layout.corridors) {
    caminho(ctx, losango(c.x, c.y));
    ctx.fillStyle = cor(paleta.corredor);
    ctx.fill();
  }
  for (const sala of layout.rooms) {
    const base = paleta.piso[sala.kind] ?? paleta.piso.open!;
    for (let y = sala.rect.y0; y < sala.rect.y1; y++) {
      for (let x = sala.rect.x0; x < sala.rect.x1; x++) {
        caminho(ctx, losango(x, y));
        const variacao = ((x * 7 + y * 13) % 5) * 0x010101;
        ctx.fillStyle = cor(base - variacao);
        ctx.fill();
      }
    }
    caminho(ctx, cantosDaSala(sala.rect));
    ctx.strokeStyle = cor(paleta.rodape, 0.85);
    ctx.lineWidth = 2;
    ctx.stroke();
    caminho(ctx, losango(sala.door.x, sala.door.y, 0.22));
    ctx.fillStyle = cor(0xffffff, 0.55);
    ctx.fill();
  }
}

function desenharCenarioEstatico(
  ctx: CanvasRenderingContext2D,
  layout: OfficeLayout,
  paleta: PaletaResolvida,
  sprites: SpriteCache,
): void {
  interface Item { depth: number; draw: () => void; }
  const itens: Item[] = [];

  for (const sala of layout.rooms) {
    const { x0, y0, x1, y1 } = sala.rect;
    for (let x = x0; x < x1; x++) {
      if (x === sala.door.x && y0 === sala.door.y) continue;
      itens.push({ depth: x + y0 - 0.5, draw: () => segmentoParede(ctx, iso(x, y0), iso(x + 1, y0), ALTURA_PAREDE, paleta.parede) });
    }
    for (let y = y0; y < y1; y++) {
      if (x0 === sala.door.x && y === sala.door.y) continue;
      itens.push({ depth: x0 + y - 0.5, draw: () => segmentoParede(ctx, iso(x0, y), iso(x0, y + 1), ALTURA_PAREDE, paleta.parede) });
    }
  }

  const { width: W, height: H } = layout.grid;
  for (let x = 0; x < W; x++) itens.push({ depth: x - 0.5, draw: () => segmentoParede(ctx, iso(x, 0), iso(x + 1, 0), ALTURA_PAREDE, paleta.parede) });
  for (let y = 0; y < H; y++) itens.push({ depth: y - 0.5, draw: () => segmentoParede(ctx, iso(0, y), iso(0, y + 1), ALTURA_PAREDE, paleta.parede) });

  const props = [...layout.props].sort((a, b) => a.cell.x + a.cell.y - (b.cell.x + b.cell.y));
  for (const p of props) {
    itens.push({
      depth: p.cell.x + p.cell.y,
      draw: () => {
        const kind = p.kind as 'desk' | 'sofa' | 'board' | 'printer' | 'meter' | 'coffee' | 'plant' | 'lamp';
        if (kind === 'lamp') return;
        desenharSpriteProp(ctx, obterSpriteProp(sprites, kind), p.cell.x, p.cell.y);
      },
    });
  }

  itens.sort((a, b) => a.depth - b.depth);
  for (const item of itens) item.draw();
}

function segmentoParede(
  ctx: CanvasRenderingContext2D,
  pA: { x: number; y: number },
  pB: { x: number; y: number },
  altura: number,
  corFace: number,
): void {
  const topoA = { x: pA.x, y: pA.y - altura };
  const topoB = { x: pB.x, y: pB.y - altura };
  const grad = ctx.createLinearGradient(pA.x, pA.y, topoA.x, topoA.y);
  grad.addColorStop(0, cor(escurecer(corFace, 0.85)));
  grad.addColorStop(1, cor(corFace));
  caminho(ctx, [pA, pB, topoB, topoA]);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = cor(escurecer(corFace, 0.8), 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(topoA.x, topoA.y);
  ctx.lineTo(topoB.x, topoB.y);
  ctx.strokeStyle = cor(0xffffff, 0.3);
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Camadas dinamicas
// ---------------------------------------------------------------------------

const PENUMBRA_NORMAL = 0.1;

function desenharPenumbra(
  ctx: CanvasRenderingContext2D,
  layout: OfficeLayout,
  quadro: WorldSnapshot | WorldDelta,
  fase: number,
  paleta: PaletaResolvida,
): void {
  const estados = new Map(quadro.rooms.map((r) => [r.roomId, r]));
  for (const sala of layout.rooms) {
    if (!estados.get(sala.roomId)?.lightBroken) {
      caminho(ctx, cantosDaSala(sala.rect));
      ctx.fillStyle = cor(paleta.penumbra, PENUMBRA_NORMAL);
      ctx.fill();
      continue;
    }
    const h = hashTexto(sala.roomId);
    const periodo = 2.4 + pseudoAleatorio(h, 1) * 1.8;
    const defasagem = pseudoAleatorio(h, 2) * periodo;
    const cicloId = Math.floor((fase + defasagem) / periodo);
    const piscaNesteCiclo = pseudoAleatorio(cicloId, h) > 0.55;
    let escuridao = 0.62;
    if (piscaNesteCiclo) {
      const t = ((fase + defasagem) % periodo) / periodo;
      if (t < 0.12) {
        const envelope = Math.sin((t / 0.12) * Math.PI);
        escuridao -= 0.4 * envelope;
      }
    }
    caminho(ctx, cantosDaSala(sala.rect));
    ctx.fillStyle = cor(paleta.penumbra, escuridao);
    ctx.fill();
  }
}

function hashTexto(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return h;
}

function halo(ctx: CanvasRenderingContext2D, x: number, y: number, raio: number, matiz: number, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, raio);
  g.addColorStop(0, cor(matiz, alpha));
  g.addColorStop(0.55, cor(matiz, alpha * 0.42));
  g.addColorStop(1, cor(matiz, 0));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, (ALTURA_TILE / LARGURA_TILE) * 2);
  ctx.translate(-x, -y);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, raio, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function desenharAmbiente(
  ctx: CanvasRenderingContext2D,
  layout: OfficeLayout,
  quadro: WorldSnapshot | WorldDelta,
  fase: number,
  paleta: PaletaResolvida,
): void {
  const propPorId = new Map(layout.props.map((p) => [p.propId, p]));
  for (const mesa of quadro.desks) {
    const prop = propPorId.get(mesa.propId);
    if (!prop) continue;
    const c = iso(prop.cell.x + 0.5, prop.cell.y + 0.5);
    if (mesa.heat > 0.05) {
      const pulso = 0.75 + 0.25 * Math.sin(fase * 4);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      halo(ctx, c.x, c.y - 6, 34 + mesa.heat * 26, 0xff7a45, 0.4 * mesa.heat * pulso);
      ctx.restore();
    }
    for (let i = 0; i < mesa.queuePile; i++) {
      const topo = c.y - 14 - i * 2.1;
      ctx.beginPath();
      ctx.rect(c.x - 9, topo, 18, 2);
      ctx.fillStyle = cor(0xfdfdfd, 0.95);
      ctx.fill();
      ctx.strokeStyle = cor(0xc9c4bb, 1);
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    for (let i = 0; i < mesa.litter; i++) {
      const ang = (i / Math.max(1, mesa.litter)) * Math.PI * 2;
      disco(ctx, c.x + Math.cos(ang) * 16, c.y + 6 + Math.sin(ang) * 8, 3, 0x9aa0a6, 0.85);
    }
  }
  for (const sala of quadro.rooms) {
    if (sala.incident < 0.35) continue;
    const geo = layout.rooms.find((r) => r.roomId === sala.roomId);
    if (!geo) continue;
    const c = iso((geo.rect.x0 + geo.rect.x1) / 2, (geo.rect.y0 + geo.rect.y1) / 2);
    for (let i = 0; i < 4; i++) {
      const t = (fase * 0.6 + i * 0.25) % 1;
      disco(ctx, c.x + Math.sin((fase + i) * 1.7) * 10, c.y - 20 - t * 60, 8 + t * 16, 0x6b7280, (1 - t) * 0.28 * sala.incident);
    }
  }
}

function desenharAtores(
  ctx: CanvasRenderingContext2D,
  quadro: WorldSnapshot | WorldDelta,
  selecionado: string | null,
  fase: number,
  paleta: PaletaResolvida,
  sprites: SpriteCache,
): void {
  const ordenados = [...quadro.actors].sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const ator of ordenados) {
    const c = iso(ator.x + 0.5, ator.y + 0.5);
    const base = corDoAtor(ator.agentId, ator.isInternal, paleta);
    const bob = ator.activity === 'walking' ? Math.abs(Math.sin(fase * 8)) * 2.5 : Math.sin(fase * 2) * 0.8;

    elipse(ctx, c.x, c.y + 2, 9, 4.5, cor(0x000000, 0.18));

    if (selecionado === ator.agentId) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 2, 15, 7.5, 0, 0, Math.PI * 2);
      ctx.strokeStyle = cor(0x1f2937, 0.8);
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const sprite = obterSpriteAtor(sprites, base, ator.isInternal);
    desenharSpriteAtor(ctx, sprite, c.x, c.y, bob);

    if (ator.health !== 'healthy') {
      ctx.beginPath();
      ctx.rect(c.x - 7, c.y - 14 - bob, 14, 3);
      ctx.fillStyle = cor(ator.health === 'failing' ? paleta.perigo : 0xe0a03f);
      ctx.fill();
    }

    if (ator.activity === 'working' && ator.progress > 0) {
      ctx.beginPath();
      ctx.rect(c.x - 10, c.y - 38 - bob, 20, 3.5);
      ctx.fillStyle = cor(0x000000, 0.18);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(c.x - 10, c.y - 38 - bob, 20 * ator.progress, 3.5);
      ctx.fillStyle = cor(0x3f8f52);
      ctx.fill();
    }

    if (ator.activity === 'waiting_approval') {
      const pulso = 0.6 + 0.4 * Math.sin(fase * 5);
      disco(ctx, c.x, c.y - 46 - bob, 8, 0xffffff, 0.95);
      ctx.beginPath();
      ctx.arc(c.x, c.y - 46 - bob, 8, 0, Math.PI * 2);
      ctx.strokeStyle = cor(paleta.perigo, pulso);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(c.x - 1, c.y - 50 - bob, 2, 5);
      ctx.fillStyle = cor(paleta.perigo);
      ctx.fill();
      disco(ctx, c.x, c.y - 43 - bob, 1.2, paleta.perigo);
    }

    if (ator.activity === 'sweeping') {
      ctx.beginPath();
      ctx.rect(c.x + 8, c.y - 20 - bob, 2, 18);
      ctx.fillStyle = cor(0x8d6e63);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(c.x + 4, c.y - 4 - bob, 10, 3);
      ctx.fillStyle = cor(0xd9a86c);
      ctx.fill();
    }
    if (ator.activity === 'repairing') {
      ctx.beginPath();
      ctx.rect(c.x + 8, c.y - 18 - bob, 2, 10);
      ctx.fillStyle = cor(0x9aa0a6);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      halo(ctx, c.x, c.y - 24, 26, 0xfff3d6, 0.35);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// utilitarios
// ---------------------------------------------------------------------------

function disco(ctx: CanvasRenderingContext2D, x: number, y: number, raio: number, matiz: number, alpha = 1): void {
  ctx.beginPath();
  ctx.arc(x, y, raio, 0, Math.PI * 2);
  ctx.fillStyle = cor(matiz, alpha);
  ctx.fill();
}

function elipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, estilo: string): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = estilo;
  ctx.fill();
}

function cor(matiz: number, alpha = 1): string {
  const v = Math.max(0, Math.min(0xffffff, Math.round(matiz)));
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

function pseudoAleatorio(a: number, b: number): number {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function corDoAtor(agentId: string, interno: boolean, paleta: PaletaResolvida): number {
  if (interno) return agentId.includes('zelador') ? paleta.internoZelador : paleta.internoTecnico;
  let h = 0;
  for (let i = 0; i < agentId.length; i++) h = (h * 31 + agentId.charCodeAt(i)) >>> 0;
  return paleta.ator[h % paleta.ator.length] as number;
}

function escurecer(matiz: number, fator: number): number {
  const r = Math.floor(((matiz >> 16) & 0xff) * fator);
  const g = Math.floor(((matiz >> 8) & 0xff) * fator);
  const b = Math.floor((matiz & 0xff) * fator);
  return (r << 16) | (g << 8) | b;
}

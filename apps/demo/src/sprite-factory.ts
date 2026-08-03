/**
 * FABRICA DE SPRITES ISOMETRICOS (ADR-0008)
 *
 * Pre-renderiza cada tipo de mobiliario e cada aparencia de ator para um
 * canvas offscreen. O renderer entao usa drawImage() em vez de comandos
 * vetoriais a cada quadro.
 *
 * Vantagens:
 *   - Qualidade visual: gradientes, sombras suaves, highlights de borda,
 *     ambient occlusion - tudo calculado uma vez, gratis em runtime.
 *   - Performance: drawImage() de um canvas offscreen e mais rapido que
 *     reconstruir paths vetoriais a 60fps.
 *   - Escala: sprites renderizados a 2x ficam crisp em qualquer zoom.
 *
 * A fabrica e theme-aware: as cores vem da PaletaResolvida, nao de constantes
 * hardcoded. Trocar de tema = regenerar sprites, nao reescrever o renderer.
 */

import type { PaletaResolvida } from '@microfirma/world-engine';

const LARGURA_TILE = 44;
const ALTURA_TILE = 22;
const SUPER = 2; // supersampling para crisp em qualquer zoom

type PropKind = 'desk' | 'sofa' | 'board' | 'printer' | 'meter' | 'coffee' | 'plant' | 'lamp';

export interface SpriteCache {
  props: Map<PropKind, HTMLCanvasElement>;
  actors: Map<number, HTMLCanvasElement>; // key: corDoAtor
  internals: Map<number, HTMLCanvasElement>; // key: corDoInterno
}

/**
 * Cria a fabrica de sprites para uma paleta. Todos os sprites sao renderizados
 * a 2x e cacheados. A fabrica e leve: ~20 sprites no total.
 */
export function criarFabrica(paleta: PaletaResolvida): SpriteCache {
  const props = new Map<PropKind, HTMLCanvasElement>();
  const actors = new Map<number, HTMLCanvasElement>();
  const internals = new Map<number, HTMLCanvasElement>();

  // Props
  for (const kind of ['desk', 'sofa', 'board', 'printer', 'meter', 'coffee', 'plant'] as PropKind[]) {
    props.set(kind, renderizarProp(kind, paleta));
  }
  // lamp: sprite invisivel (a luz e desenhada na camada aditiva)
  props.set('lamp', renderizarLamp(paleta));

  // Atores: uma sprite por cor de corpo
  for (const c of paleta.ator) {
    actors.set(c, renderizarAtor(c, false, paleta));
  }
  internals.set(paleta.internoZelador, renderizarAtor(paleta.internoZelador, true, paleta));
  internals.set(paleta.internoTecnico, renderizarAtor(paleta.internoTecnico, true, paleta));

  return { props, actors, internals };
}

// ---------------------------------------------------------------------------
// Projecao (espelhada do renderer para manter consistencia)
// ---------------------------------------------------------------------------

function iso(gx: number, gy: number): { x: number; y: number } {
  return { x: ((gx - gy) * LARGURA_TILE) / 2, y: ((gx + gy) * ALTURA_TILE) / 2 };
}

function losango(gx: number, gy: number, recuo = 0) {
  const a = recuo;
  const b = 1 - recuo;
  return [iso(gx + a, gy + a), iso(gx + b, gy + a), iso(gx + b, gy + b), iso(gx + a, gy + b)];
}

// ---------------------------------------------------------------------------
// Utilitarios de cor
// ---------------------------------------------------------------------------

function corStr(matiz: number, alpha = 1): string {
  const v = Math.max(0, Math.min(0xffffff, Math.round(matiz)));
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

function escurecer(matiz: number, fator: number): number {
  const r = Math.floor(((matiz >> 16) & 0xff) * fator);
  const g = Math.floor(((matiz >> 8) & 0xff) * fator);
  const b = Math.floor((matiz & 0xff) * fator);
  return (r << 16) | (g << 8) | b;
}

function clarear(matiz: number, fator: number): number {
  const r = Math.min(255, Math.floor(((matiz >> 16) & 0xff) + (255 - ((matiz >> 16) & 0xff)) * fator));
  const g = Math.min(255, Math.floor(((matiz >> 8) & 0xff) + (255 - ((matiz >> 8) & 0xff)) * fator));
  const b = Math.min(255, Math.floor((matiz & 0xff) + (255 - (matiz & 0xff)) * fator));
  return (r << 16) | (g << 8) | b;
}

// ---------------------------------------------------------------------------
// Canvas helper
// ---------------------------------------------------------------------------

function criarCanvas(largura: number, altura: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(largura * SUPER);
  canvas.height = Math.ceil(altura * SUPER);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SUPER, SUPER);
  return { canvas, ctx };
}

function path(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Caixa isometrica 3D-like com gradientes
// ---------------------------------------------------------------------------

function caixaIso3D(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  altura: number,
  corTopo: number,
  corLado: number,
  recuo: number,
): void {
  const base = losango(gx, gy, recuo);
  const topo = base.map((p) => ({ x: p.x, y: p.y - altura }));

  // Sombra de contato suave (blur)
  ctx.save();
  ctx.filter = 'blur(3px)';
  path(ctx, base);
  ctx.fillStyle = corStr(0x000000, 0.15);
  ctx.fill();
  ctx.restore();

  // Lateral esquerda (mais clara - recebe luz)
  const gradEsq = ctx.createLinearGradient(base[3]!.x, base[3]!.y, topo[3]!.x, topo[3]!.y);
  gradEsq.addColorStop(0, corStr(escurecer(corLado, 0.85)));
  gradEsq.addColorStop(1, corStr(corLado));
  path(ctx, [base[3]!, base[2]!, topo[2]!, topo[3]!]);
  ctx.fillStyle = gradEsq;
  ctx.fill();

  // Lateral direita (mais escura - sombra)
  const gradDir = ctx.createLinearGradient(base[2]!.x, base[2]!.y, topo[2]!.x, topo[2]!.y);
  gradDir.addColorStop(0, corStr(escurecer(corLado, 0.7)));
  gradDir.addColorStop(1, corStr(escurecer(corLado, 0.88)));
  path(ctx, [base[2]!, base[1]!, topo[1]!, topo[2]!]);
  ctx.fillStyle = gradDir;
  ctx.fill();

  // Topo: gradiente radial para simular luz incidindo do topo-esquerda
  const cx = (topo[0]!.x + topo[2]!.x) / 2;
  const cy = (topo[0]!.y + topo[2]!.y) / 2;
  const raio = Math.hypot(topo[0]!.x - topo[2]!.x, topo[0]!.y - topo[2]!.y) / 2;
  const gradTopo = ctx.createRadialGradient(cx - raio * 0.3, cy - raio * 0.2, 0, cx, cy, raio);
  gradTopo.addColorStop(0, corStr(clarear(corTopo, 0.12)));
  gradTopo.addColorStop(0.6, corStr(corTopo));
  gradTopo.addColorStop(1, corStr(escurecer(corTopo, 0.92)));
  path(ctx, topo);
  ctx.fillStyle = gradTopo;
  ctx.fill();

  // Highlight de borda no topo (friso claro)
  ctx.beginPath();
  ctx.moveTo(topo[0]!.x, topo[0]!.y);
  ctx.lineTo(topo[1]!.x, topo[1]!.y);
  ctx.strokeStyle = corStr(clarear(corTopo, 0.3), 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Ambient occlusion na base (escurecimento onde objeto encontra o piso)
  ctx.beginPath();
  ctx.moveTo(base[3]!.x, base[3]!.y);
  ctx.lineTo(base[2]!.x, base[2]!.y);
  ctx.lineTo(base[1]!.x, base[1]!.y);
  ctx.strokeStyle = corStr(0x000000, 0.2);
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Renderizacao de cada tipo de prop
// ---------------------------------------------------------------------------

function renderizarProp(kind: PropKind, paleta: PaletaResolvida): HTMLCanvasElement {
  // Caixa envolvente generosa: tile + altura maxima + margem para sombra
  const w = LARGURA_TILE + 20;
  const h = ALTURA_TILE + 50;
  const { canvas, ctx } = criarCanvas(w, h);

  // Centralizar o tile no canvas
  const ox = w / 2 - LARGURA_TILE / 2;
  const oy = h / 2 - ALTURA_TILE / 2;
  ctx.translate(ox, oy);

  switch (kind) {
    case 'desk':
      caixaIso3D(ctx, 0, 0, 10, paleta.mesaTopo, paleta.mesaLado, 0.12);
      // Monitor sobre a mesa (retangulo escuro com brilho)
      const mc = iso(0.5, 0.5);
      ctx.fillStyle = corStr(0x1a1a2e, 0.9);
      ctx.fillRect(mc.x - 7, mc.y - 18, 14, 9);
      ctx.fillStyle = corStr(0x4a6cf7, 0.15);
      ctx.fillRect(mc.x - 6, mc.y - 17, 12, 7);
      // Pe do monitor
      ctx.fillStyle = corStr(0x333333);
      ctx.fillRect(mc.x - 1, mc.y - 9, 2, 3);
      break;

    case 'sofa':
      caixaIso3D(ctx, 0, 0, 8, paleta.sofa, escurecer(paleta.sofa, 0.8), 0.1);
      // Encosto (caixa menor sobre a sofa)
      const sc = iso(0.3, 0.3);
      ctx.fillStyle = corStr(escurecer(paleta.sofa, 0.85), 0.9);
      ctx.beginPath();
      ctx.roundRect(sc.x - 12, sc.y - 14, 24, 6, 3);
      ctx.fill();
      // Almofadas
      ctx.fillStyle = corStr(clarear(paleta.sofa, 0.1), 0.7);
      ctx.beginPath();
      ctx.ellipse(sc.x - 6, sc.y - 6, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sc.x + 6, sc.y - 6, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'board':
      caixaIso3D(ctx, 0, 0, 16, paleta.quadro, escurecer(paleta.quadro, 0.85), 0.22);
      // Superficie do quadro (area escura reflexiva)
      const bc = iso(0.5, 0.5);
      const gradBoard = ctx.createLinearGradient(bc.x - 10, bc.y - 22, bc.x + 10, bc.y - 6);
      gradBoard.addColorStop(0, corStr(0x1a2332, 0.85));
      gradBoard.addColorStop(0.5, corStr(0x2a3a4a, 0.7));
      gradBoard.addColorStop(1, corStr(0x1a2332, 0.85));
      ctx.fillStyle = gradBoard;
      ctx.fillRect(bc.x - 10, bc.y - 22, 20, 14);
      // Brilho do quadro
      ctx.fillStyle = corStr(0x4a6cf7, 0.08);
      ctx.fillRect(bc.x - 9, bc.y - 21, 18, 12);
      break;

    case 'printer':
      caixaIso3D(ctx, 0, 0, 9, 0xd7dbe0, 0xa8aeb6, 0.24);
      // Slot de papel (fenda escura)
      const pc = iso(0.5, 0.5);
      ctx.fillStyle = corStr(0x444444);
      ctx.fillRect(pc.x - 8, pc.y - 12, 16, 2);
      // LED de status
      ctx.beginPath();
      ctx.arc(pc.x + 6, pc.y - 14, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = corStr(0x3f8f52);
      ctx.fill();
      break;

    case 'meter':
      caixaIso3D(ctx, 0, 0, 18, 0xdfe4ea, 0xa8b0ba, 0.28);
      // Display do medidor
      const mtc = iso(0.5, 0.5);
      ctx.fillStyle = corStr(0x0a0a0a);
      ctx.fillRect(mtc.x - 7, mtc.y - 22, 14, 8);
      // Numeros no display
      ctx.fillStyle = corStr(0x00ff88, 0.8);
      ctx.font = '5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('8.7', mtc.x, mtc.y - 16);
      break;

    case 'coffee':
      caixaIso3D(ctx, 0, 0, 7, 0x8d6e63, 0x6d5248, 0.3);
      // Caneca sobre a maquina
      const cc = iso(0.5, 0.5);
      ctx.fillStyle = corStr(0xffffff, 0.9);
      ctx.beginPath();
      ctx.roundRect(cc.x - 4, cc.y - 14, 8, 6, 2);
      ctx.fill();
      // Vapor
      ctx.strokeStyle = corStr(0xffffff, 0.3);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cc.x, cc.y - 16);
      ctx.quadraticCurveTo(cc.x + 3, cc.y - 20, cc.x - 1, cc.y - 24);
      ctx.stroke();
      break;

    case 'plant': {
      caixaIso3D(ctx, 0, 0, 5, paleta.vaso, escurecer(paleta.vaso, 0.85), 0.32);
      const c = iso(0.5, 0.5);
      // Folhagem: multiplas camadas de circulos com gradiente
      const gradFolha = ctx.createRadialGradient(c.x - 3, c.y - 14, 0, c.x, c.y - 12, 10);
      gradFolha.addColorStop(0, corStr(clarear(paleta.planta, 0.2)));
      gradFolha.addColorStop(0.7, corStr(paleta.planta));
      gradFolha.addColorStop(1, corStr(escurecer(paleta.planta, 0.7)));
      ctx.fillStyle = gradFolha;
      ctx.beginPath();
      ctx.arc(c.x, c.y - 12, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = corStr(clarear(paleta.planta, 0.15), 0.85);
      ctx.beginPath();
      ctx.arc(c.x - 4, c.y - 8, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = corStr(escurecer(paleta.planta, 0.85), 0.8);
      ctx.beginPath();
      ctx.arc(c.x + 4, c.y - 9, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'lamp':
      // Luminaria: sprite minimal (a luz e na camada aditiva)
      // So desenha a base + bulbo
      const lc = iso(0.5, 0.5);
      // Base
      ctx.fillStyle = corStr(0x888888, 0.6);
      ctx.beginPath();
      ctx.ellipse(lc.x, lc.y, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      // Haste
      ctx.strokeStyle = corStr(0x888888, 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(lc.x, lc.y);
      ctx.lineTo(lc.x, lc.y - 14);
      ctx.stroke();
      // Bulbo
      ctx.fillStyle = corStr(0xfff3d6, 0.4);
      ctx.beginPath();
      ctx.arc(lc.x, lc.y - 14, 4, 0, Math.PI * 2);
      ctx.fill();
      break;
  }

  return canvas;
}

function renderizarLamp(paleta: PaletaResolvida): HTMLCanvasElement {
  return renderizarProp('lamp', paleta);
}

// ---------------------------------------------------------------------------
// Renderizacao de ator (personagem isometrico)
// ---------------------------------------------------------------------------

function renderizarAtor(corCorpo: number, interno: boolean, paleta: PaletaResolvida): HTMLCanvasElement {
  const w = 30;
  const h = 50;
  const { canvas, ctx } = criarCanvas(w, h);

  const cx = w / 2;
  const cy = h / 2 + 8;

  // Sombra suave no chao (blur)
  ctx.save();
  ctx.filter = 'blur(2px)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 10, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = corStr(0x000000, 0.2);
  ctx.fill();
  ctx.restore();

  // Corpo: gradiente vertical (mais claro no topo, mais escuro embaixo)
  const gradCorpo = ctx.createLinearGradient(cx, cy - 22, cx, cy - 4);
  gradCorpo.addColorStop(0, corStr(clarear(corCorpo, 0.15)));
  gradCorpo.addColorStop(0.5, corStr(corCorpo));
  gradCorpo.addColorStop(1, corStr(escurecer(corCorpo, 0.85)));
  ctx.fillStyle = gradCorpo;
  ctx.beginPath();
  ctx.roundRect(cx - 7, cy - 22, 14, 18, 5);
  ctx.fill();

  // Highlight no ombro esquerdo (luz vinda de cima-esquerda)
  ctx.fillStyle = corStr(clarear(corCorpo, 0.3), 0.3);
  ctx.beginPath();
  ctx.roundRect(cx - 6, cy - 21, 4, 8, 2);
  ctx.fill();

  // Cabeca: circulo com gradiente
  const gradCabeca = ctx.createRadialGradient(cx - 2, cy - 28, 0, cx, cy - 26, 7);
  gradCabeca.addColorStop(0, corStr(0xf6e0c8));
  gradCabeca.addColorStop(1, corStr(escurecer(0xf6e0c8, 0.9)));
  ctx.fillStyle = gradCabeca;
  ctx.beginPath();
  ctx.arc(cx, cy - 26, 6.5, 0, Math.PI * 2);
  ctx.fill();

  // Cabelo/capacete: arco superior
  ctx.fillStyle = corStr(escurecer(corCorpo, 0.6));
  ctx.beginPath();
  ctx.arc(cx, cy - 29, 6.5, Math.PI, 0);
  ctx.fill();

  // Uniforme de agente interno: faixa no peito
  if (interno) {
    ctx.fillStyle = corStr(escurecer(corCorpo, 0.7), 0.8);
    ctx.fillRect(cx - 7, cy - 14, 14, 2);
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// API para o renderer
// ---------------------------------------------------------------------------

export function obterSpriteProp(cache: SpriteCache, kind: PropKind): HTMLCanvasElement {
  return cache.props.get(kind) ?? cache.props.get('desk')!;
}

export function obterSpriteAtor(cache: SpriteCache, cor: number, interno: boolean): HTMLCanvasElement {
  if (interno) {
    return cache.internals.get(cor) ?? cache.actors.get(cor) ?? cache.actors.values().next().value!;
  }
  return cache.actors.get(cor) ?? cache.actors.values().next().value!;
}

/**
 * Desenha um sprite de prop centrado na celula (gx, gy).
 * O sprite e desenhado com seu ponto de apoio (centro-base) na posicao iso.
 */
export function desenharSpriteProp(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  gx: number,
  gy: number,
): void {
  const c = iso(gx + 0.5, gy + 0.5);
  // O sprite foi renderizado com o tile centrado em (w/2, h/2) na escala 1x
  // (antes do SUPER). Precisamos desfazer o SUPER para posicionar.
  const sw = sprite.width / SUPER;
  const sh = sprite.height / SUPER;
  // Ponto de apoio: centro-base do sprite no chao
  ctx.drawImage(sprite, c.x - sw / 2, c.y - sh / 2 + 4, sw, sh);
}

/**
 * Desenha um sprite de ator centrado na posicao iso dada.
 * Inclui offset de respiracao (bob).
 */
export function desenharSpriteAtor(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  x: number,
  y: number,
  bob: number,
): void {
  const sw = sprite.width / SUPER;
  const sh = sprite.height / SUPER;
  ctx.drawImage(sprite, x - sw / 2, y - sh / 2 + 2 - bob, sw, sh);
}

/**
 * FABRICA DE SPRITES ISOMETRICOS - FASE 4 (Overhaul visual)
 *
 * Inspiracao: Gather.town e Habbo Hotel. Cada peca de mobiliario e
 * desenhada com multiplos planos, gradientes, sombras, highlights e
 * detalhes especificos que fazem o objeto ser reconhecivel instantaneamente.
 *
 * Melhorias da Fase 4:
 *   - Mesas com monitor, teclado, mouse, cadeira giratoria
 *   - Sofas com encosto alto, almofadas, bracos
 *   - Plantas com vaso de ceramica, tronco, folhagem multicamada
 *   - Maquina de cafe com caneca, vapor, display LED
 *   - Quadros com moldura, superficie reflexiva, brilho
 *   - Impressoras com slot de papel, LED de status, bandeja
 *   - Medidores com display digital, numeros
 *   - Lampadas com base, haste, bulbo, halo
 *   - Personagens com corpo, bracos, cabeca, cabelo, sombra
 *
 * Supersampling 2x para crisp em qualquer zoom.
 */

import type { PaletaResolvida } from '@microfirma/world-engine';

const LARGURA_TILE = 44;
const ALTURA_TILE = 22;
const SUPER = 2;

export type PropKind = 'desk' | 'chair' | 'sofa' | 'board' | 'printer' | 'meter' | 'coffee' | 'plant' | 'lamp' | 'cabinet' | 'bookshelf' | 'water' | 'rug';

export interface SpriteCache {
  props: Map<PropKind, HTMLCanvasElement>;
  actors: Map<number, HTMLCanvasElement>;
  internals: Map<number, HTMLCanvasElement>;
}

export function criarFabrica(paleta: PaletaResolvida): SpriteCache {
  const props = new Map<PropKind, HTMLCanvasElement>();
  const actors = new Map<number, HTMLCanvasElement>();
  const internals = new Map<number, HTMLCanvasElement>();

  for (const kind of ['desk', 'chair', 'sofa', 'board', 'printer', 'meter', 'coffee', 'plant', 'cabinet', 'bookshelf', 'water', 'rug'] as PropKind[]) {
    props.set(kind, renderizarProp(kind, paleta));
  }
  props.set('lamp', renderizarProp('lamp', paleta));

  for (const c of paleta.ator) {
    actors.set(c, renderizarAtor(c, false, paleta));
  }
  internals.set(paleta.internoZelador, renderizarAtor(paleta.internoZelador, true, paleta));
  internals.set(paleta.internoTecnico, renderizarAtor(paleta.internoTecnico, true, paleta));

  return { props, actors, internals };
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

// ---------------------------------------------------------------------------
// Cores
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
// Caixa isometrica 3D-like com gradientes e sombras
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

  ctx.save();
  ctx.filter = 'blur(3px)';
  path(ctx, base);
  ctx.fillStyle = corStr(0x000000, 0.18);
  ctx.fill();
  ctx.restore();

  const gradEsq = ctx.createLinearGradient(base[3]!.x, base[3]!.y, topo[3]!.x, topo[3]!.y);
  gradEsq.addColorStop(0, corStr(escurecer(corLado, 0.82)));
  gradEsq.addColorStop(1, corStr(corLado));
  path(ctx, [base[3]!, base[2]!, topo[2]!, topo[3]!]);
  ctx.fillStyle = gradEsq;
  ctx.fill();

  const gradDir = ctx.createLinearGradient(base[2]!.x, base[2]!.y, topo[2]!.x, topo[2]!.y);
  gradDir.addColorStop(0, corStr(escurecer(corLado, 0.68)));
  gradDir.addColorStop(1, corStr(escurecer(corLado, 0.86)));
  path(ctx, [base[2]!, base[1]!, topo[1]!, topo[2]!]);
  ctx.fillStyle = gradDir;
  ctx.fill();

  const cx = (topo[0]!.x + topo[2]!.x) / 2;
  const cy = (topo[0]!.y + topo[2]!.y) / 2;
  const raio = Math.hypot(topo[0]!.x - topo[2]!.x, topo[0]!.y - topo[2]!.y) / 2;
  const gradTopo = ctx.createRadialGradient(cx - raio * 0.3, cy - raio * 0.2, 0, cx, cy, raio);
  gradTopo.addColorStop(0, corStr(clarear(corTopo, 0.15)));
  gradTopo.addColorStop(0.6, corStr(corTopo));
  gradTopo.addColorStop(1, corStr(escurecer(corTopo, 0.9)));
  path(ctx, topo);
  ctx.fillStyle = gradTopo;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(topo[0]!.x, topo[0]!.y);
  ctx.lineTo(topo[1]!.x, topo[1]!.y);
  ctx.strokeStyle = corStr(clarear(corTopo, 0.35), 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(base[3]!.x, base[3]!.y);
  ctx.lineTo(base[2]!.x, base[2]!.y);
  ctx.lineTo(base[1]!.x, base[1]!.y);
  ctx.strokeStyle = corStr(0x000000, 0.22);
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Renderizacao de cada tipo de prop - detalhado estilo Gather/Habbo
// ---------------------------------------------------------------------------

function renderizarProp(kind: PropKind, paleta: PaletaResolvida): HTMLCanvasElement {
  const w = LARGURA_TILE + 28;
  const h = ALTURA_TILE + 60;
  const { canvas, ctx } = criarCanvas(w, h);

  const ox = w / 2 - LARGURA_TILE / 2;
  const oy = h / 2 - ALTURA_TILE / 2;
  ctx.translate(ox, oy);

  switch (kind) {
    case 'desk':
      renderizarMesa(ctx, paleta);
      break;
    case 'sofa':
      renderizarSofa(ctx, paleta);
      break;
    case 'board':
      renderizarQuadro(ctx, paleta);
      break;
    case 'printer':
      renderizarImpressora(ctx, paleta);
      break;
    case 'meter':
      renderizarMedidor(ctx, paleta);
      break;
    case 'coffee':
      renderizarMaquinaCafe(ctx, paleta);
      break;
    case 'plant':
      renderizarPlanta(ctx, paleta);
      break;
    case 'lamp':
      renderizarLampada(ctx, paleta);
      break;
    case 'chair':
      renderizarCadeira(ctx, paleta);
      break;
    case 'cabinet':
      renderizarArmario(ctx, paleta);
      break;
    case 'bookshelf':
      renderizarEstante(ctx, paleta);
      break;
    case 'water':
      renderizarBebedouro(ctx, paleta);
      break;
    case 'rug':
      renderizarTapete(ctx, paleta);
      break;
  }

  return canvas;
}

function renderizarMesa(ctx: CanvasRenderingContext2D, paleta: PaletaResolvida): void {
  const c = iso(0.5, 0.5);

  // Sombra da cadeira (atras da mesa)
  ctx.save();
  ctx.filter = 'blur(3px)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 8, 10, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = corStr(0x000000, 0.12);
  ctx.fill();
  ctx.restore();

  // Cadeira giratoria (atras da mesa, parcialmente visivel)
  const gradCad = ctx.createLinearGradient(c.x, c.y - 6, c.x, c.y + 6);
  gradCad.addColorStop(0, corStr(paleta.cadeiraEncosto));
  gradCad.addColorStop(1, corStr(paleta.cadeira));
  ctx.fillStyle = gradCad;
  ctx.beginPath();
  ctx.roundRect(c.x - 8, c.y - 4, 16, 10, 3);
  ctx.fill();
  // Encosto da cadeira
  ctx.fillStyle = corStr(escurecer(paleta.cadeiraEncosto, 0.85), 0.9);
  ctx.beginPath();
  ctx.roundRect(c.x - 8, c.y - 10, 16, 5, 2);
  ctx.fill();

  // Tampo da mesa
  caixaIso3D(ctx, 0, 0, 8, paleta.mesaTopo, paleta.mesaLado, 0.1);

  // Pernas da mesa (4 pernas finas)
  const pernas = losango(0, 0, 0.15);
  for (const p of pernas) {
    ctx.fillStyle = corStr(paleta.mesaPerna);
    ctx.fillRect(p.x - 1, p.y, 2, 6);
  }

  // Monitor sobre a mesa
  const mc = iso(0.5, 0.5);
  // Pe do monitor
  ctx.fillStyle = corStr(escurecer(paleta.monitorCorpo, 0.7));
  ctx.fillRect(mc.x - 2, mc.y - 12, 4, 3);
  // Base do monitor
  ctx.fillStyle = corStr(paleta.monitorCorpo);
  ctx.fillRect(mc.x - 5, mc.y - 10, 10, 2);

  // Corpo do monitor (escuro, retroiluminado)
  const gradMon = ctx.createLinearGradient(mc.x - 8, mc.y - 22, mc.x + 8, mc.y - 10);
  gradMon.addColorStop(0, corStr(escurecer(paleta.monitorCorpo, 0.8)));
  gradMon.addColorStop(0.5, corStr(paleta.monitorCorpo));
  gradMon.addColorStop(1, corStr(escurecer(paleta.monitorCorpo, 0.9)));
  ctx.fillStyle = gradMon;
  ctx.beginPath();
  ctx.roundRect(mc.x - 9, mc.y - 22, 18, 12, 1.5);
  ctx.fill();

  // Tela do monitor (brilho azul)
  const gradTela = ctx.createLinearGradient(mc.x - 7, mc.y - 20, mc.x + 7, mc.y - 12);
  gradTela.addColorStop(0, corStr(paleta.monitorTela, 0.9));
  gradTela.addColorStop(0.5, corStr(clarear(paleta.monitorTela, 0.15), 0.85));
  gradTela.addColorStop(1, corStr(paleta.monitorTela, 0.9));
  ctx.fillStyle = gradTela;
  ctx.fillRect(mc.x - 7, mc.y - 20, 14, 9);

  // Reflexo na tela
  ctx.fillStyle = corStr(0xffffff, 0.08);
  ctx.beginPath();
  ctx.moveTo(mc.x - 6, mc.y - 19);
  ctx.lineTo(mc.x - 2, mc.y - 19);
  ctx.lineTo(mc.x + 2, mc.y - 12);
  ctx.lineTo(mc.x - 4, mc.y - 12);
  ctx.closePath();
  ctx.fill();

  // Linhas de codigo na tela
  ctx.fillStyle = corStr(0x6cf7a0, 0.4);
  ctx.fillRect(mc.x - 5, mc.y - 18, 6, 1);
  ctx.fillRect(mc.x - 5, mc.y - 16, 4, 1);
  ctx.fillRect(mc.x - 5, mc.y - 14, 7, 1);

  // Teclado sobre a mesa
  ctx.fillStyle = corStr(paleta.teclado);
  ctx.beginPath();
  ctx.roundRect(mc.x - 7, mc.y - 5, 14, 4, 1);
  ctx.fill();
  // Teclas
  ctx.fillStyle = corStr(clarear(paleta.teclado, 0.2), 0.6);
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(mc.x - 6 + i * 2.5, mc.y - 4, 1.5, 1.5);
  }

  // Mouse
  ctx.fillStyle = corStr(clarear(paleta.teclado, 0.1));
  ctx.beginPath();
  ctx.ellipse(mc.x + 8, mc.y - 3, 2.5, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function renderizarSofa(ctx: CanvasRenderingContext2D, paleta: PaletaResolvida): void {
  const c = iso(0.5, 0.5);

  // Sombra
  ctx.save();
  ctx.filter = 'blur(4px)';
  path(ctx, losango(0, 0, 0.05));
  ctx.fillStyle = corStr(0x000000, 0.15);
  ctx.fill();
  ctx.restore();

  // Base do sofa (caixa larga)
  caixaIso3D(ctx, 0, 0, 6, paleta.sofa, escurecer(paleta.sofa, 0.8), 0.06);

  // Braco esquerdo
  const bl = iso(0.08, 0.5);
  ctx.fillStyle = corStr(escurecer(paleta.sofa, 0.85));
  ctx.beginPath();
  ctx.roundRect(bl.x - 3, bl.y - 12, 6, 14, 2);
  ctx.fill();
  ctx.fillStyle = corStr(clarear(paleta.sofa, 0.08), 0.4);
  ctx.beginPath();
  ctx.roundRect(bl.x - 2, bl.y - 11, 4, 5, 1.5);
  ctx.fill();

  // Braco direito
  const br = iso(0.92, 0.5);
  ctx.fillStyle = corStr(escurecer(paleta.sofa, 0.85));
  ctx.beginPath();
  ctx.roundRect(br.x - 3, br.y - 12, 6, 14, 2);
  ctx.fill();
  ctx.fillStyle = corStr(clarear(paleta.sofa, 0.08), 0.4);
  ctx.beginPath();
  ctx.roundRect(br.x - 2, br.y - 11, 4, 5, 1.5);
  ctx.fill();

  // Encosto alto (atrás)
  const enc = iso(0.5, 0.12);
  const gradEnc = ctx.createLinearGradient(enc.x, enc.y - 18, enc.x, enc.y - 4);
  gradEnc.addColorStop(0, corStr(paleta.sofaEncosto));
  gradEnc.addColorStop(1, corStr(escurecer(paleta.sofaEncosto, 0.85)));
  ctx.fillStyle = gradEnc;
  ctx.beginPath();
  ctx.roundRect(enc.x - 14, enc.y - 18, 28, 14, 4);
  ctx.fill();

  // Almofadas (2)
  for (const offset of [-6, 6]) {
    const ac = iso(0.5, 0.5);
    const gradAlm = ctx.createRadialGradient(ac.x + offset - 2, ac.y - 8, 0, ac.x + offset, ac.y - 6, 7);
    gradAlm.addColorStop(0, corStr(clarear(paleta.sofaAlmofada, 0.15)));
    gradAlm.addColorStop(0.7, corStr(paleta.sofaAlmofada));
    gradAlm.addColorStop(1, corStr(escurecer(paleta.sofaAlmofada, 0.85)));
    ctx.fillStyle = gradAlm;
    ctx.beginPath();
    ctx.ellipse(ac.x + offset, ac.y - 6, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Highlight no encosto
  ctx.fillStyle = corStr(clarear(paleta.sofaEncosto, 0.2), 0.3);
  ctx.beginPath();
  ctx.roundRect(enc.x - 12, enc.y - 17, 24, 3, 1.5);
  ctx.fill();
}

function renderizarQuadro(ctx: CanvasRenderingContext2D, paleta: PaletaResolvida): void {
  const c = iso(0.5, 0.5);

  // Sombra na parede
  ctx.save();
  ctx.filter = 'blur(4px)';
  ctx.fillStyle = corStr(0x000000, 0.15);
  ctx.fillRect(c.x - 12, c.y - 26, 24, 18);
  ctx.restore();

  // Moldura
  ctx.fillStyle = corStr(paleta.quadroBorda);
  ctx.beginPath();
  ctx.roundRect(c.x - 12, c.y - 26, 24, 18, 2);
  ctx.fill();

  // Superficie do quadro (escura, reflexiva)
  const gradBoard = ctx.createLinearGradient(c.x - 10, c.y - 24, c.x + 10, c.y - 10);
  gradBoard.addColorStop(0, corStr(0x1a2332, 0.9));
  gradBoard.addColorStop(0.5, corStr(0x2a3a4a, 0.75));
  gradBoard.addColorStop(1, corStr(0x1a2332, 0.9));
  ctx.fillStyle = gradBoard;
  ctx.fillRect(c.x - 10, c.y - 24, 20, 14);

  // Brilho do quadro
  ctx.fillStyle = corStr(0x4a6cf7, 0.1);
  ctx.fillRect(c.x - 9, c.y - 23, 18, 12);

  // Reflexo diagonal
  ctx.fillStyle = corStr(0xffffff, 0.06);
  ctx.beginPath();
  ctx.moveTo(c.x - 8, c.y - 22);
  ctx.lineTo(c.x - 4, c.y - 22);
  ctx.lineTo(c.x + 2, c.y - 12);
  ctx.lineTo(c.x - 2, c.y - 12);
  ctx.closePath();
  ctx.fill();

  // "Conteudo" do quadro (linhas de texto/grafico)
  ctx.fillStyle = corStr(0x6cf7a0, 0.5);
  ctx.fillRect(c.x - 7, c.y - 21, 8, 1);
  ctx.fillStyle = corStr(0xf7d44a, 0.4);
  ctx.fillRect(c.x - 7, c.y - 19, 6, 1);
  ctx.fillStyle = corStr(0x6cf7a0, 0.4);
  ctx.fillRect(c.x - 7, c.y - 17, 10, 1);

  // Pe do quadro (suporte na parede)
  ctx.fillStyle = corStr(escurecer(paleta.quadroBorda, 0.7));
  ctx.fillRect(c.x - 1, c.y - 8, 2, 4);
}

function renderizarImpressora(ctx: CanvasRenderingContext2D, paleta: PaletaResolvida): void {
  const c = iso(0.5, 0.5);

  // Sombra
  ctx.save();
  ctx.filter = 'blur(3px)';
  path(ctx, losango(0, 0, 0.1));
  ctx.fillStyle = corStr(0x000000, 0.15);
  ctx.fill();
  ctx.restore();

  // Corpo da impressora
  caixaIso3D(ctx, 0, 0, 10, 0xd7dbe0, 0xa8aeb6, 0.18);

  // Bandeja superior (relevo)
  ctx.fillStyle = corStr(escurecer(0xd7dbe0, 0.85));
  ctx.beginPath();
  ctx.roundRect(c.x - 9, c.y - 14, 18, 3, 1);
  ctx.fill();

  // Slot de papel (fenda escura)
  ctx.fillStyle = corStr(0x333333);
  ctx.fillRect(c.x - 8, c.y - 11, 16, 2);

  // Papel saindo
  ctx.fillStyle = corStr(0xfdfdfd, 0.85);
  ctx.fillRect(c.x - 6, c.y - 15, 12, 4);
  ctx.fillStyle = corStr(0xc9c4bb, 0.5);
  ctx.fillRect(c.x - 6, c.y - 13, 12, 1);

  // Painel de controle
  ctx.fillStyle = corStr(0x444444);
  ctx.beginPath();
  ctx.roundRect(c.x + 4, c.y - 9, 6, 4, 1);
  ctx.fill();

  // LED de status (verde)
  ctx.beginPath();
  ctx.arc(c.x + 7, c.y - 7, 1.2, 0, Math.PI * 2);
  ctx.fillStyle = corStr(0x3f8f52);
  ctx.fill();
  // Halo do LED
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.arc(c.x + 7, c.y - 7, 3, 0, Math.PI * 2);
  ctx.fillStyle = corStr(0x3f8f52, 0.2);
  ctx.fill();
  ctx.restore();
}

function renderizarMedidor(ctx: CanvasRenderingContext2D, paleta: PaletaResolvida): void {
  const c = iso(0.5, 0.5);

  // Sombra
  ctx.save();
  ctx.filter = 'blur(3px)';
  path(ctx, losango(0, 0, 0.15));
  ctx.fillStyle = corStr(0x000000, 0.15);
  ctx.fill();
  ctx.restore();

  // Corpo do medidor
  caixaIso3D(ctx, 0, 0, 16, 0xdfe4ea, 0xa8b0ba, 0.22);

  // Display digital
  ctx.fillStyle = corStr(0x0a0a0a);
  ctx.beginPath();
  ctx.roundRect(c.x - 8, c.y - 22, 16, 9, 1);
  ctx.fill();

  // Borda do display
  ctx.strokeStyle = corStr(0x333333, 0.8);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Numeros no display (verde LCD)
  ctx.fillStyle = corStr(0x00ff88, 0.85);
  ctx.font = 'bold 6px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('8.7', c.x, c.y - 15);

  // Brilho do display
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = corStr(0x00ff88, 0.08);
  ctx.fillRect(c.x - 7, c.y - 21, 14, 7);
  ctx.restore();

  // Botões
  ctx.fillStyle = corStr(0x888888);
  ctx.beginPath();
  ctx.arc(c.x - 6, c.y - 8, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c.x + 6, c.y - 8, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function renderizarMaquinaCafe(ctx: CanvasRenderingContext2D, paleta: PaletaResolvida): void {
  const c = iso(0.5, 0.5);

  // Sombra
  ctx.save();
  ctx.filter = 'blur(3px)';
  path(ctx, losango(0, 0, 0.2));
  ctx.fillStyle = corStr(0x000000, 0.15);
  ctx.fill();
  ctx.restore();

  // Corpo da maquina
  caixaIso3D(ctx, 0, 0, 12, 0x8d6e63, 0x6d5248, 0.18);

  // Reservatorio de agua (transparente)
  ctx.fillStyle = corStr(0x4a90d9, 0.15);
  ctx.beginPath();
  ctx.roundRect(c.x - 7, c.y - 18, 6, 12, 1);
  ctx.fill();
  ctx.strokeStyle = corStr(0x4a90d9, 0.3);
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Bico de saida
  ctx.fillStyle = corStr(0x555555);
  ctx.fillRect(c.x - 2, c.y - 14, 4, 4);

  // Caneca sob o bico
  ctx.fillStyle = corStr(0xffffff, 0.9);
  ctx.beginPath();
  ctx.roundRect(c.x - 4, c.y - 8, 8, 6, 1.5);
  ctx.fill();
  // Cafe na caneca
  ctx.fillStyle = corStr(0x4a2c17, 0.85);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 7, 3, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Vapor
  ctx.strokeStyle = corStr(0xffffff, 0.25);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 16);
  ctx.quadraticCurveTo(c.x + 3, c.y - 20, c.x - 1, c.y - 24);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c.x + 2, c.y - 16);
  ctx.quadraticCurveTo(c.x - 2, c.y - 21, c.x + 3, c.y - 25);
  ctx.stroke();

  // LED de aquecimento
  ctx.beginPath();
  ctx.arc(c.x + 5, c.y - 16, 1, 0, Math.PI * 2);
  ctx.fillStyle = corStr(0xff4444, 0.8);
  ctx.fill();
}

function renderizarPlanta(ctx: CanvasRenderingContext2D, paleta: PaletaResolvida): void {
  const c = iso(0.5, 0.5);

  // Sombra
  ctx.save();
  ctx.filter = 'blur(3px)';
  path(ctx, losango(0, 0, 0.25));
  ctx.fillStyle = corStr(0x000000, 0.12);
  ctx.fill();
  ctx.restore();

  // Vaso de ceramica (mais alto e detalhado)
  const gradVaso = ctx.createLinearGradient(c.x, c.y - 10, c.x, c.y + 2);
  gradVaso.addColorStop(0, corStr(clarear(paleta.vaso, 0.1)));
  gradVaso.addColorStop(0.5, corStr(paleta.vaso));
  gradVaso.addColorStop(1, corStr(escurecer(paleta.vaso, 0.8)));
  ctx.fillStyle = gradVaso;
  ctx.beginPath();
  ctx.moveTo(c.x - 7, c.y + 2);
  ctx.lineTo(c.x + 7, c.y + 2);
  ctx.lineTo(c.x + 5, c.y - 10);
  ctx.lineTo(c.x - 5, c.y - 10);
  ctx.closePath();
  ctx.fill();

  // Borda do vaso (abertura)
  ctx.fillStyle = corStr(escurecer(paleta.vaso, 0.7));
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 10, 6, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Terra no vaso
  ctx.fillStyle = corStr(0x3d2817, 0.8);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 10, 5, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tronco
  ctx.strokeStyle = corStr(paleta.plantaTronco);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 10);
  ctx.lineTo(c.x, c.y - 16);
  ctx.stroke();

  // Folhagem: multiplas camadas de circulos com gradiente
  const gradFolha1 = ctx.createRadialGradient(c.x - 3, c.y - 20, 0, c.x, c.y - 18, 12);
  gradFolha1.addColorStop(0, corStr(clarear(paleta.planta, 0.25)));
  gradFolha1.addColorStop(0.5, corStr(paleta.planta));
  gradFolha1.addColorStop(1, corStr(escurecer(paleta.planta, 0.65)));
  ctx.fillStyle = gradFolha1;
  ctx.beginPath();
  ctx.arc(c.x, c.y - 18, 9, 0, Math.PI * 2);
  ctx.fill();

  // Camada 2 (menor, mais clara, deslocada)
  const gradFolha2 = ctx.createRadialGradient(c.x - 4, c.y - 24, 0, c.x - 2, c.y - 22, 7);
  gradFolha2.addColorStop(0, corStr(clarear(paleta.planta, 0.2)));
  gradFolha2.addColorStop(1, corStr(escurecer(paleta.planta, 0.75)));
  ctx.fillStyle = gradFolha2;
  ctx.beginPath();
  ctx.arc(c.x - 2, c.y - 22, 6, 0, Math.PI * 2);
  ctx.fill();

  // Folhas individuais (detalhes)
  ctx.fillStyle = corStr(clarear(paleta.planta, 0.18), 0.85);
  ctx.beginPath();
  ctx.ellipse(c.x + 5, c.y - 17, 4, 2.5, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c.x - 6, c.y - 16, 4, 2.5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(c.x + 3, c.y - 25, 3.5, 2, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Highlight superior
  ctx.fillStyle = corStr(clarear(paleta.planta, 0.35), 0.3);
  ctx.beginPath();
  ctx.arc(c.x - 3, c.y - 24, 3, 0, Math.PI * 2);
  ctx.fill();
}

function renderizarLampada(ctx: CanvasRenderingContext2D, paleta: PaletaResolvida): void {
  const c = iso(0.5, 0.5);

  // Base
  ctx.fillStyle = corStr(0x666666, 0.7);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 7, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = corStr(0x888888, 0.5);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 1, 5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Haste
  ctx.strokeStyle = corStr(0x888888, 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 1);
  ctx.lineTo(c.x, c.y - 16);
  ctx.stroke();

  // Cúpula da lampada
  const gradCupula = ctx.createLinearGradient(c.x, c.y - 22, c.x, c.y - 14);
  gradCupula.addColorStop(0, corStr(0xfff3d6, 0.5));
  gradCupula.addColorStop(1, corStr(0xddd0b8, 0.4));
  ctx.fillStyle = gradCupula;
  ctx.beginPath();
  ctx.moveTo(c.x - 6, c.y - 16);
  ctx.lineTo(c.x + 6, c.y - 16);
  ctx.lineTo(c.x + 4, c.y - 22);
  ctx.lineTo(c.x - 4, c.y - 22);
  ctx.closePath();
  ctx.fill();

  // Bulbo (brilho)
  ctx.fillStyle = corStr(0xfff3d6, 0.5);
  ctx.beginPath();
  ctx.arc(c.x, c.y - 16, 3, 0, Math.PI * 2);
  ctx.fill();

  // Halo de luz
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gradHalo = ctx.createRadialGradient(c.x, c.y - 16, 0, c.x, c.y - 16, 14);
  gradHalo.addColorStop(0, corStr(0xfff3d6, 0.25));
  gradHalo.addColorStop(0.5, corStr(0xfff3d6, 0.08));
  gradHalo.addColorStop(1, corStr(0xfff3d6, 0));
  ctx.fillStyle = gradHalo;
  ctx.beginPath();
  ctx.arc(c.x, c.y - 16, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Renderizacao de ator (personagem isometrico estilo Habbo)
// ---------------------------------------------------------------------------

function renderizarAtor(corCorpo: number, interno: boolean, paleta: PaletaResolvida): HTMLCanvasElement {
  const w = 32;
  const h = 56;
  const { canvas, ctx } = criarCanvas(w, h);

  const cx = w / 2;
  const cy = h / 2 + 10;

  // Sombra suave no chao
  ctx.save();
  ctx.filter = 'blur(2px)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 10, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = corStr(0x000000, 0.22);
  ctx.fill();
  ctx.restore();

  // Pernas (calca)
  const gradPernas = ctx.createLinearGradient(cx, cy - 8, cx, cy + 2);
  gradPernas.addColorStop(0, corStr(escurecer(corCorpo, 0.7)));
  gradPernas.addColorStop(1, corStr(escurecer(corCorpo, 0.85)));
  ctx.fillStyle = gradPernas;
  ctx.fillRect(cx - 5, cy - 8, 4, 10);
  ctx.fillRect(cx + 1, cy - 8, 4, 10);

  // Pes
  ctx.fillStyle = corStr(0x333333);
  ctx.fillRect(cx - 5, cy + 1, 4, 2);
  ctx.fillRect(cx + 1, cy + 1, 4, 2);

  // Corpo (tronco) com gradiente
  const gradCorpo = ctx.createLinearGradient(cx, cy - 24, cx, cy - 6);
  gradCorpo.addColorStop(0, corStr(clarear(corCorpo, 0.18)));
  gradCorpo.addColorStop(0.5, corStr(corCorpo));
  gradCorpo.addColorStop(1, corStr(escurecer(corCorpo, 0.82)));
  ctx.fillStyle = gradCorpo;
  ctx.beginPath();
  ctx.roundRect(cx - 8, cy - 24, 16, 18, 4);
  ctx.fill();

  // Braco esquerdo
  ctx.fillStyle = corStr(escurecer(corCorpo, 0.88));
  ctx.beginPath();
  ctx.roundRect(cx - 10, cy - 22, 4, 12, 2);
  ctx.fill();

  // Braco direito
  ctx.fillStyle = corStr(escurecer(corCorpo, 0.88));
  ctx.beginPath();
  ctx.roundRect(cx + 6, cy - 22, 4, 12, 2);
  ctx.fill();

  // Maos
  ctx.fillStyle = corStr(paleta.atorPele);
  ctx.beginPath();
  ctx.arc(cx - 8, cy - 10, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 8, cy - 10, 2, 0, Math.PI * 2);
  ctx.fill();

  // Highlight no ombro esquerdo
  ctx.fillStyle = corStr(clarear(corCorpo, 0.3), 0.35);
  ctx.beginPath();
  ctx.roundRect(cx - 7, cy - 23, 5, 6, 2);
  ctx.fill();

  // Cabeca com gradiente
  const gradCabeca = ctx.createRadialGradient(cx - 2, cy - 30, 0, cx, cy - 28, 8);
  gradCabeca.addColorStop(0, corStr(clarear(paleta.atorPele, 0.08)));
  gradCabeca.addColorStop(1, corStr(escurecer(paleta.atorPele, 0.9)));
  ctx.fillStyle = gradCabeca;
  ctx.beginPath();
  ctx.arc(cx, cy - 28, 7, 0, Math.PI * 2);
  ctx.fill();

  // Cabelo
  ctx.fillStyle = corStr(paleta.atorCabelo);
  ctx.beginPath();
  ctx.arc(cx, cy - 31, 7, Math.PI + 0.2, -0.2);
  ctx.fill();
  // Franja
  ctx.fillStyle = corStr(escurecer(paleta.atorCabelo, 0.9), 0.8);
  ctx.beginPath();
  ctx.ellipse(cx, cy - 32, 5, 2.5, 0, 0, Math.PI);
  ctx.fill();

  // Olhos
  ctx.fillStyle = corStr(0x222222);
  ctx.fillRect(cx - 3, cy - 28, 1.5, 1.5);
  ctx.fillRect(cx + 1.5, cy - 28, 1.5, 1.5);

  // Uniforme de agente interno: faixa no peito
  if (interno) {
    ctx.fillStyle = corStr(escurecer(corCorpo, 0.6), 0.8);
    ctx.fillRect(cx - 8, cy - 16, 16, 2.5);
    // Distintivo
    ctx.fillStyle = corStr(clarear(corCorpo, 0.3), 0.7);
    ctx.beginPath();
    ctx.arc(cx, cy - 14.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// Mobilias novas: cadeira, armario, estante, bebedouro, tapete
// ---------------------------------------------------------------------------

function renderizarCadeira(ctx: CanvasRenderingContext2D, paleta: PaletaResolvida): void {
  const c = iso(0.5, 0.5);

  // Sombra
  ctx.save();
  ctx.filter = 'blur(2px)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 4, 9, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = corStr(0x000000, 0.15);
  ctx.fill();
  ctx.restore();

  // Base/cinco rodas
  ctx.fillStyle = corStr(0x333333, 0.9);
  for (const a of [-0.6, -0.2, 0.2, 0.6]) {
    ctx.beginPath();
    ctx.ellipse(c.x + a * 10, c.y + 4, 2, 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Coluna central
  ctx.strokeStyle = corStr(0x555555);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y + 3);
  ctx.lineTo(c.x, c.y - 6);
  ctx.stroke();

  // Assento
  const gradAssento = ctx.createLinearGradient(c.x, c.y - 4, c.x, c.y + 2);
  gradAssento.addColorStop(0, corStr(clarear(paleta.cadeira, 0.1)));
  gradAssento.addColorStop(1, corStr(paleta.cadeira));
  ctx.fillStyle = gradAssento;
  ctx.beginPath();
  ctx.roundRect(c.x - 8, c.y - 6, 16, 8, 3);
  ctx.fill();

  // Encosto
  const gradEnc = ctx.createLinearGradient(c.x, c.y - 18, c.x, c.y - 6);
  gradEnc.addColorStop(0, corStr(paleta.cadeiraEncosto));
  gradEnc.addColorStop(1, corStr(escurecer(paleta.cadeiraEncosto, 0.9)));
  ctx.fillStyle = gradEnc;
  ctx.beginPath();
  ctx.roundRect(c.x - 7, c.y - 18, 14, 12, 4);
  ctx.fill();

  // Brilho no encosto
  ctx.fillStyle = corStr(clarear(paleta.cadeiraEncosto, 0.2), 0.3);
  ctx.beginPath();
  ctx.roundRect(c.x - 6, c.y - 17, 5, 6, 2);
  ctx.fill();
}

function renderizarArmario(ctx: CanvasRenderingContext2D, paleta: PaletaResolvida): void {
  const c = iso(0.5, 0.5);

  // Corpo alto do armario
  caixaIso3D(ctx, 0, 0, 26, paleta.mesaTopo, paleta.mesaLado, 0.18);

  // Portas duplas
  ctx.strokeStyle = corStr(escurecer(paleta.mesaLado, 0.8), 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 22);
  ctx.lineTo(c.x, c.y - 2);
  ctx.stroke();

  // Macanetas
  ctx.fillStyle = corStr(0x888888);
  ctx.beginPath();
  ctx.arc(c.x - 4, c.y - 12, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(c.x + 4, c.y - 12, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Gaveta inferior
  ctx.fillStyle = corStr(escurecer(paleta.mesaLado, 0.7));
  ctx.fillRect(c.x - 10, c.y - 3, 20, 3);
  ctx.fillStyle = corStr(clarear(paleta.mesaLado, 0.1), 0.5);
  ctx.fillRect(c.x - 9, c.y - 2, 18, 1);
}

function renderizarEstante(ctx: CanvasRenderingContext2D, paleta: PaletaResolvida): void {
  const c = iso(0.5, 0.5);

  // Corpo da estante
  caixaIso3D(ctx, 0, 0, 24, paleta.mesaTopo, paleta.mesaLado, 0.2);

  // Prateleiras
  ctx.strokeStyle = corStr(escurecer(paleta.mesaLado, 0.85), 0.7);
  ctx.lineWidth = 1;
  for (const off of [-8, -3, 2]) {
    ctx.beginPath();
    ctx.moveTo(c.x - 10, c.y - 12 + off);
    ctx.lineTo(c.x + 10, c.y - 12 + off);
    ctx.stroke();
  }

  // Livros/pastas nas prateleiras
  const cores = [0xd94f4f, 0x4f6df5, 0x3f8f52, 0xd0a056, 0x9a5fd0];
  for (let pr = 0; pr < 3; pr++) {
    const py = c.y - 14 + pr * 5;
    for (let i = 0; i < 4; i++) {
      const px = c.x - 8 + i * 4.5;
      const h = 2 + ((i + pr) % 3);
      const corLivro = cores[(i + pr) % cores.length] ?? 0xd94f4f;
      ctx.fillStyle = corStr(corLivro, 0.9);
      ctx.fillRect(px, py, 3, h);
    }
  }
}

function renderizarBebedouro(ctx: CanvasRenderingContext2D, paleta: PaletaResolvida): void {
  const c = iso(0.5, 0.5);

  // Base
  caixaIso3D(ctx, 0, 0, 14, 0xd7dbe0, 0xa8aeb6, 0.22);

  // Painel frontal
  ctx.fillStyle = corStr(0x2a3a5a, 0.9);
  ctx.fillRect(c.x - 7, c.y - 14, 14, 12);

  // Garrafa de agua azul translucida
  ctx.fillStyle = corStr(0x4a90d9, 0.4);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 8, 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nivel da agua
  ctx.fillStyle = corStr(0x7fc4ff, 0.5);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y - 6, 3.5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Torneira
  ctx.strokeStyle = corStr(0x888888);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 16);
  ctx.lineTo(c.x, c.y - 11);
  ctx.stroke();
  ctx.fillStyle = corStr(0x888888);
  ctx.beginPath();
  ctx.arc(c.x, c.y - 9, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // LED verde
  ctx.fillStyle = corStr(0x3f8f52);
  ctx.beginPath();
  ctx.arc(c.x + 4, c.y - 14, 1, 0, Math.PI * 2);
  ctx.fill();
}

function renderizarTapete(ctx: CanvasRenderingContext2D, paleta: PaletaResolvida): void {
  const c = iso(0.5, 0.5);

  // Tapete fino, achatado no chao
  ctx.save();
  ctx.filter = 'blur(1px)';
  path(ctx, losango(0, 0, 0.25));
  ctx.fillStyle = corStr(0x000000, 0.08);
  ctx.fill();
  ctx.restore();

  // Corpo do tapete
  const gradRug = ctx.createRadialGradient(c.x - 4, c.y - 4, 0, c.x, c.y, 18);
  gradRug.addColorStop(0, corStr(clarear(paleta.tapete, 0.1)));
  gradRug.addColorStop(0.6, corStr(paleta.tapete));
  gradRug.addColorStop(1, corStr(escurecer(paleta.tapete, 0.85)));
  path(ctx, losango(0, 0, 0.22));
  ctx.fillStyle = gradRug;
  ctx.fill();

  // Borda
  path(ctx, losango(0, 0, 0.28));
  ctx.strokeStyle = corStr(escurecer(paleta.tapete, 0.6), 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Padrao central
  ctx.fillStyle = corStr(clarear(paleta.tapete, 0.2), 0.5);
  ctx.beginPath();
  ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = corStr(escurecer(paleta.tapete, 0.7), 0.4);
  ctx.beginPath();
  ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
  ctx.fill();
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

export function desenharSpriteProp(
  ctx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  gx: number,
  gy: number,
): void {
  const c = iso(gx + 0.5, gy + 0.5);
  const sw = sprite.width / SUPER;
  const sh = sprite.height / SUPER;
  ctx.drawImage(sprite, c.x - sw / 2, c.y - sh / 2 + 4, sw, sh);
}

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

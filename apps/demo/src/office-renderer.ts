/**
 * RENDERIZADOR DO ESCRITORIO (PixiJS v8)
 *
 * Papel deste arquivo: desenhar um quadro de mundo. Nada mais.
 * Ele NAO simula, NAO decide, NAO guarda regra de negocio. Recebe
 * `WorldSnapshot`/`WorldDelta` e pinta. Essa fronteira e o que permite mover a
 * simulacao para o servidor sem tocar uma linha de render (ADR-0006).
 *
 * Projecao: dimetrica 2:1 (a mesma de Stardew/Gather e de Age of Empires II).
 * Na Fase 0 tudo e desenhado vetorialmente para nao depender de arte pronta.
 * Em producao, os mesmos slots recebem sprites pre-renderizados em 3D (ADR-0008),
 * o que da iluminacao e materiais de verdade com custo de GPU de um sprite 2D.
 *
 * Iluminacao: camada de penumbra + luzes aditivas por luminaria. Uma luz
 * queimada NAO e um icone: e a ausencia de luz naquela area - o usuario percebe
 * antes de ler qualquer texto.
 */

import { Application, Container, Graphics } from 'pixi.js';
import type { OfficeLayout, WorldDelta, WorldSnapshot } from '@microfirma/contracts';

const LARGURA_TILE = 44;
const ALTURA_TILE = 22;

/** Paleta base. Tons frios e claros: o escritorio deve parecer limpo, nao "jogo". */
const CORES = {
  fundo: 0xf2f0ec,
  corredor: 0xe6e2db,
  piso: {
    open: 0xf7f5f1,
    private: 0xeceef2,
    break: 0xf3efe6,
    meeting: 0xedf1ee,
    war_room: 0xf6ecec,
    reception: 0xf1f2f5,
  } as Record<string, number>,
  parede: 0xcdc7bd,
  rodape: 0xb9b2a7,
  mesaTopo: 0xd8c9b2,
  mesaLado: 0xb99f7d,
  planta: 0x6f9c6b,
  vaso: 0xb98b6a,
  sofa: 0x8fa6a1,
  quadro: 0x4a5568,
  penumbra: 0x101828,
  ator: [0x4f6df5, 0x2fa8a0, 0xe0873f, 0x9a5fd0, 0xd0566f, 0x3f8f52, 0x5a6b8c],
  internoZelador: 0x2f7f6f,
  internoTecnico: 0xb4762a,
  perigo: 0xd94f4f,
};

export interface RendererHandle {
  /** Entrega um quadro para desenho. Chamada a 10 Hz pelo laco de simulacao. */
  push(frame: WorldSnapshot | WorldDelta): void;
  /** Destaca um agente (selecionado no painel lateral). */
  select(agentId: string | null): void;
  destroy(): void;
}

export async function criarRenderer(
  canvas: HTMLCanvasElement,
  layout: OfficeLayout,
): Promise<RendererHandle> {
  const app = new Application();
  const baseOpts = {
    canvas,
    background: CORES.fundo,
    antialias: true,
    resizeTo: canvas.parentElement ?? window,
    resolution: 1,
    autoDensity: true,
  };
  try {
    await app.init({ ...baseOpts, preference: 'webgl' as const });
  } catch (e1) {
    console.warn('[office-renderer] WebGL falhou, tentando Canvas 2D', e1);
    try {
      await app.init({ ...baseOpts, preference: 'canvas' as const, antialias: false });
    } catch (e2) {
      console.error('[office-renderer] Nenhum renderer disponivel', e2);
      throw e2;
    }
  }

  const mundo = new Container();
  app.stage.addChild(mundo);

  const camadaPiso = new Graphics();
  const camadaProps = new Graphics();
  const camadaPenumbra = new Graphics();
  const camadaLuzes = new Graphics();
  const camadaAtores = new Graphics();
  const camadaAmbiente = new Graphics();
  // Nota: blendMode 'add' removido pois causa falha de compilacao de shader
  // em WebGL com PixiJS v8 em certos ambientes. As luzes usam alpha alto para
  // simular efeito aditivo sem shader extra.
  mundo.addChild(camadaPiso, camadaProps, camadaPenumbra, camadaLuzes, camadaAmbiente, camadaAtores);

  // A geometria estatica e desenhada UMA vez: e imutavel enquanto o layout for
  // o mesmo. Redesenhar piso a 60 fps seria desperdicio puro.
  desenharPiso(camadaPiso, layout);
  desenharProps(camadaProps, layout);

  let quadro: WorldSnapshot | WorldDelta | null = null;
  let selecionado: string | null = null;
  let fase = 0; // usado nas animacoes ciclicas (respiracao, fumaca)

  const ajustarCamera = () => {
    const larguraNecessaria = ((layout.grid.width + layout.grid.height) * LARGURA_TILE) / 2;
    const alturaNecessaria = ((layout.grid.width + layout.grid.height) * ALTURA_TILE) / 2;
    const escala = Math.min(
      app.renderer.width / larguraNecessaria,
      app.renderer.height / alturaNecessaria,
    );
    mundo.scale.set(escala * 0.94);
    mundo.position.set(
      app.renderer.width / 2 - ((layout.grid.width - layout.grid.height) * LARGURA_TILE * mundo.scale.x) / 4,
      app.renderer.height / 2 - ((layout.grid.width + layout.grid.height) * ALTURA_TILE * mundo.scale.y) / 4,
    );
  };
  ajustarCamera();
  app.renderer.on('resize', ajustarCamera);

  // Redesenho limitado a ~10fps para evitar estouro de buffer de GPU.
  // PixiJS v8 recompila geometria a cada clear(), entao 60fps inviabiliza.
  let tempoAcumulado = 0;
  const INTERVALO_REDESENHO = 100; // ms (~10fps)
  app.ticker.add((ticker) => {
    fase += ticker.deltaMS / 1000;
    if (!quadro) return;
    tempoAcumulado += ticker.deltaMS;
    if (tempoAcumulado < INTERVALO_REDESENHO) return;
    tempoAcumulado = 0;
    desenharPenumbraELuzes(camadaPenumbra, camadaLuzes, layout, quadro, fase);
    desenharAmbiente(camadaAmbiente, layout, quadro, fase);
    desenharAtores(camadaAtores, quadro, selecionado, fase);
  });

  return {
    push: (f) => {
      quadro = f;
    },
    select: (id) => {
      selecionado = id;
    },
    destroy: () => {
      app.destroy(true, { children: true });
    },
  };
}

// ---------------------------------------------------------------------------
// Projecao
// ---------------------------------------------------------------------------

/** Converte coordenada de grid em coordenada de tela (projecao dimetrica). */
function iso(gx: number, gy: number): { x: number; y: number } {
  return { x: ((gx - gy) * LARGURA_TILE) / 2, y: ((gx + gy) * ALTURA_TILE) / 2 };
}

/** Os quatro vertices do losango de uma celula, com recuo opcional. */
function losango(gx: number, gy: number, recuo = 0) {
  const a = recuo;
  const b = 1 - recuo;
  return [iso(gx + a, gy + a), iso(gx + b, gy + a), iso(gx + b, gy + b), iso(gx + a, gy + b)];
}

function poligono(g: Graphics, pts: Array<{ x: number; y: number }>): void {
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.closePath();
}

// ---------------------------------------------------------------------------
// Camadas estaticas
// ---------------------------------------------------------------------------

function desenharPiso(g: Graphics, layout: OfficeLayout): void {
  g.clear();

  for (const c of layout.corridors) {
    poligono(g, losango(c.x, c.y));
    g.fill({ color: CORES.corredor });
  }

  for (const sala of layout.rooms) {
    const cor = CORES.piso[sala.kind] ?? CORES.piso.open!;
    for (let y = sala.rect.y0; y < sala.rect.y1; y++) {
      for (let x = sala.rect.x0; x < sala.rect.x1; x++) {
        poligono(g, losango(x, y));
        // Variacao minima por celula: quebra a sensacao de plastico liso sem
        // virar xadrez. Deterministica (depende so das coordenadas).
        const variacao = ((x * 7 + y * 13) % 5) * 0x010101;
        g.fill({ color: cor - variacao });
      }
    }

    // Rodape/parede: contorno extrudado. Da leitura de volume ao ambiente.
    const cantos = [
      iso(sala.rect.x0, sala.rect.y0),
      iso(sala.rect.x1, sala.rect.y0),
      iso(sala.rect.x1, sala.rect.y1),
      iso(sala.rect.x0, sala.rect.y1),
    ];
    poligono(g, cantos);
    g.stroke({ color: CORES.rodape, width: 2, alpha: 0.85 });

    // Marca da porta: um vao claro no rodape.
    poligono(g, losango(sala.door.x, sala.door.y, 0.22));
    g.fill({ color: 0xffffff, alpha: 0.55 });
  }
}

function desenharProps(g: Graphics, layout: OfficeLayout): void {
  g.clear();
  // Ordem de desenho por profundidade (x+y): o que esta atras e pintado antes.
  const ordenados = [...layout.props].sort((a, b) => a.cell.x + a.cell.y - (b.cell.x + b.cell.y));

  for (const p of ordenados) {
    const { x, y } = p.cell;
    switch (p.kind) {
      case 'desk':
        caixaIso(g, x, y, 10, CORES.mesaTopo, CORES.mesaLado, 0.12);
        break;
      case 'sofa':
        caixaIso(g, x, y, 8, CORES.sofa, 0x74898a, 0.1);
        break;
      case 'board':
        caixaIso(g, x, y, 16, CORES.quadro, 0x333c4d, 0.22);
        break;
      case 'printer':
        caixaIso(g, x, y, 9, 0xd7dbe0, 0xa8aeb6, 0.24);
        break;
      case 'meter':
        caixaIso(g, x, y, 18, 0xdfe4ea, 0xa8b0ba, 0.28);
        break;
      case 'coffee':
        caixaIso(g, x, y, 7, 0x8d6e63, 0x6d5248, 0.3);
        break;
      case 'plant': {
        caixaIso(g, x, y, 5, CORES.vaso, 0x9a7154, 0.32);
        const c = iso(x + 0.5, y + 0.5);
        g.circle(c.x, c.y - 12, 7).fill({ color: CORES.planta });
        g.circle(c.x - 5, c.y - 7, 5).fill({ color: 0x7fae78 });
        g.circle(c.x + 5, c.y - 8, 5).fill({ color: 0x5f8f5c });
        break;
      }
      case 'lamp':
        // A luminaria em si e discreta: o que comunica e a LUZ (camada aditiva).
        break;
      default:
        break;
    }
  }
}

/** Caixa isometrica: face superior + duas laterais. Barato e legivel. */
function caixaIso(
  g: Graphics,
  gx: number,
  gy: number,
  altura: number,
  corTopo: number,
  corLado: number,
  recuo: number,
): void {
  const base = losango(gx, gy, recuo);
  const topo = base.map((p) => ({ x: p.x, y: p.y - altura }));

  // sombra de contato
  poligono(g, base);
  g.fill({ color: 0x000000, alpha: 0.1 });

  // lateral esquerda (base[3] -> base[2]) e direita (base[2] -> base[1])
  poligono(g, [base[3]!, base[2]!, topo[2]!, topo[3]!]);
  g.fill({ color: corLado });
  poligono(g, [base[2]!, base[1]!, topo[1]!, topo[2]!]);
  g.fill({ color: escurecer(corLado, 0.88) });

  poligono(g, topo);
  g.fill({ color: corTopo });
  g.stroke({ color: escurecer(corTopo, 0.8), width: 1, alpha: 0.6 });
}

// ---------------------------------------------------------------------------
// Camadas dinamicas
// ---------------------------------------------------------------------------

function desenharPenumbraELuzes(
  penumbra: Graphics,
  luzes: Graphics,
  layout: OfficeLayout,
  quadro: WorldSnapshot | WorldDelta,
  fase: number,
): void {
  penumbra.clear();
  luzes.clear();

  const salaApagada = new Map(quadro.rooms.map((r) => [r.roomId, r]));

  // Penumbra uniforme sobre o piso. Um poligono por sala (nao por celula).
  for (const sala of layout.rooms) {
    const estado = salaApagada.get(sala.roomId);
    const intensidade = estado?.lightBroken ? 0.42 : 0.16;
    const cantos = [
      iso(sala.rect.x0, sala.rect.y0),
      iso(sala.rect.x1, sala.rect.y0),
      iso(sala.rect.x1, sala.rect.y1),
      iso(sala.rect.x0, sala.rect.y1),
    ];
    poligono(penumbra, cantos);
    penumbra.fill({ color: CORES.penumbra, alpha: intensidade });
  }

  for (const lampada of layout.props) {
    if (lampada.kind !== 'lamp') continue;
    const estado = salaApagada.get(lampada.roomId);
    const c = iso(lampada.cell.x + 0.5, lampada.cell.y + 0.5);

    if (estado?.lightBroken) {
      // Lampada com defeito: piscada irregular. O Tecnico esta a caminho.
      const piscada = Math.max(0, Math.sin(fase * 9 + lampada.cell.x) * Math.sin(fase * 3.1));
      if (piscada > 0.7) halo(luzes, c.x, c.y, 60, 0xfff0c0, 0.25);
      continue;
    }
    halo(luzes, c.x, c.y, 92, 0xfff3d6, 0.32);
  }
}

/** Halo de luz em aneis concentricos - substitui gradiente radial sem shader. */
function halo(g: Graphics, x: number, y: number, raio: number, cor: number, alpha: number): void {
  const aneis = 6;
  for (let i = aneis; i >= 1; i--) {
    const r = (raio * i) / aneis;
    g.ellipse(x, y, r, r * (ALTURA_TILE / LARGURA_TILE) * 2).fill({
      color: cor,
      alpha: alpha * (1 - i / (aneis + 1)),
    });
  }
}

/**
 * Estado ambiente: calor da mesa, pilha de fila, lixo, fumaca de incidente.
 * Cada um destes desenhos e a projecao de UMA metrica - nao ha enfeite aqui.
 */
function desenharAmbiente(
  g: Graphics,
  layout: OfficeLayout,
  quadro: WorldSnapshot | WorldDelta,
  fase: number,
): void {
  g.clear();
  const mesaPorId = new Map(layout.props.map((p) => [p.propId, p]));

  for (const mesa of quadro.desks) {
    const prop = mesaPorId.get(mesa.propId);
    if (!prop) continue;
    const c = iso(prop.cell.x + 0.5, prop.cell.y + 0.5);

    // CALOR: retries/loops. Pulsa - fatura crescendo tem urgencia.
    if (mesa.heat > 0.05) {
      const pulso = 0.75 + 0.25 * Math.sin(fase * 4);
      halo(g, c.x, c.y - 6, 34 + mesa.heat * 26, 0xff7a45, 0.16 * mesa.heat * pulso);
    }

    // FILA: pilha de folhas na mesa. "queue depth: 7" ninguem entende;
    // uma pilha de sete folhas, qualquer pessoa entende.
    for (let i = 0; i < mesa.queuePile; i++) {
      g.rect(c.x - 9, c.y - 14 - i * 2.1, 18, 2).fill({ color: 0xfdfdfd, alpha: 0.95 });
      g.rect(c.x - 9, c.y - 14 - i * 2.1, 18, 2).stroke({ color: 0xc9c4bb, width: 0.5 });
    }

    // LIXO: volume de trabalho concluido esperando coleta pelo Zelador.
    for (let i = 0; i < mesa.litter; i++) {
      const ang = (i / Math.max(1, mesa.litter)) * Math.PI * 2;
      g.circle(c.x + Math.cos(ang) * 16, c.y + 6 + Math.sin(ang) * 8, 3).fill({
        color: 0x9aa0a6,
        alpha: 0.85,
      });
    }
  }

  // FUMACA: incidente ativo na sala. Sobe e dissipa.
  for (const sala of quadro.rooms) {
    if (sala.incident < 0.35) continue;
    const geo = layout.rooms.find((r) => r.roomId === sala.roomId);
    if (!geo) continue;
    const c = iso(
      (geo.rect.x0 + geo.rect.x1) / 2,
      (geo.rect.y0 + geo.rect.y1) / 2,
    );
    for (let i = 0; i < 4; i++) {
      const t = (fase * 0.6 + i * 0.25) % 1;
      g.circle(c.x + Math.sin((fase + i) * 1.7) * 10, c.y - 20 - t * 60, 8 + t * 16).fill({
        color: 0x6b7280,
        alpha: (1 - t) * 0.28 * sala.incident,
      });
    }
  }
}

function desenharAtores(
  g: Graphics,
  quadro: WorldSnapshot | WorldDelta,
  selecionado: string | null,
  fase: number,
): void {
  g.clear();
  // Ordenacao por profundidade a cada quadro: quem esta "na frente" cobre.
  const ordenados = [...quadro.actors].sort((a, b) => a.x + a.y - (b.x + b.y));

  for (const ator of ordenados) {
    const c = iso(ator.x + 0.5, ator.y + 0.5);
    const cor = corDoAtor(ator.agentId, ator.isInternal);

    // Respiracao/passo: pequena oscilacao vertical. Sem isso, o boneco parece
    // um icone colado; com isso, parece habitar o espaco.
    const bob = ator.activity === 'walking' ? Math.abs(Math.sin(fase * 8)) * 2.5 : Math.sin(fase * 2) * 0.8;

    // sombra
    g.ellipse(c.x, c.y + 2, 9, 4.5).fill({ color: 0x000000, alpha: 0.18 });

    if (selecionado === ator.agentId) {
      g.ellipse(c.x, c.y + 2, 15, 7.5).stroke({ color: 0x1f2937, width: 2, alpha: 0.8 });
    }

    // corpo e cabeca
    g.roundRect(c.x - 7, c.y - 22 - bob, 14, 18, 5).fill({ color: cor });
    g.circle(c.x, c.y - 26 - bob, 6.5).fill({ color: 0xf6e0c8 });
    g.circle(c.x, c.y - 29 - bob, 6.5).fill({ color: escurecer(cor, 0.7) }); // cabelo/capacete

    // Estado de saude como faixa no peito: legivel mesmo em zoom pequeno.
    if (ator.health !== 'healthy') {
      g.rect(c.x - 7, c.y - 14 - bob, 14, 3).fill({
        color: ator.health === 'failing' ? CORES.perigo : 0xe0a03f,
      });
    }

    // Barra de progresso da atividade: quanto falta para o run terminar.
    if (ator.activity === 'working' && ator.progress > 0) {
      g.rect(c.x - 10, c.y - 38 - bob, 20, 3.5).fill({ color: 0x000000, alpha: 0.18 });
      g.rect(c.x - 10, c.y - 38 - bob, 20 * ator.progress, 3.5).fill({ color: 0x3f8f52 });
    }

    // Aprovacao pendente: o agente esta bloqueado esperando um HUMANO.
    // E o unico estado que interrompe qualquer outra leitura da tela.
    if (ator.activity === 'waiting_approval') {
      const pulso = 0.6 + 0.4 * Math.sin(fase * 5);
      g.circle(c.x, c.y - 46 - bob, 8).fill({ color: 0xffffff, alpha: 0.95 });
      g.circle(c.x, c.y - 46 - bob, 8).stroke({ color: CORES.perigo, width: 2, alpha: pulso });
      g.rect(c.x - 1, c.y - 50 - bob, 2, 5).fill({ color: CORES.perigo });
      g.circle(c.x, c.y - 43 - bob, 1.2).fill({ color: CORES.perigo });
    }

    // Vassoura / chave de fenda dos agentes internos.
    if (ator.activity === 'sweeping') {
      g.rect(c.x + 8, c.y - 20 - bob, 2, 18).fill({ color: 0x8d6e63 });
      g.rect(c.x + 4, c.y - 4 - bob, 10, 3).fill({ color: 0xd9a86c });
    }
    if (ator.activity === 'repairing') {
      g.rect(c.x + 8, c.y - 18 - bob, 2, 10).fill({ color: 0x9aa0a6 });
      halo(g, c.x, c.y - 24, 26, 0xfff3d6, 0.18);
    }
  }
}

// ---------------------------------------------------------------------------
// utilitarios de cor
// ---------------------------------------------------------------------------

/** Cor estavel por agente: derivada do id, nunca sorteada em runtime. */
function corDoAtor(agentId: string, interno: boolean): number {
  if (interno) {
    return agentId.includes('zelador') ? CORES.internoZelador : CORES.internoTecnico;
  }
  let h = 0;
  for (let i = 0; i < agentId.length; i++) h = (h * 31 + agentId.charCodeAt(i)) >>> 0;
  return CORES.ator[h % CORES.ator.length] as number;
}

function escurecer(cor: number, fator: number): number {
  const r = Math.floor(((cor >> 16) & 0xff) * fator);
  const g = Math.floor(((cor >> 8) & 0xff) * fator);
  const b = Math.floor((cor & 0xff) * fator);
  return (r << 16) | (g << 8) | b;
}

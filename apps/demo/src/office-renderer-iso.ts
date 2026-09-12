/**
 * RENDERIZADOR ISO DO DEMO — painter do lab + Klimmos + oclusao.
 *
 * Nao desenha heat/fila/lixo/luz/fumaca (cortados neste ciclo).
 * A fronteira e a mesma do renderer antigo: recebe layout + quadros e pinta.
 */

import type { ActorState, OfficeLayout, WorldDelta, WorldSnapshot } from '@microfirma/contracts';
import { PersonagemKit, type LookKlimmos } from '@microfirma/iso-characters';
import {
  OclusaoCorredor,
  agenciaDeLayout,
  construirEspacoAgencia,
  desenharAgencia,
  desenharAtores,
  escolherAgenteNoPonto,
  elencoIdsDoLayout,
  iso,
  prepararCenaIso,
  projetarAtorSentado,
  type AgenteEspacial,
  type CenaIsoPreparada,
} from '@microfirma/iso-office';
import { carregarWardrobe } from './wardrobe-storage';

export interface RendererHandle {
  push(frame: WorldSnapshot | WorldDelta): void;
  select(agentId: string | null): void;
  focusAgent(agentId: string | null): void;
  resetCamera(): void;
  /** Hit-test em coordenadas de cliente (CSS pixels). */
  pickAgent(clientX: number, clientY: number): string | null;
  setNomes(nomes: ReadonlyMap<string, string>): void;
  lookDe(agentId: string): LookKlimmos;
  aplicarLook(agentId: string, look: LookKlimmos): Promise<void>;
  setOnAgentClick(cb: ((agentId: string) => void) | null): void;
  destroy(): void;
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
  const agencia = agenciaDeLayout(layout);
  const donos = elencoIdsDoLayout(layout, agencia);
  const cenario = construirEspacoAgencia(agencia, donos);
  const porAgente = new Map<string, AgenteEspacial>(
    cenario.agentes.map((a) => [a.agentId, a]),
  );

  const cena: CenaIsoPreparada = await prepararCenaIso(agencia, { stripParedeL: false });
  const estatico = document.createElement('canvas');
  estatico.width = cena.width;
  estatico.height = cena.height;
  const ectx = estatico.getContext('2d');
  if (!ectx) throw new Error('Canvas 2D indisponivel para a camada estatica.');
  await desenharAgencia(ectx, agencia, cena, { fill: '#f4f1ea' });

  const oclusao = await OclusaoCorredor.preparar(cena, layout.corridors);
  const salvo = carregarWardrobe();
  const personagens = await PersonagemKit.carregar({
    agentIdsExtras: donos,
    looksIniciais: salvo.looks,
  });
  let nomes = new Map<string, string>(Object.entries(salvo.nomes));
  let onAgentClick: ((agentId: string) => void) | null = null;
  const pendingBake = new Set<string>();

  const garantirAtores = (frame: WorldSnapshot | WorldDelta): void => {
    for (const ator of frame.actors) {
      if (personagens.tem(ator.agentId) || pendingBake.has(ator.agentId)) continue;
      pendingBake.add(ator.agentId);
      void personagens.garantir(ator.agentId).finally(() => pendingBake.delete(ator.agentId));
    }
  };

  const camera: Camera = { zoom: 1, panX: 0, panY: 0, seguirAgente: null };
  let escalaBase = 1;
  let deslocX = 0;
  let deslocY = 0;
  let dpr = 1;
  let quadro: WorldSnapshot | WorldDelta | null = null;
  let selecionado: string | null = null;
  let tMs = 0;
  let ultimoMs = performance.now();
  let vivo = true;
  let raf = 0;
  let arrastando = false;
  let dragMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragPanStartX = 0;
  let dragPanStartY = 0;

  const clienteParaCena = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const escalaEfetiva = escalaBase * camera.zoom;
    return {
      x: (cx - deslocX - camera.panX) / escalaEfetiva,
      y: (cy - deslocY - camera.panY) / escalaEfetiva,
    };
  };

  const pickAgent = (clientX: number, clientY: number): string | null => {
    if (!quadro) return null;
    const { x, y } = clienteParaCena(clientX, clientY);
    return escolherAgenteNoPonto(
      cena.origem,
      quadro.actors,
      tMs,
      x,
      y,
      personagens.escalaPadrao,
    );
  };

  const ajustar = (): void => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const larguraCss = Math.max(1, palco.clientWidth);
    const alturaCss = Math.max(1, palco.clientHeight);
    canvas.width = Math.round(larguraCss * dpr);
    canvas.height = Math.round(alturaCss * dpr);
    escalaBase = Math.min(larguraCss / cena.width, alturaCss / cena.height) * 0.96;
    deslocX = (larguraCss - cena.width * escalaBase) / 2;
    deslocY = (alturaCss - cena.height * escalaBase) / 2;
  };

  ajustar();
  const observador = new ResizeObserver(ajustar);
  observador.observe(palco);

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
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    arrastando = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragPanStartX = camera.panX;
    dragPanStartY = camera.panY;
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!arrastando) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.hypot(dx, dy) > 6) dragMoved = true;
    if (!dragMoved) return;
    camera.panX = dragPanStartX + dx;
    camera.panY = dragPanStartY + dy;
    camera.seguirAgente = null;
  };

  const onPointerUp = (e: PointerEvent): void => {
    const foiClick = arrastando && !dragMoved;
    arrastando = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (foiClick && onAgentClick) {
      const id = pickAgent(e.clientX, e.clientY);
      if (id) onAgentClick(id);
    }
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
    tMs += Math.min(64, agora - ultimoMs);
    ultimoMs = agora;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const escalaEfetiva = escalaBase * camera.zoom;
    const panEfetivoX = deslocX + camera.panX;
    const panEfetivoY = deslocY + camera.panY;

    if (camera.seguirAgente && quadro) {
      const ator = quadro.actors.find((a) => a.agentId === camera.seguirAgente);
      if (ator) {
        const p = iso(ator.x + 0.5, ator.y + 0.5);
        const sx = cena.origem.x + p.x;
        const sy = cena.origem.y + p.y;
        const alvoX = canvas.width / dpr / 2 - sx * escalaEfetiva;
        const alvoY = canvas.height / dpr / 2 - sy * escalaEfetiva;
        camera.panX += (alvoX - deslocX - camera.panX) * 0.08;
        camera.panY += (alvoY - deslocY - camera.panY) * 0.08;
      }
    }

    ctx.setTransform(
      escalaEfetiva * dpr,
      0,
      0,
      escalaEfetiva * dpr,
      panEfetivoX * dpr,
      panEfetivoY * dpr,
    );
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(estatico, 0, 0);

    if (quadro) {
      const falas = new Map<string, string>();
      if (quadro.kind === 'delta') {
        for (const c of quadro.chatter) falas.set(c.agentId, c.text);
      }
      const atores: (ActorState & { speech?: string })[] = quadro.actors.map((a) => {
        const meta = porAgente.get(a.agentId);
        const projetado = projetarAtorSentado(a, meta?.seatFrac);
        const speech = falas.get(a.agentId);
        return speech ? { ...projetado, speech } : projetado;
      });
      desenharAtores(ctx, cena.origem, atores, tMs, personagens, oclusao, {
        nomes,
        selecionadoId: selecionado,
      });
    }

    raf = requestAnimationFrame(laco);
  };
  raf = requestAnimationFrame(laco);

  return {
    push: (f) => {
      quadro = f;
      garantirAtores(f);
    },
    select: (id) => {
      selecionado = id;
    },
    focusAgent: (id) => {
      camera.seguirAgente = id;
    },
    resetCamera: () => {
      camera.zoom = 1;
      camera.panX = 0;
      camera.panY = 0;
      camera.seguirAgente = null;
      ajustar();
    },
    pickAgent,
    setNomes: (m) => {
      nomes = new Map(m);
    },
    lookDe: (id) => personagens.lookDe(id),
    aplicarLook: async (id, look) => {
      await personagens.definirLook(id, look);
    },
    setOnAgentClick: (cb) => {
      onAgentClick = cb;
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

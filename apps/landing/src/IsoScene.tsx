import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IDS_QUADROS_LANDING,
  listarQuadrosLanding,
  montarSalaLanding,
  prepararCenaIso,
  renderizarCenaIso,
  type CenaIsoPreparada,
} from '@microfirma/iso-office';

const ZOOM_MS = 1800;
const N_QUADROS = IDS_QUADROS_LANDING.length;
/** Folga para marca (topo) e tagline (baixo) sem deslocar o centro da sala. */
const FIT_PAD = 0.88;
/** Nudge optico: sala iso parece pesada a esquerda (paredes NW). */
const NUDGE_X_VW = 0.08;

export type IsoSceneProps = {
  transitioning: boolean;
  onStart: () => void;
  onArrived: () => void;
  onFail: () => void;
};

type BoundsPx = { x: number; y: number; w: number; h: number };

function prefereMenosMovimento(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Bounds do conteudo util no bitmap (ignora padding do canvas minimo 640x360). */
function boundsConteudoPx(cena: CenaIsoPreparada): BoundsPx {
  const x = cena.origem.x + cena.bounds.minX;
  const y = cena.origem.y + cena.bounds.minY;
  const w = Math.max(1, cena.bounds.maxX - cena.bounds.minX);
  const h = Math.max(1, cena.bounds.maxY - cena.bounds.minY);
  return { x, y, w, h };
}

function unirBoundsPx(a: BoundsPx, b: BoundsPx): BoundsPx {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Mapeia o AABB do conteudo no bitmap para retangulo de tela (pos-scale CSS). */
function conteudoNaTela(canvas: HTMLCanvasElement, content: BoundsPx): DOMRect {
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width / canvas.width;
  const sy = rect.height / canvas.height;
  const left = rect.left + content.x * sx;
  const top = rect.top + content.y * sy;
  const width = content.w * sx;
  const height = content.h * sy;
  return new DOMRect(left, top, width, height);
}

/** 0 = longe (landing-0), 1 = em cima / dentro da sala (landing-3). */
function proximidadeNoAabb(
  cx: number,
  cy: number,
  rect: DOMRect,
): { t: number; dentro: boolean } {
  const left = rect.left;
  const top = rect.top;
  const right = rect.right;
  const bottom = rect.bottom;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  const hw = Math.max((right - left) / 2, 1);
  const hh = Math.max((bottom - top) / 2, 1);
  const dentro = cx >= left && cx <= right && cy >= top && cy <= bottom;
  if (dentro) return { t: 1, dentro: true };
  const dx = Math.max(0, Math.abs(cx - midX) - hw);
  const dy = Math.max(0, Math.abs(cy - midY) - hh);
  const dist = Math.hypot(dx, dy);
  const alcance = Math.hypot(window.innerWidth, window.innerHeight) * 0.42;
  const t = 1 - Math.min(1, dist / Math.max(alcance, 1));
  return { t: t * t * (3 - 2 * t), dentro: false };
}

export default function IsoScene({
  transitioning,
  onStart,
  onArrived,
  onFail,
}: IsoSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const buffersRef = useRef<HTMLCanvasElement[]>([]);
  const contentRef = useRef<BoundsPx>({ x: 0, y: 0, w: 1, h: 1 });
  const frameRef = useRef(0);
  const hoverRef = useRef(false);
  const chegou = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const [pronto, setPronto] = useState(false);
  const [fit, setFit] = useState(1);
  const [frame, setFrame] = useState(0);
  const [sobreSala, setSobreSala] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [nudgeX, setNudgeX] = useState(0);
  const [reduzir] = useState(() =>
    typeof window !== 'undefined' ? prefereMenosMovimento() : false,
  );

  const pintarFrame = useCallback((ix: number) => {
    const canvas = canvasRef.current;
    const buf = buffersRef.current[ix];
    if (!canvas || !buf) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, 0, 0);
  }, []);

  useEffect(() => {
    let vivo = true;
    let onResize: (() => void) | undefined;
    void (async () => {
      try {
        listarQuadrosLanding();
        const buffers: HTMLCanvasElement[] = [];
        let maxW = 0;
        let maxH = 0;
        let content: BoundsPx | null = null;
        for (const id of IDS_QUADROS_LANDING) {
          const { agencia } = montarSalaLanding(id);
          const cena = await prepararCenaIso(agencia, { stripParedeL: false, labels: false });
          if (!vivo) return;
          const off = document.createElement('canvas');
          off.width = cena.width;
          off.height = cena.height;
          const octx = off.getContext('2d', { alpha: false });
          if (!octx) throw new Error('Canvas 2D indisponivel');
          await renderizarCenaIso(octx, cena, { fill: '#f4f1ea' });
          buffers.push(off);
          maxW = Math.max(maxW, cena.width);
          maxH = Math.max(maxH, cena.height);
          const b = boundsConteudoPx(cena);
          content = content ? unirBoundsPx(content, b) : b;
        }
        if (!vivo || !canvasRef.current || !content) return;
        buffersRef.current = buffers;
        contentRef.current = content;
        const canvas = canvasRef.current;
        canvas.width = maxW;
        canvas.height = maxH;
        frameRef.current = 0;
        pintarFrame(0);
        onResize = () => {
          setFit(Math.min(window.innerWidth / maxW, window.innerHeight / maxH) * FIT_PAD);
          setNudgeX(window.innerWidth * NUDGE_X_VW);
        };
        onResize();
        window.addEventListener('resize', onResize);
        setPronto(true);
      } catch (erro) {
        console.warn('[landing] iso falhou, usando fallback:', erro);
        if (vivo) onFail();
      }
    })();
    return () => {
      vivo = false;
      if (onResize) window.removeEventListener('resize', onResize);
    };
  }, [onFail, pintarFrame]);

  useEffect(() => {
    if (!pronto || transitioning) return;
    let raf = 0;

    const tick = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { x, y } = pointerRef.current;
      const hit = conteudoNaTela(canvas, contentRef.current);
      const { t, dentro } = proximidadeNoAabb(x, y, hit);
      let ix = reduzir
        ? dentro
          ? N_QUADROS - 1
          : 0
        : Math.round(t * (N_QUADROS - 1));
      ix = Math.max(0, Math.min(N_QUADROS - 1, ix));
      if (ix !== frameRef.current) {
        frameRef.current = ix;
        setFrame(ix);
        pintarFrame(ix);
      }
      if (dentro !== hoverRef.current) {
        hoverRef.current = dentro;
        setSobreSala(dentro);
      }
      if (dentro) {
        setCursorPos({ x, y });
      }
    };

    const onMove = (ev: PointerEvent) => {
      pointerRef.current = { x: ev.clientX, y: ev.clientY };
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    tick();
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [pronto, transitioning, pintarFrame, reduzir]);

  useEffect(() => {
    if (!transitioning || chegou.current) return;
    if (reduzir) {
      chegou.current = true;
      onArrived();
      return;
    }
    const t = window.setTimeout(() => {
      if (chegou.current) return;
      chegou.current = true;
      onArrived();
    }, ZOOM_MS);
    return () => window.clearTimeout(t);
  }, [transitioning, onArrived, reduzir]);

  const escalaBase = fit * (transitioning ? 2.15 : 1);

  const tentarEntrar = (clientX?: number, clientY?: number) => {
    if (transitioning) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const x = clientX ?? pointerRef.current.x;
    const y = clientY ?? pointerRef.current.y;
    const hit = conteudoNaTela(canvas, contentRef.current);
    if (!proximidadeNoAabb(x, y, hit).dentro) return;
    onStart();
  };

  const mostrarCursorHot = sobreSala && !transitioning && !reduzir;

  return (
    <div
      className={[
        'iso-stage',
        pronto ? 'iso-stage--pronta' : '',
        transitioning ? 'iso-stage--zoom' : '',
        sobreSala ? 'iso-stage--hot' : '',
        reduzir ? 'iso-stage--reduced' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="iso-sala"
        role="button"
        tabIndex={0}
        aria-label="entrar no escritorio"
        data-frame={frame}
        onClick={(e) => tentarEntrar(e.clientX, e.clientY)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (transitioning) return;
            hoverRef.current = true;
            setSobreSala(true);
            onStart();
          }
        }}
        style={{
          transform: `translateX(${nudgeX}px) scale(${escalaBase})`,
        }}
      >
        <canvas ref={canvasRef} className="iso-canvas" />
      </div>

      {mostrarCursorHot && (
        <div
          className="cursor-hot"
          aria-hidden
          style={{ left: cursorPos.x, top: cursorPos.y }}
        />
      )}
    </div>
  );
}

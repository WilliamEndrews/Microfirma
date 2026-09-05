/**
 * Viewport atomico do Debugpreview: prepara, valida e publica a cena completa.
 */

import { useEffect, useRef, useState } from 'react';
import type { ActorState } from '@microfirma/contracts';
import { prepararCenaIso } from './cena-isometrica';
import { desenharAgencia } from './desenhar-agencia';
import { desenharAtores, desenharDebugOverlay } from './desenhar-atores';
import { construirEspacoAgencia, type CenarioEspacial } from './espaco-agencia';
import type { AgenciaMontada } from './montar-agencia';
import { RosaVentos } from './RosaVentos';
import { SimulacaoAgentes } from './simulacao-agentes';

type Props = {
  agencia: AgenciaMontada | null;
  vazioSemTemas?: boolean;
};

function contarAtividades(atores: ActorState[]): string {
  const walking = atores.filter((a) => a.activity === 'walking').length;
  const working = atores.filter((a) => a.activity === 'working').length;
  const resting = atores.filter((a) => a.activity === 'resting').length;
  return `${atores.length} agente(s) · ${walking} walking · ${working} working · ${resting} resting`;
}

function limparCanvas(canvas: HTMLCanvasElement, mensagem?: string): void {
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#07111f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (mensagem) {
    ctx.fillStyle = 'rgba(126, 200, 255, 0.9)';
    ctx.font = '12px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText(mensagem, 24, 36);
  }
}

export function PreviewStage({ agencia, vazioSemTemas = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const generationRef = useRef(0);
  const debugRef = useRef(false);
  const [status, setStatus] = useState('palco vazio — informe salas e clique Gerar');
  const [erro, setErro] = useState<string | null>(null);
  const [debugOverlay, setDebugOverlay] = useState(false);
  const [stripParedeL, setStripParedeL] = useState(false);

  debugRef.current = debugOverlay;

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'd' || ev.key === 'D') setDebugOverlay((v) => !v);
      if (ev.key === 'w' || ev.key === 'W') setStripParedeL((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const generationId = ++generationRef.current;
    cancelAnimationFrame(rafRef.current);

    if (!agencia || agencia.slots.length === 0) {
      limparCanvas(canvas);
      setStatus(
        vazioSemTemas || agencia?.slots.length === 0
          ? 'nenhum tema encontrado na biblia para esse pedido'
          : 'palco vazio — informe salas e clique Gerar',
      );
      setErro(null);
      return;
    }

    limparCanvas(canvas, 'montando agencia...');
    setStatus('carregando e validando assets…');
    setErro(null);
    let cancelado = false;

    void (async () => {
      try {
        const cena = await prepararCenaIso(agencia, { stripParedeL });
        if (cancelado || generationId !== generationRef.current) return;

        setStatus('compondo cena isometrica…');
        const staticCanvas = document.createElement('canvas');
        staticCanvas.width = cena.width;
        staticCanvas.height = cena.height;
        const staticCtx = staticCanvas.getContext('2d');
        if (!staticCtx) throw new Error('canvas 2d indisponivel');
        await desenharAgencia(staticCtx, agencia, cena);
        if (cancelado || generationId !== generationRef.current) return;

        const cenario: CenarioEspacial = construirEspacoAgencia(agencia);
        const sim = new SimulacaoAgentes(cenario, agencia.seed);

        canvas.width = cena.width;
        canvas.height = cena.height;
        let ultimo = performance.now();
        let ultimoStatus = 0;

        const loop = (agora: number) => {
          if (cancelado || generationId !== generationRef.current) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          const atores = sim.tick(Math.min(100, agora - ultimo));
          ultimo = agora;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(staticCanvas, 0, 0);
          desenharAtores(ctx, cena.origem, atores, agora);
          if (debugRef.current) {
            desenharDebugOverlay(ctx, cena.origem, { cenario, debug: sim.debugInfo() });
          }

          if (agora - ultimoStatus >= 500) {
            const nBoss = agencia.slots.filter((s) => s.proto.zonaKind === 'boss_room').length;
            const nPriv = agencia.slots.filter((s) => s.proto.zonaKind === 'private').length;
            const nCopas = agencia.slots.filter((s) => s.proto.zonaKind === 'break').length;
            const geracaoTxt = agencia.geracao != null ? ` · g${agencia.geracao}` : '';
            const seedTxt = ` · seed ${agencia.seed.toString(16).slice(0, 6)}`;
            const debugTxt = debugRef.current ? ' · debug (D)' : '';
            const stripTxt = stripParedeL ? ' · stripL (W)' : ' · clipL (W)';
            const warningTxt = cena.warnings.length ? ` · ${cena.warnings.length} aviso(s)` : '';
            setStatus(
              `agencia ${nBoss} Boss + ${nPriv} priv. + ${nCopas} copa · ${contarAtividades(atores)}${geracaoTxt}${seedTxt}${debugTxt}${stripTxt}${warningTxt}`,
            );
            ultimoStatus = agora;
          }
          rafRef.current = requestAnimationFrame(loop);
        };

        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        if (cancelado || generationId !== generationRef.current) return;
        const mensagem = String(err instanceof Error ? err.message : err);
        limparCanvas(canvas, 'falha ao montar a cena');
        setErro(mensagem);
        setStatus('falha estrutural ou asset ausente');
      }
    })();

    return () => {
      cancelado = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [agencia, vazioSemTemas, stripParedeL]);

  return (
    <section className="stage" aria-label="Palco blueprint">
      <div className="stage-scroll">
        <div className="stage-canvas-wrap">
          <canvas ref={canvasRef} className="stage-canvas" />
          {erro ? <p className="stage-erro">{erro}</p> : null}
          <p className="stage-status">{status}</p>
        </div>
      </div>
      <RosaVentos />
    </section>
  );
}

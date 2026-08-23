/**
 * Viewport do Debugpreview — agencia de protos completos + corredor.
 */

import { useEffect, useRef, useState } from 'react';
import { desenharAgencia, medidaAgencia } from './desenhar-agencia';
import type { AgenciaMontada } from './montar-agencia';

type Props = {
  agencia: AgenciaMontada | null;
  vazioSemTemas?: boolean;
};

export function PreviewStage({ agencia, vazioSemTemas = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string>('palco vazio — informe salas/copas e clique Gerar');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!agencia) {
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      setStatus(
        vazioSemTemas
          ? 'nenhum tema encontrado na biblia para esse pedido'
          : 'palco vazio — informe salas/copas e clique Gerar',
      );
      setErro(null);
      return;
    }

    if (agencia.slots.length === 0) {
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      setStatus('nenhum tema encontrado na biblia para esse pedido');
      setErro(null);
      return;
    }

    let cancelado = false;

    (async () => {
      setStatus('montando agencia…');
      setErro(null);
      try {
        const medida = medidaAgencia(agencia);
        if (cancelado) return;
        canvas.width = Math.max(640, Math.min(3200, medida.width));
        canvas.height = Math.max(360, Math.min(2400, medida.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas 2d indisponivel');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        await desenharAgencia(ctx, agencia);
        if (cancelado) return;

        const nSalas = agencia.slots.filter((s) => s.proto.zonaKind === 'private').length;
        const nCopas = agencia.slots.filter((s) => s.proto.zonaKind === 'break').length;
        setStatus(
          `agencia ${nSalas} sala(s) + ${nCopas} copa(s) · corredor ${agencia.pisoCorredor} · ${agencia.slots.length} proto(s)`,
        );
      } catch (err) {
        if (!cancelado) {
          setErro(String(err instanceof Error ? err.message : err));
          setStatus('falha ao desenhar');
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [agencia, vazioSemTemas]);

  return (
    <section className="stage" aria-label="Palco blueprint">
      <div className="stage-grid" aria-hidden="true" />
      <div className="stage-canvas-wrap">
        <canvas ref={canvasRef} className="stage-canvas" />
        {erro ? <p className="stage-erro">{erro}</p> : null}
        <p className="stage-status">{status}</p>
      </div>
    </section>
  );
}

import { useState, useCallback, Suspense } from 'react';
import Scene from './Scene';

const DEMO_URL = import.meta.env.VITE_MICROFIRMA_DEMO_URL ?? 'http://localhost:5173';

export default function App() {
  const [transitioning, setTransitioning] = useState(false);

  const handleEnter = useCallback(() => {
    if (transitioning) return;
    setTransitioning(true);
  }, [transitioning]);

  const handleArrived = useCallback(() => {
    window.location.href = DEMO_URL;
  }, []);

  return (
    <>
      <div className="ui-layer">
        <h1 className="brand">MicroFirma</h1>
        <p className="tagline">Plano de controle espacial para agentes autonomos</p>
        <p className="hint">clique para entrar no escritorio</p>
      </div>

      <Suspense
        fallback={
          <div className="loading" aria-live="polite">
            carregando ambiente
          </div>
        }
      >
        <Scene transitioning={transitioning} onArrived={handleArrived} onStart={handleEnter} />
      </Suspense>
    </>
  );
}

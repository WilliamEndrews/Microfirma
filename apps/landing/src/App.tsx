import { useState, useCallback, Suspense, useMemo } from 'react';
import Scene from './Scene';
import FallbackScene from './FallbackScene';
import ErrorBoundary from './ErrorBoundary';

const DEMO_URL = import.meta.env.VITE_MICROFIRMA_DEMO_URL ?? 'http://localhost:5173';

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return (
      canvas.getContext('webgl') !== null ||
      canvas.getContext('experimental-webgl') !== null
    );
  } catch {
    return false;
  }
}

export default function App() {
  const [transitioning, setTransitioning] = useState(false);
  const webglAvailable = useMemo(hasWebGL, []);

  const handleEnter = useCallback(() => {
    if (transitioning) return;
    setTransitioning(true);
  }, [transitioning]);

  const handleArrived = useCallback(() => {
    window.location.href = DEMO_URL;
  }, []);

  const scene = (
    <Scene
      transitioning={transitioning}
      onArrived={handleArrived}
      onStart={handleEnter}
    />
  );

  return (
    <>
      <div className="ui-layer">
        <h1 className="brand">MicroFirma</h1>
        <p className="tagline">
          Plano de controle espacial para agentes autonomos
        </p>
        <p className="hint">clique para entrar no escritorio</p>
      </div>

      {webglAvailable ? (
        <ErrorBoundary
          fallback={
            <FallbackScene
              transitioning={transitioning}
              onStart={handleEnter}
              onArrived={handleArrived}
            />
          }
        >
          <Suspense
            fallback={
              <div className="loading" aria-live="polite">
                carregando ambiente
              </div>
            }
          >
            {scene}
          </Suspense>
        </ErrorBoundary>
      ) : (
        <FallbackScene
          transitioning={transitioning}
          onStart={handleEnter}
          onArrived={handleArrived}
        />
      )}
    </>
  );
}

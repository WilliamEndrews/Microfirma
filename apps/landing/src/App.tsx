import { useCallback, useState } from 'react';
import ErrorBoundary from './ErrorBoundary';
import FallbackScene from './FallbackScene';
import IsoScene from './IsoScene';
import Onboarding, { type FaseOnboarding } from './Onboarding';
import type { RespostaPonte } from './api';

type Fase = 'idle' | 'zooming' | FaseOnboarding;

export default function App() {
  const [fase, setFase] = useState<Fase>('idle');
  const [isoFalhou, setIsoFalhou] = useState(false);
  const [sessao, setSessao] = useState<RespostaPonte | null>(null);

  const overlayAberto = fase !== 'idle' && fase !== 'zooming';

  const handleEnter = useCallback(() => {
    if (fase !== 'idle') return;
    const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setFase(reduzir || isoFalhou ? 'escolher' : 'zooming');
  }, [fase, isoFalhou]);

  const handleArrived = useCallback(() => {
    setFase((atual) => (atual === 'zooming' || atual === 'idle' ? 'escolher' : atual));
  }, []);

  const handleFail = useCallback(() => {
    setIsoFalhou(true);
  }, []);

  return (
    <>
      <div className={`landing-shell${overlayAberto ? ' landing-shell--recolhido' : ''}`}>
        <header className="landing-brand">
          <h1 className="brand">MicroFirma</h1>
        </header>

        <div className="landing-palco">
          {isoFalhou ? (
            <FallbackScene
              transitioning={fase === 'zooming'}
              onStart={handleEnter}
              onArrived={handleArrived}
            />
          ) : (
            <ErrorBoundary
              fallback={
                <FallbackScene
                  transitioning={fase === 'zooming'}
                  onStart={handleEnter}
                  onArrived={handleArrived}
                />
              }
            >
              <IsoScene
                transitioning={fase === 'zooming'}
                onStart={handleEnter}
                onArrived={handleArrived}
                onFail={handleFail}
              />
            </ErrorBoundary>
          )}
        </div>

        {!overlayAberto && (
          <p className="landing-tagline">
            Plano de controle espacial para agentes autonomos
          </p>
        )}
      </div>

      {overlayAberto && (
        <Onboarding
          fase={fase}
          sessao={sessao}
          onFase={setFase}
          onSessao={setSessao}
        />
      )}
    </>
  );
}

import { useState, useCallback } from 'react';

interface FallbackSceneProps {
  transitioning: boolean;
  onStart: () => void;
  onArrived: () => void;
}

export default function FallbackScene({
  transitioning,
  onStart,
  onArrived,
}: FallbackSceneProps) {
  const [clicked, setClicked] = useState(false);

  const handleClick = useCallback(() => {
    if (clicked || transitioning) return;
    setClicked(true);
    onStart();
    setTimeout(() => onArrived(), 1200);
  }, [clicked, transitioning, onStart, onArrived]);

  return (
    <div
      className={`fallback-scene ${clicked ? 'fallback-scene--entering' : ''}`}
      onClick={handleClick}
      role="button"
      aria-label="entrar no escritorio"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick()}
    >
      <div className="fallback-room">
        <div className="vulto vulto--1" />
        <div className="vulto vulto--2" />
        <div className="vulto vulto--3" />
        <div className="vulto vulto--4" />
        <div className="vulto vulto--5" />
      </div>
    </div>
  );
}

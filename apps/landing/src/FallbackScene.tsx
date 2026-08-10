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
    setTimeout(() => onArrived(), 1400);
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
      <div className="css-room">
        <div className="css-wall css-wall--floor" />
        <div className="css-wall css-wall--left" />
        <div className="css-wall css-wall--right" />
        <div className="css-wall css-wall--back" />
        <div className="css-shadow" />
        <div className="css-vulto css-vulto--1" />
        <div className="css-vulto css-vulto--2" />
        <div className="css-vulto css-vulto--3" />
        <div className="css-vulto css-vulto--4" />
        <div className="css-vulto css-vulto--5" />
      </div>
    </div>
  );
}

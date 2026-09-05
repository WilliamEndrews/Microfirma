/**
 * Rosa dos ventos alinhada aos eixos reais do grid iso do preview.
 * Norte = -gy (faixa norte / Wall_R); Leste = +gx.
 */

import { ALTURA_TILE, LARGURA_TILE } from './proto-blit/iso';

/** Graus CSS (horario) para o N do SVG (para cima) apontar ao norte do mundo. */
export const ANGULO_ROSA_DEG =
  (Math.atan2(LARGURA_TILE / 2, ALTURA_TILE / 2) * 180) / Math.PI;

export function RosaVentos() {
  return (
    <aside className="rosa-ventos" aria-label="Rosa dos ventos: Norte Sul Leste Oeste">
      <svg
        className="rosa-ventos-svg"
        viewBox="0 0 72 72"
        width="72"
        height="72"
        style={{ transform: `rotate(${ANGULO_ROSA_DEG}deg)` }}
      >
        <circle cx="36" cy="36" r="33" className="rosa-ring" />
        <line x1="36" y1="10" x2="36" y2="62" className="rosa-eixo" />
        <line x1="10" y1="36" x2="62" y2="36" className="rosa-eixo" />
        <polygon points="36,8 40,22 36,18 32,22" className="rosa-ponta" />
        <text x="36" y="16" textAnchor="middle" className="rosa-letra">
          N
        </text>
        <text x="36" y="64" textAnchor="middle" className="rosa-letra">
          S
        </text>
        <text x="62" y="39" textAnchor="middle" className="rosa-letra">
          L
        </text>
        <text x="12" y="39" textAnchor="middle" className="rosa-letra">
          O
        </text>
      </svg>
    </aside>
  );
}

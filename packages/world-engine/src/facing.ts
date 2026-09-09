/**
 * Direcao cardinal mais proxima de um deslocamento no grid.
 *
 * A comparacao abaixo equivale a projetar o vetor em iso 2:1 e escolher
 * qual das quatro diagonais visuais (SW/NW/NE/SE) tem maior produto escalar.
 * Centralizar esta regra impede que simuladores locais divirjam do engine.
 */
export function facingDeDelta(
  dx: number,
  dy: number,
  fallback: 0 | 1 | 2 | 3 = 0,
): 0 | 1 | 2 | 3 {
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return fallback;

  const candidatos: readonly {
    facing: 0 | 1 | 2 | 3;
    gx: number;
    gy: number;
  }[] = [
    { facing: 0, gx: 0, gy: 1 },
    { facing: 1, gx: -1, gy: 0 },
    { facing: 2, gx: 0, gy: -1 },
    { facing: 3, gx: 1, gy: 0 },
  ];

  let melhor = fallback;
  let maior = -Infinity;
  for (const candidato of candidatos) {
    const produto = dx * candidato.gx + dy * candidato.gy;
    if (produto > maior) {
      maior = produto;
      melhor = candidato.facing;
    }
  }
  return melhor;
}

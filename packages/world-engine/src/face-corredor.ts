import type { Cell, Room } from '@microfirma/contracts';

/**
 * True se a aresta norte/sul da sala compartilha lado com uma celula de
 * `layout.corridors`. Norte da sala sul e sul da sala norte dao true.
 * Norte da sala norte (fachada) e oeste de qualquer sala dao false.
 */
export function faceTocaCorredor(
  sala: Room,
  face: 'norte' | 'sul',
  corridors: readonly Cell[],
): boolean {
  const corredor = new Set(corridors.map((c) => `${c.x},${c.y}`));
  const { x0, x1, y0, y1 } = sala.rect;
  if (face === 'norte') {
    for (let x = x0; x < x1; x++) {
      if (corredor.has(`${x},${y0 - 1}`)) return true;
    }
    return false;
  }
  for (let x = x0; x < x1; x++) {
    if (corredor.has(`${x},${y1}`)) return true;
  }
  return false;
}

import type { Cell, Room, WallFace } from '@microfirma/contracts';
import { faceTocaCorredor } from './face-corredor.js';

/**
 * Faces de parede do escritorio. O renderer so blita este array.
 *
 * Oeste: Wall_L. Norte que nao toca corredor: Wall_R. Face do corredor: glass.
 * Sul do predio: nada. Porta e folha (`temPorta`), nao substitui o tile.
 */
export function emitirParedes(rooms: readonly Room[], corridors: readonly Cell[]): WallFace[] {
  const walls: WallFace[] = [];
  for (const sala of rooms) {
    const { x0, y0, y1 } = sala.rect;
    const x1 = sala.rect.x1;
    const vidroNorte = faceTocaCorredor(sala, 'norte', corridors);
    const vidroSul = faceTocaCorredor(sala, 'sul', corridors);

    for (let x = x0; x < x1; x++) {
      walls.push({
        cell: { x, y: y0 },
        papel: vidroNorte ? 'glass' : 'wall_r',
        roomId: sala.roomId,
        temPorta: sala.door.x === x && sala.door.y === y0,
      });
    }

    for (let y = y0; y < y1; y++) {
      const portaNoNorte = sala.door.x === x0 && sala.door.y === y0;
      walls.push({
        cell: { x: x0, y },
        papel: 'wall_l',
        roomId: sala.roomId,
        temPorta: sala.door.x === x0 && sala.door.y === y && !portaNoNorte,
      });
    }

    if (vidroSul) {
      const ySul = y1 - 1;
      for (let x = x0; x < x1; x++) {
        walls.push({
          cell: { x, y: ySul },
          papel: 'glass',
          roomId: sala.roomId,
          temPorta: sala.door.x === x && sala.door.y === ySul,
        });
      }
    }
  }
  return walls;
}

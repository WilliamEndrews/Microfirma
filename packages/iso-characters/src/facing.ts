/**
 * Mapa ActorState.facing (cardinal) -> linha da folha Klimmos (diagonal iso).
 * facing: 0=sul, 1=oeste, 2=norte, 3=leste
 */

import { DIR_ROW, type DirRow } from './folha.js';

export function facingParaDirRow(facing: 0 | 1 | 2 | 3): DirRow {
  switch (facing) {
    case 0:
      return DIR_ROW.SW; // +gy projeta para baixo/esquerda
    case 1:
      return DIR_ROW.NW; // -gx projeta para cima/esquerda
    case 2:
      return DIR_ROW.NE; // -gy projeta para cima/direita
    case 3:
      return DIR_ROW.SE; // +gx projeta para baixo/direita
    default: {
      const _exhaustive: never = facing;
      return _exhaustive;
    }
  }
}

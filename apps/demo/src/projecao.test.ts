/**
 * A calibracao TinyHouse tem de sobreviver ao round-trip lab -> JSON -> ancora.
 * Se este teste quebrar, o laboratorio e a demo divergiram.
 */
import { describe, expect, it } from 'vitest';
import {
  ALTURA_TILE,
  ANCORA_PISO,
  ANCORA_PORTA,
  ANCORA_WALL_L,
  ANCORA_WALL_R,
  FOLGA_PORTA,
  PE_PORTA,
  PE_WALL_L,
  PE_WALL_R,
  PORTA_COMO_FOLHA,
  ancoraDePe,
  specObjeto,
} from './projecao';

describe('calibracao TinyHouse (rodada 5, plano B)', () => {
  it('piso permanece no centro da face do diamante', () => {
    expect(ANCORA_PISO).toEqual({ x: 64, y: 68 });
  });

  it('ancora de parede e o pe do chao deslocado meia altura de tile', () => {
    expect(ANCORA_WALL_R).toEqual({ x: PE_WALL_R.x, y: PE_WALL_R.y + ALTURA_TILE / 2 });
    expect(ANCORA_WALL_L).toEqual({ x: PE_WALL_L.x, y: PE_WALL_L.y + ALTURA_TILE / 2 });
  });

  it('ancora da porta inclui a folga que centra a folha na Wall_R', () => {
    expect(ANCORA_PORTA).toEqual(ancoraDePe(PE_PORTA, FOLGA_PORTA));
  });

  it('porta e folha sobre a parede, nao substitui o tile', () => {
    expect(PORTA_COMO_FOLHA).toBe(true);
  });

  it('mesa principal alinha o canvas 128 ao centro da face do piso', () => {
    expect(specObjeto('desk')).toEqual({ modo: 'centro', ancora: { x: 64, y: 68 } });
  });

  it('bebedouro prega o pe do diamante no vertice NW (esquadro amarelo)', () => {
    expect(specObjeto('water')).toEqual({ modo: 'canto', pe: { x: 64, y: 63 } });
  });
});

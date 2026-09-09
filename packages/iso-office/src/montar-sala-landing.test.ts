import { describe, expect, it } from 'vitest';
import { Room } from '@microfirma/contracts';
import { compilarCenaIso, validarCenaIso } from './cena-isometrica';
import {
  IDS_QUADROS_LANDING,
  listarQuadrosLanding,
  montarSalaLanding,
} from './montar-sala-landing';

describe('montarSalaLanding', () => {
  it('lista os quatro quadros na ordem 0..3', () => {
    const quadros = listarQuadrosLanding();
    expect(quadros.map((t) => t.id)).toEqual([...IDS_QUADROS_LANDING]);
  });

  it('default e landing-0 e o Room e valido', () => {
    const { room, tema } = montarSalaLanding();
    expect(tema.id).toBe('landing-0');
    expect(room.kind).toBe('landing');
    expect(room.temaId).toBe('landing-0');
    expect(Room.parse(room).kind).toBe('landing');
  });

  it('monta cada quadro da sequencia', () => {
    for (const id of IDS_QUADROS_LANDING) {
      const { agencia, room, tema } = montarSalaLanding(id);
      expect(tema.id).toBe(id);
      const cena = compilarCenaIso(agencia);
      expect(validarCenaIso(agencia, cena)).toEqual([]);
      const w = room.rect.x1 - room.rect.x0;
      const h = room.rect.y1 - room.rect.y0;
      const floors = cena.commands.filter((c) => c.id.startsWith(`${room.zoneId}:floor:`));
      expect(floors).toHaveLength(w * h);
    }
  });
});

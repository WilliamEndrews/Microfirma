import { describe, expect, it } from 'vitest';
import { COMBOS, CATALOGO, specPorId } from './catalogo';

describe('catalogo proto-blit', () => {
  it('specPorId resolve asset simples do catalogo base', () => {
    const spec = specPorId('office-normal-table');
    expect(spec).toBeDefined();
    expect(spec!.fileName).toContain('Office_Normal_Table');
    expect(spec!.camadas).toBeUndefined();
  });

  it('specPorId resolve combo de combinacoes-laboratorio.json', () => {
    expect(COMBOS.some((c) => c.assetId === 'office-normal-table-combo')).toBe(true);
    const spec = specPorId('office-normal-table-combo');
    expect(spec).toBeDefined();
    expect(spec!.camadas?.length).toBeGreaterThanOrEqual(2);
    expect(spec!.camadas!.some((c) => c.assetId === 'office-normal-table')).toBe(true);
  });

  it('specPorId resolve mesa-notebook usada nos temas', () => {
    const spec = specPorId('mesa-notebook');
    expect(spec).toBeDefined();
    expect(spec!.camadas?.length).toBeGreaterThanOrEqual(2);
  });

  it('todos os assetIds de camadas dos combos existem no catalogo', () => {
    const ids = new Set(CATALOGO.assets.map((a) => a.assetId));
    for (const combo of COMBOS) {
      for (const cam of combo.camadas ?? []) {
        expect(ids.has(cam.assetId), `${combo.assetId} -> ${cam.assetId}`).toBe(true);
      }
    }
  });
});

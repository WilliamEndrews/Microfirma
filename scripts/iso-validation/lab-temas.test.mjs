import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  facingOlhandoPara,
  inferirFacingAssento,
  mesaMaisProximaDoPosto,
  mesclarCombos,
  normalizarPostosTrabalho,
  postoParaGrid,
  anexoParedeValido,
  rebasearAnexoParede,
  restaurarCoresDoTema,
  validarPalco,
} from './lab-temas.mjs';

describe('restaurarCoresDoTema', () => {
  it('materializa t.piso quando pisoLivre e null', () => {
    const r = restaurarCoresDoTema(
      { tilesetAtivo: 'nordic-calm', piso: 'WoodLight', parede: 'BrokenWhite' },
      { piso: 'Concrete', parede: 'White' },
    );
    expect(r.pisoLivre).toBe('WoodLight');
    expect(r.paredeLivre).toBe('BrokenWhite');
    expect(r.pisoEfetivo).toBe('WoodLight');
  });

  it('prefere pisoLivre explicito', () => {
    const r = restaurarCoresDoTema(
      { pisoLivre: 'Marble', piso: 'WoodLight', paredeLivre: null, parede: 'X' },
      { piso: 'Concrete', parede: 'White' },
    );
    expect(r.pisoLivre).toBe('Marble');
    expect(r.pisoEfetivo).toBe('Marble');
  });
});

describe('validarPalco', () => {
  it('detecta assetIds ausentes', () => {
    const specs = new Set(['mesa-a']);
    const r = validarPalco(
      [{ assetId: 'mesa-a', gx: 1, gy: 1 }, { assetId: 'combo-x', gx: 2, gy: 2 }],
      (id) => (specs.has(id) ? { assetId: id } : undefined),
    );
    expect(r.ok).toBe(false);
    expect(r.missingAssetIds).toEqual(['combo-x']);
  });
});

describe('mesclarCombos', () => {
  it('disco vence conflito de assetId', () => {
    const disco = [{ assetId: 'c1', nome: 'disco' }];
    const local = [{ assetId: 'c1', nome: 'local' }, { assetId: 'c2', nome: 'local2' }];
    const m = mesclarCombos(disco, local);
    expect(m.find((c) => c.assetId === 'c1')?.nome).toBe('disco');
    expect(m.find((c) => c.assetId === 'c2')?.nome).toBe('local2');
  });
});

describe('postosTrabalho', () => {
  it('normaliza e converte para grid fracionario', () => {
    const postos = normalizarPostosTrabalho([
      { agentSlot: 'agent-boss', gx: 1, gy: 2, qx: 0, qy: 1, passo: 0.5, facing: 0 },
    ]);
    expect(postos).toHaveLength(1);
    const g = postoParaGrid(postos[0]);
    expect(g.x).toBeCloseTo(1.25);
    expect(g.y).toBeCloseTo(2.75);
    expect(g.facing).toBe(0);
    expect(postos[0].facingOrigem).toBe('padrao_norte');
  });

  it('infere mesa proxima, cardinal e fallback norte', () => {
    const posto = { gx: 2, gy: 2, qx: 0, qy: 0, passo: 0.5 };
    const mesa = mesaMaisProximaDoPosto(posto, [
      { assetId: 'longe', gx: 7, gy: 7 },
      { assetId: 'perto', gx: 2, gy: 1 },
    ]);
    expect(mesa.assetId).toBe('perto');
    expect(inferirFacingAssento(posto, mesa)).toEqual({
      facing: 2,
      facingOrigem: 'olhar_mesa',
    });
    expect(
      inferirFacingAssento(posto, { assetId: 'mesma', gx: 2, gy: 2 }),
    ).toEqual({ facing: 2, facingOrigem: 'padrao_norte' });
    expect(facingOlhandoPara({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(3);
  });
});

describe('ancoras de parede', () => {
  it('rebaseia offset enorme preservando a posicao visual', () => {
    const original = {
      assetId: 'projector-screen',
      papel: 'wall',
      face: 'R',
      gx: 3,
      gy: 0,
      dx: -504,
      dy: 29,
    };
    const pes = { R: { x: 32, y: 83 }, L: { x: 95, y: 83 } };
    const next = rebasearAnexoParede(original, 5, 5, pes);
    const iso = (x, y) => ({ x: (x - y) * 64, y: (x + y) * 32 });
    const a = iso(original.gx, 0);
    const b = next.face === 'L' ? iso(0, next.gy) : iso(next.gx, 0);
    expect(b.x + next.dx - pes[next.face].x).toBe(a.x + original.dx - pes.R.x);
    expect(b.y + next.dy - pes[next.face].y).toBe(a.y + original.dy - pes.R.y);
    expect(anexoParedeValido(next)).toBe(true);
  });

  it('todos os anexos persistidos estao reancorados localmente', () => {
    const path = new URL(
      '../../packages/world-engine/src/biblia/temas-arquiteto.json',
      import.meta.url,
    );
    const doc = JSON.parse(fs.readFileSync(path, 'utf8'));
    const anexos = doc.temas.flatMap((t) =>
      (t.palco || []).filter((p) => p.papel === 'wall' || p.face === 'R' || p.face === 'L'),
    );
    expect(anexos.length).toBeGreaterThan(0);
    expect(anexos.filter((p) => !anexoParedeValido(p))).toEqual([]);
  });
});

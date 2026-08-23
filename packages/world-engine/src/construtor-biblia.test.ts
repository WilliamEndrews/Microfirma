import { describe, expect, it } from 'vitest';
import { INITIAL_CATALOG } from '@microfirma/contracts';
import { createRng } from './prng.js';
import {
  BIBLIA_TEMAS,
  escolherAssetId,
  escolherTema,
  kindChaoAtivo,
  listarProtos,
  resolverTilesetZona,
} from './construtor-biblia.js';

describe('biblia do Construtor', () => {
  it('carrega temas do laboratorio', () => {
    expect(BIBLIA_TEMAS.temas.length).toBeGreaterThan(0);
    expect(BIBLIA_TEMAS.politicaTiles.private?.modo).toBe('default');
  });

  it('escolhe tema por zonaKind e prioridade', () => {
    const rng = createRng(1);
    const usados = new Set<string>();
    const tema = escolherTema('private', rng, usados);
    expect(tema?.id).toBe('nordic-privativo');
    expect(listarProtos('private').map((t) => t.id)).toContain('nordic-privativo');
    expect(escolherTema('meeting', rng, usados)).toBeUndefined();
  });

  it('desk/chair preferem asset obrigatorio; kind de parede nao e chao', () => {
    const rng = createRng(7);
    expect(escolherAssetId('desk', rng)).toBe('office-main-table');
    expect(escolherAssetId('chair', rng)).toBe('basic-office-chair');
    expect(kindChaoAtivo('board')).toBe(true);
    const boards = INITIAL_CATALOG.assets.filter((a) => a.kind === 'board' && a.papel === 'prop');
    expect(boards.some((a) => a.assetId === 'board-full')).toBe(true);
  });

  it('politica default herda o tileset do tema', () => {
    const rng = createRng(3);
    const tema = escolherTema('private', rng, new Set());
    const visual = resolverTilesetZona('private', tema, 'midnight-ops', rng);
    expect(visual.tileSetId).toBe('nordic-calm');
    expect(escolherTema('corridor', rng, new Set())?.tilesetAtivo).toBe('cool-lab');
    expect(escolherTema('break', rng, new Set())?.tilesetAtivo).toBe('warm-studio');
  });
});

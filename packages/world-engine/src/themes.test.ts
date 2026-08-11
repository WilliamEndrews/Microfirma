/**
 * Testes do sistema de temas (ADR-0008) e do mapa de temas -> packs (ADR-0012).
 */

import { describe, it, expect } from 'vitest';
import { KNOWN_PACKS } from '@microfirma/contracts';
import { TEMAS, resolverPaleta, buscarTema, resolverPacksDoTema, PACOTES_BASE_COMPARTILHADA } from './themes.js';

const PACK_IDS_CONHECIDOS = new Set(KNOWN_PACKS.map((p) => p.packId));

describe('themes', () => {
  it('TEMAS tem pelo menos 3 temas', () => {
    expect(TEMAS.length).toBeGreaterThanOrEqual(3);
  });

  it('cada tema tem nome, palette com 4 cores e greenery 0..1', () => {
    for (const tema of TEMAS) {
      expect(tema.name).toBeTruthy();
      expect(tema.palette.length).toBeGreaterThanOrEqual(4);
      expect(tema.greenery).toBeGreaterThanOrEqual(0);
      expect(tema.greenery).toBeLessThanOrEqual(1);
    }
  });

  it('buscarTema encontra tema por nome', () => {
    const tema = buscarTema('nordic-calm');
    expect(tema.name).toBe('nordic-calm');
  });

  it('buscarTema retorna nordic-calm para nome inexistente', () => {
    const tema = buscarTema('inexistente');
    expect(tema.name).toBe('nordic-calm');
  });
});

describe('resolverPaleta', () => {
  it('resolve todas as cores necessarias', () => {
    const paleta = resolverPaleta(TEMAS[0]!);
    expect(paleta.fundo).toBeGreaterThan(0);
    expect(paleta.corredor).toBeGreaterThan(0);
    expect(paleta.parede).toBeGreaterThan(0);
    expect(paleta.mesaTopo).toBeGreaterThan(0);
    expect(paleta.mesaLado).toBeGreaterThan(0);
    expect(paleta.planta).toBeGreaterThan(0);
    expect(paleta.penumbra).toBe(0x101828);
    expect(paleta.ator.length).toBeGreaterThanOrEqual(7);
    expect(paleta.internoZelador).toBeGreaterThan(0);
    expect(paleta.internoTecnico).toBeGreaterThan(0);
    expect(paleta.perigo).toBe(0xd94f4f);
  });

  it('piso tem todas as kinds de sala', () => {
    const paleta = resolverPaleta(TEMAS[0]!);
    for (const kind of ['open', 'private', 'break', 'meeting', 'war_room', 'reception']) {
      expect(paleta.piso[kind]).toBeDefined();
    }
  });

  it('cores mudam com tema diferente', () => {
    const p1 = resolverPaleta(TEMAS[0]!);
    const p2 = resolverPaleta(TEMAS[1]!);
    expect(p1.fundo).not.toBe(p2.fundo);
  });

  it('fallback para palette incompleta', () => {
    const paleta = resolverPaleta({ name: 'x', palette: ['#FF0000'], greenery: 0.5 });
    expect(paleta.fundo).toBeGreaterThan(0);
  });
});

describe('mapa de temas -> packs (ADR-0012)', () => {
  it('cada tema declara pelo menos um pack estrutural', () => {
    for (const tema of TEMAS) {
      const packs = resolverPacksDoTema(tema);
      expect(packs.structural.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('todo packId referenciado por um tema existe em KNOWN_PACKS', () => {
    for (const tema of TEMAS) {
      for (const packId of resolverPacksDoTema(tema).structural) {
        expect(PACK_IDS_CONHECIDOS.has(packId)).toBe(true);
      }
    }
  });

  it('base compartilhada (piso, vegetacao) existe em KNOWN_PACKS', () => {
    expect(PACK_IDS_CONHECIDOS.has(PACOTES_BASE_COMPARTILHADA.floor)).toBe(true);
    expect(PACK_IDS_CONHECIDOS.has(PACOTES_BASE_COMPARTILHADA.vegetation)).toBe(true);
  });

  it('resolverPacksDoTema cai para o padrao quando o tema nao declara packs (LLM customizado)', () => {
    const packs = resolverPacksDoTema({});
    expect(packs.structural.length).toBeGreaterThanOrEqual(1);
    for (const packId of packs.structural) {
      expect(PACK_IDS_CONHECIDOS.has(packId)).toBe(true);
    }
  });
});

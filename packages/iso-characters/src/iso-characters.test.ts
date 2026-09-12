import { describe, expect, it } from 'vitest';
import { atividadeParaAnim } from './atividade.js';
import { ordemBlit, urlCamada } from './carregar.js';
import { facingParaDirRow } from './facing.js';
import { DIR_ROW, frameDeTempo, rectFrame } from './folha.js';
import {
  aleatorizarSlot,
  lookAleatorio,
  lookDoAgente,
  normalizarLook,
  validarLook,
  TOPS_ACIMA_CABELO,
} from './presets.js';
import {
  ALTURA_PERSONAGEM_KLIMMOS,
  ESCALA_KLIMMOS_PADRAO,
  ALTURA_BASE_SENTADO,
  PAD_BASE_SIT,
  PAD_PE_FRAME,
  dimensoesPersonagem,
  offsetPeChao,
  offsetSentado,
  pontoNoRetangulo,
  retanguloPersonagem,
} from './kit.js';

describe('facingParaDirRow', () => {
  it('mapeia cardinais para diagonais Klimmos', () => {
    expect(facingParaDirRow(0)).toBe(DIR_ROW.SW);
    expect(facingParaDirRow(1)).toBe(DIR_ROW.NW);
    expect(facingParaDirRow(2)).toBe(DIR_ROW.NE);
    expect(facingParaDirRow(3)).toBe(DIR_ROW.SE);
  });
});

describe('rectFrame / frameDeTempo', () => {
  it('calcula sx/sy da folha 8x4', () => {
    expect(rectFrame(DIR_ROW.SW, 0)).toEqual({ sx: 0, sy: 0, sw: 64, sh: 80 });
    expect(rectFrame(DIR_ROW.SE, 3)).toEqual({ sx: 192, sy: 80, sw: 64, sh: 80 });
    expect(rectFrame(DIR_ROW.NW, 7)).toEqual({ sx: 448, sy: 240, sw: 64, sh: 80 });
  });

  it('cicla frames pelo tempo', () => {
    expect(frameDeTempo(0, 100)).toBe(0);
    expect(frameDeTempo(350, 100)).toBe(3);
    expect(frameDeTempo(800, 100)).toBe(0);
  });
});

describe('atividadeParaAnim', () => {
  it('escolhe Walk / Sit / Idle', () => {
    expect(atividadeParaAnim('walking')).toBe('Walk');
    expect(atividadeParaAnim('working')).toBe('Idle');
    expect(atividadeParaAnim('working', 'seated')).toBe('Sit');
    expect(atividadeParaAnim('waiting_approval', 'seated')).toBe('Sit');
    expect(atividadeParaAnim('resting')).toBe('Idle');
    expect(atividadeParaAnim('idle')).toBe('Idle');
    expect(atividadeParaAnim('talking')).toBe('Idle');
    expect(atividadeParaAnim('sweeping')).toBe('Idle');
  });
});

describe('escala calibrada', () => {
  it('alinha a folha de 80px a altura humana de 96px', () => {
    expect(ESCALA_KLIMMOS_PADRAO).toBe(1.2);
    expect(ALTURA_PERSONAGEM_KLIMMOS).toBe(96);
    expect(dimensoesPersonagem()).toEqual({ largura: 76.8, altura: 96 });
  });

  it('compensa o padding sob o pe sem alterar a escala', () => {
    expect(PAD_PE_FRAME).toBe(4);
    expect(offsetPeChao()).toBeCloseTo(4.8);
  });

  it('baixa o sprite so na pose sentada', () => {
    expect(ALTURA_BASE_SENTADO).toBe(-2);
    // De costas o pad e 19: desce 17px de frame (20,4 em tela).
    expect(offsetSentado('Sit', DIR_ROW.NE)).toBeCloseTo(20.4);
    expect(offsetSentado('Sit', DIR_ROW.NW)).toBeCloseTo(20.4);
    expect(offsetSentado('Sit', DIR_ROW.SW)).toBeCloseTo(4.8);
    expect(offsetSentado('Idle', DIR_ROW.NE)).toBe(0);
    expect(offsetSentado('Walk', DIR_ROW.SW)).toBe(0);
  });

  it('pousa as quatro direcoes de assento na mesma altura', () => {
    const base = (dir: keyof typeof PAD_BASE_SIT) =>
      PAD_BASE_SIT[dir] * ESCALA_KLIMMOS_PADRAO -
      (offsetPeChao() + offsetSentado('Sit', dir));
    const alvo = ALTURA_BASE_SENTADO * ESCALA_KLIMMOS_PADRAO;
    for (const dir of [DIR_ROW.SW, DIR_ROW.SE, DIR_ROW.NE, DIR_ROW.NW]) {
      expect(base(dir)).toBeCloseTo(alvo);
    }
  });
});

describe('presets e layering', () => {
  it('presets fixos dos agentes conhecidos', () => {
    expect(lookDoAgente('agent-boss')).toEqual({
      body: 2,
      hair: 4,
      top: 8,
      bottom: 3,
      shoes: 2,
    });
    expect(lookDoAgente('agent-priv-0').body).toBe(1);
  });

  it('fallback deterministico por agentId', () => {
    const a = lookDoAgente('agent-x-desconhecido');
    const b = lookDoAgente('agent-x-desconhecido');
    expect(a).toEqual(b);
    expect(a.body).toBeGreaterThanOrEqual(1);
    expect(a.body).toBeLessThanOrEqual(4);
  });

  it('tops 13-15 ficam acima do cabelo', () => {
    for (const top of TOPS_ACIMA_CABELO) {
      const ordem = ordemBlit({ body: 1, hair: 2, top, bottom: 1, shoes: 1 });
      expect(ordem.map((c) => c.prefixo)).toEqual([
        'Male_BaseBody',
        'Male_Shoes',
        'Male_BottomClothing',
        'Male_Hairstyle',
        'Male_TopClothing',
      ]);
    }
    const normal = ordemBlit({ body: 1, hair: 2, top: 5, bottom: 1, shoes: 1 });
    expect(normal.map((c) => c.prefixo)).toEqual([
      'Male_BaseBody',
      'Male_Shoes',
      'Male_BottomClothing',
      'Male_TopClothing',
      'Male_Hairstyle',
    ]);
  });

  it('monta URLs das camadas', () => {
    expect(
      urlCamada('Idle', {
        pasta: '01_Base_Bodies',
        prefixo: 'Male_BaseBody',
        indice: 2,
      }),
    ).toBe('/klimmos-iso-male/01_Idle/01_Base_Bodies/Male_BaseBody_02_Idle.png');
    expect(
      urlCamada('Walk', {
        pasta: '03_Top_Clothing',
        prefixo: 'Male_TopClothing',
        indice: 11,
      }),
    ).toBe('/klimmos-iso-male/02_Walk/03_Top_Clothing/Male_TopClothing_11_Walk.png');
  });
});

describe('look helpers', () => {
  it('valida e normaliza looks', () => {
    expect(validarLook(lookDoAgente('agent-boss'))).toBe(true);
    expect(validarLook({ body: 0, hair: 1, top: 1, bottom: 1, shoes: 1 })).toBe(false);
    expect(normalizarLook({ body: 99, hair: 0, top: -1, bottom: 5, shoes: 3 })).toEqual({
      body: 3,
      hair: 10,
      top: 14,
      bottom: 5,
      shoes: 3,
    });
  });

  it('gera look aleatorio deterministico com rng fixo', () => {
    let i = 0;
    const seq = [0, 0.5, 0.99, 0.25, 0.75];
    const rng = () => seq[i++ % seq.length]!;
    expect(lookAleatorio(rng)).toEqual({
      body: 1,
      hair: 6,
      top: 15,
      bottom: 3,
      shoes: 8,
    });
    const base = lookDoAgente('agent-boss');
    expect(aleatorizarSlot(base, 'top', () => 0.5).top).toBe(8);
  });
});

describe('retanguloPersonagem', () => {
  it('hit-test generoso ao redor do pe', () => {
    const r = retanguloPersonagem(100, 200);
    expect(pontoNoRetangulo(100, 150, r)).toBe(true);
    expect(pontoNoRetangulo(100, 210, r)).toBe(true);
    expect(pontoNoRetangulo(0, 0, r)).toBe(false);
  });
});

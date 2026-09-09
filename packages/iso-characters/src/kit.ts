/**
 * Kit de personagens: bake de presets + blit por activity/facing/tempo.
 */

import type { Activity, ActorPose } from '@microfirma/contracts';
import { atividadeParaAnim } from './atividade.js';
import { KLIMMOS_BASE } from './carregar.js';
import { comporTodasAnims, type FolhaComposta } from './compor.js';
import { facingParaDirRow } from './facing.js';
import {
  DIR_ROW,
  FRAME_H,
  FRAME_W,
  frameDeTempo,
  msPorFrameDaAnim,
  rectFrame,
  type AnimacaoKlimmos,
  type DirRow,
} from './folha.js';
import {
  agentesPresetConhecidos,
  lookDoAgente,
  type LookKlimmos,
} from './presets.js';

export type AtlasAgente = Record<AnimacaoKlimmos, FolhaComposta>;

/** 96 px: mesma regua vertical dos atores procedurais do escritorio. */
export const ALTURA_PERSONAGEM_KLIMMOS = 96;
export const ESCALA_KLIMMOS_PADRAO = ALTURA_PERSONAGEM_KLIMMOS / FRAME_H;

/**
 * Pixels transparentes abaixo do pe no frame nativo 64x80.
 * Idle mede footY=75 → pad 4; Walk ~5-6. Usamos o Idle para ancorar
 * milimetricamente o pe no centro do tile sem empurrar o Sit para dentro da cadeira.
 */
export const PAD_PE_FRAME = 4;

/**
 * Pixels transparentes sob o corpo em cada linha de direcao da folha Sit,
 * medidos nas folhas nativas 64x80. De frente (SW/SE) o artista desenha os pes
 * no chao; de costas (NE/NW) a cadeira esconde as pernas e a base do desenho
 * sobe para o quadril. Ancorar o Sit pelo mesmo pe do Idle deixa a pose de
 * costas 13px mais alta que a de frente — e e essa a que flutua.
 */
export const PAD_BASE_SIT: Readonly<Record<DirRow, number>> = {
  [DIR_ROW.SW]: 6,
  [DIR_ROW.SE]: 6,
  [DIR_ROW.NE]: 19,
  [DIR_ROW.NW]: 19,
};

/**
 * Altura (px do frame) em que a base do corpo sentado pousa sobre o centro do
 * tile. Negativa de proposito: o quadril precisa ficar abaixo do pe do Idle
 * para vender "sentado" em vez de "de pe sobre a cadeira". Compensando o pad
 * de cada linha, as quatro direcoes pousam juntas.
 */
export const ALTURA_BASE_SENTADO = -2;

export function dimensoesPersonagem(escala = ESCALA_KLIMMOS_PADRAO): {
  largura: number;
  altura: number;
} {
  return { largura: FRAME_W * escala, altura: FRAME_H * escala };
}

/** Deslocamento vertical (px tela) para cancelar o padding sob o pe. */
export function offsetPeChao(escala = ESCALA_KLIMMOS_PADRAO): number {
  return PAD_PE_FRAME * escala;
}

/**
 * Deslocamento vertical (px tela) somado apenas quando a anim e `Sit`, por cima
 * do `offsetPeChao`. Sai do pad real da linha de direcao, entao vale para as
 * quatro orientacoes de assento sem afundar nenhuma no chao.
 */
export function offsetSentado(
  anim: AnimacaoKlimmos,
  dirRow: DirRow,
  escala = ESCALA_KLIMMOS_PADRAO,
): number {
  if (anim !== 'Sit') return 0;
  return (PAD_BASE_SIT[dirRow] - ALTURA_BASE_SENTADO - PAD_PE_FRAME) * escala;
}

export type OpcoesKit = {
  /** Prefixo URL do pack (default `/klimmos-iso-male`). */
  baseUrl?: string;
  /** agentIds a bakear alem dos presets fixos. */
  agentIdsExtras?: readonly string[];
  /** Escala de desenho (default 1.2 = 76.8x96). */
  escalaPadrao?: number;
};

export class PersonagemKit {
  private readonly atlas = new Map<string, AtlasAgente>();
  private readonly looks = new Map<string, LookKlimmos>();
  readonly escalaPadrao: number;
  private readonly baseUrl: string;

  private constructor(opts: OpcoesKit) {
    this.escalaPadrao = opts.escalaPadrao ?? ESCALA_KLIMMOS_PADRAO;
    this.baseUrl = opts.baseUrl ?? KLIMMOS_BASE;
  }

  static async carregar(opts: OpcoesKit = {}): Promise<PersonagemKit> {
    const kit = new PersonagemKit(opts);
    const ids = new Set<string>([
      ...agentesPresetConhecidos(),
      ...(opts.agentIdsExtras ?? []),
    ]);
    await Promise.all([...ids].map((id) => kit.garantir(id)));
    return kit;
  }

  lookDe(agentId: string): LookKlimmos {
    let look = this.looks.get(agentId);
    if (!look) {
      look = lookDoAgente(agentId);
      this.looks.set(agentId, look);
    }
    return look;
  }

  async garantir(agentId: string): Promise<AtlasAgente> {
    const existente = this.atlas.get(agentId);
    if (existente) return existente;
    const look = this.lookDe(agentId);
    const folhas = await comporTodasAnims(look, this.baseUrl);
    this.atlas.set(agentId, folhas);
    return folhas;
  }

  tem(agentId: string): boolean {
    return this.atlas.has(agentId);
  }

  /**
   * Desenha o personagem com pe ancorado em (x, y) — centro do tile iso.
   * Retorna false se o atlas do agente ainda nao foi bakeado.
   */
  desenhar(
    ctx: CanvasRenderingContext2D,
    agentId: string,
    activity: Activity,
    pose: ActorPose,
    facing: 0 | 1 | 2 | 3,
    tMs: number,
    x: number,
    y: number,
    escala = this.escalaPadrao,
  ): boolean {
    const atlas = this.atlas.get(agentId);
    if (!atlas) return false;

    const anim = atividadeParaAnim(activity, pose);
    const folha = atlas[anim];
    const dirRow = facingParaDirRow(facing);
    const frame = frameDeTempo(tMs, msPorFrameDaAnim(anim));
    const { sx, sy, sw, sh } = rectFrame(dirRow, frame);

    const { largura: dw, altura: dh } = dimensoesPersonagem(escala);
    // Pe no centro do tile: base util do sprite (nao o padding transparente).
    const dx = x - dw / 2;
    const dy = y - dh + offsetPeChao(escala) + offsetSentado(anim, dirRow, escala);

    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(folha, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.imageSmoothingEnabled = prevSmooth;
    return true;
  }
}

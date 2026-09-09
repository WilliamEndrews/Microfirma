/**
 * @microfirma/iso-characters
 *
 * Runtime do Klimmos Cozy Iso Modular Male Kit: compose modular + blit
 * Idle/Walk/Sit para atores do MicroFirma.
 */

export {
  FRAME_W,
  FRAME_H,
  COLS,
  ROWS,
  SHEET_W,
  SHEET_H,
  DIR_ROW,
  rectFrame,
  frameDeTempo,
  msPorFrameDaAnim,
  type DirRow,
  type AnimacaoKlimmos,
} from './folha.js';

export { facingParaDirRow } from './facing.js';
export { atividadeParaAnim } from './atividade.js';

export {
  lookDoAgente,
  agentesPresetConhecidos,
  TOPS_ACIMA_CABELO,
  BODY_MAX,
  HAIR_MAX,
  TOP_MAX,
  BOTTOM_MAX,
  SHOES_MAX,
  type LookKlimmos,
} from './presets.js';

export {
  KLIMMOS_BASE,
  camadasDoLook,
  ordemBlit,
  urlCamada,
  carregarImagem,
  type CamadaArquivo,
} from './carregar.js';

export { comporFolha, comporTodasAnims, type FolhaComposta } from './compor.js';

export {
  PersonagemKit,
  ALTURA_PERSONAGEM_KLIMMOS,
  ESCALA_KLIMMOS_PADRAO,
  PAD_PE_FRAME,
  PAD_BASE_SIT,
  ALTURA_BASE_SENTADO,
  dimensoesPersonagem,
  offsetPeChao,
  offsetSentado,
  type AtlasAgente,
  type OpcoesKit,
} from './kit.js';

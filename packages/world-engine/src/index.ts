/**
 * @microfirma/world-engine
 *
 * Simulacao autoritativa do escritorio. Nenhuma dependencia de navegador,
 * nenhuma dependencia de rede, nenhuma chamada de LLM: e uma funcao pura de
 * (layout, seed, eventos, dt) -> quadros de mundo. E por isso que ela pode
 * rodar no servidor, ser testada em milissegundos e reproduzir o passado.
 */

export { createRng, hashString, type Rng } from './prng.js';
export {
  planSpaceProgram,
  avatarSeedDe,
  type CollaborationEdge,
  type PlanOptions,
} from './space-program.js';
export { solveLayout } from './layout-solver.js';
export { faceTocaCorredor } from './face-corredor.js';
export { facingDeDelta } from './facing.js';
export { validarLayout, assertLayoutValido, type Violacao } from './layout-validation.js';
export {
  buildNavGrid,
  findPath,
  footprintCells,
  isTransitionAllowed,
  isWalkable,
  propBloqueia,
  reachableFrom,
  seatCellFor,
  type NavGrid,
  type ResolverColisao,
} from './navgrid.js';
export {
  NarrativeScheduler,
  CONFIG_PADRAO,
  type NarrativeConfig,
  type NarrativeOutput,
  type AgentAmbient,
  type Chatter,
} from './narrative-scheduler.js';
export { WorldEngine, type WorldEngineOptions } from './world-engine.js';
export {
  postoParaGridWorld,
  resolverAssento,
  resolverPostoAgente,
  facingOlhandoPara,
  mesaMaisProxima,
  inferirFacingAssento,
  type PostoResolvido,
} from './postos-trabalho.js';
export {
  BIBLIA_TEMAS,
  CALIBRACAO_PADRAO,
  escolherAssetId,
  escolherTema,
  listarProtos,
  colarProto,
  visualDoProto,
  gradeDoProto,
  gradeDoZona,
  resolverTilesetZona,
  tileSetDoVisual,
  tileSetsDoLayout,
  kindChaoAtivo,
  kindDoAsset,
  resolverColisaoDoCatalogo,
  type TemaArquiteto,
  type PostoTrabalho,
  type TileVisual,
  type ZonaKindTiles,
  type ColarProtoOpts,
  type ResolverSpec,
} from './construtor-biblia.js';
export { emitirParedes } from './emitir-paredes.js';
export { OtlpIngestor, type OtlpIngestorOptions, type IngestStats } from './otlp-ingestor.js';
export {
  TEMAS,
  resolverPaleta,
  buscarTema,
  resolverPacksDoTema,
  PACOTES_BASE_COMPARTILHADA,
  type Tema,
  type TemaPacks,
  type PaletaResolvida,
} from './themes.js';
export {
  DeterministicArchitect,
  LlmArchitect,
  type AgenteArquiteto,
} from './agente-arquiteto.js';
export {
  DeterministicDecorator,
  LlmDecorator,
  type AgenteDecorador,
} from './agente-decorador.js';

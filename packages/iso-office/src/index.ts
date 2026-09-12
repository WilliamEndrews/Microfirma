/**
 * @microfirma/iso-office
 *
 * Pipeline do escritorio isometrico do lab (painter, temas, 1 Boss + 1 copa),
 * sem o shell do Debugpreview. Cliente e servidor usam as mesmas funcoes.
 */

export {
  selecionarPedido,
  seedDoPedido,
  seedDaGeracao,
  saltAleatorio,
  escolherTemaPonderado,
  assinaturaTemas,
  COPAS_OBRIGATORIAS,
  type PedidoGeracao,
  type ZonaPedido,
  type ProtoEscolhido,
} from './selecionar-pedido';

export {
  montarAgencia,
  montarAgenciaGeracao,
  assinaturaAgencia,
  type AgenciaMontada,
  type SlotAgencia,
  type RectAgencia,
  type CelulaAgencia,
} from './montar-agencia';

export {
  construirEspacoAgencia,
  ordenarElencoCliente,
  assinaturaElenco,
  celulasOcupadasPorProps,
  pontosDeInteresseNaSala,
  celulasDePasseio,
  celulasWalkableNaSala,
  KINDS_INTERESSE,
  type CenarioEspacial,
  type AgenteEspacial,
  type PontoInteresse,
  type LayoutDaAgencia,
} from './espaco-agencia';

export {
  montarSalaLanding,
  listarQuadrosLanding,
  IDS_QUADROS_LANDING,
  type SalaLanding,
  type IdQuadroLanding,
} from './montar-sala-landing';

export {
  montarMundoIso,
  agenciaDeLayout,
  elencoIdsDoLayout,
  elencoParaPlanta,
  assinaturaElencoDe,
  resolverColisaoLab,
  COLAR_LAB,
  AGENTE_PLACEHOLDER,
  type MundoIso,
} from './montar-mundo';

export {
  compilarCenaIso,
  validarCenaIso,
  prepararCenaIso,
  prepararOclusoresParede,
  renderizarCenaIso,
  passoDoTrecho,
  type RenderCommand,
  type CenaIso,
  type CenaIsoPreparada,
  type OpcoesCena,
  type Bounds,
  type OclusorParede,
  type StripBaked,
} from './cena-isometrica';

export { desenharAgencia } from './desenhar-agencia';

export { OclusaoCorredor, oclusorNaFrente, type RetanguloTela } from './oclusao-parede';

export {
  desenharAtores,
  escolherAgenteNoPonto,
  nomeFallback,
  projetarAtorSentado,
  type OpcoesDesenharAtores,
} from './desenhar-atores';

export { iso, LARGURA_TILE, ALTURA_TILE, type Pt } from './proto-blit/iso';
export { resolverSpecLab, calibracaoDoTema, coresDoTema } from './proto-blit/catalogo';

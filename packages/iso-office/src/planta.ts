/**
 * Superficie sem DOM: planta + elenco. O servidor importa daqui para nao
 * puxar Canvas/Image do painter.
 */

export {
  selecionarPedido,
  seedDoPedido,
  seedDaGeracao,
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
} from './montar-agencia';

export {
  construirEspacoAgencia,
  ordenarElencoCliente,
  assinaturaElenco,
  type CenarioEspacial,
  type AgenteEspacial,
} from './espaco-agencia';

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

export { resolverSpecLab } from './proto-blit/catalogo';

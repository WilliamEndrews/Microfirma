/**
 * Catalogo de historias colaborativas para a Tarefa especial do Debugpreview.
 * Cada historia e um pipeline A→B→C com batidas de trabalho, fala e deslocamento.
 */

export type PapelHistoria = 'A' | 'B' | 'C';

export type AcaoBatida =
  | { tipo: 'trabalhar'; ms: number; fala: string }
  | { tipo: 'falar'; ms: number; fala: string }
  | { tipo: 'ir_porta_propria' }
  | { tipo: 'ir_corredor' }
  | { tipo: 'ir_porta_de'; de: PapelHistoria }
  | { tipo: 'ir_assento_de'; de: PapelHistoria }
  | { tipo: 'voltar_assento' }
  | { tipo: 'aguardar_aprovacao'; ms: number; fala: string };

export type Batida = {
  id: string;
  agente: PapelHistoria;
  acao: AcaoBatida;
};

export type Historia = {
  id: string;
  titulo: string;
  resumo: string;
  papeis: Record<PapelHistoria, { nome: string; agentId: string }>;
  batidas: Batida[];
};

const PAPEIS_PADRAO: Historia['papeis'] = {
  A: { nome: 'Boss', agentId: 'agent-boss' },
  B: { nome: 'Priv-0', agentId: 'agent-priv-0' },
  C: { nome: 'Priv-1', agentId: 'agent-priv-1' },
};

function papeis(
  a: string,
  b: string,
  c: string,
): Historia['papeis'] {
  return {
    A: { nome: a, agentId: PAPEIS_PADRAO.A.agentId },
    B: { nome: b, agentId: PAPEIS_PADRAO.B.agentId },
    C: { nome: c, agentId: PAPEIS_PADRAO.C.agentId },
  };
}

/** Pedidos automatizados: receptor → responder → expedidor. */
export const HISTORIA_PEDIDOS: Historia = {
  id: 'pedidos',
  titulo: 'Pedidos automatizados',
  resumo: 'Um pedido chega, e confirmado com o cliente e segue para fulfillment.',
  papeis: papeis('Receptor', 'Responder', 'Expedidor'),
  batidas: [
    { id: 'p1', agente: 'A', acao: { tipo: 'trabalhar', ms: 2800, fala: 'Pedido #4821 recebido' } },
    { id: 'p2', agente: 'A', acao: { tipo: 'falar', ms: 1600, fala: 'Encaminhando ao Responder…' } },
    { id: 'p3', agente: 'A', acao: { tipo: 'ir_porta_propria' } },
    { id: 'p4', agente: 'A', acao: { tipo: 'ir_porta_de', de: 'B' } },
    { id: 'p5', agente: 'A', acao: { tipo: 'falar', ms: 1400, fala: 'Aqui esta o payload' } },
    { id: 'p6', agente: 'B', acao: { tipo: 'trabalhar', ms: 3000, fala: 'Confirmando com o cliente' } },
    { id: 'p7', agente: 'B', acao: { tipo: 'falar', ms: 1400, fala: 'OK — envio ao Expedidor' } },
    { id: 'p8', agente: 'B', acao: { tipo: 'ir_porta_propria' } },
    { id: 'p9', agente: 'B', acao: { tipo: 'ir_porta_de', de: 'C' } },
    { id: 'p10', agente: 'C', acao: { tipo: 'trabalhar', ms: 3200, fala: 'Disparando fulfillment' } },
    { id: 'p11', agente: 'C', acao: { tipo: 'falar', ms: 1600, fala: 'Pedido #4821 despachado' } },
    { id: 'p12', agente: 'A', acao: { tipo: 'voltar_assento' } },
    { id: 'p13', agente: 'B', acao: { tipo: 'voltar_assento' } },
    { id: 'p14', agente: 'C', acao: { tipo: 'voltar_assento' } },
  ],
};

/** Incidente em producao: on-call → investigador → fixer. */
export const HISTORIA_INCIDENTE: Historia = {
  id: 'incidente',
  titulo: 'Incidente em producao',
  resumo: 'Alerta sobe, causa e isolada e o patch fecha o incidente.',
  papeis: papeis('On-call', 'Investigador', 'Fixer'),
  batidas: [
    { id: 'i1', agente: 'A', acao: { tipo: 'trabalhar', ms: 2400, fala: 'Alerta P1: latencia 5xx' } },
    { id: 'i2', agente: 'A', acao: { tipo: 'falar', ms: 1400, fala: 'Abrindo war-room…' } },
    { id: 'i3', agente: 'A', acao: { tipo: 'ir_porta_propria' } },
    { id: 'i4', agente: 'A', acao: { tipo: 'ir_corredor' } },
    { id: 'i5', agente: 'B', acao: { tipo: 'ir_porta_propria' } },
    { id: 'i6', agente: 'B', acao: { tipo: 'ir_corredor' } },
    { id: 'i7', agente: 'B', acao: { tipo: 'falar', ms: 1600, fala: 'Logs apontam timeout no DB' } },
    { id: 'i8', agente: 'B', acao: { tipo: 'trabalhar', ms: 3000, fala: 'Isolando a causa raiz' } },
    { id: 'i9', agente: 'B', acao: { tipo: 'ir_porta_de', de: 'C' } },
    { id: 'i10', agente: 'C', acao: { tipo: 'trabalhar', ms: 3400, fala: 'Aplicando patch + rollback plan' } },
    { id: 'i11', agente: 'C', acao: { tipo: 'falar', ms: 1600, fala: 'Incidente mitigado' } },
    { id: 'i12', agente: 'A', acao: { tipo: 'voltar_assento' } },
    { id: 'i13', agente: 'B', acao: { tipo: 'voltar_assento' } },
    { id: 'i14', agente: 'C', acao: { tipo: 'voltar_assento' } },
  ],
};

/** Pipeline de conteudo: scout → redator → publicador. */
export const HISTORIA_CONTEUDO: Historia = {
  id: 'conteudo',
  titulo: 'Pipeline de conteudo',
  resumo: 'Scout acha a fonte, redator monta o brief e o publicador libera.',
  papeis: papeis('Scout', 'Redator', 'Publicador'),
  batidas: [
    { id: 'c1', agente: 'A', acao: { tipo: 'trabalhar', ms: 2600, fala: 'Lead encontrada: Relatorio Q3' } },
    { id: 'c2', agente: 'A', acao: { tipo: 'falar', ms: 1400, fala: 'Fonte validada — passando' } },
    { id: 'c3', agente: 'A', acao: { tipo: 'ir_porta_propria' } },
    { id: 'c4', agente: 'A', acao: { tipo: 'ir_assento_de', de: 'B' } },
    { id: 'c5', agente: 'B', acao: { tipo: 'trabalhar', ms: 3200, fala: 'Escrevendo o brief' } },
    { id: 'c6', agente: 'B', acao: { tipo: 'falar', ms: 1400, fala: 'Draft pronto para review' } },
    { id: 'c7', agente: 'B', acao: { tipo: 'ir_porta_propria' } },
    { id: 'c8', agente: 'B', acao: { tipo: 'ir_porta_de', de: 'C' } },
    { id: 'c9', agente: 'C', acao: { tipo: 'trabalhar', ms: 2800, fala: 'Revisao editorial' } },
    { id: 'c10', agente: 'C', acao: { tipo: 'falar', ms: 1600, fala: 'Publicado no canal' } },
    { id: 'c11', agente: 'A', acao: { tipo: 'voltar_assento' } },
    { id: 'c12', agente: 'B', acao: { tipo: 'voltar_assento' } },
    { id: 'c13', agente: 'C', acao: { tipo: 'voltar_assento' } },
  ],
};

/** Compliance / HITL: auditor → analista → guardian. */
export const HISTORIA_COMPLIANCE: Historia = {
  id: 'compliance',
  titulo: 'Compliance / HITL',
  resumo: 'Risco detectado, dossie montado e guardian pede aprovacao humana.',
  papeis: papeis('Auditor', 'Analista', 'Guardian'),
  batidas: [
    { id: 'h1', agente: 'A', acao: { tipo: 'trabalhar', ms: 2600, fala: 'Risco KYC score 0.82' } },
    { id: 'h2', agente: 'A', acao: { tipo: 'falar', ms: 1400, fala: 'Escalando ao Analista' } },
    { id: 'h3', agente: 'A', acao: { tipo: 'ir_porta_propria' } },
    { id: 'h4', agente: 'A', acao: { tipo: 'ir_porta_de', de: 'B' } },
    { id: 'h5', agente: 'B', acao: { tipo: 'trabalhar', ms: 3200, fala: 'Montando o dossie' } },
    { id: 'h6', agente: 'B', acao: { tipo: 'falar', ms: 1400, fala: 'Dossie completo' } },
    { id: 'h7', agente: 'B', acao: { tipo: 'ir_porta_propria' } },
    { id: 'h8', agente: 'B', acao: { tipo: 'ir_assento_de', de: 'C' } },
    {
      id: 'h9',
      agente: 'C',
      acao: { tipo: 'aguardar_aprovacao', ms: 2800, fala: 'Aguardando humano…' },
    },
    { id: 'h10', agente: 'C', acao: { tipo: 'falar', ms: 1600, fala: 'Aprovado — liberado' } },
    { id: 'h11', agente: 'A', acao: { tipo: 'voltar_assento' } },
    { id: 'h12', agente: 'B', acao: { tipo: 'voltar_assento' } },
    { id: 'h13', agente: 'C', acao: { tipo: 'voltar_assento' } },
  ],
};

export const HISTORIAS: readonly Historia[] = [
  HISTORIA_PEDIDOS,
  HISTORIA_INCIDENTE,
  HISTORIA_CONTEUDO,
  HISTORIA_COMPLIANCE,
];

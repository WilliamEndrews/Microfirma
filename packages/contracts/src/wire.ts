/**
 * CONTRATO 4 - PROTOCOLO DE TRANSPORTE (cliente <-> servidor)
 *
 * Este arquivo existe por causa do ADR-0006: o World Engine e autoritativo e
 * vai rodar no servidor. O navegador deixa de simular e passa a APENAS
 * renderizar o que recebe. O que atravessa a rede e exatamente o que o engine
 * ja produzia em memoria (`WorldSnapshot` / `WorldDelta`) - nenhuma traducao,
 * nenhum tipo paralelo. Se este protocolo precisasse de um "DTO" proprio, a
 * fronteira estaria no lugar errado.
 *
 * DUAS DIRECOES COM REGIMES DE VALIDACAO DIFERENTES - e isto e deliberado:
 *
 *  - SERVIDOR -> CLIENTE (`ServerMessage`): caminho quente, 10 quadros por
 *    segundo por sessao. Tipos TypeScript puros, ZERO zod em runtime. A
 *    corretude e garantida pelos testes do engine, nao por revalidar a cada
 *    tick aquilo que nos mesmos acabamos de produzir (mesma razao do
 *    `world.ts`).
 *
 *  - CLIENTE -> SERVIDOR (`ClientCommand`): entrada NAO CONFIAVEL vinda da
 *    rede. Aqui zod nao e opcional: e a borda de seguranca. Um cliente
 *    hostil pode enviar qualquer coisa, e o engine autoritativo nunca deve
 *    receber lixo. Custo irrelevante (comandos sao raros, disparados por
 *    acao humana).
 */

import { z } from 'zod';
import type { WorldDelta, WorldSnapshot } from './world.js';
import type { ApprovalContext } from './tenant.js';

// ---------------------------------------------------------------------------
// SERVIDOR -> CLIENTE
// ---------------------------------------------------------------------------

/**
 * Identificacao da sessao, enviada UMA vez, antes do primeiro snapshot.
 * Carrega a seed porque ela e a chave de reproducao: "manda a seed" tem que
 * continuar funcionando quando o mundo vive no servidor (ADR-0004/0005).
 */
export interface SessionWelcome {
  kind: 'welcome';
  sessionId: string;
  tenantId: string;
  seed: number;
  /** Passo de simulacao do servidor em ms. O cliente usa para interpolar. */
  tickMs: number;
  /** A cada quantos ticks o servidor reenvia um snapshot completo. */
  keyframeEveryTicks: number;
  /** Versao do protocolo. Divergencia = cliente desatualizado, falha explicita. */
  protocolVersion: number;
}

/**
 * Falha que o cliente precisa mostrar ao humano, em vez de morrer em silencio.
 * Tela preta sem explicacao foi um problema real neste projeto; o protocolo
 * carrega o motivo para que o painel possa dize-lo.
 */
export interface ServerFailure {
  kind: 'failure';
  code: 'bad_command' | 'unsupported_protocol' | 'internal' | 'unauthorized' | 'forbidden' | 'tenant_not_found';
  message: string;
}

/** Notificacao de aprovacao pendente enviada ao cliente. */
export interface ApprovalNotification {
  kind: 'approval_pending';
  context: ApprovalContext;
}

/** Notificacao de alerta disparado. */
export interface AlertNotification {
  kind: 'alert';
  message: string;
  condition: string;
  ts: number;
}

export type ServerMessage =
  | SessionWelcome
  | WorldSnapshot
  | WorldDelta
  | ServerFailure
  | ApprovalNotification
  | AlertNotification;

/** Versao atual do protocolo. Incrementar a cada mudanca incompativel. */
export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------------------
// CLIENTE -> SERVIDOR
// ---------------------------------------------------------------------------

/**
 * O humano respondeu a um human-in-the-loop. E o unico comando que altera o
 * mundo de verdade - e por isso o mais sensivel da lista.
 */
export const ResolveApproval = z.object({
  type: z.literal('resolve_approval'),
  agentId: z.string().min(1).max(200),
}).strict();

/** Pausa/retoma a simulacao. Em producao sera restrito por permissao. */
export const SetPaused = z.object({
  type: z.literal('set_paused'),
  paused: z.boolean(),
}).strict();

/**
 * Regenera o escritorio com outra semente. Existe para a demo e para suporte
 * ("reproduza a planta do cliente"). Limitado a inteiro nao negativo: seed e
 * indice de PRNG, nao texto livre.
 */
export const Reseed = z.object({
  type: z.literal('reseed'),
  seed: z.number().int().nonnegative().max(0xffffffff),
}).strict();

export const ClientCommand = z.discriminatedUnion('type', [
  ResolveApproval,
  SetPaused,
  Reseed,
  z.object({ type: z.literal('ack_alert'), alertEventId: z.string().min(1) }).strict(),
]);
export type ClientCommand = z.infer<typeof ClientCommand>;

/**
 * Decodifica uma mensagem crua do socket. Nunca lanca: devolve o erro como
 * valor, porque uma mensagem malformada de UM cliente nao pode derrubar o
 * processo que serve todos os outros.
 */
export function parseClientCommand(
  bruto: string,
): { ok: true; command: ClientCommand } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(bruto);
  } catch {
    return { ok: false, error: 'payload nao e JSON valido' };
  }
  const r = ClientCommand.safeParse(json);
  if (!r.success) {
    return { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  return { ok: true, command: r.data };
}

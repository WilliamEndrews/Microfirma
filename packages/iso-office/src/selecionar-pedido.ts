import {
  BIBLIA_TEMAS,
  createRng,
  hashString,
  listarProtos,
  type TemaArquiteto,
  type ZonaKindTiles,
} from '@microfirma/world-engine';

/** Pedido do dashboard: so quantidade de escritorios. Copa e Boss Room sao leis fixas. */
export type PedidoGeracao = {
  salas: number;
};

export type ZonaPedido = 'private' | 'break' | 'boss_room';

export type ProtoEscolhido = {
  key: string;
  zonaKind: ZonaPedido | 'landing';
  tema: TemaArquiteto;
};

/** Sempre exatamente uma copa por agencia. */
export const COPAS_OBRIGATORIAS = 1;

/** Seed estavel so a partir do pedido (testes / repro sem geracao). */
export function seedDoPedido(pedido: PedidoGeracao): number {
  return hashString(`demo:${pedido.salas}`);
}

/** Seed de uma geracao concreta (pedido + geracao + salt). */
export function seedDaGeracao(pedido: PedidoGeracao, geracao: number, salt: number): number {
  return hashString(`demo:${pedido.salas}#${geracao}:${salt >>> 0}`);
}

export function saltAleatorio(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]!;
  }
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}

/**
 * Escolha ponderada por prioridade entre todos os candidatos livres.
 * `unicoNaAgencia` vale dentro da mesma agencia.
 */
export function escolherTemaPonderado(
  zonaKind: ZonaKindTiles,
  rng: ReturnType<typeof createRng>,
  jaUsadosUnicos: Set<string>,
  temas: readonly TemaArquiteto[] = BIBLIA_TEMAS.temas,
): TemaArquiteto | undefined {
  const candidatos = listarProtos(zonaKind, temas);
  const livres = candidatos.filter((t) => !t.unicoNaAgencia || !jaUsadosUnicos.has(t.id));
  const lista = livres.length > 0 ? livres : candidatos;
  if (lista.length === 0) return undefined;

  const pesos = lista.map((t) => Math.max(1, t.prioridade));
  const total = pesos.reduce((a, b) => a + b, 0);
  let ticket = rng.next() * total;
  let escolhido = lista[lista.length - 1]!;
  for (let i = 0; i < lista.length; i++) {
    ticket -= pesos[i]!;
    if (ticket <= 0) {
      escolhido = lista[i]!;
      break;
    }
  }
  if (escolhido.unicoNaAgencia) jaUsadosUnicos.add(escolhido.id);
  return escolhido;
}

/**
 * Leis da planta (iguais ao Debugpreview):
 * - N salas no pedido => 1 Boss Room + (N-1) privativos (N >= 1)
 * - sempre exatamente 1 copa (break)
 */
export function selecionarPedido(pedido: PedidoGeracao, seed?: number): ProtoEscolhido[] {
  const salas = Math.max(0, Math.floor(pedido.salas) || 0);
  if (salas <= 0) return [];

  const semente = seed ?? seedDoPedido({ salas });
  const rng = createRng(semente).fork('demo');
  const unicos = new Set<string>();
  const out: ProtoEscolhido[] = [];

  const boss = escolherTemaPonderado('boss_room', rng, unicos, BIBLIA_TEMAS.temas);
  if (boss) {
    out.push({
      key: `boss_room-0-${boss.id}`,
      zonaKind: 'boss_room',
      tema: boss,
    });
  }

  const privativos = Math.max(0, salas - 1);
  for (let i = 0; i < privativos; i++) {
    const tema = escolherTemaPonderado('private', rng, unicos, BIBLIA_TEMAS.temas);
    if (!tema) break;
    out.push({
      key: `private-${i}-${tema.id}`,
      zonaKind: 'private',
      tema,
    });
  }

  for (let j = 0; j < COPAS_OBRIGATORIAS; j++) {
    const tema = escolherTemaPonderado('break', rng, unicos, BIBLIA_TEMAS.temas);
    if (!tema) break;
    out.push({
      key: `break-${j}-${tema.id}`,
      zonaKind: 'break',
      tema,
    });
  }

  return out;
}

/** Assinatura multiset dos temas (ordem-independente) para anti-eco. */
export function assinaturaTemas(protos: readonly ProtoEscolhido[]): string {
  return protos
    .map((p) => p.tema.id)
    .slice()
    .sort()
    .join('|');
}

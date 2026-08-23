import {
  BIBLIA_TEMAS,
  createRng,
  escolherTema,
  hashString,
  type TemaArquiteto,
} from '@microfirma/world-engine';

export type PedidoGeracao = {
  salas: number;
  copas: number;
};

export type ProtoEscolhido = {
  key: string;
  zonaKind: 'private' | 'break';
  tema: TemaArquiteto;
};

/** Seed estavel para o mesmo pedido (salas, copas). */
export function seedDoPedido(pedido: PedidoGeracao): number {
  return hashString(`debugpreview:${pedido.salas}x${pedido.copas}`);
}

/**
 * Escolhe N protos private e M break da biblia do disco
 * (prioridade + unicoNaAgencia, mesmo criterio do Construtor).
 */
export function selecionarPedido(pedido: PedidoGeracao): ProtoEscolhido[] {
  const rng = createRng(seedDoPedido(pedido)).fork('debugpreview');
  const unicos = new Set<string>();
  const out: ProtoEscolhido[] = [];

  for (let i = 0; i < pedido.salas; i++) {
    const tema = escolherTema('private', rng, unicos, BIBLIA_TEMAS.temas);
    if (!tema) break;
    out.push({
      key: `private-${i}-${tema.id}`,
      zonaKind: 'private',
      tema,
    });
  }

  for (let j = 0; j < pedido.copas; j++) {
    const tema = escolherTema('break', rng, unicos, BIBLIA_TEMAS.temas);
    if (!tema) break;
    out.push({
      key: `break-${j}-${tema.id}`,
      zonaKind: 'break',
      tema,
    });
  }

  return out;
}

/**
 * Empacota protos completos numa agencia: faixas N/S + corredor Concrete.
 * Nao usa solveLayout / emitirParedes / colarProto — o blit do lab fica intacto.
 */

import { createRng, gradeDoProto } from '@microfirma/world-engine';
import {
  assinaturaTemas,
  seedDaGeracao,
  seedDoPedido,
  selecionarPedido,
  type PedidoGeracao,
  type ProtoEscolhido,
} from './selecionar-pedido';

export type RectAgencia = { x0: number; y0: number; x1: number; y1: number };
export type SlotAgencia = { proto: ProtoEscolhido; rect: RectAgencia };
export type CelulaAgencia = { x: number; y: number };

export type AgenciaMontada = {
  seed: number;
  geracao?: number;
  grid: { width: number; height: number };
  slots: SlotAgencia[];
  corridors: CelulaAgencia[];
  corredorY: number;
  pisoCorredor: 'Concrete';
};

const PISO_CORREDOR = 'Concrete' as const;
const PAD = 1;
const GAP = 1;

function alocarFaixa(
  lista: ProtoEscolhido[],
  corredorY: number,
  lado: 'norte' | 'sul',
): { slots: SlotAgencia[]; xFim: number } {
  const slots: SlotAgencia[] = [];
  let x = PAD;
  for (const proto of lista) {
    const { w, h } = gradeDoProto(proto.tema);
    const y0 = lado === 'norte' ? corredorY - h : corredorY + 1;
    const y1 = y0 + h;
    slots.push({ proto, rect: { x0: x, y0, x1: x + w, y1 } });
    x += w + GAP;
  }
  return { slots, xFim: x };
}

function celulasDeCorredor(
  slots: SlotAgencia[],
  width: number,
  corredorY: number,
): CelulaAgencia[] {
  const ocupado = new Set<string>();
  for (const s of slots) {
    for (let y = s.rect.y0; y < s.rect.y1; y++) {
      for (let x = s.rect.x0; x < s.rect.x1; x++) ocupado.add(`${x},${y}`);
    }
  }

  const out: CelulaAgencia[] = [];
  const tryAdd = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (ocupado.has(k)) return;
    ocupado.add(k);
    out.push({ x, y });
  };

  for (let x = PAD; x <= width - 1 - PAD; x++) tryAdd(x, corredorY);

  const porFaixa = new Map<string, SlotAgencia[]>();
  for (const s of slots) {
    const chave = s.rect.y1 <= corredorY ? 'norte' : 'sul';
    const lista = porFaixa.get(chave) ?? [];
    lista.push(s);
    porFaixa.set(chave, lista);
  }
  for (const faixa of porFaixa.values()) {
    faixa.sort((a, b) => a.rect.x0 - b.rect.x0);
    for (let i = 0; i < faixa.length - 1; i++) {
      const a = faixa[i]!;
      const b = faixa[i + 1]!;
      const y0 = Math.min(a.rect.y0, b.rect.y0);
      const y1 = Math.max(a.rect.y1, b.rect.y1);
      for (let y = y0; y < y1; y++) tryAdd(a.rect.x1, y);
    }
  }

  return out;
}

function empacotar(protos: ProtoEscolhido[], seed: number): Omit<AgenciaMontada, 'seed' | 'geracao'> {
  const rng = createRng(seed).fork('empacote');
  const ordem = rng.shuffle(protos);

  const meio = Math.ceil(ordem.length / 2);
  const sul = ordem.slice(0, meio);
  const norte = ordem.slice(meio);

  const hNorte = norte.length === 0 ? 0 : Math.max(...norte.map((p) => gradeDoProto(p.tema).h));
  const hSul = sul.length === 0 ? 0 : Math.max(...sul.map((p) => gradeDoProto(p.tema).h));
  const corredorY = PAD + hNorte;
  const height = corredorY + 1 + hSul + PAD;

  const faixaSul = alocarFaixa(sul, corredorY, 'sul');
  const faixaNorte = alocarFaixa(norte, corredorY, 'norte');
  const slots = [...faixaNorte.slots, ...faixaSul.slots];
  const width = Math.max(faixaNorte.xFim, faixaSul.xFim, PAD + 2) + PAD;

  return {
    grid: { width, height },
    slots,
    corridors: celulasDeCorredor(slots, width, corredorY),
    corredorY,
    pisoCorredor: PISO_CORREDOR,
  };
}

export function assinaturaAgencia(agencia: AgenciaMontada): string {
  return assinaturaTemas(agencia.slots.map((s) => s.proto));
}

/**
 * Monta a agencia. `seed` explicita torna o resultado reproduzivel;
 * sem seed usa so o pedido (legado / testes simples).
 */
export function montarAgencia(pedido: PedidoGeracao, seed?: number): AgenciaMontada | null {
  const salas = Math.max(0, Math.floor(pedido.salas) || 0);
  if (salas <= 0) return null;

  const semente = seed ?? seedDoPedido({ salas });
  const protos = selecionarPedido({ salas }, semente);
  if (protos.length === 0) {
    return {
      seed: semente,
      grid: { width: 10, height: 9 },
      slots: [],
      corridors: [],
      corredorY: 4,
      pisoCorredor: PISO_CORREDOR,
    };
  }

  return { seed: semente, ...empacotar(protos, semente) };
}

export function montarAgenciaGeracao(
  pedido: PedidoGeracao,
  geracao: number,
  salt: number,
): AgenciaMontada | null {
  const seed = seedDaGeracao(pedido, geracao, salt);
  const agencia = montarAgencia(pedido, seed);
  if (!agencia) return null;
  return { ...agencia, geracao };
}

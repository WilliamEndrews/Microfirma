/**
 * REPLAYER DE SESSAO - le um SessionLog e reproduz deterministicamente.
 *
 * O replay NAO reexecuta a simulacao - ele apenas devolve os quadros gravados,
 * na ordem e cadencia originais. Isso e mais simples e mais fiel: a simulacao
 * ja rodou, o resultado ja foi determinado, nao ha motivo para recalcular.
 *
 * Para auditoria (ADR-0006): "o que foi mostrado a quem" - o replay mostra
 * exatamente o que o servidor enviou, sem depender de reexecutar a engine com
 * os mesmos eventos (que embora possivel, seria uma fonte extra de bugs).
 *
 * Uso:
 *   const player = new SessionPlayer(logTexto);
 *   const header = player.header;
 *   for (const tick of player) {
 *     console.log(tick.tick, tick.frame.kind);
 *   }
 */

import {
  desserializarLinha,
  type SessionLogHeader,
  type TickRecord,
} from '@microfirma/contracts';

export class SessionPlayer {
  private readonly header_: SessionLogHeader;
  private readonly ticks_: TickRecord[];

  constructor(logNdjson: string) {
    const linhas = logNdjson.split('\n');
    let header: SessionLogHeader | null = null;
    const ticks: TickRecord[] = [];

    for (const linha of linhas) {
      const parsed = desserializarLinha(linha);
      if (!parsed) continue;
      if (parsed.kind === 'header') {
        if (header) throw new Error('SessionLog com multiplos headers');
        header = parsed.data;
      } else {
        if (!header) throw new Error('TickRecord antes do header');
        ticks.push(parsed.data);
      }
    }

    if (!header) throw new Error('SessionLog sem header');
    this.header_ = header;
    this.ticks_ = ticks;
  }

  get header(): SessionLogHeader {
    return this.header_;
  }

  get totalTicks(): number {
    return this.ticks_.length;
  }

  /** Devolve o tick no indice dado, ou null se fora de range. */
  tickAt(indice: number): TickRecord | null {
    return this.ticks_[indice] ?? null;
  }

  /**
   * Itera sobre todos os ticks gravados, em ordem.
   */
  *[Symbol.iterator](): Iterator<TickRecord> {
    for (const t of this.ticks_) yield t;
  }

  /**
   * Devolve todos os ticks como array. Cuidado com memoria em logs grandes.
   */
  todosTicks(): TickRecord[] {
    return [...this.ticks_];
  }

  /**
   * Filtra ticks por numero. Util para auditoria: "mostre o tick 500".
   */
  ticksEntre(inicio: number, fim: number): TickRecord[] {
    return this.ticks_.filter((t) => t.tick >= inicio && t.tick <= fim);
  }
}

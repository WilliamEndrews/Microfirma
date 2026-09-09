import { describe, expect, it } from 'vitest';
import {
  HISTORIAS,
  type AcaoBatida,
  type PapelHistoria,
} from './historias';
import { sortearHistoria } from './sortear';

const PAPEIS: PapelHistoria[] = ['A', 'B', 'C'];

function refsPapel(acao: AcaoBatida): PapelHistoria[] {
  if (acao.tipo === 'ir_porta_de' || acao.tipo === 'ir_assento_de') return [acao.de];
  return [];
}

describe('catalogo tarefa especial', () => {
  it('tem exatamente 4 historias', () => {
    expect(HISTORIAS).toHaveLength(4);
  });

  it.each(HISTORIAS.map((h) => [h.id, h] as const))(
    'historia %s cobre papeis A/B/C e batidas validas',
    (_id, historia) => {
      expect(Object.keys(historia.papeis).sort()).toEqual(['A', 'B', 'C']);
      expect(historia.papeis.A.agentId).toBe('agent-boss');
      expect(historia.papeis.B.agentId).toBe('agent-priv-0');
      expect(historia.papeis.C.agentId).toBe('agent-priv-1');
      expect(historia.batidas.length).toBeGreaterThan(0);

      const agentesNasBatidas = new Set(historia.batidas.map((b) => b.agente));
      for (const p of PAPEIS) expect(agentesNasBatidas.has(p)).toBe(true);

      for (const batida of historia.batidas) {
        expect(PAPEIS).toContain(batida.agente);
        for (const ref of refsPapel(batida.acao)) {
          expect(PAPEIS).toContain(ref);
        }
      }
    },
  );

  it('sortearHistoria e deterministico por seed', () => {
    expect(sortearHistoria(42).id).toBe(sortearHistoria(42).id);
  });

  it('sortearHistoria cobre mais de uma historia em seeds distintas', () => {
    const ids = new Set(
      Array.from({ length: 40 }, (_, i) => sortearHistoria(i * 97 + 3).id),
    );
    expect(ids.size).toBeGreaterThan(1);
  });
});

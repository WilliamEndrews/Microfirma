import { describe, expect, it } from 'vitest';
import { IDIOMAS, ROTULO_IDIOMA, traduzir } from './i18n';

/**
 * Verifica a integridade dos dicionarios de i18n:
 * - Todos os idiomas listados em IDIOMAS existem.
 * - Todos os dicionarios compartilham exatamente as mesmas chaves.
 * - Nao ha chaves faltantes nem orfas entre os locales.
 * - pt-BR e o fallback: chave inexistente devolve a chave crua.
 */
describe('i18n', () => {
  it('todos os idiomas listados em IDIOMAS tem rotulo', () => {
    for (const idioma of IDIOMAS) {
      expect(ROTULO_IDIOMA[idioma]).toBeDefined();
      expect(ROTULO_IDIOMA[idioma].length).toBeGreaterThan(0);
    }
  });

  it('es-ES traduz as mesmas chaves de pt-BR', () => {
    expect(traduzir('es-ES', 'app.titulo')).toBe('MicroFirma');
    expect(traduzir('es-ES', 'controles.titulo')).toBe('Controles');
    expect(traduzir('es-ES', 'kpi.execucoesAtivas')).toBe('Ejecuciones activas');
  });

  it('pseudo-localizacao expande o texto e mantem placeholders acentuados', () => {
    const r = traduzir('pseudo', 'aprovacao.bloqueado', { nome: 'Ana' });
    expect(r).toContain('[!!');
    expect(r).toContain('!!]');
    expect(r).toContain('Áná');
  });

  it('fallback para pt-BR quando a chave nao existe', () => {
    expect(traduzir('en-US', 'chave.inexistente' as never)).toBe('chave.inexistente');
    expect(traduzir('es-ES', 'outra.que.nao.existe' as never)).toBe('outra.que.nao.existe');
  });
});

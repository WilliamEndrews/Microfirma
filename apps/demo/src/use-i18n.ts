/**
 * Hook de internacionalizacao.
 *
 * `useI18n` devolve `{ t, idioma, setIdioma }`. O idioma persiste em
 * `localStorage` e defaulta para pt-BR. A troca e imediata - nao precisa
 * reload.
 */

import { useCallback, useState } from 'react';
import { traduzir, type Idioma } from './i18n';

const CHAVE_STORAGE = 'microfirma.idioma';

function idiomaInicial(): Idioma {
  try {
    const salvo = localStorage.getItem(CHAVE_STORAGE);
    if (salvo === 'pt-BR' || salvo === 'en-US') return salvo;
  } catch {
    // localStorage pode estar indisponivel (modo privado, sandbox)
  }
  return 'pt-BR';
}

export function useI18n() {
  const [idioma, setIdiomaState] = useState<Idioma>(idiomaInicial);

  const t = useCallback(
    (chave: string, vars?: Record<string, string | number>) => traduzir(idioma, chave, vars),
    [idioma],
  );

  const setIdioma = useCallback((prox: Idioma) => {
    setIdiomaState(prox);
    try {
      localStorage.setItem(CHAVE_STORAGE, prox);
    } catch {
      // sem storage, sem problema - o estado em memoria basta para a sessao
    }
  }, []);

  return { t, idioma, setIdioma };
}

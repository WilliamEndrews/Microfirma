import { createRng } from '@microfirma/world-engine';
import { HISTORIAS, type Historia } from './historias';

/** Sorteio uniforme e deterministico entre as historias do catalogo. */
export function sortearHistoria(seed: number): Historia {
  const rng = createRng(seed >>> 0).fork('tarefa-especial');
  return rng.pick([...HISTORIAS]);
}

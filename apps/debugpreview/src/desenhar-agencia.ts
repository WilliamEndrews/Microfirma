/**
 * Fachada do renderer global da agencia.
 *
 * Aceita cena ja preparada (preferido no PreviewStage, que reutiliza o
 * canvas estatico no loop de animacao) ou recompila via `prepararCenaIso`.
 * `opcoes.stripParedeL` ativa a faixa pre-composta de Wall_L.
 */

import type { AgenciaMontada } from './montar-agencia';
import {
  prepararCenaIso,
  renderizarCenaIso,
  type CenaIsoPreparada,
  type OpcoesCena,
} from './cena-isometrica';

export async function desenharAgencia(
  ctx: CanvasRenderingContext2D,
  agencia: AgenciaMontada,
  preparada?: CenaIsoPreparada,
  opcoes: OpcoesCena = {},
): Promise<CenaIsoPreparada> {
  const cena = preparada ?? (await prepararCenaIso(agencia, opcoes));
  await renderizarCenaIso(ctx, cena);
  return cena;
}

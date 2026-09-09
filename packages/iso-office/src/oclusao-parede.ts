/**
 * Oclusao do ATOR pelas paredes, isolada no corredor.
 *
 * O painter global (`cena-isometrica`) permanece intocado: a cena estatica ja
 * foi pintada com sua ordem de camadas definitiva. O que muda aqui e apenas a
 * perspectiva do ator — ele passa a ser recortado pelas mesmas pecas de parede
 * que o painter colocou a frente dele.
 *
 * Regra: so vale para quem esta pisando uma celula de corredor. Dentro das
 * salas nada e recortado, entao o ator continua na frente da mobilia, que e o
 * comportamento correto e ja validado.
 *
 * Implementacao: o ator e pintado num buffer do tamanho do proprio retangulo e
 * as paredes com `depth` maior que a do ator sao aplicadas nesse buffer em
 * `destination-out`. Nada e redesenhado sobre a cena estatica, logo nao ha
 * dupla composicao de alpha nas bordas dos PNGs.
 */

import type { Cell } from '@microfirma/contracts';
import {
  prepararOclusoresParede,
  type Bounds,
  type CenaIsoPreparada,
  type OclusorParede,
} from './cena-isometrica';
import { LARGURA_TILE, type Pt } from './proto-blit/iso';

export type RetanguloTela = { x: number; y: number; w: number; h: number };

function intersecta(bounds: Bounds, rect: Bounds): boolean {
  return (
    bounds.minX < rect.maxX &&
    bounds.maxX > rect.minX &&
    bounds.minY < rect.maxY &&
    bounds.maxY > rect.minY
  );
}

/**
 * A face e um intervalo de profundidade, nao um ponto. `depth` e o vertice de
 * tras (o que o painter usa para ordenar a cena); `alcanceDepth` e o quanto a
 * face avanca para a camera. Sem isso, a ultima Wall_L de uma sala norte —
 * vertice em `corredorY - 1`, face ate o proprio corredor — perde o teste
 * pontual e so a metade sul da parede recorta o ator.
 */
export function oclusorNaFrente(
  o: Pick<OclusorParede, 'depth' | 'alcanceDepth' | 'extensao'>,
  depthAtor: number,
  margemCelulas: number,
): boolean {
  const overflow = o.extensao ? margemCelulas : 0;
  return o.depth + o.alcanceDepth + overflow > depthAtor;
}

export class OclusaoCorredor {
  private readonly oclusores: readonly OclusorParede[];
  private readonly corredor: ReadonlySet<string>;
  private buffer: HTMLCanvasElement | null = null;

  private constructor(oclusores: readonly OclusorParede[], corredor: ReadonlySet<string>) {
    this.oclusores = oclusores;
    this.corredor = corredor;
  }

  static async preparar(
    cena: CenaIsoPreparada,
    corredores: readonly Cell[],
  ): Promise<OclusaoCorredor> {
    const oclusores = await prepararOclusoresParede(cena);
    return new OclusaoCorredor(
      oclusores,
      new Set(corredores.map((c) => `${c.x},${c.y}`)),
    );
  }

  /** True quando a celula pisada e corredor — unico caso em que ha recorte. */
  noCorredor(x: number, y: number): boolean {
    return this.corredor.has(`${Math.round(x)},${Math.round(y)}`);
  }

  /**
   * Pinta `corpo` recortado pelas paredes a frente de `depth`. Sem parede
   * candidata, pinta direto no contexto original (custo zero no caso comum).
   *
   * `margem` e a meia-largura do sprite: o quanto o billboard excede a celula
   * que o ator de fato ocupa, e portanto o quanto cada trecho de parede precisa
   * ser prolongado para nao deixar meio ator vazando na ultima celula.
   */
  recortar(
    ctx: CanvasRenderingContext2D,
    origem: Pt,
    depth: number,
    rect: RetanguloTela,
    margem: number,
    corpo: (alvo: CanvasRenderingContext2D) => void,
  ): void {
    // A busca abre pela margem: uma face fora do retangulo pode entrar nele
    // depois de prolongada.
    const naCena: Bounds = {
      minX: rect.x - origem.x - margem,
      minY: rect.y - origem.y - margem / 2,
      maxX: rect.x + rect.w - origem.x + margem,
      maxY: rect.y + rect.h - origem.y + margem / 2,
    };
    const margemCelulas = margem / (LARGURA_TILE / 2);
    const frente = this.oclusores.filter(
      (o) => oclusorNaFrente(o, depth, margemCelulas) && intersecta(o.bounds, naCena),
    );
    if (frente.length === 0) {
      corpo(ctx);
      return;
    }

    const buffer = this.garantirBuffer(rect.w, rect.h);
    const bctx = buffer.getContext('2d');
    if (!bctx) {
      corpo(ctx);
      return;
    }

    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, buffer.width, buffer.height);
    bctx.imageSmoothingEnabled = false;
    bctx.translate(-rect.x, -rect.y);
    corpo(bctx);
    bctx.globalCompositeOperation = 'destination-out';
    const passo = margemCelulas;
    for (const o of frente) {
      o.desenhar(bctx, origem);
      if (!o.extensao) continue;
      // A copia desliza sobre a propria reta de topo da face, entao a uniao e
      // a mesma parede um pouco mais longa — sem degrau nem silhueta nova.
      bctx.save();
      bctx.translate(o.extensao.x * passo, o.extensao.y * passo);
      o.desenhar(bctx, origem);
      bctx.restore();
    }
    bctx.globalCompositeOperation = 'source-over';
    bctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.drawImage(buffer, 0, 0, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
  }

  private garantirBuffer(w: number, h: number): HTMLCanvasElement {
    let buffer = this.buffer;
    if (!buffer) {
      buffer = document.createElement('canvas');
      this.buffer = buffer;
    }
    if (buffer.width < w) buffer.width = w;
    if (buffer.height < h) buffer.height = h;
    return buffer;
  }
}

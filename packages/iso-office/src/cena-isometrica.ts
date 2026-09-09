/**
 * Compilador e renderer global da cena isometrica (painter unico).
 *
 * Fluxo: `compilarCenaIso` (puro) → `prepararCenaIso` (carrega PNGs, mede
 * bounds, opcionalmente pre-compoe faixas Wall_L) → `renderizarCenaIso`.
 *
 * Coordenadas identicas ao Lab. Sort por layer → depth → sublayer → order
 * intercala salas. Sublayer preserva estrutura → anexo → prop.
 *
 * Wall_L: caminho padrao ainda clipa a face local (`clipFace`); com
 * `stripParedeL: true` (atalho W no PreviewStage) a coluna inteira e os
 * anexos L viram um sprite unico, sem clip — o tile vizinho nao apaga o anexo.
 */

import { gradeDoProto } from '@microfirma/world-engine';
import type { AgenciaMontada } from './montar-agencia';
import { bboxDe, carregar, type Bbox } from './proto-blit/assets';
import { blitCatalogo, blitNaVertice, blitTile } from './proto-blit/blit';
import {
  calibracaoDoTema,
  coresDoTema,
  specPorId,
  type SpecAsset,
} from './proto-blit/catalogo';
import {
  ALTURA_TILE,
  faceParedeIso,
  losangoPisoDaFace,
  prismaFaceColuna,
  DIR_TILES,
  LARGURA_TILE,
  PORTA_VIDRO,
  iso,
  origemDoItem,
  type Pt,
} from './proto-blit/iso';
import { peDaFace, verticeDaFace } from './proto-blit/parede-blit';
import type { PecaPalcoItem } from './proto-blit/types';

type Cal = ReturnType<typeof calibracaoDoTema>;
type Layer = 'floor' | 'vertical' | 'overlay';
type Sublayer = 'structure' | 'mount' | 'prop';

export type RenderCommand =
  | {
      id: string;
      kind: 'tile';
      layer: Layer;
      depth: number;
      order?: number;
      src: string;
      gx: number;
      gy: number;
      anchor: Pt;
    }
  | {
      id: string;
      kind: 'vertex';
      layer: Layer;
      depth: number;
      order?: number;
      sublayer?: Sublayer;
      src: string;
      vx: number;
      vy: number;
      pe: Pt;
      dx: number;
      dy: number;
      face?: 'L' | 'R';
      clipFace?: 'L';
      clipH?: number;
    }
  | {
      id: string;
      kind: 'catalog';
      layer: Layer;
      depth: number;
      order?: number;
      sublayer?: Sublayer;
      src: string;
      spec: SpecAsset;
      item: PecaPalcoItem;
      cal: Cal;
      dx: number;
      dy: number;
    }
  | {
      /**
       * Faixa de parede pre-composta: os tiles estruturais e os anexos daquela
       * face viram um sprite so, montado em `prepararCenaIso`. Como o anexo
       * passa a ser textura da parede, nenhum tile vizinho pode apaga-lo e o
       * clip por comando deixa de ser necessario.
       */
      id: string;
      kind: 'strip';
      layer: Layer;
      depth: number;
      order?: number;
      sublayer?: Sublayer;
      face: 'L';
      src: string;
      pe: Pt;
      vx: number;
      /** Linha inicial (inclusiva) e final (exclusiva) da faixa. */
      vy0: number;
      vy1: number;
      mounts: { src: string; vy: number; dx: number; dy: number }[];
    }
  | {
      id: string;
      kind: 'threshold';
      layer: Layer;
      depth: number;
      order?: number;
      gx: number;
      gy: number;
    }
  | {
      id: string;
      kind: 'label';
      layer: Layer;
      depth: number;
      order?: number;
      text: string;
      gx: number;
      gy: number;
    };

export type CenaIso = {
  commands: RenderCommand[];
  warnings: string[];
};

/** Faixa de parede ja rasterizada, em coordenadas de cena (sem origem). */
export type StripBaked = { canvas: HTMLCanvasElement; ox: number; oy: number };

export type CenaIsoPreparada = CenaIso & {
  width: number;
  height: number;
  origem: Pt;
  bounds: Bounds;
  strips: Map<string, StripBaked>;
};

export type OpcoesCena = {
  /** Pre-compoe Wall_L + anexos de face L num sprite unico (sem clip). */
  stripParedeL?: boolean;
  /** Labels de lab (nome do tema). Desligado no Demo. */
  labels?: boolean;
  /** Fundo do canvas da cena estatica. Demo usa claro; lab usa azul. */
  fill?: string;
};

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const LAYER_ORDER: Record<Layer, number> = { floor: 0, vertical: 1, overlay: 2 };
const SUBLAYER_ORDER: Record<Sublayer, number> = { structure: 0, mount: 1, prop: 2 };
const MARGIN = 40;
/** Margem acima do pe para o topo do PNG Wall_L_128 nao ser cortado pelo clip. */
const CLIP_H_PAD = 64;

function rankSublayer(command: RenderCommand): number {
  if (!('sublayer' in command) || !command.sublayer) return SUBLAYER_ORDER.prop;
  return SUBLAYER_ORDER[command.sublayer];
}

function clipHDoTema(cal: Cal): number {
  return Math.max(cal.peWallR.y, cal.peWallL.y, cal.pePorta.y) + CLIP_H_PAD;
}

function isWall(item: PecaPalcoItem): boolean {
  return item.papel === 'wall' || item.face === 'R' || item.face === 'L';
}

function addAssetCommands(
  commands: RenderCommand[],
  warnings: string[],
  baseId: string,
  spec: SpecAsset,
  item: PecaPalcoItem,
  cal: Cal,
): void {
  // O Lab ordena o item pai uma unica vez e desenha suas camadas,
  // de tras para frente, contiguamente na ordem persistida.
  const parentDepth = item.gx + item.gy + (spec.papel === 'decor' ? 0.5 : 0);
  const layers = spec.camadas?.length
    ? spec.camadas.map((cam) => ({ spec: specPorId(cam.assetId), dx: cam.dx ?? 0, dy: cam.dy ?? 0 }))
    : [{ spec, dx: 0, dy: 0 }];

  for (let i = 0; i < layers.length; i++) {
    const child = layers[i]!;
    if (!child.spec?.fileName) {
      warnings.push(`${baseId}: asset sem PNG (${child.spec?.assetId ?? 'desconhecido'})`);
      continue;
    }
    commands.push({
      id: `${baseId}:layer:${i}`,
      kind: 'catalog',
      layer: 'vertical',
      sublayer: 'prop',
      depth: parentDepth,
      src: child.spec.fileName,
      spec: child.spec,
      item,
      cal,
      dx: child.dx,
      dy: child.dy,
    });
  }
}

/** Compila a agencia inteira para um unico sistema de profundidade. */
export function compilarCenaIso(agencia: AgenciaMontada, opcoes: OpcoesCena = {}): CenaIso {
  const stripParedeL = opcoes.stripParedeL === true;
  const commands: RenderCommand[] = [];
  const warnings: string[] = [];
  const corridorAnchor = { x: 64, y: 68 };

  for (const c of agencia.corridors) {
    commands.push({
      id: `corridor:${c.x},${c.y}`,
      kind: 'tile',
      layer: 'floor',
      depth: c.x + c.y,
      src: `${DIR_TILES}/Floor_128_${agencia.pisoCorredor}.png`,
      gx: c.x,
      gy: c.y,
      anchor: corridorAnchor,
    });
  }

  for (const slot of agencia.slots) {
    const tema = slot.proto.tema;
    const { w, h } = gradeDoProto(tema);
    const cal = calibracaoDoTema(tema);
    const cores = coresDoTema(tema);
    const floorSrc = `${DIR_TILES}/Floor_128_${cores.piso}.png`;
    const wallRSrc = `${DIR_TILES}/Wall_R_128_${cores.parede}.png`;
    const wallLSrc = `${DIR_TILES}/Wall_L_128_${cores.parede}.png`;
    const anchor = cal.ancoraPiso ?? corridorAnchor;
    const peR = cal.peWallR;
    const peL = cal.peWallL;
    const peDoor = cal.pePorta;
    const folga = cal.folgaPorta ?? { x: 11, y: 4 };
    const north = slot.rect.y1 <= agencia.corredorY;
    const doorX = slot.rect.x0 + Math.floor((w - 1) / 2);
    const clipH = clipHDoTema(cal);

    for (let ly = 0; ly < h; ly++) {
      for (let lx = 0; lx < w; lx++) {
        const gx = slot.rect.x0 + lx;
        const gy = slot.rect.y0 + ly;
        commands.push({
          id: `${slot.proto.key}:floor:${lx},${ly}`,
          kind: 'tile',
          layer: 'floor',
          depth: gx + gy,
          src: floorSrc,
          gx,
          gy,
          anchor,
        });
      }
    }

    // Paredes de fundo permanecem nas faces visiveis pela camera.
    for (let lx = 0; lx < w; lx++) {
      const vx = slot.rect.x0 + lx;
      const vy = slot.rect.y0;
      commands.push({
        id: `${slot.proto.key}:wallR:${lx}`,
        kind: 'vertex',
        layer: 'vertical',
        sublayer: 'structure',
        depth: vx + vy - 0.4,
        src: wallRSrc,
        vx,
        vy,
        pe: peR,
        dx: 0,
        dy: 0,
        face: 'R',
      });
    }
    // Anexos da face L quando a faixa e pre-composta: viram textura do strip.
    const mountsL: { src: string; vy: number; dx: number; dy: number }[] = [];

    if (!stripParedeL) {
      for (let ly = 0; ly < h; ly++) {
        const vx = slot.rect.x0;
        const vy = slot.rect.y0 + ly;
        commands.push({
          id: `${slot.proto.key}:wallL:${ly}`,
          kind: 'vertex',
          layer: 'vertical',
          sublayer: 'structure',
          depth: vx + vy - 0.35,
          src: wallLSrc,
          vx,
          vy,
          pe: peL,
          dx: 0,
          dy: 0,
          face: 'L',
          clipFace: 'L',
          clipH,
        });
      }
    }

    if (north) {
      commands.push({
        id: `${slot.proto.key}:threshold`,
        kind: 'threshold',
        layer: 'overlay',
        depth: doorX + slot.rect.y1 - 0.1,
        gx: doorX,
        gy: slot.rect.y1 - 1,
      });
    } else {
      commands.push({
        id: `${slot.proto.key}:door`,
        kind: 'vertex',
        layer: 'vertical',
        sublayer: 'structure',
        depth: doorX + slot.rect.y0 - 0.2,
        src: PORTA_VIDRO,
        vx: doorX,
        vy: slot.rect.y0,
        pe: peDoor,
        dx: folga.x,
        dy: folga.y,
      });
    }

    for (let i = 0; i < (tema.palco ?? []).length; i++) {
      const local = tema.palco[i] as PecaPalcoItem;
      const spec = specPorId(local.assetId);
      if (!spec) {
        warnings.push(`${slot.proto.key}: asset desconhecido ${local.assetId}`);
        continue;
      }

      if (isWall(local)) {
        const face = local.face === 'L' ? 'L' : 'R';
        const v = verticeDaFace(face, local.gx, local.gy);
        const vx = slot.rect.x0 + v.vx;
        const vy = slot.rect.y0 + v.vy;
        const layers = spec.camadas?.length
          ? spec.camadas.map((cam) => ({ spec: specPorId(cam.assetId), dx: cam.dx ?? 0, dy: cam.dy ?? 0 }))
          : [{ spec, dx: 0, dy: 0 }];
        for (let j = 0; j < layers.length; j++) {
          const child = layers[j]!;
          if (!child.spec?.fileName) {
            warnings.push(`${slot.proto.key}: anexo sem PNG ${child.spec?.assetId ?? local.assetId}`);
            continue;
          }
          if (stripParedeL && face === 'L') {
            mountsL.push({
              src: child.spec.fileName,
              vy,
              dx: (local.dx ?? 0) + child.dx,
              dy: (local.dy ?? 0) + child.dy,
            });
            continue;
          }
          commands.push({
            id: `${slot.proto.key}:mount:${i}:${j}`,
            kind: 'vertex',
            layer: 'vertical',
            sublayer: 'mount',
            depth: vx + vy - 0.1,
            src: child.spec.fileName,
            vx,
            vy,
            pe: peDaFace(face, cal),
            dx: (local.dx ?? 0) + child.dx,
            dy: (local.dy ?? 0) + child.dy,
            face,
          });
        }
        continue;
      }

      const item: PecaPalcoItem = {
        ...local,
        gx: slot.rect.x0 + local.gx,
        gy: slot.rect.y0 + local.gy,
      };
      addAssetCommands(commands, warnings, `${slot.proto.key}:prop:${i}`, spec, item, cal);
    }

    if (stripParedeL) {
      // A faixa entra na ordenacao no lugar do tile mais ao fundo, que era o
      // primeiro `wallL` do caminho antigo.
      commands.push({
        id: `${slot.proto.key}:stripL`,
        kind: 'strip',
        layer: 'vertical',
        sublayer: 'structure',
        depth: slot.rect.x0 + slot.rect.y0 - 0.35,
        face: 'L',
        src: wallLSrc,
        pe: peL,
        vx: slot.rect.x0,
        vy0: slot.rect.y0,
        vy1: slot.rect.y0 + h,
        mounts: mountsL,
      });
    }

    if (opcoes.labels === true) {
      commands.push({
        id: `${slot.proto.key}:label`,
        kind: 'label',
        layer: 'overlay',
        depth: slot.rect.x0 + slot.rect.y0,
        text: `${tema.nome} · ${slot.proto.zonaKind} · ${w}x${h}`,
        gx: (slot.rect.x0 + slot.rect.x1) / 2,
        gy: slot.rect.y0,
      });
    }
  }

  // O indice de insercao preserva a ordem do palco e, principalmente, a
  // ordem visual das camadas dos combos salva pelo Lab. IDs textuais nao
  // podem ser usados aqui ("layer:10" viria antes de "layer:2").
  commands.forEach((command, order) => {
    command.order = order;
  });
  commands.sort(
    (a, b) =>
      LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer] ||
      a.depth - b.depth ||
      rankSublayer(a) - rankSublayer(b) ||
      (a.order ?? 0) - (b.order ?? 0),
  );
  return { commands, warnings: [...new Set(warnings)] };
}

function rectFromVisible(x: number, y: number, bbox: Bbox): Bounds {
  return { minX: x + bbox.x, minY: y + bbox.y, maxX: x + bbox.x + bbox.w, maxY: y + bbox.y + bbox.h };
}

function unirBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

const BOUNDS_VAZIO: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

/**
 * Pecas da faixa em coordenadas de cena: tiles com vy crescente (o telhamento
 * do tileset), depois os anexos na ordem do palco. Anexos por ultimo garante
 * que nenhum tile os apague, que era o bug que o clip tentava contornar.
 */
async function stripPecas(
  command: Extract<RenderCommand, { kind: 'strip' }>,
): Promise<{ pecas: { src: string; x: number; y: number }[]; bounds: Bounds }> {
  const alvos = [
    ...Array.from({ length: command.vy1 - command.vy0 }, (_, k) => ({
      src: command.src,
      vy: command.vy0 + k,
      dx: 0,
      dy: 0,
    })),
    ...command.mounts,
  ];
  const pecas: { src: string; x: number; y: number }[] = [];
  let bounds = BOUNDS_VAZIO;
  for (const alvo of alvos) {
    const bbox = await bboxDe(alvo.src);
    const p = iso(command.vx, alvo.vy);
    const x = p.x + alvo.dx - command.pe.x;
    const y = p.y + alvo.dy - command.pe.y;
    pecas.push({ src: alvo.src, x, y });
    bounds = unirBounds(bounds, rectFromVisible(x, y, bbox));
  }
  return { pecas, bounds };
}

async function comporStrip(
  command: Extract<RenderCommand, { kind: 'strip' }>,
): Promise<StripBaked> {
  const { pecas, bounds } = await stripPecas(command);
  const ox = Math.floor(bounds.minX);
  const oy = Math.floor(bounds.minY);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(bounds.maxX - ox));
  canvas.height = Math.max(1, Math.ceil(bounds.maxY - oy));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`${command.id}: canvas 2d indisponivel para a faixa de parede`);
  ctx.imageSmoothingEnabled = false;
  for (const peca of pecas) {
    ctx.drawImage(await carregar(peca.src), peca.x - ox, peca.y - oy);
  }
  return { canvas, ox, oy };
}

function catalogPosition(command: Extract<RenderCommand, { kind: 'catalog' }>, bbox: Bbox): Pt {
  const shifted = { x: command.dx, y: command.dy };
  const map = command.cal.objetos ?? {};
  const obj = map[command.spec.kind] ?? map[command.spec.assetId];
  const { ox, oy, passo } = origemDoItem(command.item);
  if (obj?.modo === 'canto' && obj.pe) {
    const p = iso(ox, oy);
    return { x: shifted.x + p.x - obj.pe.x, y: shifted.y + p.y - obj.pe.y };
  }
  if (obj?.modo === 'centro' && obj.ancora) {
    const p = iso(ox + passo / 2, oy + passo / 2);
    return { x: shifted.x + p.x - obj.ancora.x, y: shifted.y + p.y - obj.ancora.y };
  }
  const p = iso(ox + 0.5, oy + 0.5);
  return { x: shifted.x + p.x - (bbox.x + bbox.w / 2), y: shifted.y + p.y - (bbox.y + bbox.h) };
}

async function commandBounds(command: RenderCommand): Promise<Bounds> {
  if (command.kind === 'threshold') {
    const p = iso(command.gx + 0.5, command.gy + 0.5);
    return { minX: p.x - 18, minY: p.y - 10, maxX: p.x + 18, maxY: p.y + 10 };
  }
  if (command.kind === 'label') {
    const p = iso(command.gx, command.gy);
    return { minX: p.x - 80, minY: p.y - 80, maxX: p.x + 180, maxY: p.y - 55 };
  }
  if (command.kind === 'strip') {
    return (await stripPecas(command)).bounds;
  }
  const bbox = await bboxDe(command.src);
  if (command.kind === 'tile') {
    const p = iso(command.gx + 0.5, command.gy + 0.5);
    return rectFromVisible(p.x - command.anchor.x, p.y - command.anchor.y, bbox);
  }
  if (command.kind === 'vertex') {
    const p = iso(command.vx, command.vy);
    return rectFromVisible(p.x + command.dx - command.pe.x, p.y + command.dy - command.pe.y, bbox);
  }
  const p = catalogPosition(command, bbox);
  return rectFromVisible(p.x, p.y, bbox);
}

export function validarCenaIso(agencia: AgenciaMontada, cena: CenaIso): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const command of cena.commands) {
    if (ids.has(command.id)) errors.push(`comando duplicado: ${command.id}`);
    ids.add(command.id);
  }
  for (const slot of agencia.slots) {
    const { w, h } = gradeDoProto(slot.proto.tema);
    const floors = cena.commands.filter((c) => c.id.startsWith(`${slot.proto.key}:floor:`)).length;
    if (floors !== w * h) errors.push(`${slot.proto.key}: piso incompleto (${floors}/${w * h})`);
  }
  for (let i = 0; i < agencia.slots.length; i++) {
    for (let j = i + 1; j < agencia.slots.length; j++) {
      const a = agencia.slots[i]!.rect;
      const b = agencia.slots[j]!.rect;
      if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) {
        errors.push(`salas sobrepostas: ${agencia.slots[i]!.proto.key} / ${agencia.slots[j]!.proto.key}`);
      }
    }
  }
  return errors;
}

/** Precarrega, mede bboxes reais e calcula canvas integral. */
export async function prepararCenaIso(
  agencia: AgenciaMontada,
  opcoes: OpcoesCena = {},
): Promise<CenaIsoPreparada> {
  const cena = compilarCenaIso(agencia, opcoes);
  const structural = validarCenaIso(agencia, cena);
  if (structural.length) throw new Error(structural.join('; '));
  if (cena.warnings.length) throw new Error(`cena incompleta: ${cena.warnings.join('; ')}`);

  const sources = [
    ...new Set(
      cena.commands.flatMap((c) => {
        const proprio = 'src' in c ? [c.src] : [];
        return c.kind === 'strip' ? [...proprio, ...c.mounts.map((m) => m.src)] : proprio;
      }),
    ),
  ];
  const loaded = await Promise.allSettled(sources.map((src) => carregar(src)));
  const failed = loaded.flatMap((r, i) => (r.status === 'rejected' ? [sources[i]!] : []));
  if (failed.length) throw new Error(`assets obrigatorios ausentes: ${failed.join(', ')}`);

  const boxes = await Promise.all(cena.commands.map(commandBounds));
  const bounds = boxes.reduce<Bounds>(
    (acc, b) => ({
      minX: Math.min(acc.minX, b.minX),
      minY: Math.min(acc.minY, b.minY),
      maxX: Math.max(acc.maxX, b.maxX),
      maxY: Math.max(acc.maxY, b.maxY),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const width = Math.max(640, Math.ceil(bounds.maxX - bounds.minX + MARGIN * 2));
  const height = Math.max(360, Math.ceil(bounds.maxY - bounds.minY + MARGIN * 2));
  const origem = { x: Math.round(MARGIN - bounds.minX), y: Math.round(MARGIN - bounds.minY) };
  const fora = boxes.some(
    (b) =>
      b.minX + origem.x < 0 ||
      b.minY + origem.y < 0 ||
      b.maxX + origem.x > width ||
      b.maxY + origem.y > height,
  );
  if (fora) throw new Error('bounds invalidos: existe comando fora do canvas calculado');

  const strips = new Map<string, StripBaked>();
  for (const command of cena.commands) {
    if (command.kind === 'strip') strips.set(command.id, await comporStrip(command));
  }

  return { ...cena, bounds, width, height, origem, strips };
}

function tracePoligono(ctx: CanvasRenderingContext2D, origem: Pt, poly: readonly Pt[]): void {
  ctx.moveTo(origem.x + poly[0]!.x, origem.y + poly[0]!.y);
  for (let i = 1; i < poly.length; i++) {
    ctx.lineTo(origem.x + poly[i]!.x, origem.y + poly[i]!.y);
  }
  ctx.closePath();
}

function clipFaceEstrutura(
  ctx: CanvasRenderingContext2D,
  origem: Pt,
  face: 'L',
  vx: number,
  vy: number,
  alturaPx: number,
): void {
  const poly = faceParedeIso(face, vx, vy, alturaPx);
  ctx.beginPath();
  tracePoligono(ctx, origem, poly);
  ctx.clip();
}

/**
 * Clip da MASCARA do ator: o mesmo prisma do painter, furado no losango do
 * piso. O PNG da parede pinta o chao do tile; no painter isso e textura da
 * peca, na mascara isso fura o agente nas encruzilhadas. Even-odd tira so
 * o piso — a parede em pe continua inteira. Nao e usado por `renderizarCenaIso`.
 */
function clipMascaraVertical(
  ctx: CanvasRenderingContext2D,
  origem: Pt,
  face: 'L' | 'R',
  vx: number,
  vy0: number,
  vy1: number,
  alturaPx: number,
): void {
  ctx.beginPath();
  tracePoligono(ctx, origem, prismaFaceColuna(face, vx, vy0, vy1, alturaPx));
  tracePoligono(ctx, origem, losangoPisoDaFace(face, vx, vy0, vy1));
  ctx.clip('evenodd');
}

/**
 * Peca de parede reexecutavel de forma sincrona, fora do painter.
 *
 * Nao e um caminho de desenho alternativo: `desenhar` replica exatamente o
 * mesmo blit que `renderizarCenaIso` ja fez na cena estatica, com a mesma
 * geometria e o mesmo clip. Serve para recortar o ator contra as paredes que
 * o painter global colocou na frente dele — nenhuma regra de ordenacao,
 * profundidade ou composicao da cena e alterada por isso.
 */
export type OclusorParede = {
  id: string;
  depth: number;
  /** Bounds em coordenadas de cena (sem a origem de tela). */
  bounds: Bounds;
  /**
   * Deslocamento de tela de UMA celula ao longo do trecho de parede, no sentido
   * em que a profundidade cresce. Presente so nos tiles estruturais de face.
   *
   * Serve para prolongar a MASCARA do ator na ultima celula do trecho. O sprite
   * tem 1,2 celula de largura — largura de arte, nao de ocupacao — enquanto a
   * face cobre exatamente 1 celula. Na ponta do trecho nao existe a face
   * seguinte para cobrir esse excedente e metade do ator vaza para fora da
   * parede. Prolongar ao longo da propria inclinacao da face resolve sem
   * inventar geometria: o recorte segue a mesma reta de topo.
   */
  extensao?: Pt;
  /**
   * Comprimento da face em celulas no sentido em que a profundidade cresce.
   * O painter grava `depth` no vertice de TRAS (norte na L, oeste na R). A
   * face em si ocupa este intervalo a frente desse ponto — e isso que o
   * recorte do ator precisa enxergar, sem mudar o sort da cena estatica.
   *
   * Tile estrutural: 1. Faixa pre-composta: a coluna inteira (`vy1 - vy0`).
   * Anexo: 0 (decora a face, nao a define).
   */
  alcanceDepth: number;
  desenhar(ctx: CanvasRenderingContext2D, origem: Pt): void;
};

/**
 * Passo de uma celula ao longo do trecho, no sentido de profundidade crescente:
 * +vy na face L, +vx na face R. Por ser exatamente o vetor entre dois vertices
 * consecutivos da face, deslizar a mascara por ele mantem a reta de topo.
 */
export function passoDoTrecho(face: 'L' | 'R'): Pt {
  return face === 'L'
    ? { x: -LARGURA_TILE / 2, y: ALTURA_TILE / 2 }
    : { x: LARGURA_TILE / 2, y: ALTURA_TILE / 2 };
}

/**
 * Extrai apenas as pecas verticais de parede (estrutura + anexos da propria
 * face) da cena ja preparada, com as imagens resolvidas para uso sincrono no
 * loop de animacao. Props e piso ficam de fora deliberadamente: dentro das
 * salas o ator continua na frente da mobilia.
 */
export async function prepararOclusoresParede(
  cena: CenaIsoPreparada,
): Promise<OclusorParede[]> {
  const out: OclusorParede[] = [];

  for (const command of cena.commands) {
    if (command.kind === 'strip') {
      const baked = cena.strips.get(command.id);
      if (!baked) continue;
      out.push({
        id: command.id,
        depth: command.depth,
        bounds: await commandBounds(command),
        extensao: passoDoTrecho(command.face),
        alcanceDepth: command.vy1 - command.vy0,
        desenhar: (ctx, origem) => {
          ctx.save();
          clipMascaraVertical(
            ctx,
            origem,
            command.face,
            command.vx,
            command.vy0,
            command.vy1,
            command.pe.y + CLIP_H_PAD,
          );
          ctx.drawImage(baked.canvas, origem.x + baked.ox, origem.y + baked.oy);
          ctx.restore();
        },
      });
      continue;
    }
    if (command.kind !== 'vertex') continue;
    if (command.sublayer !== 'structure' && command.sublayer !== 'mount') continue;

    // Anexos de parede nao se prolongam: eles decoram a face, nao a definem.
    const face =
      command.sublayer === 'structure' && (command.face === 'L' || command.face === 'R')
        ? command.face
        : null;
    const img = await carregar(command.src);
    out.push({
      id: command.id,
      depth: command.depth,
      bounds: await commandBounds(command),
      alcanceDepth: face ? 1 : 0,
      ...(face ? { extensao: passoDoTrecho(face) } : {}),
      desenhar: (ctx, origem) => {
        const altura = command.clipH ?? command.pe.y + CLIP_H_PAD;
        if (face) {
          ctx.save();
          clipMascaraVertical(ctx, origem, face, command.vx, command.vy, command.vy + 1, altura);
        } else if (command.clipFace === 'L') {
          ctx.save();
          clipFaceEstrutura(ctx, origem, 'L', command.vx, command.vy, command.clipH!);
        }
        blitNaVertice(
          ctx,
          img,
          { x: origem.x + command.dx, y: origem.y + command.dy },
          command.vx,
          command.vy,
          command.pe,
        );
        if (face || command.clipFace === 'L') ctx.restore();
      },
    });
  }

  return out;
}

/** Render final deterministico da cena preparada. */
export async function renderizarCenaIso(
  ctx: CanvasRenderingContext2D,
  cena: CenaIsoPreparada,
  opcoes: OpcoesCena = {},
): Promise<void> {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = opcoes.fill ?? '#f4f1ea';
  ctx.fillRect(0, 0, cena.width, cena.height);

  for (const command of cena.commands) {
    const o = cena.origem;
    if (command.kind === 'threshold') {
      const p = iso(command.gx + 0.5, command.gy + 0.5);
      const x = o.x + p.x;
      const y = o.y + p.y;
      ctx.fillStyle = 'rgba(80, 70, 55, 0.2)';
      ctx.strokeStyle = 'rgba(80, 70, 55, 0.45)';
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x + 16, y);
      ctx.lineTo(x, y + 7);
      ctx.lineTo(x - 16, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      continue;
    }
    if (command.kind === 'label') {
      const p = iso(command.gx, command.gy);
      ctx.fillStyle = 'rgba(126, 200, 255, 0.9)';
      ctx.font = '11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText(command.text, o.x + p.x - 40, o.y + p.y - 64);
      continue;
    }
    if (command.kind === 'strip') {
      const baked = cena.strips.get(command.id);
      if (!baked) throw new Error(`${command.id}: faixa de parede nao pre-composta`);
      ctx.drawImage(baked.canvas, o.x + baked.ox, o.y + baked.oy);
      continue;
    }
    const img = await carregar(command.src);
    if (command.kind === 'tile') {
      blitTile(ctx, img, o, command.gx, command.gy, command.anchor);
    } else if (command.kind === 'vertex') {
      if (command.clipFace === 'L') {
        ctx.save();
        clipFaceEstrutura(ctx, o, 'L', command.vx, command.vy, command.clipH!);
      }
      blitNaVertice(
        ctx,
        img,
        { x: o.x + command.dx, y: o.y + command.dy },
        command.vx,
        command.vy,
        command.pe,
      );
      if (command.clipFace === 'L') ctx.restore();
    } else {
      const bbox = await bboxDe(command.src);
      blitCatalogo(
        ctx,
        img,
        bbox,
        command.spec,
        command.item,
        command.cal,
        { x: o.x + command.dx, y: o.y + command.dy },
      );
    }
  }
}


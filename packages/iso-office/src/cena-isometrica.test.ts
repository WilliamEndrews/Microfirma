import { describe, expect, it } from 'vitest';
import { BIBLIA_TEMAS, gradeDoProto } from '@microfirma/world-engine';
import { compilarCenaIso, passoDoTrecho, validarCenaIso } from './cena-isometrica';
import { montarAgencia, type AgenciaMontada } from './montar-agencia';
import {
  iso,
  faceParedeIso,
  pontoNoPoligono,
  FACE_PAD_OUT,
  FACE_PAD_IN,
  PE_WALL_L_DEFAULT,
} from './proto-blit/iso';
import { specPorId } from './proto-blit/catalogo';
import type { RenderCommand } from './cena-isometrica';

describe('cena isometrica global', () => {
  it.each([1, 3, 6, 10])('compila todas as salas para pedido de %i', (salas) => {
    const agencia = montarAgencia({ salas }, 12345 + salas)!;
    const cena = compilarCenaIso(agencia);
    expect(validarCenaIso(agencia, cena)).toEqual([]);

    for (const slot of agencia.slots) {
      const floors = cena.commands.filter((c) => c.id.startsWith(`${slot.proto.key}:floor:`));
      const w = slot.rect.x1 - slot.rect.x0;
      const h = slot.rect.y1 - slot.rect.y0;
      expect(floors).toHaveLength(w * h);
    }
  });

  it('faixa norte preserva paredes de fundo e usa soleira frontal', () => {
    const agencia = montarAgencia({ salas: 4 }, 77)!;
    const cena = compilarCenaIso(agencia);
    const norte = agencia.slots.find((s) => s.rect.y1 <= agencia.corredorY);
    expect(norte).toBeDefined();

    const walls = cena.commands.filter((c) => c.id.startsWith(`${norte!.proto.key}:wallR:`));
    expect(walls.length).toBe(norte!.rect.x1 - norte!.rect.x0);
    expect(
      walls.every((c) => c.kind === 'vertex' && c.vy === norte!.rect.y0),
    ).toBe(true);
    expect(cena.commands.some((c) => c.id === `${norte!.proto.key}:threshold`)).toBe(true);
    expect(cena.commands.some((c) => c.id === `${norte!.proto.key}:door`)).toBe(false);
  });

  it.each(['norte', 'sul'] as const)('compila todos os temas na faixa %s', (lado) => {
    for (const tema of BIBLIA_TEMAS.temas.filter((t) =>
      t.zonaKind === 'private' || t.zonaKind === 'break' || t.zonaKind === 'boss_room',
    )) {
      const { w, h } = gradeDoProto(tema);
      const corredorY = lado === 'norte' ? h + 1 : 1;
      const y0 = lado === 'norte' ? 1 : 2;
      const agencia: AgenciaMontada = {
        seed: 1,
        grid: { width: w + 2, height: h + 3 },
        corredorY,
        pisoCorredor: 'Concrete',
        corridors: Array.from({ length: w }, (_, i) => ({ x: i + 1, y: corredorY })),
        slots: [
          {
            proto: {
              key: `${tema.zonaKind}-${tema.id}`,
              zonaKind: tema.zonaKind as 'private' | 'break' | 'boss_room',
              tema,
            },
            rect: { x0: 1, y0, x1: w + 1, y1: y0 + h },
          },
        ],
      };
      const cena = compilarCenaIso(agencia);
      expect(validarCenaIso(agencia, cena), tema.id).toEqual([]);
      expect(cena.warnings, tema.id).toEqual([]);

      for (let i = 0; i < tema.palco.length; i++) {
        const item = tema.palco[i]!;
        const spec = specPorId(item.assetId);
        if (!spec) continue;
        const parede = item.papel === 'wall' || item.face === 'R' || item.face === 'L';
        const prefix = parede
          ? `${tema.zonaKind}-${tema.id}:mount:${i}:`
          : `${tema.zonaKind}-${tema.id}:prop:${i}:layer:`;
        const filhos = cena.commands.filter((c) => c.id.startsWith(prefix));
        if (!spec.camadas?.length) {
          expect(filhos, `${tema.id}/${item.assetId}`).toHaveLength(1);
          const command = filhos[0]!;
          expect('src' in command ? command.src : '').toBe(spec.fileName);
          if (command.kind === 'catalog') {
            expect(command.item.gx).toBe(item.gx + 1);
            expect(command.item.gy).toBe(item.gy + y0);
            expect(command.item.qx).toBe(item.qx);
            expect(command.item.qy).toBe(item.qy);
            expect(command.item.passo).toBe(item.passo);
          } else if (command.kind === 'vertex') {
            expect(command.dx).toBe(item.dx ?? 0);
            expect(command.dy).toBe(item.dy ?? 0);
            expect(command.vx).toBe(item.face === 'L' ? 1 : item.gx + 1);
            expect(command.vy).toBe(item.face === 'L' ? item.gy + y0 : y0);
          }
          continue;
        }
        const esperados = spec.camadas
          .map((cam) => ({ cam, spec: specPorId(cam.assetId) }))
          .filter((entry) => entry.spec?.fileName && !entry.spec.camadas);
        expect(filhos.map((c) => ('src' in c ? c.src : '')), `${tema.id}/${item.assetId}`).toEqual(
          esperados.map((entry) => entry.spec!.fileName),
        );
        expect(filhos.map((c) => ('dx' in c ? c.dx : 0))).toEqual(
          esperados.map((entry) => (item.dx ?? 0) + (entry.cam.dx ?? 0)),
        );
        expect(filhos.map((c) => ('dy' in c ? c.dy : 0))).toEqual(
          esperados.map((entry) => (item.dy ?? 0) + (entry.cam.dy ?? 0)),
        );
        expect(new Set(filhos.map((c) => c.depth)).size).toBe(1);
      }
    }
  });

  it('ordena comandos por camada e profundidade de forma estavel', () => {
    const agencia = montarAgencia({ salas: 3 }, 222)!;
    const cena = compilarCenaIso(agencia);
    const ordem = { floor: 0, vertical: 1, overlay: 2 };
    for (let i = 1; i < cena.commands.length; i++) {
      const a = cena.commands[i - 1]!;
      const b = cena.commands[i]!;
      expect(ordem[a.layer]).toBeLessThanOrEqual(ordem[b.layer]);
      if (a.layer === b.layer) expect(a.depth).toBeLessThanOrEqual(b.depth);
    }
  });

  it('passo do trecho liga vertices consecutivos da mesma face', () => {
    // A extensao da mascara do ator desliza por este vetor. Coincidir com a
    // aresta da face e o que garante que a reta de topo da parede nao muda.
    const vx = 3;
    const vy = 7;
    const l = passoDoTrecho('L');
    expect(l.x).toBeCloseTo(iso(vx, vy + 1).x - iso(vx, vy).x);
    expect(l.y).toBeCloseTo(iso(vx, vy + 1).y - iso(vx, vy).y);

    const r = passoDoTrecho('R');
    expect(r.x).toBeCloseTo(iso(vx + 1, vy).x - iso(vx, vy).x);
    expect(r.y).toBeCloseTo(iso(vx + 1, vy).y - iso(vx, vy).y);

    // Sentido da camera: as duas faces avancam para baixo na tela.
    expect(l.y).toBeGreaterThan(0);
    expect(r.y).toBeGreaterThan(0);
  });

  it('mantem snapshot estrutural para uma seed fixa', () => {
    const agencia = montarAgencia({ salas: 3 }, 20260830)!;
    const cena = compilarCenaIso(agencia);
    const resumo = {
      grid: agencia.grid,
      corredorY: agencia.corredorY,
      slots: agencia.slots.map((s) => ({
        key: s.proto.key,
        zona: s.proto.zonaKind,
        rect: s.rect,
      })),
      comandosPorTipo: cena.commands.reduce<Record<string, number>>((acc, c) => {
        acc[c.kind] = (acc[c.kind] ?? 0) + 1;
        return acc;
      }, {}),
      warnings: cena.warnings,
    };
    expect(resumo).toMatchSnapshot();
  });

  it('Wall_L da sala da frente nao invade face da coluna oeste (anexos L)', () => {
    const temaNorte = BIBLIA_TEMAS.temas.find((t) => t.id === 'copa-simples-new');
    const temaSul = BIBLIA_TEMAS.temas.find((t) => t.id === 'sala-simples2-new');
    expect(temaNorte).toBeDefined();
    expect(temaSul).toBeDefined();
    const gn = gradeDoProto(temaNorte!);
    const gs = gradeDoProto(temaSul!);
    const corredorY = gn.h + 1;
    const agencia: AgenciaMontada = {
      seed: 1,
      grid: { width: Math.max(gn.w, gs.w) + 2, height: gn.h + gs.h + 3 },
      corredorY,
      pisoCorredor: 'Concrete',
      corridors: Array.from({ length: Math.max(gn.w, gs.w) }, (_, i) => ({
        x: i + 1,
        y: corredorY,
      })),
      slots: [
        {
          proto: { key: `break-${temaNorte!.id}`, zonaKind: 'break', tema: temaNorte! },
          rect: { x0: 1, y0: 1, x1: 1 + gn.w, y1: 1 + gn.h },
        },
        {
          proto: { key: `private-${temaSul!.id}`, zonaKind: 'private', tema: temaSul! },
          rect: { x0: 1, y0: corredorY + 1, x1: 1 + gs.w, y1: corredorY + 1 + gs.h },
        },
      ],
    };

    const cena = compilarCenaIso(agencia);
    const norte = agencia.slots[0]!;
    const sul = agencia.slots[1]!;
    const pecaLIx = temaNorte!.palco.findIndex((p) => p.face === 'L');
    expect(pecaLIx).toBeGreaterThanOrEqual(0);
    const pecaL = temaNorte!.palco[pecaLIx]!;

    const anexoL = cena.commands.find(
      (c) => c.kind === 'vertex' && c.id.startsWith(`${norte.proto.key}:mount:${pecaLIx}:`),
    );
    expect(anexoL?.kind).toBe('vertex');
    if (anexoL?.kind !== 'vertex') return;

    const wallLSul = cena.commands.find(
      (c) => c.kind === 'vertex' && c.id === `${sul.proto.key}:wallL:0`,
    );
    expect(wallLSul?.kind).toBe('vertex');
    if (wallLSul?.kind !== 'vertex') return;

    expect(anexoL.vx).toBe(norte.rect.x0);
    expect(anexoL.vy).toBe(norte.rect.y0 + (pecaL.gy ?? 0));
    expect(anexoL.dx).toBe(pecaL.dx ?? 0);
    expect(anexoL.dy).toBe(pecaL.dy ?? 0);
    expect(anexoL.sublayer).toBe('mount');
    expect(anexoL.face).toBe('L');
    expect(anexoL.clipFace).toBeUndefined();
    expect(wallLSul.sublayer).toBe('structure');
    expect(wallLSul.face).toBe('L');
    expect(wallLSul.clipFace).toBe('L');
    expect(wallLSul.clipH).toBeGreaterThan(80);
    expect(wallLSul.depth).toBeGreaterThan(anexoL.depth);

    const faceSul = faceParedeIso('L', wallLSul.vx, wallLSul.vy, wallLSul.clipH!);
    expect(pontoNoPoligono(iso(anexoL.vx, anexoL.vy), faceSul)).toBe(false);
    expect(pontoNoPoligono(iso(wallLSul.vx, wallLSul.vy), faceSul)).toBe(true);
  });

  it('na mesma celula, anexo de parede desenha depois da estrutura', () => {
    const agencia = montarAgencia({ salas: 4 }, 77)!;
    const cena = compilarCenaIso(agencia);
    const mounts = cena.commands.filter(
      (c): c is Extract<(typeof cena.commands)[number], { kind: 'vertex' }> =>
        c.kind === 'vertex' && c.sublayer === 'mount',
    );
    expect(mounts.length).toBeGreaterThan(0);
    for (const mount of mounts) {
      const parede = cena.commands.find(
        (c) =>
          c.kind === 'vertex' &&
          c.sublayer === 'structure' &&
          c.vx === mount.vx &&
          c.vy === mount.vy &&
          (c.id.includes(':wallL:') || c.id.includes(':wallR:')),
      );
      if (!parede || parede.kind !== 'vertex') continue;
      expect(cena.commands.indexOf(mount)).toBeGreaterThan(cena.commands.indexOf(parede));
    }
  });

  it('faceParedeIso L cobre o PNG externo sem invadir celula de tras', () => {
    expect(FACE_PAD_OUT).toBeCloseTo(PE_WALL_L_DEFAULT.x / 64, 5);
    expect(FACE_PAD_IN).toBe(0.35);
    const face3 = faceParedeIso('L', 1, 3, 160);
    const face5 = faceParedeIso('L', 1, 5, 160);
    expect(pontoNoPoligono(iso(1, 3), face3)).toBe(true);
    expect(pontoNoPoligono(iso(1, 3), face5)).toBe(false);
    expect(pontoNoPoligono(iso(1, 5), face5)).toBe(true);
    // Meio do PNG a oeste do pe (padOut) permanece dentro do clip local.
    const meioPng = iso(1 - FACE_PAD_OUT / 2, 3.5);
    expect(pontoNoPoligono(meioPng, face3)).toBe(true);
    expect(pontoNoPoligono(meioPng, face5)).toBe(false);
  });

  it('faixa L pre-composta substitui tiles e anexos por um comando por sala', () => {
    const agencia = montarAgencia({ salas: 4 }, 77)!;
    const cena = compilarCenaIso(agencia, { stripParedeL: true });

    expect(validarCenaIso(agencia, cena)).toEqual([]);
    expect(cena.warnings).toEqual([]);
    expect(cena.commands.some((c) => c.id.includes(':wallL:'))).toBe(false);
    expect(
      cena.commands.some((c) => c.kind === 'vertex' && c.sublayer === 'mount' && c.face === 'L'),
    ).toBe(false);
    expect(cena.commands.some((c) => 'clipFace' in c && c.clipFace)).toBe(false);

    for (const slot of agencia.slots) {
      const strip = cena.commands.find((c) => c.id === `${slot.proto.key}:stripL`);
      expect(strip?.kind, slot.proto.key).toBe('strip');
      if (strip?.kind !== 'strip') continue;
      expect(strip.vx).toBe(slot.rect.x0);
      expect(strip.vy0).toBe(slot.rect.y0);
      expect(strip.vy1).toBe(slot.rect.y1);
      expect(strip.sublayer).toBe('structure');
      expect(strip.layer).toBe('vertical');
    }

    // Wall_R segue no caminho antigo: o baker e generico, mas so o L esta ligado.
    expect(cena.commands.some((c) => c.id.includes(':wallR:'))).toBe(true);
  });

  it('faixa L cobre os mesmos sprites e posicoes do caminho com clip', () => {
    const agencia = montarAgencia({ salas: 4 }, 77)!;
    const comClip = compilarCenaIso(agencia);
    const comStrip = compilarCenaIso(agencia, { stripParedeL: true });

    for (const slot of agencia.slots) {
      const tiles = comClip.commands.filter(
        (c): c is Extract<RenderCommand, { kind: 'vertex' }> =>
          c.kind === 'vertex' && c.id.startsWith(`${slot.proto.key}:wallL:`),
      );
      const anexos = comClip.commands
        .filter(
          (c): c is Extract<RenderCommand, { kind: 'vertex' }> =>
            c.kind === 'vertex' &&
            c.sublayer === 'mount' &&
            c.face === 'L' &&
            c.id.startsWith(`${slot.proto.key}:mount:`),
        )
        // A cena sai ordenada por profundidade; `order` e o indice de insercao,
        // ou seja, a ordem do palco.
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const strip = comStrip.commands.find((c) => c.id === `${slot.proto.key}:stripL`);
      expect(strip?.kind).toBe('strip');
      if (strip?.kind !== 'strip') continue;

      expect(Array.from({ length: strip.vy1 - strip.vy0 }, (_, k) => strip.vy0 + k)).toEqual(
        tiles.map((t) => t.vy).sort((a, b) => a - b),
      );
      expect(strip.src).toBe(tiles[0]!.src);
      expect(strip.pe).toEqual(tiles[0]!.pe);
      expect(strip.mounts).toEqual(
        anexos.map((a) => ({ src: a.src, vy: a.vy, dx: a.dx, dy: a.dy })),
      );

      // A faixa entra na ordenacao exatamente onde estava o tile mais ao fundo.
      const fundo = tiles.reduce((min, t) => (t.depth < min.depth ? t : min), tiles[0]!);
      expect(strip.depth).toBe(fundo.depth);
    }
  });

  it('caminho padrao continua com clip e sem faixa pre-composta', () => {
    const agencia = montarAgencia({ salas: 4 }, 77)!;
    const cena = compilarCenaIso(agencia);
    expect(cena.commands.some((c) => c.kind === 'strip')).toBe(false);
    expect(cena.commands.some((c) => c.id.includes(':wallL:'))).toBe(true);
  });

  it('todas as Wall_L estruturais tem clipFace L', () => {
    const agencia = montarAgencia({ salas: 4 }, 77)!;
    const cena = compilarCenaIso(agencia);
    const walls = cena.commands.filter(
      (c): c is Extract<RenderCommand, { kind: 'vertex' }> =>
        c.kind === 'vertex' && c.id.includes(':wallL:'),
    );
    expect(walls.length).toBeGreaterThan(0);
    for (const wall of walls) {
      expect(wall.clipFace).toBe('L');
      expect(wall.clipH).toBeGreaterThan(80);
    }
    const mounts = cena.commands.filter(
      (c): c is Extract<RenderCommand, { kind: 'vertex' }> =>
        c.kind === 'vertex' && c.sublayer === 'mount' && c.face === 'L',
    );
    for (const mount of mounts) {
      expect(mount.clipFace).toBeUndefined();
    }
  });
});

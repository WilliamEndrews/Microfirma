import { describe, expect, it } from 'vitest';
import type { Room } from '@microfirma/contracts';
import { buildNavGrid } from './navgrid.js';
import {
  facingOlhandoPara,
  inferirFacingAssento,
  mesaMaisProxima,
  postoParaGridWorld,
  resolverAssento,
  resolverPostoAgente,
} from './postos-trabalho.js';
import type { PostoTrabalho, TemaArquiteto } from './construtor-biblia.js';

function salaDeTeste(overrides: Partial<Room> = {}): Room {
  return {
    roomId: 'room-1',
    zoneId: 'zone-1',
    name: 'Sala de teste',
    kind: 'private',
    rect: { x0: 1, y0: 1, x1: 4, y1: 4 },
    door: { x: 2, y: 3 },
    ...overrides,
  };
}

describe('postoParaGridWorld', () => {
  it('celula 0,0 com passo 1 cai no centro da sala + offset do rect', () => {
    const posto: PostoTrabalho = { agentSlot: 'default', gx: 1, gy: 1, passo: 1, facing: 2 };
    const sala = salaDeTeste();
    const resolvido = postoParaGridWorld(posto, sala);
    expect(resolvido.cellAlvo).toEqual({ x: 2, y: 2 });
    expect(resolvido.render.x).toBeCloseTo(2);
    expect(resolvido.render.y).toBeCloseTo(2);
    expect(resolvido.render.facing).toBe(2);
  });

  it('sub-celula (qx/qy com passo 0.5) fica dentro da mesma celula inteira', () => {
    const posto: PostoTrabalho = { agentSlot: 'default', gx: 1, gy: 1, qx: 1, qy: 0, passo: 0.5, facing: 0 };
    const sala = salaDeTeste();
    const resolvido = postoParaGridWorld(posto, sala);
    expect(resolvido.cellAlvo).toEqual({ x: 2, y: 2 });
    // qx=1 (metade direita) desloca o render para a direita do centro da celula.
    expect(resolvido.render.x).toBeGreaterThan(2);
  });

  it('espelharY reflete a celula verticalmente dentro do rect da sala', () => {
    const posto: PostoTrabalho = { agentSlot: 'default', gx: 1, gy: 0, passo: 1, facing: 2 };
    const sala = salaDeTeste(); // altura 3 (y0=1,y1=4)
    const semEspelho = postoParaGridWorld(posto, sala, false);
    const comEspelho = postoParaGridWorld(posto, sala, true);
    expect(semEspelho.cellAlvo.y).toBe(1); // gy=0 -> y0+0
    expect(comEspelho.cellAlvo.y).toBe(3); // gy=0 espelhado -> y0 + (altura-1) = 1+2
  });
});

describe('resolverPostoAgente', () => {
  const tema = {
    id: 'tema-teste',
    nome: 'Tema teste',
    tilesetAtivo: 'x',
    prioridade: 1,
    unicoNaAgencia: false,
    zonaKind: 'private',
    palco: [],
    postosTrabalho: [{ agentSlot: 'default', gx: 1, gy: 1, passo: 1, facing: 2 }],
  } as unknown as TemaArquiteto;

  it('sem posto para o slot exato, cai no default', () => {
    const sala = salaDeTeste();
    const resolvido = resolverPostoAgente(tema, 'agent-priv-0', sala);
    expect(resolvido?.cellAlvo).toEqual({ x: 2, y: 2 });
  });

  it('tema sem postosTrabalho retorna undefined (fallback do chamador)', () => {
    const semPosto = { ...tema, postosTrabalho: [] } as TemaArquiteto;
    const sala = salaDeTeste();
    expect(resolverPostoAgente(semPosto, 'agent-priv-0', sala)).toBeUndefined();
    expect(resolverPostoAgente(undefined, 'agent-priv-0', sala)).toBeUndefined();
  });
});

describe('resolverAssento', () => {
  it('usa desk.seat quando presente e caminhavel', () => {
    const layout = {
      officeId: 'o',
      seed: 1,
      grid: { width: 6, height: 6 },
      rooms: [salaDeTeste()],
      props: [
        {
          propId: 'desk-1',
          kind: 'desk' as const,
          cell: { x: 2, y: 2 },
          roomId: 'room-1',
          ownerAgentId: 'agent-0',
          facing: 0 as const,
          footprint: { w: 1, h: 1 },
          seat: { x: 3, y: 2 },
        },
      ],
      decor: [],
      corridors: [{ x: 2, y: 5 }],
      theme: { name: 't', palette: [], greenery: 0 },
      walls: [],
      wallMounts: [],
    };
    const nav = buildNavGrid(layout);
    const desk = layout.props[0]!;
    expect(resolverAssento(nav, desk)).toEqual({ x: 3, y: 2 });
  });

  it('cai para a cadeira do mesmo dono quando desk.seat esta ausente ou bloqueado', () => {
    const layout = {
      officeId: 'o',
      seed: 1,
      grid: { width: 6, height: 6 },
      rooms: [salaDeTeste()],
      props: [
        {
          propId: 'desk-1',
          kind: 'desk' as const,
          cell: { x: 2, y: 2 },
          roomId: 'room-1',
          ownerAgentId: 'agent-0',
          facing: 0 as const,
          footprint: { w: 1, h: 1 },
        },
        {
          propId: 'chair-1',
          kind: 'chair' as const,
          cell: { x: 1, y: 2 },
          roomId: 'room-1',
          ownerAgentId: 'agent-0',
          facing: 0 as const,
          footprint: { w: 1, h: 1 },
        },
      ],
      decor: [],
      corridors: [{ x: 2, y: 5 }],
      theme: { name: 't', palette: [], greenery: 0 },
      walls: [],
      wallMounts: [],
    };
    const nav = buildNavGrid(layout);
    const [desk, chair] = layout.props;
    expect(resolverAssento(nav, desk!, layout.props)).toEqual(chair!.cell);
  });

  it('sem seat e sem cadeira, cai no vizinho generico da mesa (seatCellFor)', () => {
    const layout = {
      officeId: 'o',
      seed: 1,
      grid: { width: 6, height: 6 },
      rooms: [salaDeTeste()],
      props: [
        {
          propId: 'desk-1',
          kind: 'desk' as const,
          cell: { x: 2, y: 2 },
          roomId: 'room-1',
          ownerAgentId: 'agent-0',
          facing: 0 as const,
          footprint: { w: 1, h: 1 },
        },
      ],
      decor: [],
      corridors: [{ x: 2, y: 5 }],
      theme: { name: 't', palette: [], greenery: 0 },
      walls: [],
      wallMounts: [],
    };
    const nav = buildNavGrid(layout);
    const desk = layout.props[0]!;
    expect(resolverAssento(nav, desk)).not.toBeNull();
  });
});

describe('orientacao automatica do assento', () => {
  it('olha para a mesa nos quatro cardinais', () => {
    expect(facingOlhandoPara({ x: 1, y: 1 }, { x: 1, y: 2 })).toBe(0);
    expect(facingOlhandoPara({ x: 1, y: 1 }, { x: 0, y: 1 })).toBe(1);
    expect(facingOlhandoPara({ x: 1, y: 1 }, { x: 1, y: 0 })).toBe(2);
    expect(facingOlhandoPara({ x: 1, y: 1 }, { x: 2, y: 1 })).toBe(3);
  });

  it('escolhe a mesa mais proxima', () => {
    const posto = { gx: 2, gy: 2, qx: 0, qy: 0, passo: 0.5 };
    expect(
      mesaMaisProxima(posto, [
        { assetId: 'longe', gx: 6, gy: 6 },
        { assetId: 'perto', gx: 2, gy: 1 },
      ])?.assetId,
    ).toBe('perto');
  });

  it('usa norte quando assento e mesa compartilham a celula', () => {
    expect(
      inferirFacingAssento(
        { gx: 1, gy: 1, qx: 0, qy: 0, passo: 0.5 },
        { assetId: 'desk', gx: 1, gy: 1 },
      ),
    ).toEqual({ facing: 2, origem: 'padrao_norte' });
  });
});

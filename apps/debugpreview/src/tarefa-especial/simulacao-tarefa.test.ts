import { describe, expect, it } from 'vitest';
import { isWalkable } from '@microfirma/world-engine';
import { construirEspacoAgencia } from '../espaco-agencia';
import { montarAgencia } from '../montar-agencia';
import { seedDoPedido } from '../selecionar-pedido';
import { HISTORIA_PEDIDOS } from './historias';
import { SimulacaoTarefaEspecial } from './simulacao-tarefa';

describe('SimulacaoTarefaEspecial', () => {
  it('avanca batidas e emite speech no agente ativo', () => {
    const seed = seedDoPedido({ salas: 3 });
    const agencia = montarAgencia({ salas: 3 }, seed)!;
    const cenario = construirEspacoAgencia(agencia);
    expect(cenario.agentes.length).toBeGreaterThanOrEqual(3);

    const sim = new SimulacaoTarefaEspecial(cenario, HISTORIA_PEDIDOS, seed);
    let viuSpeech = false;
    let batidaMax = 0;

    for (let i = 0; i < 2500; i++) {
      const atores = sim.tick(50);
      const st = sim.status();
      batidaMax = Math.max(batidaMax, st.batidaIndex);
      for (const a of atores) {
        if ('speech' in a && a.speech) viuSpeech = true;
      }
      const debug = sim.debugInfo();
      for (const path of debug.paths.values()) {
        for (const c of path) {
          expect(isWalkable(cenario.nav, c)).toBe(true);
        }
      }
    }

    expect(viuSpeech).toBe(true);
    expect(batidaMax).toBeGreaterThan(0);
  });

  it('nenhum agente fica parado com a animacao de walk ativa', () => {
    const seed = seedDoPedido({ salas: 3 });
    const agencia = montarAgencia({ salas: 3 }, seed)!;
    const cenario = construirEspacoAgencia(agencia);
    const sim = new SimulacaoTarefaEspecial(cenario, HISTORIA_PEDIDOS, seed);

    const anterior = new Map<string, { x: number; y: number }>();
    const paradoAndando = new Map<string, number>();

    for (let i = 0; i < 2500; i++) {
      for (const a of sim.tick(50)) {
        const antes = anterior.get(a.agentId);
        anterior.set(a.agentId, { x: a.x, y: a.y });
        if (!antes) continue;
        const mexeu = Math.hypot(a.x - antes.x, a.y - antes.y) > 1e-6;
        const travas = a.activity === 'walking' && !mexeu ? (paradoAndando.get(a.agentId) ?? 0) + 1 : 0;
        paradoAndando.set(a.agentId, travas);
        // Uma unica batida pode encerrar a rota no tick; varias seguidas nao.
        expect(travas).toBeLessThan(3);
      }
    }
  });

  it('status reflete a historia sorteada', () => {
    const seed = seedDoPedido({ salas: 3 });
    const agencia = montarAgencia({ salas: 3 }, seed)!;
    const cenario = construirEspacoAgencia(agencia);
    const sim = new SimulacaoTarefaEspecial(cenario, HISTORIA_PEDIDOS, seed);
    const st = sim.status();
    expect(st.historiaId).toBe('pedidos');
    expect(st.titulo).toBe(HISTORIA_PEDIDOS.titulo);
    expect(st.batidaTotal).toBe(HISTORIA_PEDIDOS.batidas.length);
  });
});

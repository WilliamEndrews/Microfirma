/**
 * Testes do Narrative Scheduler - "o coracao do produto" (ver docstring do
 * arquivo). Cobrem os tres mecanismos que ele documenta: agregacao, divida
 * narrativa / modo ambiente, e orcamento de atencao - alem de prioridade e
 * dos efeitos colaterais que alimentam o render (heat, lightBroken, kpis).
 */
import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '@microfirma/contracts';
import { NarrativeScheduler } from './narrative-scheduler.js';

let proximoEventId = 1;
function eventoBase(): { eventId: string; tenantId: string; tsReal: number } {
  return { eventId: `ev-${proximoEventId++}`, tenantId: 't1', tsReal: 0 };
}

function erro(agentId: string, kind = 'validation_error', severity: 'warning' | 'error' | 'critical' = 'error'): DomainEvent {
  return { ...eventoBase(), type: 'error.raised', agentId, kind, severity };
}

function aprovacao(agentId: string): DomainEvent {
  return { ...eventoBase(), type: 'approval.requested', agentId, approvalId: 'a1', question: 'ok?' };
}

function llm(agentId: string, costUsd: number): DomainEvent {
  return {
    ...eventoBase(),
    type: 'llm.completed',
    agentId,
    model: 'gpt-4o-mini',
    inputTokens: 100,
    outputTokens: 50,
    costUsd,
    latencyMs: 500,
  };
}

describe('NarrativeScheduler - agregacao', () => {
  it('coalesce varios eventos do mesmo agente na mesma janela em UMA intencao', () => {
    const s = new NarrativeScheduler();
    s.ingest(erro('a1'));
    s.ingest(erro('a1'));
    s.ingest(erro('a1'));

    const { intents } = s.tick(100);
    const doAgente = intents.filter((i) => i.agentId === 'a1');

    expect(doAgente.length).toBe(1);
    expect(doAgente[0]?.representsEvents).toBe(3);
  });

  it('duracao da encenacao cresce com o numero de eventos agregados', () => {
    const s1 = new NarrativeScheduler();
    s1.ingest(erro('pouco'));
    const [poucoIntent] = s1.tick(100).intents.filter((i) => i.agentId === 'pouco');

    const s2 = new NarrativeScheduler();
    for (let i = 0; i < 8; i++) s2.ingest(erro('muito'));
    const [muitoIntent] = s2.tick(100).intents.filter((i) => i.agentId === 'muito');

    expect(muitoIntent?.minDurationMs ?? 0).toBeGreaterThan(poucoIntent?.minDurationMs ?? 0);
  });
});

describe('NarrativeScheduler - divida narrativa e modo ambiente', () => {
  it('agente sem divida nao entra em modo ambiente', () => {
    const s = new NarrativeScheduler();
    s.ingest(erro('a1'));
    s.tick(100);
    expect(s.isAmbientMode('a1')).toBe(false);
  });

  it('acumular divida acima de maxDebtMs poe o agente em modo ambiente', () => {
    // attentionBudget baixo para forcar fila e acumulo de divida rapido, e
    // maxDebtMs baixo para o teste nao precisar de milhares de ticks.
    const s = new NarrativeScheduler({ attentionBudget: 1, maxDebtMs: 500, minLegibleMs: 300 });

    // Um agente ocupa o unico slot de atencao por muitas encenacoes longas,
    // empurrando a divida do proprio agente para cima a cada novo evento.
    for (let i = 0; i < 10; i++) {
      s.ingest(erro('sobrecarregado'));
      s.tick(300);
    }

    expect(s.debtFor('sobrecarregado')).toBeGreaterThan(0);
    expect(s.isAmbientMode('sobrecarregado')).toBe(true);
  });

  it('em modo ambiente, o fato nao e descartado: ele aumenta o heat', () => {
    const s = new NarrativeScheduler({ attentionBudget: 1, maxDebtMs: 500, minLegibleMs: 300 });
    for (let i = 0; i < 10; i++) {
      s.ingest(erro('a1'));
      s.tick(300);
    }
    expect(s.isAmbientMode('a1')).toBe(true);
    const heatAntes = s.ambientFor('a1').heat;

    expect(heatAntes).toBeGreaterThan(0);

    s.ingest(erro('a1'));
    s.tick(300);

    // Heat e clampado em 1 (Math.min(1, ...)); apos varios erros ja pode estar
    // saturado. A garantia que importa e que o modo ambiente NUNCA reduz o
    // heat - o fato continua sendo contabilizado, so muda a linguagem.
    expect(s.ambientFor('a1').heat).toBeGreaterThanOrEqual(heatAntes);
  });
});

describe('NarrativeScheduler - orcamento de atencao', () => {
  it('nao encena mais que attentionBudget encenacoes simultaneas de baixa prioridade', () => {
    const s = new NarrativeScheduler({ attentionBudget: 2, minLegibleMs: 5000 });
    for (const id of ['a1', 'a2', 'a3', 'a4']) s.ingest(erro(id, 'validation_error', 'warning'));

    const { intents } = s.tick(100);
    expect(intents.length).toBeLessThanOrEqual(2);
  });

  it('aprovacao pendente fura a fila mesmo com orcamento esgotado', () => {
    const s = new NarrativeScheduler({ attentionBudget: 1, minLegibleMs: 5000 });
    s.ingest(erro('ocupado', 'validation_error', 'warning'));
    s.tick(100); // consome o unico slot de atencao por 5s

    s.ingest(aprovacao('urgente'));
    const { intents } = s.tick(100);

    expect(intents.some((i) => i.agentId === 'urgente' && i.behavior === 'go_to_door')).toBe(true);
  });
});

describe('NarrativeScheduler - prioridade', () => {
  it('aprovacao e incidente (prioridade >= 0.8) furam o orcamento; trabalho rotineiro fica de fora', () => {
    // "so o urgente furra a fila" (narrative-scheduler.ts) isenta qualquer
    // prioridade >= 0.8 do orcamento de atencao - nao so a mais alta. Aprovacao
    // (0.95) e incidente (0.8) sao ambos urgentes e devem ser encenados juntos,
    // mesmo com orcamento 1; so o trabalho rotineiro (0.5) e racionado.
    const s = new NarrativeScheduler({ attentionBudget: 1, minLegibleMs: 1000 });
    s.ingest(erro('incidente', 'http_5xx', 'critical')); // incident > 0.4 -> prioridade 0.8
    s.ingest(erro('trabalho'));
    s.ingest(aprovacao('bloqueado'));

    const { intents } = s.tick(100);
    const porAgente = new Set(intents.map((i) => i.agentId));

    expect(porAgente.has('bloqueado')).toBe(true);
    expect(porAgente.has('incidente')).toBe(true);
    expect(porAgente.has('trabalho')).toBe(false);
  });
});

describe('NarrativeScheduler - efeitos ambiente', () => {
  it('erro 5xx/timeout queima a luz da area; repairLight apaga o incidente', () => {
    const s = new NarrativeScheduler();
    s.ingest(erro('a1', 'http_5xx', 'critical'));
    s.tick(100);

    expect(s.ambientFor('a1').lightBroken).toBe(true);

    s.repairLight('a1');
    expect(s.ambientFor('a1').lightBroken).toBe(false);
  });

  it('erro que nao e 5xx/timeout NAO queima a luz', () => {
    const s = new NarrativeScheduler();
    s.ingest(erro('a1', 'validation_error', 'warning'));
    s.tick(100);
    expect(s.ambientFor('a1').lightBroken).toBe(false);
  });

  it('kpis acumulam custo de llm.completed e refletem o orcamento configurado', () => {
    const s = new NarrativeScheduler({ budgetUsdToday: 10 });
    s.ingest(llm('a1', 1.5));
    s.ingest(llm('a1', 2.25));
    s.tick(100);

    const kpis = s.kpis();
    expect(kpis.costUsdToday).toBeCloseTo(3.75, 6);
    expect(kpis.budgetUsdToday).toBe(10);
  });

  it('heat e incident decaem com o tempo quando nao ha novos eventos', () => {
    const s = new NarrativeScheduler();
    s.ingest(erro('a1', 'http_5xx', 'critical'));
    s.tick(100);
    const heatLogoApos = s.ambientFor('a1').heat;

    for (let i = 0; i < 50; i++) s.tick(100); // 5s sem novos eventos

    expect(s.ambientFor('a1').heat).toBeLessThan(heatLogoApos);
  });
});

describe('NarrativeScheduler - determinismo', () => {
  it('a mesma sequencia de (evento, dt) produz exatamente os mesmos intents', () => {
    const rodar = () => {
      const s = new NarrativeScheduler();
      const saida: unknown[] = [];
      s.ingest(erro('a1'));
      saida.push(s.tick(100));
      s.ingest(aprovacao('a2'));
      saida.push(s.tick(100));
      s.ingest(llm('a1', 0.02));
      saida.push(s.tick(100));
      return saida.map((o) => JSON.stringify(o, (k, v) => (k === 'intentId' ? '<id>' : v)));
    };

    proximoEventId = 1;
    const primeira = rodar();
    proximoEventId = 1;
    const segunda = rodar();

    expect(segunda).toEqual(primeira);
  });
});

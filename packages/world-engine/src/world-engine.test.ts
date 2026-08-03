/**
 * Testes do World Engine. A propriedade fundamental exigida pelo produto
 * (ADR-0006, Replay e auditoria): dado o mesmo layout, a mesma seed e a
 * mesma sequencia de (eventos, dt), o engine produz exatamente os mesmos
 * quadros. Sem isso, Replay e "manda a seed" para suporte nao existem.
 */
import { describe, expect, it } from 'vitest';
import type { AgentDescriptor, AgentRole, DomainEvent } from '@microfirma/contracts';
import { planSpaceProgram } from './space-program.js';
import { solveLayout } from './layout-solver.js';
import { WorldEngine } from './world-engine.js';

function elenco(): AgentDescriptor[] {
  const papeis: AgentRole[] = ['orchestrator', 'researcher', 'support'];
  return papeis.map((role, i) => ({
    agentId: `agent-${i}`,
    displayName: `Agente ${i}`,
    role,
    framework: 'test',
    discoveredVia: 'synthetic' as const,
    avatarSeed: i,
  }));
}

function layoutDeTeste(seed: number) {
  const agentes = elenco();
  const programa = planSpaceProgram(agentes, { officeId: 'office-test', seed });
  return { layout: solveLayout(programa), agentes };
}

/** Sequencia fixa de eventos usada nos dois testes de determinismo. */
function sequenciaDeEventos(): DomainEvent[] {
  return [
    { eventId: 'e1', tenantId: 't1', tsReal: 0, type: 'run.started', agentId: 'agent-0', runId: 'r1' },
    { eventId: 'e2', tenantId: 't1', tsReal: 0, type: 'tool.called', agentId: 'agent-0', toolName: 'buscar', durationMs: 40, ok: true },
    {
      eventId: 'e3',
      tenantId: 't1',
      tsReal: 0,
      type: 'error.raised',
      agentId: 'agent-1',
      kind: 'http_5xx',
      severity: 'critical',
    },
    { eventId: 'e4', tenantId: 't1', tsReal: 0, type: 'approval.requested', agentId: 'agent-2', approvalId: 'a1', question: 'confirma?' },
    { eventId: 'e5', tenantId: 't1', tsReal: 0, type: 'run.finished', agentId: 'agent-0', runId: 'r1', status: 'ok', durationMs: 900 },
  ];
}

describe('WorldEngine - determinismo', () => {
  it('mesma seed + mesma sequencia de eventos produz quadros identicos', () => {
    const rodar = () => {
      const { layout, agentes } = layoutDeTeste(7);
      const engine = new WorldEngine({ layout, agents: agentes, seed: 7 });
      const eventos = sequenciaDeEventos();

      const quadros = [];
      for (let i = 0; i < eventos.length; i++) {
        engine.ingest([eventos[i] as DomainEvent]);
        quadros.push(engine.tick(100));
      }
      // Mais alguns ticks sem eventos, para cobrir movimento/pathfinding.
      for (let i = 0; i < 20; i++) quadros.push(engine.tick(100));

      return quadros;
    };

    const a = rodar();
    const b = rodar();
    expect(b).toEqual(a);
  });

  it('snapshot() e a projecao dos mesmos ticks aplicados', () => {
    const { layout, agentes } = layoutDeTeste(11);
    const engine = new WorldEngine({ layout, agents: agentes, seed: 11 });
    for (const e of sequenciaDeEventos()) engine.ingest([e]);
    for (let i = 0; i < 5; i++) engine.tick(100);

    const foto = engine.snapshot();
    expect(foto.kind).toBe('snapshot');
    expect(foto.tick).toBe(5);
    expect(foto.actors.length).toBeGreaterThan(0);
    // Os dois agentes internos (zelador/tecnico) sempre existem, alem do elenco.
    expect(foto.actors.some((a) => a.agentId === 'microfirma-zelador')).toBe(true);
    expect(foto.actors.some((a) => a.agentId === 'microfirma-tecnico')).toBe(true);
  });
});

describe('WorldEngine - aprovacao humana', () => {
  it('resolverAprovacao tira o ator do estado waiting_approval', () => {
    const { layout, agentes } = layoutDeTeste(3);
    const engine = new WorldEngine({ layout, agents: agentes, seed: 3 });

    engine.ingest([
      { eventId: 'e1', tenantId: 't1', tsReal: 0, type: 'approval.requested', agentId: 'agent-2', approvalId: 'a1', question: 'confirma?' },
    ]);

    // O ator caminha ate a porta antes de assumir 'waiting_approval' - avanca
    // ticks ate a chegada, com um limite de seguranca generoso.
    let antes = engine.snapshot().actors.find((a) => a.agentId === 'agent-2');
    for (let i = 0; i < 300 && antes?.activity !== 'waiting_approval'; i++) {
      engine.tick(100);
      antes = engine.snapshot().actors.find((a) => a.agentId === 'agent-2');
    }
    expect(antes?.activity).toBe('waiting_approval');

    engine.resolverAprovacao('agent-2');
    const depois = engine.snapshot().actors.find((a) => a.agentId === 'agent-2');
    expect(depois?.activity).not.toBe('waiting_approval');
  });
});

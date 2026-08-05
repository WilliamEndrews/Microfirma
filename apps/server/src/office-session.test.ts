/**
 * Testes da OfficeSession - a simulacao autoritativa sem rede.
 *
 * Estes testes existem para garantir que o comportamento do servidor e
 * deterministico e que a cadencia de keyframe/snapshot esta correta, tudo
 * sem abrir um socket. Se algo aqui quebra, o servidor em producao quebra
 * da mesma forma - mas aqui o diagnostico e em milissegundos.
 */

import { describe, it, expect } from 'vitest';
import { OfficeSession } from './office-session.js';

describe('OfficeSession', () => {
  it('welcome contem seed, cadencia e protocolo', () => {
    const s = new OfficeSession({ seed: 42, tickMs: 100, keyframeEveryTicks: 50 });
    const w = s.welcome();
    expect(w.kind).toBe('welcome');
    expect(w.seed).toBe(42);
    expect(w.tickMs).toBe(100);
    expect(w.keyframeEveryTicks).toBe(50);
    expect(w.protocolVersion).toBe(1);
    expect(w.sessionId).toBe('office-42');
  });

  it('snapshot inicial tem layout e atores', () => {
    const s = new OfficeSession({ seed: 1 });
    const snap = s.snapshot();
    expect(snap.kind).toBe('snapshot');
    expect(snap.layout.rooms.length).toBeGreaterThan(0);
    expect(snap.actors.length).toBeGreaterThan(0);
    expect(snap.tick).toBe(0);
  });

  it('primeiro tick devolve snapshot (snapshotPendente)', () => {
    const s = new OfficeSession({ seed: 7 });
    const quadro = s.tick();
    expect(quadro).not.toBeNull();
    expect(quadro!.kind).toBe('snapshot');
  });

  it('ticks subsequentes devolvem delta ate o keyframe', () => {
    const s = new OfficeSession({ seed: 7, keyframeEveryTicks: 5 });
    s.tick(); // tick 1: snapshot (pendente)
    for (let i = 2; i <= 4; i++) {
      const q = s.tick();
      expect(q).not.toBeNull();
      expect(q!.kind).toBe('delta');
    }
    // tick 5: keyframe
    const key = s.tick();
    expect(key).not.toBeNull();
    expect(key!.kind).toBe('snapshot');
  });

  it('tick pausado devolve null', () => {
    const s = new OfficeSession({ seed: 3 });
    s.apply({ type: 'set_paused', paused: true });
    expect(s.tick()).toBeNull();
    expect(s.paused).toBe(true);
  });

  it('despausar retoma a simulacao', () => {
    const s = new OfficeSession({ seed: 3 });
    s.apply({ type: 'set_paused', paused: true });
    expect(s.tick()).toBeNull();
    s.apply({ type: 'set_paused', paused: false });
    const q = s.tick();
    expect(q).not.toBeNull();
  });

  it('reseed troca a seed e forca snapshot no proximo tick', () => {
    const s = new OfficeSession({ seed: 100 });
    const layoutAntes = s.layout;
    s.apply({ type: 'reseed', seed: 200 });
    expect(s.seed).toBe(200);
    const q = s.tick();
    expect(q).not.toBeNull();
    expect(q!.kind).toBe('snapshot');
    // A planta mudou (officeId diferente) - se nao mudou, a seed nao esta
    // sendo usada na geracao, o que seria um bug serio.
    if (q!.kind === 'snapshot') {
      expect(q!.layout.officeId).not.toBe(layoutAntes.officeId);
    }
  });

  it('determinismo: mesma seed produz mesma sequencia de quadros', () => {
    const rodar = (seed: number) => {
      const s = new OfficeSession({ seed, keyframeEveryTicks: 1000 });
      const quadros: string[] = [];
      for (let i = 0; i < 20; i++) {
        const q = s.tick();
        if (q) quadros.push(JSON.stringify(q));
      }
      return quadros;
    };
    const a = rodar(999);
    const b = rodar(999);
    expect(a).toEqual(b);
  });

  it('seeds diferentes produzem sequencias diferentes', () => {
    const rodar = (seed: number) => {
      const s = new OfficeSession({ seed, keyframeEveryTicks: 1000 });
      const quadros: string[] = [];
      for (let i = 0; i < 10; i++) {
        const q = s.tick();
        if (q) quadros.push(JSON.stringify(q));
      }
      return quadros;
    };
    const a = rodar(111);
    const b = rodar(222);
    expect(a).not.toEqual(b);
  });

  it('sessionId deriva da seed e e estavel', () => {
    const s = new OfficeSession({ seed: 555 });
    expect(s.sessionId).toBe('office-555');
    s.apply({ type: 'reseed', seed: 666 });
    expect(s.sessionId).toBe('office-666');
  });

  it('simular avanca o mundo em fast-forward sem emitir quadros', () => {
    const s = new OfficeSession({ seed: 123, tickMs: 100 });
    const antes = s.snapshot();
    const r = s.simular(5000); // 5 segundos de mundo
    expect(r.tMundoMs).toBeGreaterThanOrEqual(5000);
    expect(r.ticks).toBeGreaterThanOrEqual(50);
    expect(r.snapshot.kind).toBe('snapshot');
    expect(r.snapshot.tick).toBeGreaterThan(antes.tick);
  });

  it('carga maior gera mais eventos no modo SimFirma', () => {
    const normal = new OfficeSession({ seed: 7, carga: 1 });
    const pesado = new OfficeSession({ seed: 7, carga: 5 });
    const rNormal = normal.simular(3000);
    const rPesado = pesado.simular(3000);
    expect(rPesado.snapshot.kpis.activeRuns).toBeGreaterThanOrEqual(
      rNormal.snapshot.kpis.activeRuns,
    );
  });
});

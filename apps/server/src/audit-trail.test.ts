/**
 * Testes da trilha de auditoria.
 */

import { describe, it, expect } from 'vitest';
import { AuditTrail } from './audit-trail.js';

describe('AuditTrail', () => {
  it('registra e consulta eventos', () => {
    const trail = new AuditTrail();
    trail.registrar({
      tenantId: 't1',
      userId: 'u1',
      action: 'approval.granted',
      details: { agentId: 'a1' },
    });
    const eventos = trail.consultar('t1');
    expect(eventos.length).toBe(1);
    expect(eventos[0]!.action).toBe('approval.granted');
    expect(eventos[0]!.details.agentId).toBe('a1');
  });

  it('isola eventos por tenant', () => {
    const trail = new AuditTrail();
    trail.registrar({ tenantId: 't1', userId: 'u1', action: 'session.paused' });
    trail.registrar({ tenantId: 't2', userId: 'u2', action: 'session.resumed' });

    expect(trail.consultar('t1').length).toBe(1);
    expect(trail.consultar('t2').length).toBe(1);
    expect(trail.consultar('t1')[0]!.action).toBe('session.paused');
  });

  it('filtra por acao', () => {
    const trail = new AuditTrail();
    trail.registrar({ tenantId: 't1', userId: 'u1', action: 'session.paused' });
    trail.registrar({ tenantId: 't1', userId: 'u1', action: 'session.resumed' });
    trail.registrar({ tenantId: 't1', userId: 'u1', action: 'approval.granted' });

    const apenasPausa = trail.consultar('t1', { action: 'session.paused' });
    expect(apenasPausa.length).toBe(1);
  });

  it('respeita limite', () => {
    const trail = new AuditTrail();
    for (let i = 0; i < 50; i++) {
      trail.registrar({ tenantId: 't1', userId: 'u1', action: 'session.paused' });
    }
    expect(trail.consultar('t1', { limite: 10 }).length).toBe(10);
  });

  it('devolve tenant vazio como array vazio', () => {
    const trail = new AuditTrail();
    expect(trail.consultar('inexistente')).toEqual([]);
  });

  it('registra resultado failure', () => {
    const trail = new AuditTrail();
    trail.registrar({
      tenantId: 't1',
      userId: 'u1',
      action: 'approval.rejected',
      result: 'failure',
    });
    expect(trail.consultar('t1')[0]!.result).toBe('failure');
  });
});

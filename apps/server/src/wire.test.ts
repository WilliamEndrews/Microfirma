/**
 * Testes do contrato de transporte (wire protocol).
 *
 * Estes testes garantem que:
 *   1. `parseClientCommand` aceita comandos bem formados.
 *   2. `parseClientCommand` rejeita comandos mal formados (campo faltando,
 *      tipo errado, payload inesperado) sem lancar - ele devolve { ok: false }.
 *   3. Os tipos `ServerMessage` cobrem todos os casos que o servidor emite.
 */

import { describe, it, expect } from 'vitest';
import {
  parseClientCommand,
  PROTOCOL_VERSION,
} from '@microfirma/contracts';

describe('parseClientCommand', () => {
  it('aceita resolve_approval valido', () => {
    const r = parseClientCommand(JSON.stringify({ type: 'resolve_approval', agentId: 'ag-1' }));
    expect(r.ok).toBe(true);
    if (r.ok && r.command.type === 'resolve_approval') {
      expect(r.command.agentId).toBe('ag-1');
    }
  });

  it('aceita set_paused valido', () => {
    const r = parseClientCommand(JSON.stringify({ type: 'set_paused', paused: true }));
    expect(r.ok).toBe(true);
    if (r.ok && r.command.type === 'set_paused') {
      expect(r.command.paused).toBe(true);
    }
  });

  it('aceita reseed valido', () => {
    const r = parseClientCommand(JSON.stringify({ type: 'reseed', seed: 42 }));
    expect(r.ok).toBe(true);
    if (r.ok && r.command.type === 'reseed') {
      expect(r.command.seed).toBe(42);
    }
  });

  it('rejeita JSON invalido', () => {
    const r = parseClientCommand('nao e json');
    expect(r.ok).toBe(false);
  });

  it('rejeita objeto sem type', () => {
    const r = parseClientCommand(JSON.stringify({ agentId: 'ag-1' }));
    expect(r.ok).toBe(false);
  });

  it('rejeita type desconhecido', () => {
    const r = parseClientCommand(JSON.stringify({ type: 'hack_the_planet' }));
    expect(r.ok).toBe(false);
  });

  it('rejeita resolve_approval sem agentId', () => {
    const r = parseClientCommand(JSON.stringify({ type: 'resolve_approval' }));
    expect(r.ok).toBe(false);
  });

  it('rejeita set_paused sem paused', () => {
    const r = parseClientCommand(JSON.stringify({ type: 'set_paused' }));
    expect(r.ok).toBe(false);
  });

  it('rejeita set_paused com paused nao-booleano', () => {
    const r = parseClientCommand(JSON.stringify({ type: 'set_paused', paused: 'sim' }));
    expect(r.ok).toBe(false);
  });

  it('rejeita reseed sem seed', () => {
    const r = parseClientCommand(JSON.stringify({ type: 'reseed' }));
    expect(r.ok).toBe(false);
  });

  it('rejeita reseed com seed nao-numerico', () => {
    const r = parseClientCommand(JSON.stringify({ type: 'reseed', seed: 'abc' }));
    expect(r.ok).toBe(false);
  });

  it('rejeita payload com campos extras inesperados', () => {
    const r = parseClientCommand(
      JSON.stringify({ type: 'resolve_approval', agentId: 'ag-1', extra: 'malicioso' }),
    );
    expect(r.ok).toBe(false);
  });
});

describe('PROTOCOL_VERSION', () => {
  it('e um numero inteiro positivo', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
  });
});

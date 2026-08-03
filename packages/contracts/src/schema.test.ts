/**
 * VALIDADOR CROSS-LINGUAGEM
 *
 * Este arquivo prova que os JSON Schemas gerados a partir dos schemas zod
 * sao consumiveis por qualquer linguagem. Ele carrega os arquivos .schema.json
 * e valida payloads de exemplo usando `ajv` - uma implementacao de JSON Schema
 * independente do zod.
 *
 * Se um agente Python, Go ou Rust validar contra os mesmos arquivos
 * `schema/*.schema.json`, tera a mesma garantia. E isso que faz ser
 * "cross-linguagem": a fonte da verdade e o arquivo JSON, nao o codigo TS.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import type { ValidateFunction } from 'ajv';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = resolve(here, '../schema');

function carregarValidador(nomeArquivo: string): ValidateFunction {
  const schema = JSON.parse(readFileSync(resolve(schemaDir, nomeArquivo), 'utf8'));
  const ajv = new Ajv({ strict: false, allErrors: true });
  return ajv.compile(schema);
}

describe('Schema cross-linguagem - domain-event', () => {
  const validar = carregarValidador('domain-event.schema.json');

  it('valida agent.discovered correto', () => {
    const evento = {
      eventId: 'evt-1',
      tenantId: 'demo',
      tsReal: 1700000000000,
      type: 'agent.discovered',
      agent: {
        agentId: 'agent-triagem',
        displayName: 'Triagem',
        role: 'researcher',
        framework: 'langgraph',
        discoveredVia: 'otel',
        avatarSeed: 12345,
      },
    };
    expect(validar(evento)).toBe(true);
  });

  it('valida run.finished correto', () => {
    const evento = {
      eventId: 'evt-2',
      tenantId: 'demo',
      tsReal: 1700000005000,
      type: 'run.finished',
      agentId: 'agent-triagem',
      runId: 'trace-abc',
      status: 'ok',
      durationMs: 5000,
    };
    expect(validar(evento)).toBe(true);
  });

  it('rejeita evento sem eventId', () => {
    const evento = {
      tenantId: 'demo',
      tsReal: 1700000000000,
      type: 'run.started',
      agentId: 'agent-x',
      runId: 'r1',
    };
    expect(validar(evento)).toBe(false);
  });

  it('rejeita tipo desconhecido', () => {
    const evento = {
      eventId: 'evt-3',
      tenantId: 'demo',
      tsReal: 1700000000000,
      type: 'unknown.event',
      agentId: 'agent-x',
    };
    expect(validar(evento)).toBe(false);
  });
});

describe('Schema cross-linguagem - client-command', () => {
  const validar = carregarValidador('client-command.schema.json');

  it('valida resolve_approval', () => {
    expect(validar({ type: 'resolve_approval', agentId: 'ag-1' })).toBe(true);
  });

  it('valida set_paused', () => {
    expect(validar({ type: 'set_paused', paused: true })).toBe(true);
  });

  it('valida reseed', () => {
    expect(validar({ type: 'reseed', seed: 42 })).toBe(true);
  });

  it('rejeita payload com campo extra (strict)', () => {
    expect(validar({ type: 'set_paused', paused: true, extra: 'mal' })).toBe(false);
  });

  it('rejeita tipo desconhecido', () => {
    expect(validar({ type: 'unknown', agentId: 'x' })).toBe(false);
  });
});

describe('Schema cross-linguagem - agent-descriptor', () => {
  const validar = carregarValidador('agent-descriptor.schema.json');

  it('valida agente completo', () => {
    const agente = {
      agentId: 'agent-1',
      displayName: 'Pesquisa',
      role: 'researcher',
      framework: 'langgraph',
      discoveredVia: 'otel',
      avatarSeed: 999,
    };
    expect(validar(agente)).toBe(true);
  });

  it('rejeita agente sem agentId', () => {
    const agente = {
      displayName: 'Pesquisa',
      role: 'researcher',
      framework: 'langgraph',
      discoveredVia: 'otel',
      avatarSeed: 999,
    };
    expect(validar(agente)).toBe(false);
  });
});

describe('Schema cross-linguagem - office-layout', () => {
  const validar = carregarValidador('office-layout.schema.json');

  it('rejeita layout vazio', () => {
    expect(validar({})).toBe(false);
  });
});

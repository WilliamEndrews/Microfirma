/**
 * Garante que a fixture canônica de agencia (scripts/fixtures) continua
 * alinhada ao adaptador GenAI — regressao barata sem subir o server.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { traduzirLoteOtlp, type OtlpExportRequest } from '../packages/contracts/src/otlp.ts';

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/agencia-3-agentes.otlp.json',
);

describe('fixture agencia-3-agentes.otlp.json', () => {
  it('gera discovered / tool fail / approval / timeout', () => {
    const lote = JSON.parse(readFileSync(FIXTURE, 'utf8')) as OtlpExportRequest;
    const eventos = traduzirLoteOtlp(lote, 'fixture-test');

    const discovered = [
      ...new Set(
        eventos
          .filter((e) => e.type === 'agent.discovered')
          .map((e) => (e.type === 'agent.discovered' ? e.agent.agentId : '')),
      ),
    ].sort();
    expect(discovered).toEqual([
      'agent_analista_02',
      'agent_gerente_03',
      'agent_triador_01',
    ]);
    // Spans filhos com gen_ai.agent.* tambem emitem discover; o OtlpIngestor
    // deduplica por agentId. A fixture deve gerar multiplas descobertas brutas.
    expect(
      eventos.filter((e) => e.type === 'agent.discovered').length,
    ).toBeGreaterThanOrEqual(3);

    expect(eventos.some((e) => e.type === 'tool.called' && e.ok === false)).toBe(true);
    expect(eventos.some((e) => e.type === 'approval.requested')).toBe(true);

    const timeouts = eventos.filter(
      (e) => e.type === 'error.raised' && e.kind === 'timeout',
    );
    expect(timeouts.length).toBeGreaterThanOrEqual(1);

    const gerente = eventos.find(
      (e) => e.type === 'agent.discovered' && e.agent.agentId === 'agent_gerente_03',
    );
    expect(gerente?.type === 'agent.discovered' && gerente.agent.role).toBe('finance');
    expect(gerente?.type === 'agent.discovered' && gerente.agent.displayName).toBe(
      'Gerente de Contas',
    );
  });
});

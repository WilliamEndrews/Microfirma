/// <reference types="node" />

/**
 * Harness OTLP da agencia sintetica de 3 agentes.
 *
 * 1. (Opcional) cria tenant com otlpEndpoint se nao houver meta em
 *    scripts/fixtures/.otlp-tenant.json
 * 2. Valida a fixture offline com traduzirLoteOtlp (mesmo contrato do server)
 * 3. POST /v1/traces com x-tenant-id
 * 4. Imprime checklist honesto do que observar no demo
 *
 * Uso (servidor rodando):
 *   npm run telemetria:enviar
 *   npm run telemetria:dry
 *   npm exec --yes --package=tsx@4.19.2 -- tsx scripts/enviar-telemetria-agencia.ts --new-tenant
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { traduzirLoteOtlp, type OtlpExportRequest } from '../packages/contracts/src/otlp.ts';

const HOST = process.env.MICROFIRMA_HOST ?? '127.0.0.1';
const PORT = Number(process.env.MICROFIRMA_PORT ?? 8787);
const BASE_URL = process.env.MICROFIRMA_BASE_URL ?? `http://${HOST}:${PORT}`;
const ONBOARDING_KEY = process.env.MICROFIRMA_ONBOARDING_KEY ?? 'microfirma-dev-onboarding';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'scripts/fixtures/agencia-3-agentes.otlp.json');
const TENANT_META = join(ROOT, 'scripts/fixtures/.otlp-tenant.json');

const AGENT_IDS = ['agent_triador_01', 'agent_analista_02', 'agent_gerente_03'] as const;

type TenantMeta = { tenantId: string; token: string; baseUrl?: string; otlpUrl?: string };

function carregarFixture(): OtlpExportRequest {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as OtlpExportRequest;
}

function validarOffline(lote: OtlpExportRequest): {
  total: number;
  porTipo: Record<string, number>;
  agentIds: string[];
} {
  const eventos = traduzirLoteOtlp(lote, 'offline-check');
  const porTipo: Record<string, number> = {};
  const agentIds = new Set<string>();
  for (const e of eventos) {
    porTipo[e.type] = (porTipo[e.type] ?? 0) + 1;
    if (e.type === 'agent.discovered') agentIds.add(e.agent.agentId);
  }
  return { total: eventos.length, porTipo, agentIds: [...agentIds].sort() };
}

function assertContrato(v: ReturnType<typeof validarOffline>): void {
  const faltando = AGENT_IDS.filter((id) => !v.agentIds.includes(id));
  if (faltando.length) {
    throw new Error(`fixture nao descobriu agentes: ${faltando.join(', ')}`);
  }
  for (const tipo of [
    'agent.discovered',
    'run.started',
    'tool.called',
    'error.raised',
    'approval.requested',
  ] as const) {
    if ((v.porTipo[tipo] ?? 0) < 1) {
      throw new Error(`fixture sem evento obrigatorio: ${tipo}`);
    }
  }
  // Pelo menos uma tool falhou (ok:false) — calor real no NarrativeScheduler.
  const eventos = traduzirLoteOtlp(carregarFixture(), 'offline-check');
  const toolFail = eventos.some((e) => e.type === 'tool.called' && e.ok === false);
  if (!toolFail) {
    throw new Error('fixture precisa de pelo menos um tool.called com ok=false (gera heat)');
  }
}

async function healthOk(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function criarTenantOtlp(): Promise<TenantMeta> {
  const res = await fetch(`${BASE_URL}/api/tenants`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ONBOARDING_KEY,
    },
    body: JSON.stringify({
      displayName: 'OTLP Agency Test',
      seed: 20260907,
      plano: 'pro',
      otlpEndpoint: `${BASE_URL}/v1/traces`,
    }),
  });
  if (!res.ok) throw new Error(`onboarding falhou: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { tenant: { tenantId: string }; token: string };
  const meta: TenantMeta = {
    tenantId: data.tenant.tenantId,
    token: data.token,
    baseUrl: BASE_URL,
    otlpUrl: `${BASE_URL}/v1/traces`,
  };
  writeFileSync(TENANT_META, JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

function lerMeta(): TenantMeta | null {
  if (!existsSync(TENANT_META)) return null;
  return JSON.parse(readFileSync(TENANT_META, 'utf8')) as TenantMeta;
}

async function enviarLote(tenantId: string, lote: OtlpExportRequest): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE_URL}/v1/traces`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': tenantId,
    },
    body: JSON.stringify(lote),
  });
  return { status: res.status, body: await res.text() };
}

function imprimirChecklist(v: ReturnType<typeof validarOffline>, tenantId: string): void {
  console.log('');
  console.log('=== Checklist de validacao (honesto) ===');
  console.log(`tenantId: ${tenantId}`);
  console.log(`eventos traduzidos (offline): ${v.total}`);
  console.log('por tipo:', JSON.stringify(v.porTipo));
  console.log(`agent.discovered: ${v.agentIds.join(', ')}`);
  console.log('');
  console.log('PASSA se no server/demo voce vir:');
  console.log('  [ ] log [otlp] N eventos ingeridos (N > 0)');
  console.log('  [ ] 3 agent.discovered (triador, analista, gerente)');
  console.log('  [ ] approval.requested → ator em waiting_approval (gerente)');
  console.log('  [ ] heat sobe apos tool.called ok=false / error.raised (analista)');
  console.log('  [ ] incident/smoke apos error.raised timeout (gerente)');
  console.log('');
  console.log('NAO exigir neste passo:');
  console.log('  - auto-criacao de 3 salas/mesas so pelo ingest (layout fixo; precisa reseed)');
  console.log('  - labels pixel-perfect dos displayNames no canvas');
  console.log('  - debugpreview reagindo a OTLP (pipeline separado; ver docs/telemetria-otlp.md)');
  console.log('');
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const forceNew = process.argv.includes('--new-tenant');

  if (!existsSync(FIXTURE)) throw new Error(`fixture ausente: ${FIXTURE}`);
  const lote = carregarFixture();
  const offline = validarOffline(lote);
  assertContrato(offline);

  console.log('Fixture OK (offline).');
  console.log(`  eventos=${offline.total}`);
  console.log(`  tipos=${JSON.stringify(offline.porTipo)}`);
  console.log(`  agents=${offline.agentIds.join(', ')}`);

  if (dryRun) {
    imprimirChecklist(offline, '(dry-run)');
    return;
  }

  if (!(await healthOk())) {
    throw new Error(
      `Servidor nao responde em ${BASE_URL}/health. Suba com: npx pnpm --filter @microfirma/server dev`,
    );
  }

  let meta = forceNew ? null : lerMeta();
  if (!meta) {
    console.log('Criando tenant com otlpEndpoint…');
    meta = await criarTenantOtlp();
    console.log(`  tenantId=${meta.tenantId}`);
  } else {
    console.log(`Usando tenant salvo: ${meta.tenantId}`);
  }

  const { status, body } = await enviarLote(meta.tenantId, lote);
  console.log(`POST /v1/traces → HTTP ${status} ${body}`);
  if (status === 404) {
    throw new Error(
      'tenant sem OTLP (404). Rode scripts/setup-otlp-tenant.ps1 ou este script com --new-tenant.',
    );
  }
  if (status >= 400) {
    throw new Error(`ingest falhou: HTTP ${status} ${body}`);
  }

  imprimirChecklist(offline, meta.tenantId);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

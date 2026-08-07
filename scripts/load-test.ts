/// <reference types="node" />

/**
 * Teste de carga basico no endpoint SimFirma.
 *
 * Cria um tenant via onboarding, dispara N requisicoes concorrentes para
 * POST /api/tenants/:id/simulate e reporta latencia percentilar + taxa de erro.
 *
 * Uso:
 *   npx tsx scripts/load-test.ts [concorrencia=10] [requisicoes=100] [duracao=5000]
 */

const HOST = process.env.MICROFIRMA_HOST ?? '127.0.0.1';
const PORT = Number(process.env.MICROFIRMA_PORT ?? 8787);
const BASE_URL = `http://${HOST}:${PORT}`;
const ONBOARDING_KEY = process.env.MICROFIRMA_ONBOARDING_KEY ?? 'microfirma-dev-onboarding';

interface LoadReport {
  tenantId: string;
  concurrency: number;
  total: number;
  completed: number;
  errors: number;
  totalMs: number;
  p50: number;
  p95: number;
  p99: number;
  rps: number;
}

async function criarTenant(): Promise<{ tenantId: string; token: string }> {
  const res = await fetch(`${BASE_URL}/api/tenants`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ONBOARDING_KEY,
    },
    body: JSON.stringify({ displayName: 'Load Test', seed: 2026, plano: 'pro' }),
  });
  if (!res.ok) throw new Error(`onboarding falhou: ${res.status}`);
  const data = (await res.json()) as { tenant: { tenantId: string }; token: string };
  return { tenantId: data.tenant.tenantId, token: data.token };
}

async function umaChamada(tenantId: string, token: string, durationMs: number, carga: number): Promise<number> {
  const inicio = performance.now();
  const res = await fetch(`${BASE_URL}/api/tenants/${tenantId}/simulate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ durationMs, carga }),
  });
  const fim = performance.now();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return fim - inicio;
}

function percentil(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

async function main() {
  const conc = Number(process.argv[2] ?? 10);
  const total = Number(process.argv[3] ?? 100);
  const duration = Number(process.argv[4] ?? 5000);
  const carga = Number(process.argv[5] ?? 1);

  const { tenantId, token } = await criarTenant();

  const latencias: number[] = [];
  let erros = 0;
  let completadas = 0;
  const inicio = performance.now();

  const fila: Promise<void>[] = [];
  let restantes = total;

  const worker = async () => {
    while (restantes-- > 0) {
      try {
        const ms = await umaChamada(tenantId, token, duration, carga);
        latencias.push(ms);
        completadas++;
      } catch (e) {
        erros++;
        console.error('[load-test] erro:', (e as Error).message);
      }
    }
  };

  for (let i = 0; i < conc; i++) fila.push(worker());
  await Promise.all(fila);

  const totalMs = performance.now() - inicio;
  const p50 = percentil(latencias, 50);
  const p95 = percentil(latencias, 95);
  const p99 = percentil(latencias, 99);
  const rps = (completadas / totalMs) * 1000;

  const report: LoadReport = {
    tenantId,
    concurrency: conc,
    total,
    completed: completadas,
    errors: erros,
    totalMs,
    p50,
    p95,
    p99,
    rps,
  };

  if (process.env.MICROFIRMA_LOAD_JSON) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[load-test] tenant ${tenantId} | concorrencia ${conc} | total ${total} | duracao ${duration}ms`);
    console.log(`[load-test] concluido em ${totalMs.toFixed(0)}ms`);
    console.log(`[load-test] completadas: ${completadas} | erros: ${erros}`);
    console.log(`[load-test] p50: ${p50.toFixed(1)}ms | p95: ${p95.toFixed(1)}ms | p99: ${p99.toFixed(1)}ms`);
    console.log(`[load-test] rps: ${rps.toFixed(1)}`);
  }
}

main().catch((e) => {
  console.error('[load-test] falha geral:', e);
  process.exit(1);
});

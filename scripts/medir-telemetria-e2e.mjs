/**
 * Medicao e2e da telemetria OTLP com amostragem a cada 1ms do estado do mundo.
 *
 * Fluxo (reset completo) — pos heranca iso do Demo:
 * 1. Cria tenant fresco + atualiza apps/demo/.env.local
 * 2. Conecta WS /mundo
 * 3. POST lote Python (discover + efeitos)
 * 4. Aguarda remesh automatico (OfficeSession) e sinais no mundo
 * 5. Amostra o ultimo frame a cada 1ms
 * 6. Calcula % de sucesso vs checklist atual de docs/telemetria-otlp.md
 *
 * Uso:
 *   node scripts/medir-telemetria-e2e.mjs
 *   node scripts/medir-telemetria-e2e.mjs --observe-ms 45000
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

const require = createRequire(import.meta.url);
const WebSocket = require(join(dirname(fileURLToPath(import.meta.url)), '../apps/server/node_modules/ws'));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.MICROFIRMA_BASE_URL ?? 'http://127.0.0.1:8787';
const ONBOARDING_KEY = process.env.MICROFIRMA_ONBOARDING_KEY ?? 'microfirma-dev-onboarding';
const AGENT_IDS = ['agent_triador_01', 'agent_analista_02', 'agent_gerente_03'];
const OUT_JSON = join(ROOT, 'scripts/fixtures/.telemetria-medida.json');

function argNum(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  return fallback;
}

const OBSERVE_MS = argNum('--observe-ms', 45_000);

function nowMs() {
  return performance.now();
}

function hex(n) {
  return randomBytes(n).toString('hex');
}

/** Clona o lote e regenera traceId/spanId/parentSpanId para furar dedup. */
function regenerarIds(lote) {
  const clone = structuredClone(lote);
  const map = new Map();
  const novo = (old) => {
    if (!old) return old;
    if (!map.has(old)) {
      map.set(old, old.length === 32 ? hex(16) : hex(8));
    }
    return map.get(old);
  };
  for (const rs of clone.resourceSpans ?? []) {
    for (const scope of rs.scopeSpans ?? []) {
      for (const span of scope.spans ?? []) {
        span.traceId = novo(span.traceId);
        span.spanId = novo(span.spanId);
        if (span.parentSpanId) span.parentSpanId = novo(span.parentSpanId);
      }
    }
  }
  return clone;
}

async function healthOk() {
  try {
    const r = await fetch(`${BASE}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

async function criarTenant() {
  const res = await fetch(`${BASE}/api/tenants`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ONBOARDING_KEY,
    },
    body: JSON.stringify({
      displayName: 'OTLP Measure Reset Iso',
      seed: 20260907,
      plano: 'pro',
      otlpEndpoint: `${BASE}/v1/traces`,
    }),
  });
  if (!res.ok) throw new Error(`onboarding falhou: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const meta = {
    tenantId: data.tenant.tenantId,
    token: data.token,
    baseUrl: BASE,
    otlpUrl: `${BASE}/v1/traces`,
    createdAt: new Date().toISOString(),
  };
  const fixtures = join(ROOT, 'scripts/fixtures');
  if (!existsSync(fixtures)) mkdirSync(fixtures, { recursive: true });
  writeFileSync(join(fixtures, '.otlp-tenant.json'), JSON.stringify(meta, null, 2), 'utf8');

  const env = [
    '# Gerado por scripts/medir-telemetria-e2e.mjs - tenant com OTLP ligado',
    `# Tenant: ${meta.tenantId}`,
    `VITE_MICROFIRMA_WS=ws://127.0.0.1:8787/mundo?token=${meta.token}`,
    `VITE_MICROFIRMA_TOKEN=${meta.token}`,
  ].join('\n');
  writeFileSync(join(ROOT, 'apps/demo/.env.local'), env, 'utf8');
  return meta;
}

function carregarLotePython() {
  const r = spawnSync('python', ['scripts/test_agency_telemetry.py', '--print-only'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`python --print-only falhou: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout);
}

function formaPlanta(layout) {
  if (!layout?.rooms) {
    return {
      boss: 0,
      private: 0,
      break: 0,
      desksOwner: 0,
      officeId: null,
      ok: false,
    };
  }
  const boss = layout.rooms.filter((r) => r.kind === 'boss_room').length;
  const priv = layout.rooms.filter((r) => r.kind === 'private').length;
  const brk = layout.rooms.filter((r) => r.kind === 'break').length;
  const desksOwner = (layout.props ?? []).filter(
    (p) => p.kind === 'desk' && AGENT_IDS.includes(p.ownerAgentId),
  ).length;
  return {
    boss,
    private: priv,
    break: brk,
    desksOwner,
    officeId: layout.officeId ?? null,
    ok: boss === 1 && priv === 2 && brk === 1 && desksOwner >= 3,
  };
}

function avaliar(frame, lastLayout) {
  if (!frame || !frame.actors) {
    return {
      agents3: false,
      agentsFound: [],
      waitingApproval: false,
      heat: false,
      heatMax: 0,
      desksComDono: 0,
      incidentOrSmoke: false,
      incidentMax: 0,
      lightBroken: false,
      pendingApprovals: 0,
      degradedActors: 0,
      plantaOk: false,
      planta: formaPlanta(null),
      officeId: lastLayout?.officeId ?? null,
      layout: lastLayout,
    };
  }
  const layout = frame.kind === 'snapshot' && frame.layout ? frame.layout : lastLayout;
  const planta = formaPlanta(layout);
  const agentsFound = AGENT_IDS.filter((id) => frame.actors.some((a) => a.agentId === id));
  const waitingApproval = frame.actors.some(
    (a) => a.agentId === 'agent_gerente_03' && a.activity === 'waiting_approval',
  );
  const heatMax = Math.max(0, ...(frame.desks ?? []).map((d) => d.heat ?? 0));
  const desksComDono = Math.max(
    planta.desksOwner,
    (frame.desks ?? []).filter((d) => AGENT_IDS.includes(d.ownerAgentId)).length,
  );
  const incidentMax = Math.max(0, ...(frame.rooms ?? []).map((r) => r.incident ?? 0));
  const lightBroken = (frame.rooms ?? []).some((r) => r.lightBroken);
  const degradedActors = (frame.actors ?? []).filter(
    (a) => AGENT_IDS.includes(a.agentId) && a.health !== 'healthy',
  ).length;
  return {
    agents3: agentsFound.length === 3,
    agentsFound,
    waitingApproval,
    heat: heatMax > 0,
    heatMax,
    desksComDono,
    incidentOrSmoke: incidentMax > 0 || lightBroken,
    incidentMax,
    lightBroken,
    pendingApprovals: frame.kpis?.pendingApprovals ?? 0,
    degradedActors,
    plantaOk: planta.ok,
    planta,
    officeId: planta.officeId,
    layout,
  };
}

function connectWs(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:8787/mundo?token=${encodeURIComponent(token)}`);
    let latest = null;
    let welcome = null;
    let lastLayout = null;
    const frames = [];
    const t0 = nowMs();

    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('timeout aguardando welcome/snapshot'));
    }, 10_000);

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ws.on('message', (buf) => {
      let msg;
      try {
        msg = JSON.parse(buf.toString());
      } catch {
        return;
      }
      const wall = nowMs() - t0;
      if (msg.kind === 'welcome') {
        welcome = msg;
        return;
      }
      if (msg.kind === 'snapshot' || msg.kind === 'delta') {
        latest = msg;
        if (msg.kind === 'snapshot' && msg.layout) lastLayout = msg.layout;
        frames.push({
          wallMs: wall,
          kind: msg.kind,
          tick: msg.tick,
          tMundo: msg.tMundo,
          officeId: msg.layout?.officeId ?? lastLayout?.officeId ?? null,
        });
        if (welcome && frames.length === 1) {
          clearTimeout(timer);
          resolve({
            ws,
            getLatest: () => latest,
            getLayout: () => lastLayout,
            frames,
            welcome,
          });
        }
      }
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postLote(tenantId, lote) {
  const t0 = nowMs();
  const res = await fetch(`${BASE}/v1/traces`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': tenantId,
    },
    body: JSON.stringify(lote),
  });
  const body = await res.text();
  return { status: res.status, body, latencyMs: nowMs() - t0 };
}

async function main() {
  if (!(await healthOk())) {
    throw new Error(`Servidor nao responde em ${BASE}/health`);
  }

  console.log('Reset: criando tenant OTLP fresco...');
  const meta = await criarTenant();
  console.log(`  tenantId=${meta.tenantId}`);

  console.log('Conectando WebSocket /mundo...');
  const conn = await connectWs(meta.token);
  const officeAntes = conn.getLayout()?.officeId ?? null;
  console.log(`  welcome + snapshot OK (officeId=${officeAntes})`);

  const loteBase = carregarLotePython();
  // Checklist atual (docs/telemetria-otlp.md pos iso-office). Heat/smoke canvas = cortados.
  const criterios = {
    ingestHttpOk: { ok: false, firstMs: null, label: 'POST /v1/traces HTTP 200' },
    agents3: { ok: false, firstMs: null, label: '3 agent.discovered no mundo' },
    waitingApproval: { ok: false, firstMs: null, label: 'gerente em waiting_approval' },
    plantaRemesh: {
      ok: false,
      firstMs: null,
      label: 'planta remeshada 1 Boss + 2 priv + 1 copa (3 mesas)',
    },
    officeIdMudou: {
      ok: false,
      firstMs: null,
      label: 'officeId mudou apos discover (remesh automatico)',
    },
  };
  // Sinais do scheduler (informativos; nao entram no % de aceite deste ciclo)
  const extras = {
    heat: { ok: false, firstMs: null, label: 'heat > 0 nas mesas (scheduler)' },
    incidentOrSmoke: { ok: false, firstMs: null, label: 'incident/smoke ou lightBroken (scheduler)' },
  };

  const samples = [];
  let sampleCount = 0;
  let lastEval = null;
  let markAt = null;
  let running = true;
  let phase = 'discover';
  let firstPost = null;
  let secondPost = null;
  let secondPostAt = null;

  const sampler = (async () => {
    while (running) {
      const wall = nowMs();
      const frame = conn.getLatest();
      const ev = avaliar(frame, conn.getLayout());
      lastEval = ev;
      sampleCount++;

      if (markAt != null) {
        const since = wall - markAt;
        if (!criterios.agents3.ok && ev.agents3) {
          criterios.agents3.ok = true;
          criterios.agents3.firstMs = since;
        }
        if (!criterios.waitingApproval.ok && ev.waitingApproval) {
          criterios.waitingApproval.ok = true;
          criterios.waitingApproval.firstMs = since;
        }
        if (!criterios.plantaRemesh.ok && ev.plantaOk) {
          criterios.plantaRemesh.ok = true;
          criterios.plantaRemesh.firstMs = since;
        }
        if (
          !criterios.officeIdMudou.ok &&
          ev.officeId &&
          officeAntes &&
          ev.officeId !== officeAntes
        ) {
          criterios.officeIdMudou.ok = true;
          criterios.officeIdMudou.firstMs = since;
        }
        if (!extras.heat.ok && ev.heat) {
          extras.heat.ok = true;
          extras.heat.firstMs = since;
        }
        if (!extras.incidentOrSmoke.ok && ev.incidentOrSmoke) {
          extras.incidentOrSmoke.ok = true;
          extras.incidentOrSmoke.firstMs = since;
        }
        if (sampleCount % 50 === 0) {
          samples.push({
            sinceMarkMs: Math.round(since),
            phase,
            tick: frame?.tick ?? null,
            agents: ev.agentsFound.length,
            desksComDono: ev.desksComDono,
            heatMax: Number(ev.heatMax.toFixed(3)),
            incidentMax: Number(ev.incidentMax.toFixed(3)),
            lightBroken: ev.lightBroken,
            waitingApproval: ev.waitingApproval,
            pendingApprovals: ev.pendingApprovals,
            degradedActors: ev.degradedActors,
            plantaOk: ev.plantaOk,
            boss: ev.planta.boss,
            private: ev.planta.private,
            break: ev.planta.break,
            officeId: ev.officeId,
          });
        }
      }
      await sleep(1);
    }
  })();

  await sleep(150);

  phase = 'discover';
  markAt = nowMs();
  console.log('POST #1 (discover + efeitos, remesh automatico)...');
  firstPost = await postLote(meta.tenantId, regenerarIds(loteBase));
  criterios.ingestHttpOk.ok = firstPost.status === 200;
  criterios.ingestHttpOk.firstMs = criterios.ingestHttpOk.ok ? firstPost.latencyMs : null;
  console.log(`  -> HTTP ${firstPost.status} (${firstPost.latencyMs.toFixed(1)}ms)`);

  const discoverDeadline = nowMs() + 12_000;
  while (nowMs() < discoverDeadline && !(criterios.agents3.ok && criterios.plantaRemesh.ok)) {
    await sleep(20);
  }
  console.log(
    `  agentes=${lastEval?.agentsFound?.length ?? 0} plantaOk=${lastEval?.plantaOk} desks=${lastEval?.desksComDono} officeId=${lastEval?.officeId}`,
  );

  // Segundo POST so se faltar HITL/efeitos (IDs novos furam dedup). Sem reseed manual.
  if (!criterios.waitingApproval.ok || !extras.heat.ok) {
    phase = 'effects';
    secondPostAt = nowMs() - markAt;
    console.log('POST #2 (reforco efeitos, IDs novos; sem reseed manual)...');
    secondPost = await postLote(meta.tenantId, regenerarIds(loteBase));
    console.log(`  -> HTTP ${secondPost.status} (${secondPost.latencyMs.toFixed(1)}ms)`);
    if (secondPost.status !== 200) criterios.ingestHttpOk.ok = false;
  }

  console.log(`Observando por ate ${OBSERVE_MS}ms (amostra 1ms)...`);
  const observeStart = nowMs();
  while (nowMs() - observeStart < OBSERVE_MS) {
    await sleep(100);
    if (
      criterios.agents3.ok &&
      criterios.waitingApproval.ok &&
      criterios.plantaRemesh.ok &&
      criterios.officeIdMudou.ok
    ) {
      await sleep(800);
      break;
    }
  }

  running = false;
  await sampler;
  conn.ws.close();

  const lista = Object.values(criterios);
  const pass = lista.filter((c) => c.ok).length;
  const total = lista.length;
  const pct = Math.round((pass / total) * 1000) / 10;

  const resultado = {
    measuredAt: new Date().toISOString(),
    tenantId: meta.tenantId,
    observeMs: OBSERVE_MS,
    sampleIntervalMs: 1,
    samplesTaken: sampleCount,
    wsFrames: conn.frames.length,
    firstPost,
    secondPost,
    secondPostAtMs: secondPostAt,
    officeIdAntes: officeAntes,
    officeIdDepois: lastEval?.officeId ?? null,
    successPercent: pct,
    passed: pass,
    total,
    criteria: criterios,
    schedulerExtras: extras,
    final: lastEval
      ? {
          ...lastEval,
          layout: undefined,
        }
      : null,
    timeline: samples,
    demoUrl: 'http://localhost:5173/',
    note:
      'Checklist pos iso-office: remesh automatico + HITL. Heat/smoke no canvas cortados; extras do scheduler sao informativos.',
  };

  writeFileSync(OUT_JSON, JSON.stringify(resultado, null, 2), 'utf8');

  console.log('');
  console.log('=== Resultado (checklist aceite) ===');
  console.log(`Sucesso: ${pct}% (${pass}/${total})`);
  for (const c of Object.values(criterios)) {
    const ms = c.firstMs == null ? '-' : `${Number(c.firstMs).toFixed(1)}ms`;
    console.log(`  [${c.ok ? 'OK' : 'FAIL'}] ${c.label}  first=${ms}`);
  }
  console.log('=== Extras scheduler (nao contam no %) ===');
  for (const c of Object.values(extras)) {
    const ms = c.firstMs == null ? '-' : `${Number(c.firstMs).toFixed(1)}ms`;
    console.log(`  [${c.ok ? 'OK' : 'FAIL'}] ${c.label}  first=${ms}`);
  }
  console.log(`Amostras: ${sampleCount} @ 1ms | frames WS: ${conn.frames.length}`);
  console.log(
    `Final: desks=${lastEval?.desksComDono} planta=${JSON.stringify(lastEval?.planta)} waiting=${lastEval?.waitingApproval} heat=${lastEval?.heatMax} incident=${lastEval?.incidentMax}`,
  );
  console.log(`Escrito: ${OUT_JSON}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

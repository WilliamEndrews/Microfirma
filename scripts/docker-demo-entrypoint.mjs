import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const server = process.env.SERVER_URL || 'http://server:8787';
const onboardingKey = process.env.MICROFIRMA_ONBOARDING_KEY || 'microfirma-dev-onboarding';
const envFile = '/app/apps/demo/.env.local';

async function aguardarServidor() {
  while (true) {
    try {
      const res = await fetch(`${server}/health`);
      if (res.ok) {
        console.log('[demo-entrypoint] servidor pronto');
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function criarTenant() {
  const res = await fetch(`${server}/api/tenants`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': onboardingKey,
    },
    body: JSON.stringify({ displayName: 'Demo', seed: 2026 }),
  });
  if (!res.ok) throw new Error(`onboarding falhou: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function main() {
  await aguardarServidor();
  const token = await criarTenant();
  const wsUrl = `${server.replace(/^http/, 'ws')}/mundo?token=${token}`;
  const env = `# Gerado automaticamente pelo container demo\nVITE_MICROFIRMA_WS=${wsUrl}\nVITE_MICROFIRMA_TOKEN=${token}\n`;
  writeFileSync(envFile, env);
  console.log('[demo-entrypoint] .env.local criado, iniciando Vite');

  const vite = spawn('pnpm', ['dev', '--host'], {
    cwd: '/app/apps/demo',
    stdio: 'inherit',
    shell: true,
  });
  vite.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error('[demo-entrypoint] erro:', err);
  process.exit(1);
});

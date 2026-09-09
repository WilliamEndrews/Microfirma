export const API_BASE = import.meta.env.VITE_MICROFIRMA_API ?? 'http://127.0.0.1:8787';
export const DEMO_URL = import.meta.env.VITE_MICROFIRMA_DEMO_URL ?? 'http://localhost:5173';

export type TenantPonte = {
  tenantId: string;
  displayName: string;
  seed: number;
  plano: string;
};

export type RespostaPonte = {
  tenant: TenantPonte;
  token: string;
  refresh: string;
};

async function postJson(path: string, body: unknown): Promise<RespostaPonte> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const erro =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(erro);
  }
  return parsed as RespostaPonte;
}

export function onboardEmpresa(displayName: string): Promise<RespostaPonte> {
  return postJson('/api/public/onboard', { displayName });
}

export function conectarCodigo(codigo: string): Promise<RespostaPonte> {
  return postJson('/api/public/conectar', { codigo });
}

export function urlDemoComToken(token: string): string {
  const url = new URL(DEMO_URL);
  url.searchParams.set('token', token);
  return url.toString();
}

export function snippetOtlp(tenantId: string): string {
  return [
    `POST ${API_BASE}/v1/traces`,
    `x-tenant-id: ${tenantId}`,
    'content-type: application/json',
  ].join('\n');
}

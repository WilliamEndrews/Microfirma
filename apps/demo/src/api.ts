/**
 * API cliente do MicroFirma - chamadas REST ponto a ponto.
 *
 * O WebSocket e a fonte de mundo (quadros a 10 Hz). Estas funcoes fazem
 * operacoes pontuais que nao cabem no stream: SimFirma, onboarding, login.
 */

export interface SimularResult {
  ticks: number;
  tMundoMs: number;
  kpis: {
    activeRuns: number;
    costUsdToday: number;
    budgetUsdToday: number;
    errorsLast5Min: number;
    tokensPerMinute: number;
    pendingApprovals: number;
  };
}

/**
 * Converte URL do WebSocket para URL base da API REST.
 * ws://localhost:8787/mundo -> http://localhost:8787
 */
function baseDaApi(urlWs: string): string {
  const u = new URL(urlWs);
  const protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
  return `${protocol}//${u.host}`;
}

export async function simular(
  urlWs: string,
  tenantId: string,
  token: string,
  durationMs: number,
  carga: number,
): Promise<SimularResult> {
  const res = await fetch(`${baseDaApi(urlWs)}/api/tenants/${tenantId}/simulate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ durationMs, carga }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return (await res.json()) as SimularResult;
}

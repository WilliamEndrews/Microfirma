/**
 * AUTENTICACAO E AUTORIZACAO (RBAC)
 *
 * JWT simples com HMAC-SHA256. Sem dependencias externas - o Node tem
 * crypto.randomUUID e createHmac nativos. O segredo vem de env var.
 *
 * RBAC: 3 papeis (admin, operator, viewer) com permissoes declaradas em
 * PERMISSOES no contrato. A verificacao e feita aqui, nao no caller.
 */

import { createHmac, randomUUID } from 'node:crypto';
import type { JwtPayload, Papel } from '@microfirma/contracts';
import { JwtPayload as JwtPayloadSchema, PERMISSOES } from '@microfirma/contracts';

const SEGREDO = process.env.MICROFIRMA_JWT_SECRET ?? 'microfirma-dev-secret-change-in-prod';
const EXPIRACAO_MS = 24 * 60 * 60 * 1000; // 24h

function base64Url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
}

/** Emite um JWT para um usuario. */
export function emitirJwt(opts: {
  tenantId: string;
  userId: string;
  papel: Papel;
}): string {
  const agora = Date.now();
  const payload: JwtPayload = {
    tenantId: opts.tenantId,
    userId: opts.userId,
    papel: opts.papel,
    iat: agora,
    exp: agora + EXPIRACAO_MS,
  };

  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64Url(JSON.stringify(payload));
  const assinatura = createHmac('sha256', SEGREDO).update(`${header}.${body}`).digest('base64url');

  return `${header}.${body}.${assinatura}`;
}

/**
 * Verifica um JWT. Devolve o payload se valido, null caso contrario.
 * Nunca lanca - token invalido e resultado, nao excecao.
 */
export function verificarJwt(token: string): JwtPayload | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;

  const [header, body, assinatura] = partes as [string, string, string];
  const esperada = createHmac('sha256', SEGREDO).update(`${header}.${body}`).digest('base64url');

  // Comparacao em tempo constante para evitar timing attacks.
  if (esperada.length !== assinatura.length) return null;
  let diff = 0;
  for (let i = 0; i < esperada.length; i++) {
    diff |= esperada.charCodeAt(i) ^ assinatura.charCodeAt(i);
  }
  if (diff !== 0) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(body));
  } catch {
    return null;
  }

  const r = JwtPayloadSchema.safeParse(payload);
  if (!r.success) return null;

  // Verificar expiracao.
  if (Date.now() > r.data.exp) return null;

  return r.data;
}

/** Verifica se um papel tem uma permissao. */
export function temPermissao(papel: Papel, permissao: keyof (typeof PERMISSOES)[Papel]): boolean {
  return PERMISSOES[papel][permissao] ?? false;
}

/** Extrai token de query string do WebSocket. */
export function extrairTokenQuery(url: string): string | null {
  try {
    const u = new URL(url, 'http://localhost');
    const token = u.searchParams.get('token');
    return token;
  } catch {
    return null;
  }
}

/** Extrai token de header Authorization: Bearer <token>. */
export function extrairTokenHeader(headers: Record<string, string | string[] | undefined>): string | null {
  const auth = headers['authorization'];
  if (!auth || typeof auth !== 'string') return null;
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

/** Gera um ID unico para usuarios/tenants. */
export function gerarId(): string {
  return randomUUID();
}

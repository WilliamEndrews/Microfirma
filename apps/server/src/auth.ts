/**
 * AUTENTICACAO E AUTORIZACAO (RBAC)
 *
 * JWT real com `jose` (HMAC-SHA256), expiracao e refresh tokens.
 * O segredo simetrico vem de `MICROFIRMA_JWT_SECRET`.
 * Refresh tokens sao mantidos em memoria e podem ser revogados via
 * `revogarRefreshToken`.
 *
 * RBAC: 3 papeis (admin, operator, viewer) com permissoes declaradas em
 * PERMISSOES no contrato. A verificacao e feita aqui, nao no caller.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { SignJWT, jwtVerify } from 'jose';
import type { JwtPayload, Papel } from '@microfirma/contracts';
import { JwtPayload as JwtPayloadSchema, PERMISSOES } from '@microfirma/contracts';

const SEGREDO = process.env.MICROFIRMA_JWT_SECRET ?? 'microfirma-dev-secret-change-in-prod';
const SECRET_BUFFER = Buffer.from(SEGREDO, 'utf8');
const ACCESS_TTL_S = Number(process.env.MICROFIRMA_JWT_ACCESS_TTL_S ?? 900); // 15 min
const REFRESH_TTL_S = Number(process.env.MICROFIRMA_JWT_REFRESH_TTL_S ?? 7 * 24 * 60 * 60); // 7 dias

/** Refresh tokens emitidos. O Set armazena os JTI ativos. */
const refreshTokensAtivos = new Set<string>();

export interface TokenPair {
  access: string;
  refresh: string;
}

/** Emite um access token e um refresh token para um usuario. */
export async function emitirJwt(opts: {
  tenantId: string;
  userId: string;
  papel: Papel;
}): Promise<TokenPair> {
  const now = Math.floor(Date.now() / 1000);
  const access = await new SignJWT({
    tenantId: opts.tenantId,
    userId: opts.userId,
    papel: opts.papel,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(now + ACCESS_TTL_S)
    .sign(SECRET_BUFFER);

  const jti = randomBytes(16).toString('hex');
  refreshTokensAtivos.add(jti);

  const refresh = await new SignJWT({
    tenantId: opts.tenantId,
    userId: opts.userId,
    papel: opts.papel,
    jti,
    scope: 'refresh',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(now + REFRESH_TTL_S)
    .sign(SECRET_BUFFER);

  return { access, refresh };
}

/** Verifica um access token. Devolve o payload se valido, null caso contrario. */
export async function verificarJwt(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_BUFFER, {
      algorithms: ['HS256'],
    });
    if (payload.scope === 'refresh') return null;
    const r = JwtPayloadSchema.safeParse({
      tenantId: payload.tenantId,
      userId: payload.userId,
      papel: payload.papel,
      exp: payload.exp,
      iat: payload.iat,
    });
    if (!r.success) return null;
    return r.data;
  } catch {
    return null;
  }
}

/** Troca um refresh token por um novo par. */
export async function refreshJwt(refreshToken: string): Promise<TokenPair | null> {
  try {
    const { payload } = await jwtVerify(refreshToken, SECRET_BUFFER, {
      algorithms: ['HS256'],
    });
    if (payload.scope !== 'refresh' || !payload.jti || !refreshTokensAtivos.has(payload.jti as string)) {
      return null;
    }
    refreshTokensAtivos.delete(payload.jti as string);
    const tenantId = String(payload.tenantId ?? '');
    const userId = String(payload.userId ?? '');
    const papel = String(payload.papel ?? '') as Papel;
    return emitirJwt({ tenantId, userId, papel });
  } catch {
    return null;
  }
}

/** Revoga um refresh token para logout. */
export function revogarRefreshToken(refreshToken: string): boolean {
  try {
    const partes = refreshToken.split('.');
    if (partes.length !== 3) return false;
    const body = Buffer.from(partes[1]!, 'base64url').toString('utf8');
    const payload = JSON.parse(body);
    if (payload.jti && refreshTokensAtivos.has(payload.jti)) {
      refreshTokensAtivos.delete(payload.jti);
      return true;
    }
  } catch {
    return false;
  }
  return false;
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

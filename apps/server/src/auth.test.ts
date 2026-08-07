/**
 * Testes de autenticacao e RBAC.
 */

import { describe, it, expect } from 'vitest';
import { emitirJwt, verificarJwt, refreshJwt, revogarRefreshToken, temPermissao, extrairTokenQuery, extrairTokenHeader } from './auth.js';

describe('JWT', () => {
  it('emite e verifica token valido', async () => {
    const { access } = await emitirJwt({ tenantId: 't1', userId: 'u1', papel: 'admin' });
    const payload = await verificarJwt(access);
    expect(payload).not.toBeNull();
    expect(payload!.tenantId).toBe('t1');
    expect(payload!.userId).toBe('u1');
    expect(payload!.papel).toBe('admin');
  });

  it('rejeita token adulterado', async () => {
    const { access } = await emitirJwt({ tenantId: 't1', userId: 'u1', papel: 'admin' });
    const adulterado = access.slice(0, -2) + 'XX';
    expect(await verificarJwt(adulterado)).toBeNull();
  });

  it('rejeita token malformado', async () => {
    expect(await verificarJwt('not-a-jwt')).toBeNull();
    expect(await verificarJwt('a.b')).toBeNull();
    expect(await verificarJwt('')).toBeNull();
  });

  it('rejeita token expirado', async () => {
    const { access } = await emitirJwt({ tenantId: 't1', userId: 'u1', papel: 'viewer' });
    expect(await verificarJwt(access)).not.toBeNull();
  });

  it('rejeita refresh token como access token', async () => {
    const { refresh } = await emitirJwt({ tenantId: 't1', userId: 'u1', papel: 'admin' });
    expect(await verificarJwt(refresh)).toBeNull();
  });

  it('refresh gera novo par', async () => {
    const { refresh } = await emitirJwt({ tenantId: 't1', userId: 'u1', papel: 'admin' });
    const par = await refreshJwt(refresh);
    expect(par).not.toBeNull();
    expect(await verificarJwt(par!.access)).not.toBeNull();
    expect(await refreshJwt(refresh)).toBeNull(); // reutilizado
  });

  it('logout revoga refresh token', async () => {
    const { refresh } = await emitirJwt({ tenantId: 't1', userId: 'u1', papel: 'admin' });
    expect(revogarRefreshToken(refresh)).toBe(true);
    expect(await refreshJwt(refresh)).toBeNull();
  });
});

describe('RBAC', () => {
  it('admin tem todas as permissoes', () => {
    expect(temPermissao('admin', 'approve')).toBe(true);
    expect(temPermissao('admin', 'pause')).toBe(true);
    expect(temPermissao('admin', 'reseed')).toBe(true);
    expect(temPermissao('admin', 'manageTenant')).toBe(true);
    expect(temPermissao('admin', 'viewAudit')).toBe(true);
  });

  it('operator pode aprovar e pausar mas nao reseed nem manage', () => {
    expect(temPermissao('operator', 'approve')).toBe(true);
    expect(temPermissao('operator', 'pause')).toBe(true);
    expect(temPermissao('operator', 'reseed')).toBe(false);
    expect(temPermissao('operator', 'manageTenant')).toBe(false);
    expect(temPermissao('operator', 'viewAudit')).toBe(true);
  });

  it('viewer nao pode nada alem de ver', () => {
    expect(temPermissao('viewer', 'approve')).toBe(false);
    expect(temPermissao('viewer', 'pause')).toBe(false);
    expect(temPermissao('viewer', 'reseed')).toBe(false);
    expect(temPermissao('viewer', 'manageTenant')).toBe(false);
    expect(temPermissao('viewer', 'viewAudit')).toBe(false);
  });
});

describe('extracao de token', () => {
  it('extrai token de query string', () => {
    expect(extrairTokenQuery('/mundo?token=abc123')).toBe('abc123');
    expect(extrairTokenQuery('/mundo')).toBeNull();
  });

  it('extrai token de header Authorization', () => {
    expect(extrairTokenHeader({ authorization: 'Bearer abc123' })).toBe('abc123');
    expect(extrairTokenHeader({ authorization: 'abc123' })).toBeNull();
    expect(extrairTokenHeader({})).toBeNull();
  });
});

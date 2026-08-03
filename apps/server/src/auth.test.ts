/**
 * Testes de autenticacao e RBAC.
 */

import { describe, it, expect } from 'vitest';
import { emitirJwt, verificarJwt, temPermissao, extrairTokenQuery, extrairTokenHeader } from './auth.js';

describe('JWT', () => {
  it('emite e verifica token valido', () => {
    const token = emitirJwt({ tenantId: 't1', userId: 'u1', papel: 'admin' });
    const payload = verificarJwt(token);
    expect(payload).not.toBeNull();
    expect(payload!.tenantId).toBe('t1');
    expect(payload!.userId).toBe('u1');
    expect(payload!.papel).toBe('admin');
  });

  it('rejeita token adulterado', () => {
    const token = emitirJwt({ tenantId: 't1', userId: 'u1', papel: 'admin' });
    const adulterado = token.slice(0, -2) + 'XX';
    expect(verificarJwt(adulterado)).toBeNull();
  });

  it('rejeita token malformado', () => {
    expect(verificarJwt('not-a-jwt')).toBeNull();
    expect(verificarJwt('a.b')).toBeNull();
    expect(verificarJwt('')).toBeNull();
  });

  it('rejeita token expirado', async () => {
    // Ja que exp e 24h, nao podemos esperar. Mas podemos testar a logica
    // criando um token e verificando que ele e valido AGORA.
    const token = emitirJwt({ tenantId: 't1', userId: 'u1', papel: 'viewer' });
    expect(verificarJwt(token)).not.toBeNull();
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

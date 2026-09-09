import { describe, expect, it } from 'vitest';
import { AlertEngine } from './alert-engine.js';
import { AuditTrail } from './audit-trail.js';
import { verificarJwt } from './auth.js';
import { conectarPublico, criarOnboardPublico } from './public-onboard.js';
import { TenantRegistry } from './tenant-registry.js';

describe('ponte publica (landing)', () => {
  function setup() {
    const audit = new AuditTrail();
    const registry = new TenantRegistry(audit, new AlertEngine(audit));
    return { registry };
  }

  it('onboard cria tenant pro com ingestor OTLP e JWT, sem x-api-key', async () => {
    const { registry } = setup();
    const r = await criarOnboardPublico(registry, '  Acme  ', 'http://127.0.0.1:8787');
    expect(r.tenant.displayName).toBe('Acme');
    expect(r.tenant.plano).toBe('pro');
    expect(r.token).toBeTruthy();
    expect(r.refresh).toBeTruthy();
    expect(registry.ingestorDoTenant(r.tenant.tenantId)).not.toBeNull();
    const payload = await verificarJwt(r.token);
    expect(payload?.tenantId).toBe(r.tenant.tenantId);
    expect(payload?.papel).toBe('admin');
  });

  it('onboard rejeita nome vazio', async () => {
    const { registry } = setup();
    await expect(criarOnboardPublico(registry, '   ', 'http://127.0.0.1:8787')).rejects.toThrow(
      'displayName obrigatorio',
    );
  });

  it('conectar devolve JWT quando o codigo existe', async () => {
    const { registry } = setup();
    const criado = await criarOnboardPublico(registry, 'Beta', 'http://127.0.0.1:8787');
    const r = await conectarPublico(registry, `  ${criado.tenant.tenantId}  `);
    expect(r).not.toBeNull();
    expect(r!.tenant.tenantId).toBe(criado.tenant.tenantId);
    const payload = await verificarJwt(r!.token);
    expect(payload?.tenantId).toBe(criado.tenant.tenantId);
  });

  it('conectar retorna null para codigo inexistente', async () => {
    const { registry } = setup();
    expect(await conectarPublico(registry, 'nao-existe')).toBeNull();
    expect(await conectarPublico(registry, '   ')).toBeNull();
  });
});

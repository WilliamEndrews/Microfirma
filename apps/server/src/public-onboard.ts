/**
 * Ponte publica da landing: cria ou reconecta tenant sem x-api-key.
 * O codigo do cliente e o tenantId (mesmo valor de x-tenant-id no OTLP).
 */

import type { Tenant } from '@microfirma/contracts';
import { emitirJwt, gerarId } from './auth.js';
import type { TenantRegistry } from './tenant-registry.js';

export type RespostaPonte = {
  tenant: Pick<Tenant, 'tenantId' | 'displayName' | 'seed' | 'plano'>;
  token: string;
  refresh: string;
};

function recorte(tenant: Tenant): RespostaPonte['tenant'] {
  return {
    tenantId: tenant.tenantId,
    displayName: tenant.displayName,
    seed: tenant.seed,
    plano: tenant.plano,
  };
}

export async function criarOnboardPublico(
  registry: TenantRegistry,
  displayName: string,
  otlpEndpoint: string,
): Promise<RespostaPonte> {
  const nome = displayName.trim();
  if (!nome) throw new Error('displayName obrigatorio');
  const tenant = registry.criar({
    displayName: nome,
    plano: 'pro',
    seed: Date.now(),
    otlpEndpoint,
  });
  const { access, refresh } = await emitirJwt({
    tenantId: tenant.tenantId,
    userId: gerarId(),
    papel: 'admin',
  });
  return { tenant: recorte(tenant), token: access, refresh };
}

export async function conectarPublico(
  registry: TenantRegistry,
  codigo: string,
): Promise<RespostaPonte | null> {
  const id = codigo.trim();
  if (!id) return null;
  const entry = registry.obter(id);
  if (!entry) return null;
  const { access, refresh } = await emitirJwt({
    tenantId: entry.tenant.tenantId,
    userId: gerarId(),
    papel: 'admin',
  });
  return { tenant: recorte(entry.tenant), token: access, refresh };
}

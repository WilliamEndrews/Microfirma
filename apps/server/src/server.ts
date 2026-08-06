/**
 * SERVIDOR MULTI-TENANT - FASE 3
 *
 * Plumbing de transporte com auth, RBAC, multi-tenant, auditoria e alertas.
 * Tudo que decide algo vive em OfficeSession ou TenantRegistry. Aqui so
 * existe roteamento, validacao de borda e repasse.
 *
 * Endpoints REST:
 *   POST /api/tenants              - cria tenant (onboarding)
 *   GET  /api/tenants              - lista tenants (admin)
 *   GET  /api/tenants/:id          - detalhes de um tenant
 *   DELETE /api/tenants/:id        - remove tenant
 *   POST /api/tenants/:id/alerts   - configura alerta
 *   GET  /api/tenants/:id/alerts   - lista alertas
 *   GET  /api/tenants/:id/audit    - trilha de auditoria
 *   POST /api/tenants/:id/simulate - roda cenario SimFirma what-if
 *   POST /api/auth/login           - emite JWT
 *   GET  /health                   - saude do servidor
 *   POST /v1/traces                - receptor OTLP (roteado por tenant)
 *
 * WebSocket:
 *   /mundo?token=<JWT>             - multi-tenant, roteado por tenantId do token
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  parseClientCommand,
  type ServerMessage,
  type AlertNotification,
  type ApprovalNotification,
  Tenant as TenantSchema,
  AlertConfig as AlertConfigSchema,
  SimulateRequest as SimulateRequestSchema,
} from '@microfirma/contracts';
import { AuditTrail } from './audit-trail.js';
import { AlertEngine } from './alert-engine.js';
import { TenantRegistry } from './tenant-registry.js';
import {
  emitirJwt,
  verificarJwt,
  temPermissao,
  extrairTokenQuery,
  extrairTokenHeader,
  gerarId,
} from './auth.js';

const PORTA = Number(process.env.MICROFIRMA_PORT ?? 8787);
const SEED_PADRAO = Number(process.env.MICROFIRMA_SEED ?? 20260802);

// --- Infraestrutura singleton ---
const audit = new AuditTrail();
const alertEngine = new AlertEngine(audit);
const registry = new TenantRegistry(audit, alertEngine);

// --- Tenant demo default (para compatibilidade com a demo existente) ---
const tenantDemo = registry.criar({
  displayName: 'Demo',
  plano: 'pro',
  seed: SEED_PADRAO,
});

// --- Mapa de clientes WebSocket por tenant para broadcast ---
const clientesPorTenant = new Map<string, Set<WebSocket>>();
function clientesDoTenant(tenantId: string): Set<WebSocket> {
  let set = clientesPorTenant.get(tenantId);
  if (!set) {
    set = new Set();
    clientesPorTenant.set(tenantId, set);
  }
  return set;
}

function enviar(socket: WebSocket, mensagem: ServerMessage): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(mensagem));
}

function broadcastTenant(tenantId: string, mensagem: ServerMessage): void {
  const carga = JSON.stringify(mensagem);
  for (const cliente of clientesDoTenant(tenantId)) {
    if (cliente.readyState === cliente.OPEN) cliente.send(carga);
  }
}

// --- HTTP Server ---
const http = createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, authorization, x-api-key, x-tenant-id');
  res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  // Health check (publico).
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      tenants: registry.total,
      auditEvents: audit.total,
      alertEvents: alertEngine.eventosDisparados.length,
    }));
    return;
  }

  // Receptor OTLP/HTTP - roteado por tenant via header ou query.
  if (req.url?.startsWith('/v1/traces') && req.method === 'POST') {
    let corpo = '';
    req.on('data', (chunk) => { corpo += chunk.toString(); });
    req.on('end', () => {
      try {
        const lote = JSON.parse(corpo);
        const tenantId = (req.headers['x-tenant-id'] as string | undefined)
          ?? new URL(req.url ?? '/', 'http://localhost').searchParams.get('tenant')
          ?? tenantDemo.tenantId;
        const ingestor = registry.ingestorDoTenant(tenantId);
        if (!ingestor) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'tenant nao encontrado ou sem OTLP' }));
          return;
        }
        const n = ingestor.ingerir(lote);
        if (n > 0) {
          console.log(`[otlp] ${n} eventos ingeridos para tenant ${tenantId}`);
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      } catch (erro) {
        console.warn('[otlp] falha ao processar lote:', erro);
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'lote OTLP invalido' }));
      }
    });
    return;
  }

  // --- API REST ---
  const url = new URL(req.url ?? '/', `http://localhost:${PORTA}`);
  const path = url.pathname;
  const segments = path.split('/').filter(Boolean);

  // Auth: POST /api/auth/login
  if (path === '/api/auth/login' && req.method === 'POST') {
    const body = await lerBody(req);
    try {
      const { tenantId, userId, displayName, email, papel } = JSON.parse(body);
      const token = emitirJwt({ tenantId, userId, papel });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ token, tenantId, userId, displayName, email, papel }));
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'payload invalido' }));
    }
    return;
  }

  // A partir daqui, tudo precisa de auth (exceto POST /api/tenants que e onboarding).
  const tokenHeader = extrairTokenHeader(req.headers as Record<string, string | string[] | undefined>);
  const payload = tokenHeader ? verificarJwt(tokenHeader) : null;

  // POST /api/tenants - onboarding.
  if (path === '/api/tenants' && req.method === 'POST') {
    const onboardingKey = process.env.MICROFIRMA_ONBOARDING_KEY ?? 'microfirma-dev-onboarding';
    const apiKey = req.headers['x-api-key'] as string | undefined;
    const authOk = (payload && payload.papel === 'admin') || apiKey === onboardingKey;

    if (!authOk) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'nao autorizado' }));
      return;
    }

    const body = await lerBody(req);
    const r = TenantSchema.safeParse({
      ...JSON.parse(body),
      tenantId: gerarId(),
      createdAt: Date.now(),
      active: true,
    });
    if (!r.success) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: r.error.issues }));
      return;
    }

    const tenant = registry.criar({
      displayName: r.data.displayName,
      plano: r.data.plano,
      seed: r.data.seed,
      otlpEndpoint: r.data.otlpEndpoint,
    });

    const token = emitirJwt({ tenantId: tenant.tenantId, userId: gerarId(), papel: 'admin' });

    res.writeHead(201, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ tenant, token }));
    return;
  }

  // GET /api/tenants - lista (admin).
  if (path === '/api/tenants' && req.method === 'GET') {
    if (!payload || payload.papel !== 'admin') {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'forbidden' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(registry.listar()));
    return;
  }

  // /api/tenants/:id/...
  if (segments[0] === 'api' && segments[1] === 'tenants' && segments[2]) {
    const tenantId = segments[2]!;
    const entry = registry.obter(tenantId);

    if (!entry) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'tenant nao encontrado' }));
      return;
    }

    if (!payload || (payload.tenantId !== tenantId && payload.papel !== 'admin')) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'forbidden' }));
      return;
    }

    // GET /api/tenants/:id
    if (segments.length === 3 && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(entry.tenant));
      return;
    }

    // DELETE /api/tenants/:id
    if (segments.length === 3 && req.method === 'DELETE') {
      if (!temPermissao(payload.papel, 'manageTenant')) {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'forbidden' }));
        return;
      }
      registry.remover(tenantId);
      res.writeHead(204).end();
      return;
    }

    // POST /api/tenants/:id/alerts
    if (segments[3] === 'alerts' && req.method === 'POST') {
      const body = await lerBody(req);
      const r = AlertConfigSchema.safeParse({
        ...JSON.parse(body),
        alertId: gerarId(),
        tenantId,
      });
      if (!r.success) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: r.error.issues }));
        return;
      }
      registry.configurarAlerta(r.data);
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.data));
      return;
    }

    // GET /api/tenants/:id/alerts
    if (segments[3] === 'alerts' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(registry.alertasDoTenant(tenantId)));
      return;
    }

    // GET /api/tenants/:id/audit
    if (segments[3] === 'audit' && req.method === 'GET') {
      if (!temPermissao(payload.papel, 'viewAudit')) {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'forbidden' }));
        return;
      }
      const action = url.searchParams.get('action') ?? undefined;
      const limite = Number(url.searchParams.get('limite') ?? 100);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(audit.consultar(tenantId, { action: action as never, limite })));
      return;
    }

    // POST /api/tenants/:id/simulate
    if (segments[3] === 'simulate' && req.method === 'POST') {
      const body = await lerBody(req);
      const r = SimulateRequestSchema.safeParse(JSON.parse(body));
      if (!r.success) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: r.error.issues }));
        return;
      }
      const resultado = registry.simular(tenantId, r.data.durationMs, r.data.carga);
      if (!resultado) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'tenant nao encontrado' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ticks: resultado.ticks,
        tMundoMs: resultado.tMundoMs,
        kpis: resultado.snapshot.kpis,
      }));
      return;
    }
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'rota nao encontrada' }));
});

// --- WebSocket Server (multi-tenant) ---
const wss = new WebSocketServer({ server: http, path: '/mundo' });

wss.on('connection', (socket, req) => {
  const token = extrairTokenQuery(req.url ?? '');
  if (!token) {
    enviar(socket, { kind: 'failure', code: 'unauthorized', message: 'token ausente' });
    socket.close(4001, 'unauthorized');
    return;
  }

  const payload = verificarJwt(token);
  if (!payload) {
    enviar(socket, { kind: 'failure', code: 'unauthorized', message: 'token invalido ou expirado' });
    socket.close(4001, 'unauthorized');
    return;
  }

  const entry = registry.obter(payload.tenantId);
  if (!entry) {
    enviar(socket, { kind: 'failure', code: 'tenant_not_found', message: 'tenant nao encontrado' });
    socket.close(4004, 'tenant not found');
    return;
  }

  const sessao = entry.sessao;
  const tenantId = payload.tenantId;
  const de = req.socket.remoteAddress ?? 'desconhecido';

  console.log(`[server] cliente conectado tenant=${tenantId} user=${payload.userId} (${de})`);

  clientesDoTenant(tenantId).add(socket);

  // Handshake.
  enviar(socket, sessao.welcome());
  enviar(socket, sessao.snapshot());

  // Notificacoes de aprovacao pendentes.
  for (const ator of sessao.snapshot().actors) {
    if (ator.activity === 'waiting_approval') {
      enviar(socket, {
        kind: 'approval_pending',
        context: {
          approvalId: gerarId(),
          agentId: ator.agentId,
          agentDisplayName: ator.agentId,
          question: 'Aguardando aprovacao humana',
          waitingSeconds: 0,
          runCostUsd: 0,
          runTokens: 0,
        },
      } satisfies ApprovalNotification);
    }
  }

  socket.on('message', (bruto) => {
    const r = parseClientCommand(bruto.toString());
    if (!r.ok) {
      enviar(socket, { kind: 'failure', code: 'bad_command', message: r.error });
      return;
    }

    const cmd = r.command;

    switch (cmd.type) {
      case 'resolve_approval': {
        if (!temPermissao(payload.papel, 'approve')) {
          enviar(socket, { kind: 'failure', code: 'forbidden', message: 'papel nao tem permissao de aprovacao' });
          return;
        }
        sessao.apply(cmd);
        audit.registrar({
          tenantId,
          userId: payload.userId,
          action: 'approval.granted',
          details: { agentId: cmd.agentId },
        });
        return;
      }

      case 'set_paused': {
        if (!temPermissao(payload.papel, 'pause')) {
          enviar(socket, { kind: 'failure', code: 'forbidden', message: 'papel nao tem permissao de pause' });
          return;
        }
        sessao.apply(cmd);
        audit.registrar({
          tenantId,
          userId: payload.userId,
          action: cmd.paused ? 'session.paused' : 'session.resumed',
        });
        return;
      }

      case 'reseed': {
        if (!temPermissao(payload.papel, 'reseed')) {
          enviar(socket, { kind: 'failure', code: 'forbidden', message: 'papel nao tem permissao de reseed' });
          return;
        }
        sessao.apply(cmd);
        audit.registrar({
          tenantId,
          userId: payload.userId,
          action: 'session.reseeded',
          details: { seed: cmd.seed },
        });
        broadcastTenant(tenantId, sessao.snapshot());
        return;
      }

      case 'ack_alert': {
        audit.registrar({
          tenantId,
          userId: payload.userId,
          action: 'alert.acknowledged',
          details: { alertEventId: cmd.alertEventId },
        });
        return;
      }
    }
  });

  socket.on('close', () => {
    clientesDoTenant(tenantId).delete(socket);
    console.log(`[server] cliente desconectado tenant=${tenantId}`);
  });

  socket.on('error', (erro) => {
    console.warn(`[server] erro de socket tenant=${tenantId}:`, erro.message);
  });
});

// --- Laco autoritativo multi-tenant ---
const tickMsGlobal = 100;
const timer = setInterval(() => {
  for (const { tenantId, sessao } of registry.sessoesAtivas()) {
    const quadro = sessao.tick();
    if (!quadro) continue;
    const clientes = clientesDoTenant(tenantId);
    if (clientes.size === 0) continue;

    const carga = JSON.stringify(quadro);
    for (const cliente of clientes) {
      if (cliente.readyState === cliente.OPEN) cliente.send(carga);
    }

    // Avaliar alertas.
    const snap = sessao.snapshot();
    const pendingApprovals = snap.actors
      .filter((a) => a.activity === 'waiting_approval')
      .map((a) => ({ agentId: a.agentId, waitingSeconds: 0 }));

    const alertas = alertEngine.avaliar(tenantId, snap.kpis, pendingApprovals);
    for (const alerta of alertas) {
      const notif: AlertNotification = {
        kind: 'alert',
        message: alerta.message,
        condition: alerta.condition,
        ts: alerta.ts,
      };
      broadcastTenant(tenantId, notif);
    }
  }
}, tickMsGlobal);

// --- Start ---
http.listen(PORTA, '127.0.0.1', () => {
  console.log(
    `[server] MicroFirma multi-tenant no ar em ws://127.0.0.1:${PORTA}/mundo ` +
      `(${registry.total} tenant(s), ${tickMsGlobal}ms/tick)`,
  );
  console.log(`[server] REST API em http://127.0.0.1:${PORTA}/api/`);
  console.log(`[server] Receptor OTLP em http://127.0.0.1:${PORTA}/v1/traces`);
  console.log('[server] Para onboarding: POST /api/tenants (admin token ou x-api-key: microfirma-dev-onboarding)');
});

// --- Graceful shutdown ---
function encerrar(sinal: string): void {
  console.log(`[server] ${sinal} recebido, encerrando...`);
  clearInterval(timer);
  for (const cliente of wss.clients) cliente.close(1001, 'servidor encerrando');
  wss.close(() => http.close(() => process.exit(0)));
}

process.on('SIGINT', () => encerrar('SIGINT'));
process.on('SIGTERM', () => encerrar('SIGTERM'));

// --- Helpers ---
function lerBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let corpo = '';
    req.on('data', (chunk) => { corpo += chunk.toString(); });
    req.on('end', () => resolve(corpo));
    req.on('error', reject);
  });
}

# Conexao da telemetria — logica da ponte

Este topico explica **como o cliente se liga ao escritorio**: o que e o codigo,
o que e o JWT, e por que OTLP e o browser usam caminhos diferentes.

**Guia completo** (todas as variantes + o que configurar no sistema do cliente):
[`guia-conexao-cliente.md`](guia-conexao-cliente.md).

Runbook de teste local (fixture, curl, aceite): [`telemetria-otlp.md`](telemetria-otlp.md).

## Duas identidades (nao misturar)

| Peca | Papel | Quem usa |
|------|--------|----------|
| **Codigo = `tenantId`** | Identifica a empresa no servidor | Exportador OTLP do cliente (`x-tenant-id`) e tela “Ja tenho codigo” |
| **JWT (`token` / `refresh`)** | Autoriza o humano a abrir o escritorio | Browser do Demo (`/mundo?token=…`) |

O app do cliente **nao** envia o JWT nos spans. O browser **nao** precisa do
codigo OTLP para desenhar a sala — ele entra com o token.

```
Cliente OTLP  ──x-tenant-id──►  POST /v1/traces  ──►  OfficeSession da empresa
Humano        ──JWT──────────►  WS /mundo?token= ──►  mesma OfficeSession
```

## Fluxo A — Nova empresa (landing)

1. Landing → “Nova empresa” → nome.
2. `POST /api/public/onboard` `{ displayName }` (publico, sem `x-api-key`).
3. Servidor cria no `TenantRegistry`:
   - tenant (`tenantId` gerado),
   - `OfficeSession`,
   - `OtlpIngestor` (porque o onboard passa `otlpEndpoint`),
   - JWT admin (`token` + `refresh`).
4. Tela **Ponte** mostra:
   - **Codigo** = `tenantId` (copiar / guardar),
   - snippet OTLP (`POST …/v1/traces` + `x-tenant-id`),
   - link “entrar no escritorio” → Demo com `?token=<JWT>`.

Codigo relevante: `apps/landing/src/Onboarding.tsx`, `apps/landing/src/api.ts`,
`apps/server/src/public-onboard.ts`.

## Fluxo B — Ja tenho codigo

1. Landing → “Ja tenho codigo” → cola o **mesmo** `tenantId`.
2. `POST /api/public/conectar` `{ codigo }`.
3. Se o tenant existir no registry, emite **novo** JWT; nao recria a empresa.
4. De novo a tela Ponte → Demo com o token novo.

Se o codigo nao existir → `404 codigo nao encontrado`.

## Fluxo C — Cliente aponta telemetria

O exportador OTLP/HTTP do cliente (ou Collector) deve:

```http
POST http://<host>:8787/v1/traces
content-type: application/json
x-tenant-id: <tenantId>
```

Regras atuais:

- So **JSON** (nao protobuf / gRPC neste ciclo).
- Porta do MicroFirma (`:8787`), nao o Collector padrao `:4318`.
- Sem `x-tenant-id` valido (tenant sem ingestor) → spans nao entram na sala.
- Atributos GenAI: ver contrato em [`telemetria-otlp.md`](telemetria-otlp.md)
  e `packages/contracts/src/otlp.ts`.

Pipeline interno apos o POST:

```
/v1/traces
  → traduzirLoteOtlp
  → OtlpIngestor do tenant
  → OfficeSession.tick → WorldEngine
  → NarrativeScheduler
  → snapshot no WebSocket /mundo → apps/demo
```

Quando o elenco OTLP cresce, a sessao pode **remeshar** a planta
(1 Boss + N-1 privativos + copa) para caber os agentes descobertos.

## Fluxo D — Demo com token

1. URL: `http://localhost:5173/?token=<JWT>` (ou `VITE_MICROFIRMA_DEMO_URL`).
2. Demo resolve `ws://…/mundo?token=…` a partir do JWT.
3. Servidor valida o JWT, roteia pelo `tenantId` do payload e envia o snapshot.

Sem token (dev legado): `VITE_MICROFIRMA_WS` aponta direto para um mundo fixo.

## O que ainda e “em memoria”

O `TenantRegistry` vive no processo do server. Reiniciar o server apaga tenants
criados pela landing → “codigo nao encontrado” ate criar de novo. Persistencia
duravel de tenant/sessao ainda nao e este documento.

## Checklist rapido para o cliente

1. Criar empresa na landing (ou reusar codigo).
2. Guardar o **codigo** (`tenantId`).
3. **Simular agencia** na ponte (fixture de 3 agentes) **ou** configurar OTLP/HTTP
   JSON → `/v1/traces` com `x-tenant-id` **ou** `POST /api/events` (JSON nativo).
4. Abrir o escritorio pelo link com JWT (ou colar o codigo depois e gerar outro token).
5. Telemetria real so e necessaria quando o cliente apontar a fonte dele.

## Simular na ponte (sem terminal do cliente)

Na tela **Ponte pronta**, o botao **Simular agencia** chama
`POST /api/public/simular` `{ "codigo": "<tenantId>" }` e injeta a fixture
`scripts/fixtures/agencia-3-agentes.otlp.json` no ingestor daquele tenant.
Depois e so **entrar no escritorio**.

## POST /api/events (shape minimo, sem OTLP)

Para scripts / SDKs que nao falam OpenTelemetry:

```http
POST /api/events
content-type: application/json
```

```json
{
  "tenantId": "<codigo>",
  "events": [
    {
      "type": "agent.discovered",
      "agentId": "agent_1",
      "name": "Triador",
      "role": "researcher"
    },
    {
      "type": "tool.called",
      "agentId": "agent_1",
      "toolName": "busca",
      "ok": true,
      "durationMs": 120
    },
    {
      "type": "approval.requested",
      "agentId": "agent_1",
      "question": "Posso seguir?"
    }
  ]
}
```

Tipos aceitos: `agent.discovered`, `run.started`, `run.finished`, `tool.called`,
`llm.completed`, `error.raised`, `approval.requested`, `queue.observed`.
O servidor preenche `eventId`, `tsReal` e `tenantId` no DomainEvent interno.
`tenantId` tambem pode ir no header `x-tenant-id`.

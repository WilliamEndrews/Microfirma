# Guia de conexao do cliente — MicroFirma

Documentacao **completa** para conectar o sistema do cliente ao escritorio:
todas as variantes, o que configurar do lado deles, e como validar.

Leituras curtas relacionadas:

- Logica da ponte (codigo vs JWT): [`conexao-telemetria.md`](conexao-telemetria.md)
- Runbook / aceite OTLP local: [`telemetria-otlp.md`](telemetria-otlp.md)
- Deploy e env: [`deploy.md`](deploy.md)

---

## 1. Ideia em uma frase

MicroFirma **nao entra no codigo deles para “rodar tenant”**.  
Eles (ou voce na integracao) configuram **uma fonte de eventos** que manda
dados para o server; o browser so **abre o escritorio** com um JWT.

```
Sistema do cliente  →  telemetria (codigo / tenantId)  →  server MicroFirma
Humano no browser   →  JWT                            →  mesmo escritorio
```

---

## 2. Pecas que voce precisa entender

| Nome | O que e | Onde aparece | Quem usa |
|------|---------|--------------|----------|
| **Codigo / `tenantId`** | ID da empresa | Tela Ponte; header `x-tenant-id` | Exportador / webhook do cliente |
| **JWT (`token`)** | Sessao do viewer | Link `?token=` / WebSocket `/mundo` | Browser (Demo) |
| **`refresh`** | Renovar JWT | Resposta do onboard | App (ainda pouco usado na landing) |
| **Endpoint OTLP** | `POST …/v1/traces` | Snippet na ponte | OpenTelemetry / Collector |
| **Endpoint nativo** | `POST …/api/events` | Snippet na ponte | Scripts / SDK sem OTel |
| **Simular** | Fixture interna | Botao na ponte | Demo sem sistema do cliente |

**Nunca** coloque o JWT no exportador OTLP.  
**Nunca** use o `tenantId` como senha do browser (use o link com token).

---

## 3. Pre-requisitos do lado MicroFirma

Suba (local):

| Servico | URL tipica |
|---------|------------|
| Server | `http://127.0.0.1:8787` |
| Landing | `http://localhost:5174` |
| Demo | `http://localhost:5173` |

Variaveis uteis:

| Variavel | Quem | Default | Funcao |
|----------|------|---------|--------|
| `MICROFIRMA_HOST` / `MICROFIRMA_PORT` | Server | `127.0.0.1` / `8787` | Bind do API/OTLP/WS |
| `VITE_MICROFIRMA_API` | Landing | `http://127.0.0.1:8787` | Para onde a ponte POSTA |
| `VITE_MICROFIRMA_DEMO_URL` | Landing | `http://localhost:5173` | Link “entrar no escritorio” |
| `VITE_MICROFIRMA_WS` | Demo (legado) | — | WS fixo sem `?token=` |

**Limite atual:** tenants ficam **em memoria**. Reiniciar o server apaga o
codigo. Em piloto real, o server precisa ficar estavel (persistencia duravel
ainda e gap — ver [`plano-mestre-mvp.md`](plano-mestre-mvp.md)).

---

## 4. Passo zero (sempre): criar a empresa na landing

1. Abra a landing (`http://localhost:5174`).
2. Clique na sala → **Nova empresa** → nome.
3. Na **Ponte**, guarde:
   - **Codigo** (`tenantId`)
   - Snippets OTLP e/ou Eventos nativos
4. Escolha **uma** porta de telemetria (secoes 5–8).
5. Clique **entrar no escritorio** (JWT).

Voltar depois: **Ja tenho codigo** → mesmo `tenantId` → novo JWT.

API equivalente (sem UI):

```http
POST /api/public/onboard
content-type: application/json

{ "displayName": "Acme" }
```

```http
POST /api/public/conectar
content-type: application/json

{ "codigo": "<tenantId>" }
```

---

## 5. Variante A — Simular (sem tocar no sistema deles)

**Quando usar:** demo comercial, validar remesh, cliente ainda sem OTLP.

1. Na ponte → **Simular agencia**
2. Isso chama `POST /api/public/simular` `{ "codigo": "<tenantId>" }`
3. Injeta `scripts/fixtures/agencia-3-agentes.otlp.json` (3 agentes)
4. **Entrar no escritorio**

Nao configura nada no projeto do cliente.

---

## 6. Variante B — OTLP real (cliente com OpenTelemetry)

### 6.1 O que configurar obrigatoriamente

No exportador / Collector / SDK deles:

| Config | Valor | Notas |
|--------|-------|-------|
| Protocolo | **OTLP/HTTP** | Nao gRPC neste ciclo |
| Encoding | **JSON** | Nao protobuf |
| Endpoint | `http://<host-microfirma>:8787/v1/traces` | Nao `:4318` padrao OTel |
| Header | `x-tenant-id: <codigo-da-ponte>` | Sem isso → 404 / sala errada |
| Content-Type | `application/json` | |

Exemplo mental (env comum em SDKs — nomes variam por SDK):

```bash
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:8787/v1/traces
OTEL_EXPORTER_OTLP_PROTOCOL=http/json
OTEL_EXPORTER_OTLP_HEADERS=x-tenant-id=<CODIGO>
```

O **efeito** tem que ser o da tabela; o nome exato da env depende do SDK.

### 6.2 Collector OpenTelemetry (YAML tipico)

```yaml
exporters:
  otlphttp/microfirma:
    endpoint: http://SEU_HOST:8787
    traces_endpoint: http://SEU_HOST:8787/v1/traces
    encoding: json
    headers:
      x-tenant-id: "<CODIGO>"

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [otlphttp/microfirma]
```

Ajuste `endpoint` / `traces_endpoint` conforme a versao do Collector; o POST
final precisa bater em `/v1/traces` com JSON + header.

### 6.3 Atributos GenAI que o MicroFirma le

Referencia de codigo: `packages/contracts/src/otlp.ts`.

| Objetivo no escritorio | Atributos no span |
|------------------------|-------------------|
| Descobrir agente (mesa/personagem) | `gen_ai.agent.id` e/ou `gen_ai.agent.name` (+ `gen_ai.agent.role`) |
| LLM / custo | `gen_ai.operation.name` = `chat` ou `generate` + `gen_ai.request.model` + `gen_ai.usage.*` |
| Tool call | `gen_ai.operation.name` = `tool` + `gen_ai.tool.name` |
| Erro / heat | `status.code` = 2 e/ou `error.type` / `exception.*` |
| Aprovacao HITL | `human_approval.required` = true e/ou `human_approval.id` + `human_approval.question` |
| Fila | `queue.depth` |

**Roles validos** (`AgentRole`):  
`orchestrator`, `researcher`, `analyst`, `support`, `engineer`, `finance`,
`guardian`, `unknown`.

**Privacidade (ADR-0007):** nao envie `gen_ai.prompt` / `gen_ai.completion`.
O adaptador ignora conteudo, mas melhor nem mandar.

### 6.4 O que nao funciona (erros comuns)

| Errado | Certo |
|--------|-------|
| Porta `:4318` protobuf | `:8787` JSON |
| Header `customer.id` | `x-tenant-id` |
| `agent.id` generico | `gen_ai.agent.id` |
| `tool.name` sozinho | `gen_ai.operation.name=tool` + `gen_ai.tool.name` |
| JWT no header OTLP | so `x-tenant-id` |
| Endpoint sem tenant criado na landing | onboard primeiro |

### 6.5 Teste manual (PowerShell)

No PowerShell use `curl.exe` (nao o alias `curl` = `Invoke-WebRequest`):

```powershell
curl.exe -X POST http://127.0.0.1:8787/v1/traces `
  -H "content-type: application/json" `
  -H "x-tenant-id: SEU_CODIGO" `
  -d "@scripts/fixtures/agencia-3-agentes.otlp.json"
```

Ou nativo:

```powershell
$lote = Get-Content -Raw "scripts/fixtures/agencia-3-agentes.otlp.json"
Invoke-RestMethod -Uri "http://127.0.0.1:8787/v1/traces" -Method POST `
  -ContentType "application/json" `
  -Headers @{ "x-tenant-id" = "SEU_CODIGO" } `
  -Body $lote
```

No server deve aparecer: `[otlp] N eventos ingeridos…`

---

## 7. Variante C — Eventos nativos (sem OTLP)

**Quando usar:** scripts, prototipos, SaaS sem OTel, webhook interno.

```http
POST http://<host>:8787/api/events
content-type: application/json
```

```json
{
  "tenantId": "<CODIGO>",
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

`tenantId` tambem pode ir no header `x-tenant-id`.

### Tipos e campos

| `type` | Campos principais |
|--------|-------------------|
| `agent.discovered` | `agentId` (obrig.), `name`, `role`, `framework` |
| `run.started` | `agentId`, `runId?`, `label?` |
| `run.finished` | `agentId`, `status?`, `durationMs?`, `runId?` |
| `tool.called` | `agentId`, `toolName`, `ok?`, `durationMs?` |
| `llm.completed` | `agentId`, `model?`, tokens, `costUsd?`, `latencyMs?` |
| `error.raised` | `agentId`, `kind?`, `severity?` |
| `approval.requested` | `agentId`, `question`, `approvalId?` |
| `queue.observed` | `agentId`, `depth` |

O server preenche `eventId`, `tsReal` e envelope interno
(`apps/server/src/eventos-nativos.ts`).

**O que configurar no sistema deles:** qualquer job/HTTP client que, em
pontos-chave (agente criado, tool, erro, aprovacao), faca esse POST. Nao
precisa de OpenTelemetry.

---

## 8. Variante D — Harness local (seu notebook)

Sem landing UI:

```powershell
npx pnpm --filter @microfirma/server dev
.\scripts\setup-otlp-tenant.ps1
npm run telemetria:enviar
npx pnpm --filter @microfirma/demo dev
```

Util para engenharia; na mesa do cliente prefira landing + Simular ou
OTLP / events.

Validacao offline da fixture:

```powershell
npm run telemetria:dry
```

---

## 9. Checklist — o que pedir ao time tecnico deles

Entregue este pacote (Slack / e-mail / Notion):

1. **Codigo:** `xxxxxxxx-xxxx-…`
2. **Escolha A ou B:**
   - **A – OTLP:** endpoint + header + JSON GenAI (secao 6)
   - **B – Webhook:** `POST /api/events` (secao 7)
3. **Viewer:** link da Demo com token (ou “Ja tenho codigo” na landing)
4. **Privacidade:** nao enviar prompts / completions
5. **Rede:** firewall / VPN ate o host do MicroFirma `:8787` (ou HTTPS publico)

Perguntas para eles:

- Ja exportam OpenTelemetry traces?
- Preferem HTTP JSON direto ou Collector?
- Qual framework (LangChain, Crew, custom)?
- Podem adicionar header custom `x-tenant-id`?

---

## 10. Como validar que conectou

| Sinal | Onde |
|-------|------|
| `[otlp] N eventos ingeridos` ou resposta `{ "eventos": N }` | Log server / HTTP |
| Agentes aparecem; planta remesha (Boss + privativos + copa) | Demo |
| Gerente em `waiting_approval` (fixture) | Demo / painel |
| `404 codigo nao encontrado` | Tenant sumiu (restart) ou codigo errado |

Criterios de aceite detalhados: [`telemetria-otlp.md`](telemetria-otlp.md).

---

## 11. Ciclo de vida (desligar PC, etc.)

| O que desliga | Efeito | Proxima entrada |
|---------------|--------|-----------------|
| PC do **viewer** | So fecha o Demo | Landing → Ja tenho codigo → novo JWT |
| Processo **agentico do cliente** | Para de mandar eventos | Ao subir de novo, mesma config OTLP / `/api/events` |
| **Server MicroFirma** | Perde tenant (hoje) | Nova empresa **ou** recriar + atualizar codigo no cliente |

A config OTLP / events no disco **deles** persiste; o que nao persiste ainda e
o registry **nosso**.

---

## 12. Mapa de decisao rapido

```
Cliente na mesa?
  ├─ So mostrar o produto     → Simular (var. A)
  ├─ Tem OTel / Collector     → OTLP JSON + x-tenant-id (var. B)
  ├─ Tem HTTP / webhook facil → /api/events (var. C)
  └─ Nada ainda               → Simular agora + agendar integracao SDK / OTLP
```

---

## 13. Codigo de referencia

| Peça | Caminho |
|------|---------|
| Ponte landing | `apps/landing/src/Onboarding.tsx`, `apps/landing/src/api.ts` |
| Onboard / conectar | `apps/server/src/public-onboard.ts` |
| Simular + events | `apps/server/src/eventos-nativos.ts` |
| Receptor OTLP | `apps/server/src/server.ts` (`POST /v1/traces`) |
| Traducao GenAI | `packages/contracts/src/otlp.ts` |
| Fixture demo | `scripts/fixtures/agencia-3-agentes.otlp.json` |

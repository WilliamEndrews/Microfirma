# Telemetria OTLP — runbook e criterios de aceite

Este documento descreve **o que ja funciona** no pipeline OTLP do MicroFirma e
como testa-lo localmente com a fixture GenAI + harness, sem depender de um
cliente agentico real.

Logica da ponte (codigo = `tenantId`, JWT vs OTLP, landing → Demo):
[`conexao-telemetria.md`](conexao-telemetria.md).

**Guia completo** (todas as variantes + o que configurar no sistema do cliente):
[`guia-conexao-cliente.md`](guia-conexao-cliente.md).

## Pipeline real (nao e stub)

```
POST /v1/traces (JSON)
  → traduzirLoteOtlp (@microfirma/contracts)
  → OtlpIngestor (@microfirma/world-engine)
  → OfficeSession.tick → WorldEngine.ingest
  → NarrativeScheduler (heat / incident / approval)
  → WebSocket /mundo → apps/demo (painter iso + Klimmos; HITL no painel)
```

| Peca | Status |
|------|--------|
| `traduzirSpan` / `traduzirLoteOtlp` | Funciona |
| `OtlpIngestor` | **Ja existe** — nao recriar |
| `POST /v1/traces` em `:8787` | Funciona, **so JSON** (nao protobuf) |
| Tenant demo padrao com OTLP | **Nao** — precisa `otlpEndpoint` no create |
| Heat / smoke / `waiting_approval` | Funciona via DomainEvents |
| Auto-reseed de layout ao descobrir agentes | **Feito** — `OfficeSession` remesha via `montarMundoIso` quando a assinatura do elenco muda |
| Canvas heat / smoke / fila / lixo / luz | **Cortado no Demo** neste ciclo (painter do lab). Continua no scheduler |
| `apps/debugpreview` | **Fora** deste pipeline (bancada; ver secao abaixo) |

## Contrato GenAI (o que o codigo le)

| Objetivo | Atributos / sinais |
|----------|--------------------|
| `agent.discovered` | `gen_ai.agent.id` e/ou `gen_ai.agent.name` (+ `gen_ai.agent.role` no enum: `researcher`, `analyst`, `finance`, …) |
| `tool.called` | `gen_ai.operation.name=tool` + `gen_ai.tool.name` |
| `llm.completed` | `gen_ai.operation.name=chat\|generate` |
| `approval.requested` | `human_approval.required` / `.id` / `.question` |
| `error.raised` | `status.code=2` + `exception.*` / `error.type` |
| Heat na mesa | `tool.called` com `ok=false` **ou** `error.raised` / `run.finished` nao-ok — **retries OK nao aquecem** |
| `lightBroken` / timeout | `error.type` (ou kind) contendo `timeout` / `5xx` — preferir `error.type: "timeout"`; `exception.type: "TimeoutError"` **nao** casa com o `includes('timeout')` do scheduler |
| Tenant | header `x-tenant-id` (resource `customer.id` e ignorado) |
| Endpoint | `http://127.0.0.1:8787/v1/traces` (nao `:4318`) |

`gen_ai.agent.role` deve ser um valor do enum `AgentRole` em
`packages/contracts`. O display name humano vai em `gen_ai.agent.name`
(ex.: `"Triador de Demandas"`).

## Bootstrap local

```powershell
# Terminal 1 — server
npx pnpm --filter @microfirma/server dev

# Terminal 2 — tenant com OtlpIngestor + .env.local do demo
.\scripts\setup-otlp-tenant.ps1

# Terminal 3 — demo apontando para esse tenant
npx pnpm --filter @microfirma/demo dev

# Terminal 4 — dispara a fixture
npm run telemetria:enviar
# ou o simulador Python (JSON, nao protobuf):
python scripts/test_agency_telemetry.py
```

Validacao offline da fixture (sem server):

```powershell
npm run telemetria:dry
```

Arquivos:

| Arquivo | Papel |
|---------|-------|
| [`scripts/fixtures/agencia-3-agentes.otlp.json`](../scripts/fixtures/agencia-3-agentes.otlp.json) | Lote OTLP/JSON canonico |
| [`scripts/enviar-telemetria-agencia.ts`](../scripts/enviar-telemetria-agencia.ts) | Harness: cria tenant se preciso, valida offline, POST |
| [`scripts/setup-otlp-tenant.ps1`](../scripts/setup-otlp-tenant.ps1) | Onboarding com `otlpEndpoint` + demo `.env.local` |
| [`scripts/test_agency_telemetry.py`](../scripts/test_agency_telemetry.py) | Simulador Python alinhado ao mesmo contrato |
| `scripts/fixtures/.otlp-tenant.json` | Meta local (tenantId/token) — gerado, nao versionar |

## Criterios de aceite (honestos)

**Passa se:**

1. Log do server: `[otlp] N eventos ingeridos` com `N > 0`
2. Tres `agent.discovered`: `agent_triador_01`, `agent_analista_02`, `agent_gerente_03`
3. `approval.requested` e ator do gerente em `waiting_approval`
4. Planta remeshada: 1 Boss + 2 privativos + 1 copa, mesas com os 3 `ownerAgentId`
5. Demo usa o painter iso (Klimmos, sit/facing, oclusao); **nao** exigir halo/fumaca

**Nao exigir neste passo:**

- Heat / pilha / luz / lixo / fumaca no canvas (cortados; voltam na camada de clima)
- Labels pixel-perfect dos display names no canvas
- `apps/debugpreview` reagindo a OTLP

## Remesh automatico da planta

`OfficeSession` compara a assinatura do elenco (`assinaturaElencoDe`) a cada
tick. Quando o `OtlpIngestor` descobre agentes novos, `montarMundoIso` gera
de novo 1 Boss + (N-1) privativos + 1 copa e o `officeId` muda, forcando o
Demo a reconstruir o painter. Zelador/tecnico nao ocupam sala.

## O que o script Python antigo do colaborador errava

| Proposta antiga | Realidade MicroFirma |
|-----------------|----------------------|
| `agent.id` / `agent.role` | `gen_ai.agent.id` / `gen_ai.agent.role` |
| `tool.name` | `gen_ai.operation.name=tool` + `gen_ai.tool.name` |
| retries OK = calor | calor so com `ok=false` / erro |
| `approval.required` | `human_approval.required` |
| `:4318` + protobuf | `:8787` + JSON |
| `customer.id` | `x-tenant-id` |
| criar `OtlpIngestor` | ja existe; falta tenant com `otlpEndpoint` |

O simulador em `scripts/test_agency_telemetry.py` ja usa o dialeto correto.

## Plano de testes do debugpreview (pipeline separado)

O debugpreview **nao** consome OTLP / WorldEngine / NarrativeScheduler. Ele e
um laboratorio isometrico com simulacao local (`SimulacaoAgentes` /
`SimulacaoTarefaEspecial`) + painter + Klimmos. Validar telemetria la e o
endereco errado.

### O que testar no debugpreview

```powershell
# Unit / integracao local (sem server)
npm run test:debugpreview

# Typecheck do app
cd apps/debugpreview; ..\..\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.json

# Manual — UI
npx pnpm --filter @microfirma/debugpreview dev
```

Checklist manual (apos as refinacoes Klimmos / oclusao / passeio):

1. **Sit** — agente sentado mais baixo que Idle/Walk; pe no tile
2. **Facing** — sem moonwalk; olha na direcao do deslocamento
3. **Passeio ocioso** — para em frente a impressora/armario/bebedouro, nao em cima do asset
4. **Tarefa especial** — nenhum ator parado com animacao `walking` por varios ticks
5. **Oclusao no corredor** — Wall L/R recortam o ator; piso da face **nao** fura o personagem nas encruzilhadas
6. **Dentro da sala** — ator na frente da mobilia (oclusao so no corredor)

### O que NAO misturar

| Sistema | Onde validar |
|---------|--------------|
| OTLP → DomainEvent → HITL / remesh de mesas | `server` + `demo` + scripts deste doc |
| Painter / Klimmos / oclusao / 1 Boss+copa no produto | `demo` (`@microfirma/iso-office`) |
| Gerar salas / tarefa especial / blueprint | `debugpreview` (oraculo, nao pipeline) |

## Scripts npm (raiz)

```powershell
npm run telemetria:dry      # valida fixture offline
npm run telemetria:enviar   # cria/usa tenant + POST /v1/traces
npm run test:debugpreview   # vitest do laboratorio isometrico
```

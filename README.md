# MicroFirma

**Plano de controle espacial para sistemas agenticos.**

MicroFirma transforma a telemetria de agentes AI (spans OpenTelemetry, eventos de SDK, webhooks) em um escritorio isometrico vivo, onde cada agente e um personagem animado, cada mesa reflete metricas operacionais (calor, fila, lixo), e cada incidente tem um endereco visual. O humano ve o sistema agentico funcionando - e pode intervir sem perder o contexto.

```
telemetria -> eventos de dominio -> Narrative Scheduler -> World Engine -> render
```

---

## Sumario

- [O que e](#o-que-e)
- [Arquitetura](#arquitetura)
- [Estrutura do repositorio](#estrutura-do-repositorio)
- [Requisitos](#requisitos)
- [Como rodar](#como-rodar)
- [Como testar](#como-testar)
- [Contratos](#contratos)
- [World Engine](#world-engine)
- [Narrative Scheduler](#narrative-scheduler)
- [Renderer](#renderer)
- [Servidor](#servidor)
- [Multi-tenant, Auth e RBAC](#multi-tenant-auth-e-rbac)
- [Auditoria](#auditoria)
- [Alertas](#alertas)
- [Aprovacao humana](#aprovacao-humana)
- [Onboarding](#onboarding)
- [Persistencia e Replay](#persistencia-e-replay)
- [Sistema de temas](#sistema-de-temas)
- [Agentes Arquiteto e Decorador](#agentes-arquiteto-e-decorador)
- [ADRs](#adrs)
- [Convencoes](#convencoes)
- [Roadmap](#roadmap)
- [Licenca](#licenca)

---

## O que e

MicroFirma e um **plano de controle espacial** para sistemas agenticos. Em vez de dashboards com graficos de linhas, o operador humano ve um escritorio 2.5D onde:

- **Cada agente AI e um personagem** que caminha, trabalha em sua mesa, vai para a sala de descanso, ou vai ate a porta quando precisa de aprovacao humana.
- **Cada mesa reflete o estado do agente**: calor (retries/loops), pilha de papel (profundidade de fila), sacos de lixo (runs concluidos nao coletados).
- **Cada sala tem ambiente proprio**: luz queimada indica erro 5xx, fumaca indica incidente ativo, penumbra indica apagao por orcamento.
- **KPIs globais** (runs ativos, custo em USD, tokens/min, erros, aprovacoes pendentes) sao exibidos no saguao e no painel lateral.
- **O humano pode intervir**: aprovar/rejeitar human-in-the-loop, pausar/retomar a simulacao, regenerar o escritorio com outra seed.

### Principio fundamental (ADR-0009)

O canvas **nunca** e a unica fonte de uma informacao. Tudo que ele mostra tem equivalente textual e acessivel no painel lateral. O escritorio e uma projecao visual do estado do sistema, nao o estado em si.

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Fontes de telemetria                          │
│  OpenTelemetry (OTLP/HTTP)  │  SDK events  │  Webhooks  │  Sintetico │
└──────────┬──────────────────┴───────────────┴───────────┴──────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  @microfirma/contracts - Eventos de dominio (zod)                    │
│  agent.discovered | run.started | run.finished | tool.called |       │
│  llm.completed | error.raised | approval.requested | queue.observed  │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  @microfirma/world-engine                                           │
│                                                                      │
│  OtlpIngestor ──> Narrative Scheduler ──> World Engine               │
│  (traduz OTLP)    (agrega eventos,    (cinematica, pathfinding,      │
│                    divida narrativa,    ambiente, KPIs)               │
│                    atencao)                                          │
│                                                                      │
│  planSpaceProgram ──> solveLayout ──> validarLayout                  │
│  (programa de         (geometria)     (invariantes)                   │
│   necessidades)                                                      │
│                                                                      │
│  themes.ts (paletas)  │  navgrid.ts (pathfinding A*)                 │
│  prng.ts (RNG seeded) │  agente-arquiteto.ts / agente-decorador.ts   │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  @microfirma/server                                                 │
│                                                                      │
│  TenantRegistry ──> OfficeSession (uma por tenant)                  │
│  AuditTrail      │  AlertEngine    │  Auth (JWT + RBAC)             │
│  server.ts (HTTP REST + WebSocket multi-tenant)                     │
└──────────┬──────────────────────────────────────────────────────────┘
           │  WebSocket (WorldSnapshot / WorldDelta a 10 Hz)
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  @microfirma/demo (React + Vite)                                    │
│                                                                      │
│  world-source.ts (WS client) ──> office-renderer-2d.ts (Canvas 2D)  │
│  sprite-factory.ts (sprites pre-renderizados)                       │
│  App.tsx (painel lateral + canvas + i18n pt-BR/en-US)              │
└─────────────────────────────────────────────────────────────────────┘
```

### Fluxo de dados

1. **Telemetria** entra por OTLP/HTTP, SDK, webhooks, ou gerador sintetico.
2. **OtlpIngestor** traduz spans OpenTelemetry em `DomainEvent` (a linguagem unica do sistema).
3. **Narrative Scheduler** agrega eventos, gerencia divida narrativa (`debtMs`), e decide quais fatos merecem ser encenados (intencao narrativa).
4. **World Engine** e autoritativo: processa intencoes, move atores no grid (pathfinding A*), projeta ambiente (calor, fila, lixo, luz, incidente), calcula KPIs, e produz `WorldSnapshot` (keyframe) ou `WorldDelta` (incremental) a cada tick.
5. **Servidor** difunde quadros via WebSocket a 10 Hz para todos os clientes do tenant. Comandos do cliente (aprovacao, pause, reseed) sao validados por zod na borda e protegidos por RBAC.
6. **Cliente (React)** renderiza o escritorio em Canvas 2D com sprites pre-renderizados, painel lateral acessivel, e controles de camera (zoom, pan, follow, reset).

---

## Estrutura do repositorio

```
microfirma/
├── package.json              # Raiz monorepo (pnpm workspace + turbo)
├── pnpm-workspace.yaml       # Declaracao dos workspaces
├── turbo.json                # Pipeline de build (turbo)
├── tsconfig.base.json        # Config TypeScript base (strict, ES2022)
├── tsconfig.json             # Config TypeScript raiz (typecheck)
│
├── packages/
│   ├── contracts/            # Fonte unica de tipos e schemas zod
│   │   ├── src/
│   │   │   ├── domain-events.ts   # Contrato 1: eventos de dominio (8 tipos)
│   │   │   ├── layout.ts          # Contrato 2: layout do escritorio
│   │   │   ├── world.ts           # Contrato 3: snapshot/delta do mundo
│   │   │   ├── wire.ts            # Contrato 4: protocolo cliente <-> servidor
│   │   │   ├── otlp.ts            # Tradutor OTLP -> DomainEvent
│   │   │   ├── replay.ts          # Formato NDJSON para gravacao/replay
│   │   │   ├── tenant.ts          # Contrato 5: tenant, auth, auditoria, alertas
│   │   │   └── index.ts           # Barrel export
│   │   └── scripts/
│   │       └── gen-jsonschema.ts  # Gerador de JSON Schema (cross-linguagem)
│   │
│   ├── world-engine/         # Motor de simulacao autoritativo
│   │   ├── src/
│   │   │   ├── world-engine.ts          # Engine principal (tick, snapshot, delta)
│   │   │   ├── narrative-scheduler.ts   # Agregacao de eventos, divida narrativa
│   │   │   ├── space-program.ts         # planSpaceProgram (programa de necessidades)
│   │   │   ├── layout-solver.ts         # solveLayout (geometria deterministica)
│   │   │   ├── layout-validation.ts     # validarLayout (invariantes geometricos)
│   │   │   ├── navgrid.ts              # Grid de navegacao + pathfinding A*
│   │   │   ├── prng.ts                 # PRNG deterministico (mulberry32 + fork)
│   │   │   ├── themes.ts               # 6 temas de decoracao + resolverPaleta()
│   │   │   ├── otlp-ingestor.ts        # Receptor OTLP -> DomainEvent
│   │   │   ├── agente-arquiteto.ts     # Interface + Deterministic + LLM scaffold
│   │   │   ├── agente-decorador.ts     # Interface + Deterministic + LLM scaffold
│   │   │   └── index.ts               # Barrel export
│   │   └── *.test.ts                   # Testes junto ao codigo
│   │
│   └── synthetic/            # Gerador de telemetria sintetica (modo demo)
│       └── src/
│           └── index.ts               # 7 agentes com perfis distintos
│
├── apps/
│   ├── server/               # Servidor multi-tenant (Node.js)
│   │   ├── src/
│   │   │   ├── server.ts               # HTTP REST + WebSocket multi-tenant
│   │   │   ├── office-session.ts       # Sessao por tenant (tick, snapshot, delta)
│   │   │   ├── tenant-registry.ts      # Mapa tenantId -> OfficeSession
│   │   │   ├── auth.ts                 # JWT HMAC-SHA256 + RBAC
│   │   │   ├── audit-trail.ts          # Log imutavel de acoes humanas
│   │   │   ├── alert-engine.ts         # Watchdog de KPIs (5 condicoes, 4 canais)
│   │   │   ├── session-player.ts       # Replay de SessionLog NDJSON
│   │   │   └── *.test.ts              # Testes junto ao codigo
│   │   └── package.json
│   │
│   └── demo/                 # Cliente web (React + Vite + Canvas 2D)
│       ├── src/
│       │   ├── App.tsx                 # Componente principal (painel + canvas)
│       │   ├── office-renderer-2d.ts   # Renderer Canvas 2D com sprites + camera
│       │   ├── sprite-factory.ts       # Pre-renderizacao de sprites isometricos
│       │   ├── world-source.ts         # Cliente WebSocket (snapshots + deltas)
│       │   ├── i18n.ts                 # Internacionalizacao (pt-BR, en-US)
│       │   ├── use-i18n.ts             # Hook de i18n
│       │   ├── style.css               # Estilos do painel e palco
│       │   └── main.tsx               # Entry point
│       └── package.json
│
└── docs/
    ├── roadmap.md            # Documento vivo: planejamento e status
    └── adr/
        └── 0010-renderer-canvas-2d.md  # Decisao: Canvas 2D na Fase 0
```

---

## Requisitos

- **Node.js** >= 20
- **pnpm** >= 9 (gerenciado via corepack: `corepack enable`)
- Navegador moderno (Chrome, Firefox, Edge, Safari)

---

## Como rodar

### Instalacao

```bash
corepack enable
corepack pnpm install
```

### Modo demo (cliente + servidor sintetico)

Em dois terminais:

```bash
# Terminal 1: servidor
corepack pnpm dev:server

# Terminal 2: cliente
corepack pnpm dev
```

O cliente abre em `http://localhost:5173` e conecta ao servidor em `ws://localhost:8787/mundo`.

### Modo OTLP (telemetria real)

```bash
MICROFIRMA_OTLP=1 corepack pnpm dev:server
```

O servidor passa a aceitar spans OpenTelemetry em `http://localhost:8787/v1/traces` (POST JSON). Configure seu SDK para exportar para este endpoint.

### Variaveis de ambiente

| Variavel | Default | Descricao |
| --- | --- | --- |
| `MICROFIRMA_PORT` | `8787` | Porta do servidor |
| `MICROFIRMA_SEED` | `20260802` | Seed do tenant demo |
| `MICROFIRMA_OTLP` | `0` | `1` ou `true` para modo OTLP |
| `MICROFIRMA_JWT_SECRET` | `microfirma-dev-secret-...` | Segredo do JWT (mudar em producao) |
| `MICROFIRMA_ONBOARDING_KEY` | (vazio) | Chave para criar tenants via API |

---

## Como testar

```bash
# Typecheck (tsc --noEmit)
corepack pnpm typecheck

# Suite completa (vitest)
corepack pnpm test

# Modo watch
corepack pnpm test:watch

# Gerar JSON Schemas (cross-linguagem)
corepack pnpm contracts:jsonschema
```

**Estado atual:** 191 testes, 16 arquivos, suite verde, typecheck limpo.

---

## Contratos

`@microfirma/contracts` e a **fonte unica de verdade** dos tipos do sistema. Qualquer pacote (frontend, engine, servico Python via schema gerado) fala esta linguagem e apenas esta. Duplicar uma definicao de tipo e considerado bug.

### 5 contratos

| # | Arquivo | O que define |
| --- | --- | --- |
| 1 | `domain-events.ts` | 8 tipos de evento de dominio (zod): `agent.discovered`, `run.started`, `run.finished`, `tool.called`, `llm.completed`, `error.raised`, `approval.requested`, `queue.observed` |
| 2 | `layout.ts` | Schema do `OfficeLayout`: grid, salas, props (mesas, sof, quadros, etc.), tema |
| 3 | `world.ts` | `WorldSnapshot` (keyframe completo) e `WorldDelta` (incremental): atores, mesas, salas, KPIs, chatter |
| 4 | `wire.ts` | Protocolo de transporte: `ServerMessage` (welcome, snapshot, delta, failure, approval, alert) e `ClientCommand` (resolve_approval, set_paused, reseed, ack_alert) |
| 5 | `tenant.ts` | Tenant, Plano (free/pro/enterprise), Papel (admin/operator/viewer), AuditEvent, AlertConfig, ApprovalContext |

### Regra de ouro (ADR-0002)

"Nenhum pixel sem fato." Todo elemento visual do escritorio nasce de um evento de dominio e guarda o `eventId` de origem, para que o usuario possa sempre navegar do pixel de volta ao trace real.

### Privacidade (ADR-0007)

Eventos **nao** carregam conteudo de prompt/resposta por padrao. Apenas forma e numeros: duracao, tokens, custo, status, nome de ferramenta.

---

## World Engine

`@microfirma/world-engine` e o motor de simulacao **autoritativo** (ADR-0006). Roda no servidor. O navegador apenas renderiza o que recebe.

### Componentes

- **`WorldEngine`**: processa intencoes narrativas, move atores no grid com pathfinding A* (`navgrid.ts`), projeta ambiente (calor, fila, lixo, luz, incidente), calcula KPIs, e produz snapshots/deltas a cada tick. **Deterministico**: mesma seed + mesmos eventos = mesmo mundo.

- **`NarrativeScheduler`**: o coracao do produto. Agrega eventos brutos em intencoes narrativas (ex.: 15 `run.started` em 2s vira uma intencao `work`). Gerencia **divida narrativa** (`debtMs`): se o mundo esta atrasado em relacao aos eventos reais, o tempo narrativo acelera; se esta adiantado, desacelera. Tem **orcamento de atencao**: incidentes ganham prioridade sobre cotidiano quando o operador tem pouco tempo.

- **`planSpaceProgram`**: gera o **programa de necessidades** (quais salas, quais agentes em cada sala, adjacencias) a partir dos agentes descobertos. **Nao gera coordenadas** (ADR-0004) - isso e trabalho do solver.

- **`solveLayout`**: transforma o programa de necessidades em **geometria concreta** (grid, retangulos de salas, posicoes de props). Deterministico por seed.

- **`validarLayout`**: checa invariantes geometricos (salas nao se sobrepoem, todas tem porta, mesas sao acessiveis, perimetro e fechado). Se o layout e invalido, o servidor **nao sobe** - falhar alto e cedo.

- **`OtlpIngestor`**: traduz spans OpenTelemetry (JSON) em `DomainEvent`. Nada a jusante conhece OpenTelemetry.

- **`prng.ts`**: PRNG deterministico (mulberry32) com `fork(seed)` para derivar sub-streams independentes. Mesma seed = mesmo mundo, sempre.

---

## Renderer

`apps/demo/src/office-renderer-2d.ts` renderiza o escritorio em **Canvas 2D** (nao WebGL - ver ADR-0010).

### Fase 2: Sprites pre-renderizados (ADR-0008)

A Fase 2 substituiu o desenho vetorial (`caixaIso()`/`fill()`) por **sprites pre-renderizados** via `drawImage()`:

- **`sprite-factory.ts`**: pre-renderiza cada tipo de mobiliario (mesa, sofa, quadro, impressora, medidor, maquina de cafe, planta, lampada) e cada cor de ator em canvas offscreen a **2x supersampling**. Cada sprite tem:
  - Gradiente radial no topo (luz incidindo do topo-esquerda)
  - Gradiente linear nas faces laterais (face clara/escura)
  - Sombra com `blur(3px)` abaixo da base
  - Ambient occlusion na base
  - Highlights de borda
  - Detalhes especificos: monitor com brilho azul, display com numeros, vapor na maquina de cafe, folhagem multicamada na planta

- **Renderer theme-aware**: todas as cores vem da `PaletaResolvida` do tema do layout, nao de constantes hardcoded. Trocar tema = regenerar sprites, nao reescrever renderer.

### Camera e navegacao

- **Zoom** (scroll wheel): centrado no cursor, range 0.4x a 4x
- **Pan** (drag): arrastar move a camera; pan cancela seguimento
- **Seguir agente**: `focusAgent(id)` faz a camera seguir suavemente (interpolacao a 8% por frame)
- **Reset** (duplo-clique ou botao): volta ao zoom 1x, pan zero

### Acessibilidade (ADR-0009)

O canvas **nunca** e a unica fonte de informacao. O painel lateral exibe:
- KPIs globais (runs ativos, custo, tokens/min, erros, aprovacoes)
- Orcamento diario (USD)
- Lista de atores com papel, framework, saude
- Historico textual de eventos recentes
- Tudo em pt-BR ou en-US (i18n)

---

## Servidor

`@microfirma/server` e o processo de servidor. Na Fase 3, foi overhauled para **multi-tenant** com auth, RBAC, auditoria e alertas.

### Arquitetura

- **`TenantRegistry`**: mapa `tenantId -> OfficeSession`. Cada tenant tem sua propria sessao, seu proprio OtlpIngestor (se o plano suporta OTLP), suas propias violacoes de layout. Isolamento total: dados de uma empresa nunca vazam para outra.
- **`OfficeSession`**: encapsula o WorldEngine, a fonte de eventos, o gravador de replay, e o ciclo de tick/snapshot/delta. Uma por tenant.
- **`server.ts`**: roteamento HTTP REST + WebSocket multi-tenant. O laco autoritativo itera sobre todas as sessoes ativas, faz tick, difunde quadros por broadcast por tenant, e avalia alertas.

### Endpoints REST

| Metodo | Rota | Auth | Descricao |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | Publico | Emite JWT |
| `POST` | `/api/tenants` | Admin ou API key | Cria tenant (onboarding) |
| `GET` | `/api/tenants` | Admin | Lista tenants |
| `GET` | `/api/tenants/:id` | Admin ou proprio tenant | Detalhes do tenant |
| `DELETE` | `/api/tenants/:id` | Admin | Remove tenant |
| `POST` | `/api/tenants/:id/alerts` | Admin ou operator | Configura alerta |
| `GET` | `/api/tenants/:id/alerts` | Admin ou operator | Lista alertas |
| `GET` | `/api/tenants/:id/audit` | Admin ou operator | Trilha de auditoria |
| `GET` | `/health` | Publico | Saude do servidor |
| `POST` | `/v1/traces` | Header `x-tenant-id` | Receptor OTLP/HTTP |

### WebSocket

```
ws://localhost:8787/mundo?token=<JWT>
```

O token JWT e obrigatorio. Sem token = close 4001. Token invalido = close 4001. Tenant inexistente = close 4004. O `tenantId` do token determina qual sessao o cliente conecta.

---

## Multi-tenant, Auth e RBAC

### JWT

- Algoritmo: HMAC-SHA256 (nativo do Node, sem dependencias externas)
- Expiracao: 24h
- Segredo: env var `MICROFIRMA_JWT_SECRET`
- Anti-timing-attack: comparacao em tempo constante na verificacao

### RBAC

3 papeis com permissoes declarativas:

| Permissao | Admin | Operator | Viewer |
| --- | --- | --- | --- |
| Aprovar/rejeitar | Sim | Sim | Nao |
| Pausar/retomar | Sim | Sim | Nao |
| Reseed | Sim | Nao | Nao |
| Gerenciar tenant | Sim | Nao | Nao |
| Ver auditoria | Sim | Sim | Nao |

### Planos

| Limite | Free | Pro | Enterprise |
| --- | --- | --- | --- |
| Agentes max | 5 | 50 | 500 |
| Ticks/s | 10 | 10 | 20 |
| Retencao | 7 dias | 30 dias | 365 dias |
| OTLP | Nao | Sim | Sim |
| Alertas | Nao | Sim | Sim |
| Auditoria | Nao | Sim | Sim |

---

## Auditoria

`apps/server/src/audit-trail.ts` mantem um log **imutavel** de acoes humanas. Cada registro carrega:

- `auditId`: UUID unico
- `tenantId`: qual tenant
- `userId`: quem fez
- `action`: o que fez (11 tipos: `approval.granted`, `approval.rejected`, `session.paused`, `session.resumed`, `session.reseeded`, `tenant.created`, `tenant.updated`, `tenant.deleted`, `user.invited`, `user.removed`, `alert.acknowledged`)
- `ts`: quando (epoch ms)
- `details`: contexto da acao (agentId, seed, reason, etc)
- `result`: `success` ou `failure`

Ring buffer de 10.000 eventos por tenant. Consulta via `GET /api/tenants/:id/audit` com filtro de acao e limite.

---

## Alertas

`apps/server/src/alert-engine.ts` e um watchdog que avalia KPIs a cada N ticks e dispara notificacoes.

### 5 condicoes

| Condicao | Dispara quando |
| --- | --- |
| `agent_failing` | Erros nos ultimos 5 min > threshold |
| `budget_exceeded` | Custo diario >= orcamento diario |
| `approval_pending_long` | Aprovacao pendente ha mais de `windowSeconds` |
| `error_rate_high` | Erros nos ultimos 5 min > threshold |
| `agent_discovered` | Novo agente descoberto (disparado por evento) |

### 4 canais

| Canal | Como |
| --- | --- |
| `webhook` | POST JSON para `targetUrl` |
| `slack` | POST JSON (formato Slack Incoming Webhook) para `targetUrl` |
| `pagerduty` | POST JSON (Events API v2) para `targetUrl` |
| `email` | Delegado para sender injetado (nodemailer em producao) |

Debounce por janela configuravel. Entrega assincrona (nao bloqueia o tick). Falha de entrega loga mas nao derruba o servidor.

---

## Aprovacao humana

A Fase 3 transformou `waiting_approval` de apenas visual em **acionavel**:

- **`ApprovalContext`** no wire protocol carrega: `agentId`, `agentDisplayName`, `question`, `summary`, `waitingSeconds`, `runCostUsd`, `runTokens`. O humano ve o contexto completo, nao so "aprove".
- **`ApprovalNotification`** e enviada no handshake e quando um agente entra em `waiting_approval`.
- **RBAC**: so admin e operator podem aprovar/rejeitar. Viewer nao.
- **Auditoria**: toda aprovacao (concedida ou rejeitada) e registrada no AuditTrail.

---

## Onboarding

O onboarding self-service permite que uma empresa se cadastre e tenha seu escritorio rodando sem intervencao manual:

```bash
# Criar tenant (precisa de admin token ou MICROFIRMA_ONBOARDING_KEY)
curl -X POST http://localhost:8787/api/tenants \
  -H "Content-Type: application/json" \
  -H "x-api-key: $MICROFIRMA_ONBOARDING_KEY" \
  -d '{"displayName": "Acme Corp", "plano": "pro", "seed": 12345, "otlpEndpoint": "http://localhost:4318"}'

# Resposta: { tenant: {...}, token: "eyJ..." }
```

O token retornado e JWT admin para o novo tenant. O cliente conecta via:

```
ws://localhost:8787/mundo?token=<JWT>
```

---

## Persistencia e Replay

### Formato SessionLog (NDJSON)

`@microfirma/contracts/src/replay.ts` define o formato de gravacao:

- **Header** (linha 1): `sessionId`, `seed`, `tickMs`, `protocolVersion`, `gravadoEm`
- **Tick records** (linhas subsequentes): `tick`, `eventos[]`, `quadro` (snapshot ou delta)

### Gravacao

`OfficeSession` aceita `gravarEm: NodeJS.WritableStream` no construtor. Cada tick e gravado em NDJSON.

### Replay

`apps/server/src/session-player.ts` le o NDJSON e reproduz os quadros deterministicamente. Iteravel com `for-of`. Suporta filtragem por intervalo de ticks.

### Determinismo

O WorldEngine e **deterministico**: mesma seed + mesmos eventos = mesmo mundo. O replay reproduz exatamente o que aconteceu, nao uma aproximacao.

---

## Sistema de temas

`packages/world-engine/src/themes.ts` define **6 temas** de decoracao:

| Tema | Paleta | Estilo |
| --- | --- | --- |
| `nordic-calm` | Tons neutros | Versatil, limpo |
| `warm-studio` | Tons quentes | Criativo, acolhedor |
| `cool-lab` | Tons frios | Preciso, tecnologico |
| `forest-deep` | Verdes profundos | Natural, organico |
| `sunset-loft` | Tons de por do sol | Artistico, aquecido |
| `midnight-ops` | Tons escuros | Operacional, noturno |

`resolverPaleta(tema)` deriva todas as cores do renderer (piso por tipo de sala, paredes, mobilia, atores, penumbra, perigo) a partir das 4 cores base do tema. Trocar tema = regenerar sprites, nao reescrever renderer.

---

## Agentes Arquiteto e Decorador

### Arquiteto (ADR-0004/0005)

`packages/world-engine/src/agente-arquiteto.ts` define a interface `AgenteArquiteto`:

- **`DeterministicArchitect`**: usa `planSpaceProgram` diretamente. Sempre funciona, sem custo, sem rede. E o fallback.
- **`LlmArchitect`**: injeta `chamarLlm(prompt)` (dependency injection). Monta prompt com regras de negocio + agentes + colaboracao. Valida resposta contra schema zod. Se invalido/erro: cai para deterministico. **O LLM nunca gera coordenadas** (ADR-0004) e **nunca esta no caminho critico** (ADR-0005).

### Decorador

`packages/world-engine/src/agente-decorador.ts` define a interface `AgenteDecorador`:

- **`DeterministicDecorator`**: escolhe tema por seed (RNG seeded).
- **`LlmDecorator`**: injeta `chamarLlm(prompt)`. Monta prompt com papeis dos agentes e sugestao baseada em dominio (financeiro -> cool-lab, pesquisador -> warm-studio, etc). Valida paleta (4 cores hex), greenery (0..1). Invalido -> fallback.

---

## ADRs

| ADR | Assunto | Status |
| --- | --- | --- |
| 0004 | LLM nunca gera coordenadas | Vigente |
| 0005 | LLM como enfeite, nunca dependencia critica | Vigente |
| 0006 | Simulacao autoritativa no servidor; browser e terminal | Vigente |
| 0007 | Eventos nao carregam conteudo de prompt/resposta (privacidade) | Vigente |
| 0008 | Sprites pre-renderizados em 3D na Fase 2 | Vigente |
| 0009 | Canvas nunca e fonte unica de informacao (acessibilidade) | Vigente |
| 0010 | Renderer Canvas 2D na Fase 0 (sem GPU) | Escrito: `docs/adr/0010-renderer-canvas-2d.md` |

---

## Convencoes

- **Codigo em portugues, sem acentos** (ASCII-only). Identificadores, comentarios e mensagens.
- **`@microfirma/contracts`** e a unica fonte de tipos. Duplicar um tipo e bug.
- **Nenhuma informacao pode existir SOMENTE no canvas** (ADR-0009).
- **O LLM nunca gera coordenadas** (ADR-0004) e **nunca esta no caminho critico** (ADR-0005).
- **Testes junto ao codigo**: arquivos `*.test.ts` ao lado do modulo que testam.
- **TypeScript strict**: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`.
- **Monorepo**: pnpm workspaces + turbo. Pacotes se referenciam via `workspace:*`.

---

## Roadmap

O roadmap completo vive em `docs/roadmap.md` e e o documento vivo do projeto.

### Status atual

| Fase | Status | Resumo |
| --- | --- | --- |
| **Fase 0** - Demonstracao sintetica | Concluida | Contratos, engine, renderer 2.5D, painel acessivel, gerador sintetico |
| **Fase 1** - Fundacao de produto | Concluida | Servidor autoritativo (WS), OTLP/HTTP, i18n, schema cross-linguagem, persistencia/replay |
| **Fase 2** - Fidelidade visual e escala | Concluida | Sprites pre-renderizados, temas, camera (zoom/pan/follow/reset), arquiteto/decorador (LLM scaffold) |
| **Fase 3** - Produto | Concluida | Multi-tenant, JWT+RBAC, auditoria, alertas (Slack/PagerDuty), aprovacao acionavel, onboarding self-service |

### Proxima fase

Fase 3 esta concluida. O proximo passo e definido em `docs/roadmap.md` na secao "Sequenciamento recomendado".

---

## Entregas do roadmap (7 frentes recentes)

As frentes abaixo foram implementadas e refletidas nos commits da main. Todos os pontos passaram por `typecheck` e `test`.

### 1. S3 para replay
- `apps/server/src/replay-storage.ts` — abstracao `ReplayStorage` com `DiskReplayStorage` e `S3ReplayStorage`.
- `apps/server/src/server.ts` — gravacao, download e carregamento de replays via storage.
- `apps/server/src/replay.test.ts` — testes ajustados.

### 2. Autenticacao real com JWT expirante
- `apps/server/src/auth.ts` — reescrito com `jose`: access token, refresh token, revogacao e RBAC.
- `apps/server/src/server.ts` — endpoints `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` e protecao de rotas.
- `apps/server/src/auth.test.ts` — testes de emissao, verificacao, refresh e revogacao.

### 3. Teste de carga via HTTP real
- `scripts/load-test.ts` — concorrencia, duracao, carga, envs e relatorio JSON.
- `package.json` — script `load-test`.

### 4. Deploy em nuvem
- `fly.toml` — configuracao para Fly.io.
- `docs/deploy.md` — runbook com Fly.io e Railway.

### 5. Metricas Prometheus
- `apps/server/src/metrics.ts` — registry leve de metricas em formato Prometheus.
- `apps/server/src/server.ts` — endpoint `/metrics` e contadores de requests/ticks/tenants.
- `apps/server/src/metrics.test.ts` — testes do exposition format.

### 6. Alertas reais (webhook/Slack/PagerDuty)
- `apps/server/src/alert-engine.ts` — entrega real por webhook, Slack, PagerDuty e email.

### 7. Refinamento do dashboard com historico
- `apps/demo/src/App.tsx` — componente `Sparkline` e secao `Historico`.
- `apps/demo/src/i18n.ts` — chaves `dashboard.historico` em `pt-BR`, `en-US` e `es-ES`.
- `apps/demo/src/style.css` — estilos do historico e sparkline.

---

## Licenca

Privado. Todos os direitos reservados.

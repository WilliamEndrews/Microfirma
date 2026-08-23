# MicroFirma - BACKUP DE CONTEXTO

> Documento de resgate de contexto. Destinado a qualquer pessoa ou agente que
> precise retomar o projeto sem relembrar toda a conversa de implementacao.
> Ultima atualizacao: 2026-08-23.

---

## 1. O que e a MicroFirma

**MicroFirma** e um plano de controle espacial para sistemas agenticos.

Em vez de dashboards tabulares, o produto projeta o estado de uma frota de
agentes autonomos como um escritorio isometrico 2.5D vivo. Cada agente e um
personagem, cada mesa reflete metricas operacionais (fila, calor, lixo), cada
sala tem ambiente proprio (luz, energia, fumaca) e cada incidente tem um
endereco visual.

A proposta de valor nao e "mais bonito". E **densidade cognitiva**: um humano
avalia 40 agentes num escritorio em ~2 segundos; numa tabela leva minutos. A
metfora espacial explora atencao pre-atentiva e memoria espacial do cerebro.

Fluxo de dados de alto nivel:

```
telemetria -> eventos de dominio -> Narrative Scheduler -> World Engine -> render
```

### Categoria e concorrencia

- **Concorrentes diretos**: Langfuse, LangSmith, Arize Phoenix, Braintrust,
  AgentOps.
- **Diferencial da MicroFirma**: bidirecionalidade (observar E agir) dentro de
  uma metfora espacial unica. O HITL (human-in-the-loop) acontece no proprio
  espaco: o agente bate na porta, o humano aprova, o agente volta.

## 2. Regras de ouro

1. **Nenhum pixel sem fato** (ADR-0002).
   Todo elemento visual deriva de um evento de dominio verificavel. O canvas
   nao inventa informacao; ele projeta fatos. Clicar em um pixel deve ser
   capaz de levar ao span/evento que o originou.

2. **LLM escreve o programa, nao o desenho** (ADR-0004).
   O LLM (Arquiteto) emite um PROGRAMA DE NECESSIDADES: zonas, adjacencias,
   privacidade, tema. Um solver determinista gera a geometria concreta. Isso
   evita salas sobrepostas, corredores sem saida e layouts irreprodutiveis.

3. **Simulacao autoritativa no servidor** (ADR-0006).
   O `WorldEngine` roda no servidor. O browser e um terminal. Dois usuarios do
   mesmo tenant vem o mesmo mundo; replays sao reproduziveis byte a byte.

4. **Privacidade por padrao** (ADR-0007).
   Eventos carregam forma e numeros (duracao, tokens, custo, status), nunca o
   conteudo de prompts ou respostas. PII e redigido no OTel Collector do
   cliente antes de sair.

5. **LLM nas bordas, codigo no loop.**
   Comportamento de alto nivel (layout, tema, relatorios) usa LLM. Tick a
   tick, pathfinding, behavior trees e validacao sao codigo puro. Nao se chama
   LLM por evento de agente.

6. **Tempo real e tempo do mundo sao independentes** (ADR-0001).
   O `NarrativeScheduler` traduz eventos de `t_real` em encenacoes de
   `t_mundo`, respeitando um orcamento de atencao. O produto nao quebra sob
   rajadas de milhares de eventos.

## 3. Arquitetura geral

```
CLIENTE
  OTLP (OpenTelemetry) · SDK enriquecedor (opcional) · A2A Card · MCP
          |
          | OTLP/gRPC + mTLS
          ▼
INGEST
  OTel Collector (edge) → Kafka/Redpanda → Normalizador
          |
          ▼
SEMANTIC CORE
  Event Store · Modelo de dominio · Grafo de colaboracao · CQRS
          |
          ▼
WORLD ENGINE (autoritativo, headless, deterministico)
  NarrativeScheduler · Simulacao ECS 10 Hz · Pathfinding · Behavior Trees
          |
          ▼
EDGE
  WebSocket/WebTransport → snapshot + delta
          |
          ▼
CLIENTE WEB
  React + Vite → Canvas 2D (Fase 0) → PixiJS v8 (Fase 2)
```

### Camadas importantes no repositorio

| Pacote | Responsabilidade | Tech |
| --- | --- | --- |
| `@microfirma/contracts` | Tipos, schemas zod, contratos de wire, OTLP | zod, ajv |
| `@microfirma/world-engine` | NarrativeScheduler, WorldEngine, layout, pathfinding | TS puro |
| `@microfirma/synthetic` | Gerador sintetico de eventos para testes | TS puro |
| `@microfirma/server` | HTTP, WebSocket, multi-tenant, auth, alertas | ws, jose, aws-sdk |
| `@microfirma/demo` | Canvas 2.5D + painel lateral React | Vite, React, Canvas 2D |
| `@microfirma/debugpreview` | Bancada: biblia do lab -> agencia visual | Vite, React, Canvas 2D |
| `@microfirma/landing` | Landing page 3D com transicao cinematografica | Vite, React, Three.js |

## 4. ADRs (Architecture Decision Records)

Arquivos em `docs/adr/`:

| ADR | Assunto | Status | Arquivo |
| --- | --- | --- | --- |
| 0001 | Motor de tempo narrativo | Aceita | `0001-tempo-narrativo.md` |
| 0002 | Nenhum pixel sem fato | Aceita | `0002-pixel-sem-fato.md` |
| 0003 | Fonte unica de verdade em eventos | Aceita | `0003-fonte-de-verdade-em-eventos.md` |
| 0004 | LLM nunca gera coordenadas | Vigente | citado em `space-program.ts` |
| 0005 | LLM como enfeite, nunca dependencia critica | Vigente | citado em `space-program.ts` |
| 0006 | Simulacao autoritativa no servidor | Vigente | citado em `world-engine.ts` |
| 0007 | Privacidade por padrao | Aceita | `0007-privacidade-por-padrao.md` |
| 0008 | Sprites pre-renderizados em 3D (Fase 2) | Vigente | citado em `office-renderer-2d.ts` |
| 0009 | Canvas nunca e fonte unica de informacao | Vigente | `apps/demo/src/App.tsx` |
| 0010 | Renderer Canvas 2D na Fase 0 | Aceita | `0010-renderer-canvas-2d.md` |
| 0011 | Internacionalizacao pt-BR/en-US/es-ES | Vigente | `0011-internacionalizacao.md` |

**Nota**: ADR-0001 a 0003 e 0007 tinham registro pendente no `docs/roadmap.md`. Os
arquivos foram confirmados em `docs/adr/`. ADR-0004, 0005, 0006, 0008 e 0009
ainda nao tem arquivos fisicos, so citacoes no codigo.

## 5. O que ja esta feito

### Fase 0 - Demonstracao sintetica

- Contratos (`packages/contracts`): `DomainEvent`, `OfficeLayout`,
  `WorldSnapshot`, `WorldDelta`, `WorldKpis`.
- `planSpaceProgram` + `solveLayout`: geracao determinista de escritorio por
  seed, com `validarLayout` checando invariantes.
- `NarrativeScheduler`: agregacao, divida narrativa, orcamento de atencao.
- `WorldEngine`: cinematica, pathfinding A*, ambiente (calor, fila, lixo,
  luz queimada, apagao).
- Gerador sintetico (`packages/synthetic`): 7 agentes de demo emitindo os
  mesmos tipos de evento do OTLP real.
- Renderer 2.5D (`apps/demo/src/office-renderer-2d.ts`): projecao dimetrica
  2:1, sprites, penumbra, luzes aditivas.
- Painel acessivel (`App.tsx`): KPIs, orcamento, lista de atores, historico.

### Fase 1 - Producao

- `OfficeSession` pura sem rede (`apps/server/src/office-session.ts`).
- Servidor WebSocket (`apps/server/src/server.ts`) multi-tenant, 10 Hz,
  receptor OTLP/HTTP `/v1/traces`.
- Adaptador OTLP->`DomainEvent` (`packages/contracts/src/otlp.ts`) e
  `OtlpIngestor` (`packages/world-engine/src/otlp-ingestor.ts`).
- i18n (`apps/demo/src/i18n.ts`) em pt-BR, en-US, es-ES.
- JSON Schema cross-linguagem (`packages/contracts/scripts/gen-jsonschema.ts`).
- Replay em NDJSON (`packages/contracts/src/replay.ts`) com `SessionPlayer`.

### Fase 2 - Fidelidade visual e escala

- Sprites pre-renderizados (`apps/demo/src/sprite-factory.ts`) e temas
  (`packages/world-engine/src/themes.ts`).
- Camera: zoom, pan, follow, reset.
- `AgenteArquiteto` e `AgenteDecorador` com fallback deterministico.

### Fase 3 - Produto

- Multi-tenant (`apps/server/src/tenant-registry.ts`).
- Auth JWT + RBAC (`apps/server/src/auth.ts`).
- Auditoria (`apps/server/src/audit-trail.ts`).
- Motor de alertas com 5 condicoes e 4 canais (`apps/server/src/alert-engine.ts`).
- HITL acionavel (`ApprovalContext`, `ApprovalNotification`).
- Onboarding self-service via REST.
- 191 testes passando na Fase 3.

### 7 frentes extras implementadas (agosto/2026)

1. **S3 para replay** (`apps/server/src/replay-storage.ts`)
2. **Autenticacao real com JWT expirante** (`apps/server/src/auth.ts` com `jose`)
3. **Teste de carga HTTP real** (`scripts/load-test.ts`)
4. **Deploy em nuvem** (`fly.toml`, `docs/deploy.md`)
5. **Metricas Prometheus** (`apps/server/src/metrics.ts`)
6. **Alertas reais** (`apps/server/src/alert-engine.ts`)
7. **Dashboard com historico** (`apps/demo/src/App.tsx`, `Sparkline`)
8. **Landing page 3D** (`apps/landing/`) — quarto branco, vultos, transicao
   cinematografica para a demo

**Testes atuais**: `pnpm typecheck` limpo. `pnpm test` = 218 testes, 20 arquivos, 0 falhas.

### Frente de refinamento visual (agosto/2026)

1. **Migracao para TinyHouse pack** (`assets-source/TinyHouse`): pack 0.17 do
   Pixel_Salvaje extraido e renomeado (original tinha `@` e parenteses no nome).
   Tornou-se a fonte primaria de assets estruturais e de escritorio. Contem:
   `Office`, `Desks`, `Chairs`, `Computer`, `Floor_Wall_Tiles_128/64/32`,
   `Doors`, `Plants`, `Books`, `Carpets`, `Lamp`, `Sofa`, `Windows`,
   `Bathroom`, `Kitchen`, etc.
2. **Projecao nativa TinyHouse** (`apps/demo/src/projecao.ts`): `PX_POR_CELULA=128`,
   `LARGURA_TILE=128`, `ALTURA_TILE=64`, `ALTURA_PERSONAGEM=96`. Substituiu a
   projecao anterior de 44x22. Tiles de piso/parede blitados nativamente.
3. **Tiles de piso e parede pelo atlas**: `Wall_L_128` (oeste), `Wall_R_128`
   (norte), floor tiles 128x128. Oclusao por construcao: apenas arestas norte
   e oeste recebem parede; sul e leste sao omitidas para manter o interior
   visivel sem parede translucida.
4. **Recorte de parede** (`comRecorte` em `office-renderer-2d.ts`): clip de
   canvas limita a largura das paredes a extensao exata do piso da sala,
   impedindo que a laje de 8px do tile de parede transborde para fora do chao.
5. **Porta sobreposta como objeto**: a porta do TinyHouse e um retangulo
   frontal, incompativel com o paralelogramo inclinado de Wall_L/Wall_R. Em vez
   de substituir o tile de parede, a parede e desenhada normalmente e a porta
   e sobreposta como objeto ancorado pelo centro-inferior (`spriteDeAsset` +
   `desenharObjetoPorta`).
6. **Salas mais quadradas**: grid baseado em `maxPorFaixa` (max de zonas por
   faixa norte/sul), nao no total de zonas. Corredor centralizado em
   `floor(H/2)`. Cap de largura por sala em `alturaFaixa + 1`, com excecao para
   acomodar N agentes (`2N + 1`). Celulas nao alocadas viram corredor (piso).
7. **Cenarios de demo**: `?agents=1` (1 agente, 1 escritorio, 1 copa) e
   `?agents=2` (2 agentes, 2 escritorios, 1 copa). Elencos customizados em
   `world-source.ts`.
8. **Supressao de procedural para kinds com asset**: `PROP_KINDS_COM_ASSET` e
   `DECOR_KINDS_COM_ASSET` em `sprite-factory.ts` - se o asset falha ao
   carregar, retorna placeholder transparente em vez de forma geometrica.
9. **Estantes na parede do fundo**: movidas de `frenteY` (conflitava com
   cadeiras em salas compactas) para `fundoY` (parede oposta a porta).
10. **Espacamento de mesas adaptativo**: 3 celulas em salas largas, 2 em salas
    pequenas (<=5) para garantir que todos os agentes tenham mesa.

### Fase 3.5 - Laboratorio, Construtor e Debugpreview (2026-08-23)

Evolucao central da frente visual: o laboratorio deixou de ser so calibracao
e passou a alimentar o Construtor; o Debugpreview valida o empacote sem
comprometer o blit que o olho ja aprovou.

1. **Laboratorio TinyHouse persistente** (`pnpm lab:iso`):
   `scripts/iso-validation/lab-server.mjs` serve o pack e expoe
   `POST /api/temas-arquiteto`. A biblia vive em
   `packages/world-engine/src/biblia/temas-arquiteto.json` (temas por
   `zonaKind`, grade, tileset, palco, calibracao, `politicaTiles`).
2. **Calibracao oficial** (`apps/demo/src/calibracao-tinyhouse.json` +
   `projecao.ts`): ancora de piso (64, 68), pe de parede, folga da porta.
   Teste de round-trip em `projecao.test.ts`.
3. **Construtor da biblia** (`construtor-biblia.ts`): `escolherTema`,
   `gradeDoProto`, `visualDoProto`, `resolverTilesetZona`, `colarProto`.
   Corredor respeita politica `unico` → piso Concrete / tileset `cool-lab`.
4. **Faces de parede** (`emitir-paredes.ts`, `face-corredor.ts`): o solver
   pode emitir `WallFace[]` (oeste Wall_L, face do corredor glass, porta
   como folha). A demo ainda pode blit NW quando `walls` esta vazio.
5. **`solveLayout` cola ProtoComodos**: salas dimensionadas pela grade real
   do tema escolhido; props/wallMounts vindos do palco (com espelho Y na
   faixa norte no caminho de produto).
6. **Debugpreview** (`apps/debugpreview`, `pnpm dev:debugpreview`):
   - Dashboard: salas, copas, Gerar, Resetar.
   - `selecionarPedido` escolhe protos (prioridade + `unicoNaAgencia`).
   - `montarAgencia` empacota grades reais (3x3, 4x3, 5x3…) em faixas N/S
     com espinha e gaps de corredor Concrete — **sem** `solveLayout` /
     `emitirParedes` / `colarProto` no preview.
   - `desenharProtoEm` reutiliza o blit completo do lab por slot; assim a
     sala nao e cortada por parede no meio nem perde `qx/qy/passo/camadas`.

## 6. O que ainda falta (proximos passos)

### Refinamento visual em andamento

- **Aceite visual** em `?agents=7` e no Debugpreview (seam, escala, metragem).
- **Variedade por seed no atlas**: hoje o ultimo asset de cada `kind` vence.
- **Promover combos** do laboratorio (`combinacoes-laboratorio.json`) e a
  intencao obrigatorio/aleatorio/off para o solver, sem quebrar invariantes.
- **Alinhar preview e produto** quando fizer sentido: o Debugpreview
  preserva o proto intacto; o caminho demo/solver ainda espelha faixa norte
  e pode emitir vidro no corredor — evolucao consciente, nao regressao.
- **Meter** ainda sem PNG de repouso no TinyHouse.
- **Expandir catalogo TinyHouse** conforme aceite humano (variantes de mesa,
  parede, decoracao).

### Producao e escala

- **Observabilidade produtiva:** conectar `/metrics` a Prometheus/Grafana,
  tracar via collector OTLP real (Jaeger/Tempo), logs estruturados.
- **Resiliencia e testes de carga:** cenarios longos, chaos tests, failover de
  S3/replay.
- **SLOs e custo:** definir latencia/tick, budget burn rate, auto-shutdown.
- **Multi-tenant real:** namespaces, rate limit, isolamento de rede.
- **CI/CD:** GitHub Actions com typecheck/test/build/deploy canario no Fly.
- **Air-gapped / VPC / SaaS:** modos de deployment, Helm, SOC2 prep.
- **LOD semantico e escala para 5.000 agentes:** agregacao visual por
  proximidade, campus -> predio -> andar -> sala -> mesa.
- **Modo executivo / NOC wallboard:** visual sobrio, exportacao de video
  server-side, narrador automatico de incidentes.
- **SimFirma what-if:** interface para rodar cenarios sinteticos e comparar.
- **Watercooler seguro:** mural de artefatos estruturados, com escopo, TTL,
  opt-in e auditoria (nao compartilhamento de contexto cru).

## 7. Como rodar e testar

### Instalacao

```bash
pnpm install
```

### Desenvolvimento

```bash
pnpm dev:landing       # landing page 3D na porta 5174
pnpm dev:server        # servidor na porta 8787
pnpm dev               # demo React no navegador
pnpm lab:iso           # laboratorio TinyHouse (3333) + persistencia da biblia
pnpm dev:debugpreview  # bancada de agencia (5175)
```

### Testes e typecheck

```bash
pnpm typecheck
pnpm test              # 206 testes, vitest
pnpm load-test         # carga HTTP no endpoint SimFirma
```

### Deploy

- Fly.io: `fly deploy` (ver `fly.toml` e `docs/deploy.md`).
- Railway: `railway up`.

### Variaveis de ambiente uteis

- `MICROFIRMA_JWT_SECRET` — segredo para JWT.
- `VITE_MICROFIRMA_DEMO_URL` — URL para a demo na landing page.
- `MICROFIRMA_ONBOARDING_KEY` — chave de onboarding de novos tenants.
- `MICROFIRMA_OTLP` — ativa receptor OTLP real em vez do gerador sintetico.
- `MICROFIRMA_WS` — URL do WebSocket no demo (`VITE_MICROFIRMA_WS`).
- `MICROFIRMA_S3_*` — credenciais para S3 replay.

## 8. Arquivos de entrada obrigatorios

Para entender ou retomar o projeto, leia nesta ordem:

1. `README.md` — visao geral e status.
2. `BACKUP.md` — este arquivo.
3. `docs/roadmap.md` — planejamento por fase.
4. `docs/adr/*.md` — decisoes arquiteturais.
5. `docs/specs/motor-de-tempo-narrativo.md` — especificacao do scheduler.
6. `docs/deploy.md` — runbook de deploy.
7. `packages/contracts/src/` — contratos de dominio e wire.
8. `packages/world-engine/src/narrative-scheduler.ts`
9. `packages/world-engine/src/world-engine.ts`
10. `packages/world-engine/src/construtor-biblia.ts` — biblia / ProtoComodo.
11. `packages/world-engine/src/layout-solver.ts`
12. `scripts/iso-validation/README.md` — laboratorio TinyHouse.
13. `apps/server/src/server.ts`
14. `apps/server/src/office-session.ts`
15. `apps/demo/src/App.tsx`
16. `apps/demo/src/office-renderer-2d.ts`
17. `apps/debugpreview/src/montar-agencia.ts`
18. `apps/landing/src/App.tsx`
19. `apps/landing/src/Scene.tsx`

## 9. Notas para quem retoma com um agente LLM

- **Nao altere ADRs sem escrever o novo ADR.** As regras de ouro sao
  imutaveis sem registro.
- **Nunca duplique tipos de `@microfirma/contracts`.** E a fonte unica.
- **Nunca chame LLM dentro do loop de tick.** LLM fica nas bordas
  (arquiteto/decorador/relatorios).
- **Nunca gere coordenadas com LLM.** Use `planSpaceProgram` + solver.
- **Todo pixel precisa de fato.** Se um novo elemento visual nao deriva de um
  `WorldSnapshot`/`WorldDelta`, ele esta errado.
- **Mantenha determinismo.** Mesma seed + mesma sequencia = mesma historia.
- **Preview visual da biblia**: use `pnpm lab:iso` + `pnpm dev:debugpreview`.
  No Debugpreview, nao desmonte o proto com `emitirParedes`/`colarProto`;
  o valor e validar o blit completo + empacote.
- **Teste antes de commitar.** `pnpm typecheck` e `pnpm test` devem passar.
- **Codigo em portugues ASCII-only.** Identificadores, comentarios, mensagens.

---

**Repositorio**: `https://github.com/WilliamEndrews/Microfirma`
**Branch ativa**: `main`

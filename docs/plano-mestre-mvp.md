# MicroFirma - Plano Mestre rumo ao MVP

> Documento vivo de rastreamento. Criado em 2026-08-10 a partir de auditoria
> real do codigo (nao de memoria de conversa) cruzada com a arquitetura de
> referencia da "segunda consultoria" (camadas CLIENTE -> INGEST -> SEMANTIC
> CORE -> WORLD ENGINE -> AGENT OPS -> EDGE -> CLIENTE WEB).
>
> Regra deste arquivo: toda linha de status foi verificada lendo codigo,
> rodando `pnpm typecheck` e `pnpm test`, ou lendo um ADR/roadmap existente -
> nunca inferida da conversa. Se um item aqui disser "FEITO", e porque o
> arquivo citado existe e faz o que descreve. Se disser "GAP", e porque foi
> procurado e nao encontrado.
>
> Ao retomar o projeto (humano ou agente), leia primeiro `docs/agentes.md`
> (quem somos, convencoes, skills), depois este arquivo (onde estamos e o que
> falta), depois `docs/roadmap.md` (historico detalhado do que ja foi feito) e
> `BACKUP.md` (resgate de contexto). Atualize a secao 3 deste arquivo a cada
> marco concluido - isso e o que impede o proximo agente de alucinar.

## 1. Veredito em uma frase

O projeto tem uma **Fase 0-3 de demonstracao sintetica completa e testada**
(206 testes, typecheck limpo) com a arquitetura correta nos pontos que a
terceira analise identificou como criticos (motor de tempo narrativo, LLM sem
coordenadas, simulacao autoritativa no servidor). O que falta para um **MVP
com clientes reais** nao e retrabalho - e a camada de ingestao/persistencia
de producao (Semantic Core) e a camada de orquestracao de agentes internos
(Agent Ops), que hoje **nao existem como codigo**, apenas como decisao
arquitetural registrada em ADR e como scaffold determinístico.

## 2. Mapa de camadas: arquitetura de referencia vs. codigo real

Camadas na ordem do diagrama de referencia (CLIENTE -> ... -> CLIENTE WEB).
Status: **FEITO** (existe e testado) / **PARCIAL** (existe versao reduzida
ou scaffold) / **GAP** (nao existe nenhuma linha de codigo).

### 2.1 CLIENTE (OTLP, SDK, A2A, MCP)

| Item da referencia | Status | Evidencia |
| --- | --- | --- |
| OTLP como via primaria | **PARCIAL** | `packages/contracts/src/otlp.ts` traduz spans OTLP/JSON -> `DomainEvent` (`traduzirSpan`, `traduzirLoteOtlp`), com semantica GenAI (`gen_ai.*`). E so o parser; nao ha OTel Collector proprio, nem suporte a OTLP/gRPC ou OTLP/protobuf - so JSON via HTTP. |
| SDK enriquecedor opcional | **GAP** | Nenhum pacote `sdk` no monorepo. Nao existe `officeverse-sdk`/`microfirma-sdk` em nenhuma linguagem. |
| A2A Agent Card (`/.well-known/agent-card.json`) | **GAP** | Nenhuma referencia a A2A no codigo. Apenas citado como ideia futura em `docs/agentes.md`. |
| MCP (descoberta de ferramentas) | **GAP** | Nenhuma referencia a MCP no codigo. |

### 2.2 INGEST (OTel Collector edge, Kafka/Redpanda, normalizador)

| Item da referencia | Status | Evidencia |
| --- | --- | --- |
| Receptor OTLP/HTTP | **FEITO** | `apps/server/src/server.ts:127` - `POST /v1/traces`, roteado por tenant via header `x-tenant-id`, ativado por `MICROFIRMA_OTLP=1`. |
| OTel Collector no cliente (redacao de PII na borda) | **GAP** | Redacao de PII e um PRINCIPIO (ADR-0007: eventos carregam forma e numeros, nunca conteudo), aplicado em `traduzirSpan` (nao copia `gen_ai.prompt`/`gen_ai.completion`). Mas nao ha Collector distribuivel para o cliente instalar - hoje o cliente aponta o exportador OTLP direto pro nosso endpoint. |
| Fila de mensageria (Kafka/Redpanda) | **GAP** | Nao existe. Ingestao e sincrona: HTTP POST -> `OtlpIngestor.ingerir()` em memoria. Sem fila, um pico de trafego acima da capacidade do processo derruba ingestao (mitigado parcialmente pelo `NarrativeScheduler`, que so absorve o excesso NA CAMADA DE ENCENACAO, nao na de ingestao). |
| Normalizador multi-dialeto (OTel/OpenInference/nativo) | **PARCIAL** | So o dialeto OTel GenAI e suportado. OpenInference (Langfuse/Arize) e "nativo" (webhook proprio) nao tem adaptador. |

### 2.3 SEMANTIC CORE (Event Store, modelo de dominio, grafo de colaboracao, CQRS, anomalia)

| Item da referencia | Status | Evidencia |
| --- | --- | --- |
| Contrato de `DomainEvent` (fonte unica de verdade) | **FEITO** | `packages/contracts/src/domain-events.ts` - 8 tipos de evento, zod. ADR-0003. |
| Event Store append-only persistente (Postgres/TimescaleDB/ClickHouse) | **GAP** | Nao existe banco de dados no projeto. `OfficeSession` mantem estado em memoria (`Map<string, SessaoTenant>` em `tenant-registry.ts:34`). O unico armazenamento durante e o **replay NDJSON** (`replay-storage.ts`, local ou S3) - e um log de ticks para reproducao visual, nao um Event Store consultavel/indexado. Reiniciar o processo do servidor perde todo o estado (exceto o que foi gravado em replay). |
| Modelo de dominio (Agent/Run/Step/ToolCall/Cost/Health) | **PARCIAL** | Existe como TIPOS (`DomainEvent`, `AgentDescriptor`, `WorldKpis`), nao como entidades persistidas com historico consultavel. O modelo vive no `WorldSnapshot` (estado atual), nao num repositorio de dominio. |
| Grafo de colaboracao extraido de telemetria real | **GAP** | `space-program.ts` aceita `CollaborationEdge[]` e usa para posicionar zonas - mas em todo o codigo real (`office-session.ts:278`, `world-source.ts:110`) o grafo vem de `colaboracaoDoElenco()`, uma funcao **sintetica e hardcoded** em `packages/synthetic/src/index.ts:313`. Nao ha nenhum codigo que calcule adjacencia a partir do historico real de `tool.called`/handoffs entre agentes. |
| Projecoes CQRS | **GAP** | Nao existe. O unico "read model" e o `WorldSnapshot`/`WorldDelta` calculado a cada tick pelo `WorldEngine`, que e estado de simulacao, nao projecao analitica de eventos historicos. |
| Deteccao de anomalia | **GAP** | Nao existe deteccao estatistica. O `AlertEngine` (`apps/server/src/alert-engine.ts`) e um watchdog de **limiares fixos** sobre KPIs (5 condicoes: erro acima de X, budget acima de Y, etc.), nao deteccao de anomalia (desvio de baseline, series temporais). |

### 2.4 WORLD ENGINE (autoritativo, headless, deterministico)

Esta e a camada mais madura do projeto - e exatamente a que as tres analises
concordaram ser o coracao tecnico.

| Item da referencia | Status | Evidencia |
| --- | --- | --- |
| Narrative Scheduler (agregacao, divida narrativa, orcamento de atencao) | **FEITO** | `packages/world-engine/src/narrative-scheduler.ts`. ADR-0001. 13 testes dedicados. Implementa exatamente os 3 mecanismos que a analise pediu: agregacao por janela, `debtMs` (divida narrativa / modo ambiente), `attentionBudget`. |
| Simulacao a tick fixo (a referencia pede ECS a 10 Hz) | **PARCIAL** | `WorldEngine.tick()` roda a cadencia configuravel (10 Hz no server) e produz snapshot/delta - o COMPORTAMENTO e o mesmo do ECS pedido, mas a IMPLEMENTACAO nao usa uma biblioteca ECS (bitECS/Miniplex); e um motor OO/funcional proprio sobre arrays. Isso nao e um problema funcional hoje (206 testes provam corretude e determinismo), mas pode limitar escala (ver 2.6). |
| Pathfinding | **FEITO** | `packages/world-engine/src/navgrid.ts` - grid de navegacao + A*. |
| Behavior Trees / GOAP para comportamento momento-a-momento | **PARCIAL** | O comportamento existe (andar, sentar, ir para sala de descanso, ir para a porta pedir aprovacao) mas e codificado como maquina de estados/logica imperativa dentro do `WorldEngine`, nao como Behavior Tree/GOAP formal e componivel. Funciona e e testado; nao e o padrao de arquitetura de jogos recomendado, o que pode custar mais para estender comportamento no futuro (ex.: Zelador, Tecnico como agentes proprios). |
| Layout generativo em 2 etapas (programa de necessidades -> solver geometrico) | **FEITO** | Exatamente a correcao que a terceira analise pediu, e ja implementada: `space-program.ts` (`planSpaceProgram`, sem coordenadas) -> `layout-solver.ts` (`solveLayout`, geometria deterministica por seed) -> `layout-validation.ts` (`validarLayout`, invariantes). ADR-0004/0005. 39 testes cobrindo 30 seeds x 1-20 agentes, zero violacao de invariante. |
| Solver com tecnicas especificas (rectangular dissection/treemap, force-directed, WFC) | **PARCIAL** | O solver existe e e deterministico e valido, mas usa uma heuristica proprio de particionamento em grid (nao literalmente treemap squarified nem force-directed puro) e nao usa Wave Function Collapse para mobiliario - mobiliario e posicionado por regra fixa. O resultado pratico (layout valido, sem overlap, sempre alcancavel) e equivalente ao pedido; a tecnica interna difere do que a analise sugeriu, sem prejuizo aparente medido pelos testes de invariante. |
| Snapshot + delta -> Redis Streams | **PARCIAL** | Snapshot/delta existem e sao o protocolo real (`packages/contracts/src/world.ts`, `wire.ts`), difundidos via WebSocket a 10Hz. Nao ha Redis nem qualquer message broker - a difusao e feita por iteracao direta sobre os sockets conectados (`clientesPorTenant` em `server.ts`). Funciona para 1 processo; nao escala horizontalmente (2 instancias do servidor nao compartilham estado nem pub/sub). |
| LLM Arquiteto / Decorador (fallback deterministico obrigatorio) | **FEITO** | `agente-arquiteto.ts` (`DeterministicArchitect`, `LlmArchitect` com `chamarLlm` injetado e fallback), `agente-decorador.ts` no mesmo padrao. ADR-0004/0005 respeitados: LLM nunca gera coordenadas, e sempre opcional. **Porem**: `LlmArchitect`/`LlmDecorador` nunca foram exercitados contra um LLM real no repo - so testados com mocks de `chamarLlm` (`agente-arquiteto.test.ts`). Nao ha prompt de producao versionado nem chamada real a uma API de LLM em lugar nenhum do codigo hoje. |

### 2.5 AGENT OPS (LangGraph supervisor, Arquiteto, Decorador, Zelador, Tecnico, Contador, RH, Compliance)

| Item da referencia | Status | Evidencia |
| --- | --- | --- |
| Orquestrador (LangGraph supervisor) | **GAP** | Nao existe LangGraph, AutoGen nem CrewAI no repo (confirmado por busca - zero dependencia, zero import). O "orquestrador" hoje e o proprio `OfficeSession`/`WorldEngine`, que e codigo determinístico, nao um supervisor de agentes LLM. |
| Agente Arquiteto | **FEITO (scaffold)** | Ver 2.4. Interface + implementacao deterministica pronta; implementacao LLM existe mas nunca foi ligada a um provedor real. |
| Agente Decorador | **FEITO (scaffold)** | Mesmo padrao do Arquiteto (`agente-decorador.ts`), escolhe tema/paleta. Deterministico funcional; LLM com fallback, nao testado contra provedor real. |
| Agente Zelador (limpeza) | **PARCIAL** | O COMPORTAMENTO visual existe dentro do `WorldEngine` (lixo acumula com `run.finished` nao coletado, conforme `roadmap.md`/README), mas nao ha um "agente" separado, testavel e nomeado - e uma regra embutida na simulacao. Do ponto de vista de produto o efeito e o mesmo; do ponto de vista de arquitetura (ADR de agentes internos), nao ha modularizacao. |
| Agente Tecnico (manutencao/luz queimada) | **PARCIAL** | Mesmo caso: `lightBroken`/reparo existe como estado do `WorldEngine`, nao como agente modular. Ha inclusive um ADR de UX resolvido recentemente (roadmap: correcao do "piscar de luz"), mas segue dentro do motor, nao em `agente-tecnico.ts`. |
| Agente Contador (custo/budget) | **PARCIAL** | KPIs de custo (`costUsdToday`, `budgetUsdToday`) existem e o apagao por orcamento e simulado. Nao ha agente de diagnostico/relatorio de custo (ex.: LLM que escreve "relatorio do dia"). |
| Agente RH / onboarding de novo agente | **GAP** | `agent.discovered` existe como tipo de evento, mas nao ha cena/logica dedicada de "onboarding" (crachá, mesa nova, vizinho) - o comportamento generico de novo ator provavelmente ja cobre isso via `WorldEngine`, mas nao foi encontrada nenhuma implementacao ou teste especificamente nomeado para isso. |
| Agente Diagnosticador (correlaciona incidentes, formula hipotese) | **GAP** | Nao existe. Esta e a peca de maior valor segundo a terceira analise ("onde o LLM ganha de verdade") e ainda nao tem nenhum codigo. |
| Watercooler (mural de artefatos, nao canal de contexto) | **GAP** | Nao existe nenhuma implementacao, nem a versao segura (mural com TTL/escopo/opt-in) recomendada pela terceira analise. So existe como ideia em `docs/agentes.md`/`BACKUP.md`. |
| Compliance | **GAP** | Nao existe. |

### 2.6 EDGE (WebSocket/WebTransport, snapshot+delta, interest management)

| Item da referencia | Status | Evidencia |
| --- | --- | --- |
| WebSocket com snapshot + delta | **FEITO** | `apps/server/src/server.ts` (`ws`), 10Hz, handshake com snapshot completo na conexao, deltas incrementais depois. Testado (`wire.test.ts`, `office-session.test.ts`). |
| Reconexao no cliente | **FEITO** | `apps/demo/src/world-source.ts` - `criarFonteRemota` com backoff exponencial. |
| WebTransport (binario, alternativa a WebSocket) | **GAP** | So WebSocket com JSON via `ws`. Sem protocolo binario (Protobuf/MessagePack) nem WebTransport. Para volumes altos (a preocupacao de escala da terceira analise), isso e overhead real de banda, nao so estetico. |
| Interest management (enviar só o que o cliente ve) | **GAP** | O servidor difunde o mesmo delta para todos os clientes do tenant, sem filtrar por viewport/camera. Nao e um problema no volume atual (1 escritorio pequeno); vira um problema direto quando LOD/escala (5.000 agentes) entrar em pauta. |

### 2.7 CLIENTE WEB (Next.js, PixiJS v8/WebGPU + ECS, R3F, shadcn/ui)

| Item da referencia | Status | Evidencia |
| --- | --- | --- |
| Renderer do escritorio | **FEITO, mas Canvas 2D, nao PixiJS** | ADR-0010: Canvas 2D deliberado para a Fase 0 porque WebGL falhava silenciosamente em GPUs em blocklist no ambiente de desenvolvimento. `office-renderer-2d.ts` e o renderer ativo (projecao dimetrica 2:1, sprites pre-renderizados, luzes aditivas, penumbra). `office-renderer.ts` (versao PixiJS) **existe no repo mas nao e importado por nada** - e o rascunho reservado para a Fase 2, exatamente como o roadmap descreve. `pixi.js` esta como dependencia do `apps/demo` mas fora do bundle real (tree-shaken, nada o referencia). |
| Framework do painel | **PARCIAL** | E React + Vite, nao Next.js. Funcional e testado, mas se o objetivo comercial exigir SSR/SEO para paginas de produto (nao a landing, que ja e separada), havera migracao. Para a demo/painel operacional isso nao e bloqueante. |
| ECS proprio no cliente (bitECS/Miniplex) | **GAP** | O cliente e um renderer burro que consome snapshot/delta e desenha; nao ha ECS no browser (nem falta, dado que o estado e autoritativo no servidor - ECS no cliente so importaria se fossemos fazer predicao/interpolacao client-side avancada). |
| shadcn/ui | **GAP** | O painel (`App.tsx`) usa CSS proprio (`style.css`), nao shadcn/ui. Funcional, sem lock-in, mas nao segue a stack sugerida literalmente. |
| Landing 3D (R3F) | **FEITO** | `apps/landing` - `Scene.tsx` (Canvas R3F, quarto branco 10x10x5, iluminacao, 7 "vultos" com `Billboard`), `FallbackScene.tsx` (fallback sem WebGL), `ErrorBoundary.tsx`, transicao de camera (`CameraFlight`) e clique (`ClickPlane`) que leva a demo. Corresponde ao pedido original da landing "quarto branco com vultos". |
| LOD/culling/reconciliacao no cliente | **GAP** | Nao ha LOD semantico (perto=animado, longe=agregado) nem culling por camera - o renderer desenha tudo que recebe. Nao e um bug hoje (elenco de demo tem ~7 agentes); e o proximo limite de escala. |

## 3. Estado consolidado por fase (compatibilizando com `docs/roadmap.md`)

| Fase | O que a fase cobre | Status real |
| --- | --- | --- |
| Fase 0 - Demonstracao sintetica | Contratos, layout 2 etapas, Narrative Scheduler, World Engine, gerador sintetico, renderer 2.5D, painel acessivel | **FEITO** |
| Fase 1 - Producao (servidor real) | Testes, World Engine no servidor, ingest OTLP real, i18n, schema cross-linguagem, replay | **FEITO** (para o escopo de 1 processo, sem fila/DB) |
| Fase 2 - Fidelidade visual e escala | Sprites, temas, camera, agentes Arquiteto/Decorador com fallback | **FEITO o scaffold**; LOD/escala para milhares de agentes e PixiJS real ainda **GAP** |
| Fase 3 - Produto | Multi-tenant, auth JWT+RBAC, auditoria, alertas, HITL, onboarding self-service | **FEITO** (em memoria, 1 processo; falta persistencia durável e deploy multi-instancia) |
| "Fase 4" da 3a analise - Semantic Core real + Agent Ops real | Event Store persistente, grafo de colaboracao real, fila de ingestao, orquestrador LangGraph, agentes Zelador/Tecnico/Contador/Diagnosticador modulares, Watercooler seguro | **GAP quase total** - esta e a fronteira atual do projeto |

## 4. Os dois MVPs pedidos: onde cada um esta e o que falta

### 4.1 MVP sintetico ("o vídeo de 40 segundos que faz alguem dizer 'eu quero isso'")

Isto e a **Fase 0 da terceira analise**, e ja esta, no essencial, **pronto**:

- Gerador sintetico com 7 agentes de perfis distintos (`packages/synthetic`).
- World Engine completo, deterministico, com Narrative Scheduler.
- Layout gerado por seed (2 etapas, sem LLM obrigatorio).
- Renderer 2.5D com luz/calor/fila/lixo/incidente.
- Painel acessivel com KPIs e historico.
- Landing 3D com transicao para a demo.
- Multi-tenant, auth, alertas, HITL, replay - tudo ja funcional em memoria.

**O que falta para este MVP ser "vendavel" no sentido que a 3a analise descreve** (nao tecnico, de acabamento):

1. Arte/qualidade visual - a analise insiste em "qualidade de arte irrepreensivel" contra a "toy perception". O renderer atual e Canvas 2D vetorial funcional, nao sprites 3D pre-renderizados (isso e explicitamente Fase 2/ADR-0008, ainda nao feito).
2. Exportacao de video server-side ("um dia na vida dos seus agentes") - GAP, nao implementado.
3. Modo executivo/wallboard sobrio - GAP; hoje ha um so modo de visualizacao.
4. SimFirma como MODO DE PRODUTO (interface para rodar what-if e comparar) - o mecanismo existe (`SyntheticStream` com carga multiplicada, `scripts/load-test.ts`), mas nao ha UI de produto para isso, so teste de carga tecnico.

Conclusao 4.1: **tecnicamente pronto para gravar a demo**; falta trabalho de
polimento de produto (video, modo executivo, arte), nao arquitetura.

### 4.2 MVP com cliente real ("aponte seu OTLP para nos e o escritorio se constroi")

Isto e a **Fase 1 da 3a analise (Walking Skeleton) + parte da Fase 2**. O
caminho de dados minimo (`OTLP -> DomainEvent -> WorldEngine -> render`) **ja
existe e funciona** (`MICROFIRMA_OTLP=1`, endpoint `/v1/traces`). Isso e
importante: o Walking Skeleton nao e um GAP, e o que a Fase 1 do roadmap
historico ja entregou.

O que falta para isso suportar um cliente PILOTO real e nao apenas um teste:

1. **Persistencia durável (GAP critico)** - hoje, reiniciar o processo do
   servidor perde todo o estado do tenant (exceto replay gravado). Um piloto
   real precisa de pelo menos: banco de estado de tenant/agentes descobertos
   e, idealmente, um Event Store consultável (mesmo que simplificado - nao
   precisa ser Kafka+ClickHouse no piloto, mas precisa sobreviver a um
   restart).
2. **Grafo de colaboracao real (GAP critico para o diferencial do layout)** -
   hoje o layout de um cliente real usaria `collaboration: []` (vazio, cai
   para afinidade de papel) porque `colaboracaoDoElenco()` e sintetica. Sem
   isso, a promessa "agentes que se chamam muito ficam perto" nao se
   concretiza com dados reais. E preciso: agregar `tool.called`/handoffs por
   par de agentes numa janela de tempo e alimentar isso em `PlanOptions.collaboration`.
3. **Fila/backpressure na ingestao (GAP, risco de escala)** - ingest sincrono
   direto em memoria. Para um piloto pequeno (1 cliente, poucos agentes) isso
   e aceitavel; nao escala para "100 clientes" sem uma fila.
4. **Descoberta via A2A/MCP (GAP, mencionado como diferencial na 3a analise)**
   - hoje a unica forma de descobrir agentes e via spans OTLP chegando (span
   com atributo de agente = agente descoberto). Nao ha leitura de Agent Card
   nem de servidores MCP.
5. **LLM Arquiteto/Decorador reais (PARCIAL)** - a interface e o fallback
   existem; falta escolher e conectar um provedor real (mesmo que so para o
   Decorador primeiro, que e de baixo risco - ele so escolhe paleta/nomes).
6. **Redacao de PII na borda / OTel Collector distribuivel (GAP)** - hoje
   confiamos que o cliente configure o proprio exportador para nao mandar
   `gen_ai.prompt`/`gen_ai.completion` (o adaptador ja ignora esses campos se
   vierem, por ADR-0007), mas nao fornecemos um Collector pronto para reduzir
   esse risco na origem. Para um piloto de confianca (nao produto GA) isso
   pode ser aceitavel com um checklist de configuracao no onboarding; para
   venda enterprise, e bloqueante.

Conclusao 4.2: o **caminho critico de dados ja existe**; os GAPs reais que
bloqueiam um cliente PILOTO (nao GA) sao, em ordem de urgencia: persistencia
durável minima, grafo de colaboracao real, e um checklist de privacidade no
onboarding. Fila de mensageria, A2A/MCP, LLM real e Agent Ops modular são
necessários para GA/escala, não para o primeiro piloto.

## 5. Proximos passos recomendados (ordem sugerida, nao autorizacao de execucao)

Seguindo a "Regra de engajamento" do `docs/roadmap.md`: nada abaixo comeca
sem "start" explicito do dono do produto. Esta secao e so o mapa.

1. **Grafo de colaboracao real a partir de eventos ingeridos.** Menor esforco,
   maior fidelidade ao valor prometido ("layout com significado"). Requer:
   agregar pares de agentes por `tool.called`/handoff numa janela deslizante
   dentro de `OfficeSession`, substituindo `colaboracaoDoElenco()` quando a
   fonte for `OtlpIngestor`.
2. **Persistencia durável minima do estado de tenant.** Nao precisa ser o
   Semantic Core completo da 3a analise de imediato - o menor incremento que
   resolve "reiniciar o servidor nao pode apagar o cliente" e suficiente para
   um piloto (ex.: Postgres com tabela de tenants/agentes descobertos/ultimo
   snapshot, reidratando o `OfficeSession` no boot).
3. **Checklist de privacidade de onboarding** (documentacao + validacao no
   receptor `/v1/traces`) para cobrir o GAP de Collector distribuivel sem
   precisar construir um Collector agora.
4. **Conectar o Agente Decorador a um LLM real** (menor risco dos dois LLMs,
   ADR-0005 garante fallback) - primeiro uso real de LLM em producao,
   validando o padrao antes de estender ao Arquiteto.
5. **Modo executivo/wallboard + exportacao de video** - maior valor de
   percepcao/venda, indepen­dente dos itens tecnicos acima; pode ser
   paralelizado por outra pessoa/agente.
6. Só depois disso: fila de ingestao, LOD/escala, PixiJS real, A2A/MCP,
   Agente Diagnosticador, Watercooler seguro, orquestrador LangGraph. Esses
   sao investimentos de GA/escala, prematuros antes de validar com 1-2
   clientes reais.

## 6. Como manter este arquivo honesto

- Ao concluir um item da secao 5, mover a linha correspondente da tabela da
  secao 2 de GAP/PARCIAL para FEITO, citando o arquivo e o teste que provam.
- Nao marcar "FEITO" por intencao ou por estar no roadmap como planejado -
  so por codigo existente e testado.
- Se uma decisao da secao 5 for tomada de forma diferente do sugerido, isso
  vira ADR (ver `docs/adr/`), e este arquivo e atualizado para linkar o ADR.
- Este arquivo nao substitui `docs/roadmap.md` (historico cronologico
  detalhado do que foi implementado, fase por fase) nem `BACKUP.md` (resgate
  de contexto geral). Ele existe para responder uma pergunta especifica:
  "comparado a arquitetura de referencia inteira, o que falta e em que
  ordem atacar". Revisar os tres juntos ao planejar o proximo passo.

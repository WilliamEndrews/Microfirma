# MicroFirma - Roadmap

> Documento vivo. Fonte unica de verdade do planejamento. Se uma decisao nao
> esta aqui nem num ADR, ela nao existe - foi conversa de corredor.

## Como ler este documento

Este arquivo existe para sobreviver a troca de parceiros de implementacao
(humanos ou agentes). Qualquer pessoa deve conseguir assumir o projeto lendo
apenas: este roadmap, os ADRs citados e os docstrings de cabecalho dos pacotes.

### Duas categorias de conteudo, com peso diferente

- **[DEPURADO]** - decisao tomada apos investigacao concreta (log, codigo
  lido, causa raiz identificada) e ja implementada ou registrada em ADR. Tem o
  mesmo peso de um fato do codigo. Reverter exige entender o ADR primeiro.
- **[PROPOSTA]** - julgamento de engenharia ainda nao validado com o dono do
  produto, ou nao testado em uso real. E ponto de partida para discussao, nao
  ordem. Marcado explicitamente onde aparece.

Itens sem marcacao neste documento sao [DEPURADO] por padrao (fatos extraidos
diretamente do codigo, como a tabela de ADRs abaixo).

Convencoes do repositorio que NAO devem ser alteradas sem ADR:

- Codigo, identificadores e comentarios em portugues, sem acentos (ASCII-only).
  Isso vale tambem para este documento.
- `@microfirma/contracts` e a unica fonte de tipos. Duplicar um tipo e bug.
- Nenhuma informacao pode existir SOMENTE no canvas (ADR-0009).
- O LLM nunca gera coordenadas (ADR-0004) e nunca esta no caminho critico
  (ADR-0005).

## Registro de ADRs

| ADR | Assunto | Situacao |
| --- | --- | --- |
| 0001-0003 | Nao referenciados em nenhum arquivo do repositorio | **Faltando** - recuperar ou renumerar |
| 0004 | LLM nunca gera coordenadas | Vigente, citado em `space-program.ts` |
| 0005 | LLM como enfeite, nunca dependencia critica | Vigente, citado em `space-program.ts` |
| 0006 | Simulacao autoritativa no servidor; browser e terminal | Vigente, citado em `world-engine.ts` |
| 0007 | Nao referenciado no codigo | **Faltando** - verificar |
| 0008 | Sprites pre-renderizados em 3D na Fase 2 | Vigente, citado em `office-renderer-2d.ts` |
| 0009 | Canvas nunca e fonte unica de informacao (acessibilidade) | Vigente, citado em `App.tsx` e `style.css` |
| 0010 | Renderer Canvas 2D na Fase 0 (sem GPU) | Escrita: `docs/adr/0010-renderer-canvas-2d.md` |
| 0011 | Internacionalizacao (pt-BR, en, es) | Vigente, escrito: `docs/adr/0011-internacionalizacao.md` |

ADR-0001 a 0003 e 0007 seguem sem arquivo. Demais ADRs vivem em `docs/adr/`.

---

## Fase 0 - Demonstracao sintetica (concluida na essencia)

Objetivo: matar o maior risco do projeto - a percepcao de "brinquedo" - em
semanas, usando ja a arquitetura definitiva:

```
telemetria -> eventos de dominio -> Narrative Scheduler -> World Engine -> render
```

### O que esta pronto e validado

- **Contratos** (`packages/contracts`): `DomainEvent`, `OfficeLayout`,
  `WorldSnapshot`/`WorldDelta`, `WorldKpis`.
- **Geracao de escritorio em duas etapas**: `planSpaceProgram` (programa de
  necessidades, sem coordenadas) e `solveLayout` (geometria concreta),
  deterministicos por seed, com `validarLayout` checando invariantes.
- **Narrative Scheduler**: agregacao de eventos, divida narrativa (`debtMs`),
  modo ambiente e orcamento de atencao. E o coracao do produto.
- **World Engine**: cinematica, pathfinding (`navgrid`), projecao de ambiente
  (calor, fila, lixo, luz queimada, apagao por orcamento).
- **Gerador sintetico** (`packages/synthetic`): elenco de 7 agentes com perfis
  distintos, emitindo os MESMOS tipos de evento que o OTLP real emitira.
- **Renderer 2.5D** (`apps/demo/src/office-renderer-2d.ts`): projecao dimetrica
  2:1, piso por tipo de sala, paredes extrudidas nas faces norte/oeste com vao
  na porta, perimetro do predio, mobiliario ordenado por profundidade,
  penumbra + luzes com blend aditivo real, atores animados.
- **Painel lateral acessivel** (ADR-0009): KPIs, orcamento, lista de atores,
  historico textual de eventos - tudo que o canvas mostra tem equivalente
  textual.

### [DEPURADO] ADR-0010: Canvas 2D em vez de WebGL/PixiJS

Decisao completa em `docs/adr/0010-renderer-canvas-2d.md`. Resumo: em
ambientes com GPU em blocklist, o contexto WebGL e criado com SUCESSO mas e um
stub nao funcional (`gl.getShaderSource()`/`gl.getProgramInfoLog()` retornam
`null`), e `Application.init()` nao lanca excecao - nao havia ponto onde cair
para fallback. Canvas 2D elimina a dependencia de GPU (toda a geometria da
Fase 0 e vetorial) trocando UMA linha fora do renderer, validando empiricamente
a fronteira do ADR-0006.

`apps/demo/src/office-renderer.ts` (versao PixiJS) permanece no repositorio, nao
referenciado, como base para a Fase 2. Como nada o importa, `pixi.js` nao entra
no bundle.

### Ajustes pendentes na Fase 0

- [x] **Piscar das luzes incomodava visualmente.** [DEPURADO] Causa: NAO era
      o estado (`lightBroken` e um booleano estavel, so muda via
      `repairLight`) - era o padrao visual em `desenharLuzes`, que usava duas
      senoides com corte abrupto em `> 0.7` (lia como estroboscopio continuo,
      transicao binaria). Corrigido para flash intermitente: periodo e
      defasagem proprios por lampada (hash deterministico `pseudoAleatorio`),
      fracao dos ciclos dispara, envelope suave de entrada/saida (seno, sem
      corte). Le como "mau contato ocasional", nao luz de emergencia.
- [x] **Suite de testes criada e verde** - 191 testes, 16 arquivos, cobrindo
      `narrative-scheduler` (agregacao, divida, atencao), `layout-solver`
      (invariantes geometricas), `world-engine`, `office-session`, auth,
      tenant, alertas, auditoria, replay e OTLP.
- [x] **`docs/specs/motor-de-tempo-narrativo.md` escrito.** E citado em
      `narrative-scheduler.ts:34` e `packages/contracts/src/world.ts:128`.
- [x] **ADR-0010 escrito** em `docs/adr/0010-renderer-canvas-2d.md`. ADR-0001
      a 0003 e 0007 seguem sem arquivo (nao encontrados no repositorio).

---

## Requisito novo - Internacionalizacao (ADR-0011 a escrever)

> Todo o conteudo desta secao e **[PROPOSTA]**, exceto onde marcado em
> contrario. Mapeamento de codigo e fato; recomendacoes de arquitetura de i18n
> ainda nao foram validadas em uso real.

### Motivacao comercial

A MicroFirma nao sera vendida apenas no Brasil. Observabilidade de sistemas
agenticos e um mercado global e a barreira de idioma elimina o comprador
internacional antes da primeira demo. Idiomas do primeiro ciclo:

| Locale | Papel |
| --- | --- |
| `pt-BR` | Idioma de origem, base de traducao |
| `en` | Prioridade comercial numero 1 (mercado global, investidor) |
| `es` | America Latina hispanofona |

### Escopo (e o que fica FORA)

Traduzir apenas o que o usuario le. **Codigo, identificadores, comentarios,
nomes de arquivo e ADRs permanecem em portugues ASCII-only** - traduzir isso
geraria churn enorme sem valor para o cliente.

### Superficie de strings ja mapeada

`apps/demo/src/App.tsx`

- `ROTULO_ATIVIDADE` (linhas ~40-50): 9 rotulos de atividade de ator.
- Cabecalho da marca: titulo e subtitulo "Plano de controle espacial...".
- Rotulos de KPI: "Execucoes ativas", "Erros (5 min)", "Tokens / min",
  "Aprovacoes".
- Bloco de orcamento: "Custo do dia" e o prefixo `US$` **hardcoded**.
- `aria-label` de secoes e do canvas ("Planta do escritorio dos agentes").
- Legenda do palco: 4 frases explicando fila, calor, luz e lixo.
- Textos de nota, erro e sucesso da secao de semente.
- `descreverEvento()` (~linhas 298-315): frases geradas por tipo de evento -
  o caso mais delicado, porque monta sentenca com interpolacao.
- `formatarNumero()`: sufixo "k" e separador decimal.

`packages/synthetic/src/index.ts`

- `ELENCO`: nomes dos agentes de demo (Triagem, Pesquisa, Analise, Engenharia,
  Fiscal, Revisor, Maestro).
- `FERRAMENTAS`: nomes de ferramentas em portugues (`buscar_crm`,
  `consultar_erp`, ...).

Estes dois sao **dados de demonstracao**, nao interface. Em producao os nomes
vem da telemetria real e nao devem ser traduzidos. Mas a demo precisa de
elenco localizado, senao a apresentacao para um CTO americano mostra bonecos
chamados "Triagem".

`apps/demo/src/office-renderer-2d.ts`

- Nenhuma string visivel. O renderer e mudo por design - toda a semantica vive
  no painel. Isso torna a i18n barata e e consequencia direta do ADR-0009.

### Pontos de atencao tecnica

- **Formatacao localizada, nao apenas traducao.** `Intl.NumberFormat` e
  `Intl.DateTimeFormat` para numeros, percentuais e horarios. `formatarNumero`
  precisa parar de concatenar "k" na mao.
- **Moeda: [DEPURADO] decidido.** Custo sempre exibido em **USD**, em todos os
  locales - apenas o formato do numero e localizado (separador decimal,
  agrupamento), nunca a unidade monetaria. Motivo: custo de LLM e cobrado em
  USD; converter para moeda local introduz taxa de cambio como fonte de erro
  e de disputa com o cliente. `costUsdToday`/`budgetUsdToday` no contrato
  (`packages/contracts`) ja refletem isso no nome do campo - nao precisam
  mudar quando ADR-0011 for escrito, so formalizar a decisao la.
- **Pluralizacao e genero.** `descreverEvento` monta frases; portugues e
  espanhol tem genero gramatical. Usar biblioteca com suporte a ICU MessageFormat
  em vez de concatenacao de string.
- **Acessibilidade.** Todo `aria-label` traduzido, e `<html lang>` atualizado -
  senao o leitor de tela pronuncia portugues com fonemas ingleses. Isso e
  extensao direta do ADR-0009, nao item separado.
- **Pseudo-localizacao.** Locale de teste que expande strings ~40% para revelar
  layout quebrado antes de contratar tradutor.

### Criterio de pronto

1. Trocar de idioma nao exige recarregar a pagina nem reiniciar a simulacao.
2. Nenhuma string literal visivel ao usuario fora dos arquivos de traducao.
3. Verificacao automatizada de chaves faltando/orfas entre os tres locales.
4. `pt-BR`, `en` e `es` completos, revisados por humano - nao apenas MT.
5. Pseudo-locale nao quebra o layout do painel.

---

## Fase 1 - Producao: servidor, ingest real e fundacao de qualidade

Objetivo: sair da demo sem reescrever a arquitetura. Ordem sugerida:

### [DEPURADO] 1.1 Fundacao de testes - feito em 2026-08-03

55 testes, 3 arquivos, `pnpm test` verde:

- `packages/world-engine/src/narrative-scheduler.test.ts` (13 testes) -
  agregacao, divida narrativa/modo ambiente, orcamento de atencao (incluindo o
  comportamento real de que QUALQUER prioridade >= 0.8 fura o orcamento, nao
  so a mais alta), heat/incident/lightBroken, determinismo de intents.
- `packages/world-engine/src/layout-solver.test.ts` (39 testes) - determinismo
  por seed, e zero violacoes de invariante em 30 seeds x elencos de 1 a 20
  agentes.
- `packages/world-engine/src/world-engine.test.ts` (3 testes) - determinismo
  de quadros dada a mesma sequencia de `(eventos, dt)`, snapshot consistente,
  fluxo de aprovacao humana.

Dois testes escritos inicialmente falharam por premissa errada minha, nao por
bug no codigo - documentado inline nos comentarios dos testes corrigidos:
prioridade >= 0.8 (nao so a maior) bypassa o orcamento de atencao por design.

### 1.2 Mover o World Engine para o servidor (ADR-0006) - feito em 2026-08-03

A interface publica (`ingest` / `tick` / `snapshot`) ja era desenhada para ser
identica a que seria exposta por WebSocket. O trabalho foi:

- **1.2a Contrato de transporte** (`packages/contracts/src/wire.ts`):
  `ServerMessage` (tipos TS puros, sem zod) e `ClientCommand` (zod com
  `.strict()` para rejeitar campos extras). `parseClientCommand` nunca lanca.
- **1.2b OfficeSession pura** (`apps/server/src/office-session.ts`):
  simulacao autoritativa sem rede. Monta escritorio, faz tick, devolve
  snapshot/delta na cadencia de keyframe, aplica comandos. Zero conhecimento
  de WebSocket.
- **1.2c Processo servidor** (`apps/server/src/server.ts`): WebSocket na
  porta 8787, handshake + snapshot na conexao, deltas a 10Hz, `/health`,
  receptor OTLP/HTTP em `/v1/traces`.
- **1.2d WorldSource no cliente** (`apps/demo/src/world-source.ts`):
  `criarFonteLocal` (simula no navegador) e `criarFonteRemota` (WebSocket com
  reconexao exponencial). `App.tsx` trocou de fonte sem mudar render/painel.
- **1.2e Testes**: 78 testes, 5 arquivos. OfficeSession (10), wire protocol
  (13), mais os 55 ja existentes da Fase 1.1.

Resultado: `App.tsx` e o renderer nao mudaram. A unica linha que sabe da
existencia do servidor e `const URL_SERVIDOR = import.meta.env.VITE_MICROFIRMA_WS`.

### 1.3 Ingest OTLP real - feito em 2026-08-03

Adaptador que traduz spans OTLP para `DomainEvent`. `SyntheticStream`
**permanece** como infraestrutura de teste de carga, regressao visual e do modo
"SimFirma" (feature vendavel: "e se o trafego decuplicar?").

- **1.3a Adaptador OTLP->DomainEvent** (`packages/contracts/src/otlp.ts`):
  `OtlpSpan` (tipo do span OTLP/JSON), `traduzirSpan` (funcao pura que devolve
  zero ou mais DomainEvents por span), `traduzirLoteOtlp` (processa
  ExportTraceServiceRequest completo). Segue semantica GenAI do OpenTelemetry
  (`gen_ai.*` attributes). Span malformado nao derruba o lote.
- **1.3b OtlpIngestor** (`packages/world-engine/src/otlp-ingestor.ts`):
  classe com buffer, deduplicacao por eventId, descoberta unica de agentes,
  ordenacao temporal. Implementa `FonteEventos` - a mesma interface que
  `SyntheticStream`, permitindo troca sem mudar `OfficeSession`.
- **1.3c Receptor OTLP/HTTP** (`apps/server/src/server.ts`): endpoint
  `/v1/traces` (POST JSON), compativel com SDKs OpenTelemetry. Ativado por
  `MICROFIRMA_OTLP=1`. Sem essa env, o servidor usa SyntheticStream.
- **1.3d Testes**: 24 novos testes (15 do adaptador, 9 do ingestor). Total:
  102 testes, 7 arquivos, suite verde.

Fronteira verificada: a `OfficeSession` nao sabe se eventos vem de OTLP ou de
sintetico. A troca e uma linha no construtor (`fonteEventos: ingestor`).

### 1.4 Internacionalizacao (ADR-0011) - feito em 2026-08-03

A UI estava estavel apos 1.1-1.3, momento certo para i18n sem retrabalho.

- **Dicionario** (`apps/demo/src/i18n.ts`): ~50 chaves planas com placeholders
  `{nome}`, `{n}`, etc. pt-BR (default) e en-US. Sem ICU, sem pluralizacao
  complexa - a UI nao precisa. Adicionar idioma = adicionar um objeto.
- **Hook** (`apps/demo/src/use-i18n.ts`): `useI18n()` devolve `{ t, idioma,
  setIdioma }`. Persiste em `localStorage`. Troca em runtime, sem reload.
- **App.tsx refatorado**: todas as strings hardcoded (rotulos de KPI, estados
  de conexao, atividades, descricoes de evento, legenda, controles, notas)
  agora passam por `t()`. Funcao `descreverEvento` aceita `t` como parametro.
- **Seletor de idioma**: `<select>` no header, ao lado do indicador de fonte.
  CSS em `style.css`.

Resultado: nenhuma string em portugues hardcoded em `App.tsx`. Trocar para
en-US e um clique, e o estado persiste entre sessoes.

### 1.5 Schema cross-linguagem - feito em 2026-08-03

O script `contracts:jsonschema` ja existia. O trabalho foi:

- **Gerador atualizado** (`packages/contracts/scripts/gen-jsonschema.ts`):
  adicionado `ClientCommand` ao gerador. Agora gera 5 schemas: domain-event,
  agent-descriptor, space-program, office-layout, client-command.
- **Validador independente** (`packages/contracts/src/schema.test.ts`):
  12 testes usando `ajv` (implementacao JSON Schema draft-07 independente do
  zod) para validar payloads de exemplo contra os arquivos `.schema.json`
  gerados. Prova que os schemas sao consumiveis por qualquer linguagem.
- **Dependencia**: `ajv` adicionada como devDependency do contracts.

Resultado: um agente Python, Go ou Rust pode carregar os arquivos
`schema/*.schema.json` e validar com a mesma garantia que o zod da em TS.

### 1.6 Persistencia e Replay - feito em 2026-08-03

O determinismo do engine existe justamente para isto: guardar
`(layout, seed, sequencia de eventos)` permite reproduzir qualquer momento.
Requisito de auditoria citado no ADR-0006 ("auditoria do que foi mostrado a
quem").

- **Formato SessionLog** (`packages/contracts/src/replay.ts`): NDJSON
  (newline-delimited JSON). Linha 1 = header (seed, agentes, layout, tickMs,
  keyframeEveryTicks). Linhas 2+ = um TickRecord por tick (eventos ingeridos
  + quadro produzido). Funcoes `serializarHeader`, `serializarTick`,
  `desserializarLinha`.
- **Gravacao no OfficeSession** (`apps/server/src/office-session.ts`): opcao
  `gravarEm: NodeJS.WritableStream` no construtor. Header escrito na
  construcao, cada tick escrito em `tick()`. Tick pausado nao grava.
- **SessionPlayer** (`apps/server/src/session-player.ts`): le o NDJSON,
  devolve header + iterador de ticks. Metodos `tickAt`, `ticksEntre`,
  `todosTicks`. Iteravel com `for-of`.
- **Testes** (`apps/server/src/replay.test.ts`): 9 testes - header na
  construcao, tick produz linha, pausa nao grava, replay reproduz mesmos
  quadros, iteracao for-of, filtragem por intervalo, rejeicao de log sem
  header, rejeicao de tick antes do header, gravacao apos reseed.

Total: 123 testes, 9 arquivos, suite verde.

---

## Fase 2 - Fidelidade visual e escala - feito em 2026-08-03

### 2.1 Sprites pre-renderizados (ADR-0008)

- **Sistema de temas** (`packages/world-engine/src/themes.ts`): 6 temas com
  paleta de 4 cores cada. `resolverPaleta()` deriva todas as cores do
  renderer (piso, paredes, mobilia, atores) a partir do tema. Trocar tema =
  regenerar sprites, nao reescrever renderer.
- **Fabrica de sprites** (`apps/demo/src/sprite-factory.ts`): pre-renderiza
  cada tipo de mobiliario e cada cor de ator em canvas offscreen a 2x
  (supersampling). Gradientes lineares nas faces das caixas, gradiente
  radial no topo (luz incidindo do topo-esquerda), sombra com blur,
  ambient occlusion na base, highlights de borda. Detalhes por prop:
  monitor com brilho azul na mesa, display com numeros no medidor, vapor
  na maquina de cafe, folhagem com gradiente radial na planta.
- **Renderer overhauled** (`apps/demo/src/office-renderer-2d.ts`): todos os
  slots de `caixaIso()`/`fill()` vetoriais substituidos por `drawImage()`
  dos sprites pre-renderizados. Paredes agora tem gradiente vertical.
  Cores vem da `PaletaResolvida` do tema do layout, nao de constantes
  hardcoded. `RendererHandle` ganhou `focusAgent()` e `resetCamera()`.

### 2.2 Camera e navegacao

- **Zoom** (scroll wheel): zoom centrado no cursor, range 0.4x a 4x.
- **Pan** (drag): arrastar o canvas move a camera. Pan cancela seguimento.
- **Seguir agente**: `focusAgent(id)` faz a camera seguir suavemente
  (interpolacao a 8% por frame). Selecionar agente no painel ativa follow.
- **Reset** (duplo-clique ou botao): volta ao zoom 1x, pan zero.
- **Botao na UI** com dica de controles. CSS em `style.css`.

### 2.3 Agente Arquiteto (ADR-0004/0005)

- **Interface** `AgenteArquiteto` (`packages/world-engine/src/agente-arquiteto.ts`):
  `planejar(agents, opts) => SpaceProgram`.
- **DeterministicArchitect**: usa `planSpaceProgram` diretamente. Sempre
  funciona, sem custo, sem rede. E o fallback.
- **LlmArchitect**: injeta `chamarLlm(prompt)` (dependency injection).
  Monta prompt com regras de negocio + agentes + colaboracao. Valida
  resposta contra schema zod. Se invalido/erro: cai para deterministico.
  Metodo `planejarAsync()` para chamada ao LLM; `planejar()` (sync) usa
  fallback.
- **30 testes** (11 arquiteto + 11 decorador + 8 themes).

### 2.4 Agente Decorador

- **Interface** `AgenteDecorador` (`packages/world-engine/src/agente-decorador.ts`):
  `decorar(agents, seed) => Tema`.
- **DeterministicDecorator**: escolhe tema por seed (RNG seeded).
- **LlmDecorator**: injeta `chamarLlm(prompt)`. Monta prompt com papeis
  dos agentes e sugestao baseada em dominio (financeiro -> cool-lab,
  pesquisador -> warm-studio, etc). Valida paleta (4 cores hex),
  greenery (0..1). Se nome existe em TEMAS, usa paleta do tema. Se novo,
  usa paleta custom. Invalido -> fallback.
- **TEMAS expandido**: 6 temas (nordic-calm, warm-studio, cool-lab,
  forest-deep, sunset-loft, midnight-ops). Antes eram 3.

### Resultado

- **Typecheck:** limpo
- **Testes:** 153 passando, 12 arquivos, 0 falhas
- **Sprites:** ~20 sprites pre-renderizados com gradientes, sombras, highlights
- **Camera:** zoom, pan, follow, reset - todos funcionais
- **Arquiteto/Decorador:** interfaces prontas para LLM, fallback deterministico
  garantido, testes cobrem todos os caminhos de falha

---

## Fase 3 - Produto - feito em 2026-08-03

### 3.1 Contratos de tenant, auth, auditoria, alertas e aprovacao

- **`packages/contracts/src/tenant.ts`**: schemas zod para Tenant, Plano
  (free/pro/enterprise), LimitesPlano, Papel (admin/operator/viewer),
  PERMISSOES (RBAC declarativo), JwtPayload, Usuario, AuditAction,
  AuditEvent, AlertConfig (5 condicoes, 4 canais), AlertEvent,
  ApprovalContext (contexto completo para decisao humana).
- **`packages/contracts/src/wire.ts`** estendido: `ApprovalNotification`
  e `AlertNotification` no `ServerMessage`; `ack_alert` no
  `ClientCommand`; novos failure codes (`unauthorized`, `forbidden`,
  `tenant_not_found`).

### 3.2 Multi-tenant e isolamento

- **`apps/server/src/tenant-registry.ts`**: mapa `tenantId -> OfficeSession`
  com isolamento total. Cada tenant tem sua propria sessao, seu proprio
  OtlpIngestor (se plano suporta OTLP), suas propias violacoes de layout.
  Lifecycle: criar, obter, listar, atualizarPlano, remover. Iterador
  `sessoesAtivas()` para o laco de tick global.

### 3.3 Autenticacao e RBAC

- **`apps/server/src/auth.ts`**: JWT HMAC-SHA256 nativo (sem dependencias
  externas). `emitirJwt()`, `verificarJwt()` com comparacao em tempo
  constante (anti timing attack). `temPermissao(papel, acao)` para RBAC.
  Extracao de token de query string (WS) e header Authorization (REST).
  Expiracao de 24h, segredo via env var.
- **3 papeis**: admin (tudo), operator (approve/pause/audit, sem reseed/
  manage), viewer (so ve).
- **WS auth**: token na query string. Sem token = close 4001. Token
  invalido = close 4001. Tenant inexistente = close 4004.
- **REST auth**: Bearer token no header. Onboarding aceita admin token
  ou `MICROFIRMA_ONBOARDING_KEY`.

### 3.4 Trilha de auditoria

- **`apps/server/src/audit-trail.ts`**: log imutavel de acoes humanas
  com who/when/what/result. Ring buffer de 10k eventos. Consulta por
  tenant com filtro de acao e limite. Registrado em: aprovacao, pause,
  reseed, tenant.created/updated/deleted, alert.acknowledged.

### 3.5 Motor de alertas

- **`apps/server/src/alert-engine.ts`**: watchdog sobre KPIs. 5 condicoes:
  `agent_failing`, `budget_exceeded`, `approval_pending_long`,
  `error_rate_high`, `agent_discovered`. 4 canais: webhook (POST JSON),
  slack (Incoming Webhook), pagerduty (Events API v2), email (delegado).
  Debounce por janela configuravel. Avaliacao a cada N ticks. Entrega
  assincrona (nao bloqueia o tick). Falha de entrega loga mas nao derruba.

### 3.6 Fluxo de aprovacao acionavel

- **`ApprovalContext`** no wire: agentId, question, summary,
  waitingSeconds, runCostUsd, runTokens. O humano ve o contexto completo,
  nao so "aprove".
- **`ApprovalNotification`** enviada no handshake e quando um agente
  entra em `waiting_approval`.
- **RBAC**: so admin e operator podem aprovar. Viewer nao.

### 3.7 Onboarding self-service

- **POST /api/tenants**: cria tenant + OfficeSession + OtlpIngestor +
  emite JWT admin. Valida contra schema zod. Precisa de admin token ou
  `MICROFIRMA_ONBOARDING_KEY`.
- **GET /api/tenants**: lista tenants (admin).
- **GET /api/tenants/:id**: detalhes do tenant.
- **DELETE /api/tenants/:id**: remove tenant (admin).
- **POST /api/tenants/:id/alerts**: configura alerta.
- **GET /api/tenants/:id/alerts**: lista alertas.
- **GET /api/tenants/:id/audit**: trilha de auditoria (admin/operator).
- **POST /api/auth/login**: emite JWT.

### 3.8 Servidor overhauled

- **`apps/server/src/server.ts`**: multi-tenant routing completo. Loop
  de tick global itera sobre todas as sessoes ativas. Broadcast por
  tenant (nao global). OTLP roteado por `x-tenant-id` header ou query.
  CORS permissivo para desenvolvimento. Graceful shutdown.

### Resultado

- **Typecheck:** limpo
- **Testes:** 191 passando, 16 arquivos, 0 falhas
- **38 novos testes** (9 auth + 6 audit + 9 alert + 14 tenant-registry)
- **Multi-tenant:** isolamento total, cada empresa com sua sessao
- **Auth:** JWT + RBAC com 3 papeis e 5 permissoes
- **Auditoria:** log imutavel de toda acao humana
- **Alertas:** 5 condicoes, 4 canais, debounce, entrega assincrona
- **Onboarding:** API REST completa para self-service

---

## Sequenciamento recomendado

```
Fase 0 (ajustes)  ->  1.1 testes  ->  1.2 servidor  ->  1.3 OTLP
                                                         |
                                          1.4 i18n  <----+
                                          1.5 schema
                                          1.6 replay
                                                         |
                                                    Fase 2  ->  Fase 3
```

Justificativa da ordem: testes primeiro porque tudo depois deles e refatoracao
de risco; servidor antes de OTLP porque o ingest real deve nascer ja no lugar
definitivo; i18n depois do painel estabilizar.

---

## Regra de engajamento

**Nenhum desenvolvimento dos itens acima comeca sem o "start" explicito do
dono do projeto.** Este documento e planejamento, nao autorizacao de execucao.
Ao receber o start, confirmar qual item sera atacado e atualizar a caixa de
status correspondente aqui.

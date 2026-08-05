# Motor de Tempo Narrativo

> Especificacao do `NarrativeScheduler` (`packages/world-engine/src/narrative-scheduler.ts`).

## Problema

Sistemas agenticos reais operam em escala de milissegundos: uma tool call leva
~40 ms, uma cadeia completa ~900 ms. A percepcao humana, por outro lado,
precisa de ~3 s para acompanhar um deslocamento, um gesto ou uma mudanca de
estado. Mapear eventos e animacoes 1:1 gera teletransporte, animacoes
interrompidas e carga visual excessiva.

O Motor de Tempo Narrativo resolve essa incompatibilidade de duas a quatro
ordens de grandeza sem distorcer o tempo do mundo ao vivo.

## Principios

1. **O mundo nao e desacelerado.** No modo ao vivo, `dtMs` e real. Dilatacao
   temporal (`alpha != 1`) so e permitida em Replay/Foco.
2. **Eventos sao fatos; intencoes sao encenacoes.** Um `DomainEvent` e algo que
   aconteceu. Uma `NarrativeIntent` e a decisao de que esse fato merece ser
   mostrado, por quanto tempo e com qual prioridade.
3. **A atencao humana e escassa.** O orcamento de atencao limita quantas
   encenacoes podem estar em voo simultaneamente.
4. **Modo ambiente e conteudo, nao descarte.** Quando a narrativa nao consegue
   encenar, o fato e traduzido para sinais continuos: calor, lixo, fila,
   incidente, luz queimada.

## Mecanismos

### 1. Agregacao

Eventos do mesmo agente dentro de `aggregationWindowMs` sao coalescidos numa
unica intencao. O campo `representsEvents` guarda quantos fatos reais a
encenacao resume.

Exemplo: cinco `run.started` de um agente em 1,5 s viram uma unica ida a mesa,
com duracao proporcional a `log2(1 + eventos)`.

### 2. Divida narrativa (`debtMs`)

Toda encenacao tem duracao minima (`minLegibleMs`). Quando o scheduler emite uma
intencao, a divida do agente aumenta em `minDurationMs`. A cada `tick`, a
 divida decresce de `dtMs`.

Quando `debtMs > maxDebtMs`, o agente entra em **modo ambiente**: novos eventos
nao sao encenados, mas aumentam sinais ambientais (`heat`, `incident`, `litter`).

### 3. Orcamento de atencao

`attentionBudget` (padrao 6) e o numero maximo de encenacoes simultaneas. Em
cada `tick`:

1. Expira intencoes ja concluidas.
2. Conta quantas ainda estao em voo.
3. Ordena candidatos por prioridade decrescente, depois `agentId` (para
   determinismo).
4. Emite intencoes ate esgotar o orcamento. Apenas prioridade >= 0.8 furra a
   fila quando o orcamento acabou.

## Configuracao (`NarrativeConfig`)

| Campo | Padrao | Significado |
| --- | --- | --- |
| `minLegibleMs` | 1200 | Duracao minima de uma encenacao legivel. |
| `attentionBudget` | 6 | Maximo de encenacoes simultaneas. |
| `maxDebtMs` | 4000 | Defasagem maxima antes de cair em modo ambiente. |
| `aggregationWindowMs` | 1500 | Janela de coalescencia de eventos. |
| `idleToRestMs` | 25000 | Ociosidade ate ir para a sala de descanso. |
| `runsPorLixo` | 4 | Runs concluidos para gerar uma unidade de lixo. |
| `budgetUsdToday` | 50 | Orcamento diario em USD. |

## Eventos processados

| Evento | Efeito no track | Efeito ambiente |
| --- | --- | --- |
| `agent.discovered` | Cria track para o agente. | - |
| `run.started` | `activeRuns++`, acumula pendencia. | - |
| `run.finished` | `activeRuns--`, `runsConcluidos++`. | Incrementa `litter` a cada N runs; aumenta `heat` se status != ok. |
| `tool.called` | - | Aumenta `heat` se falhar. |
| `llm.completed` | Soma `costUsd` e tokens. | - |
| `error.raised` | Acumula pendencia. | Aumenta `heat` e `incident`; `lightBroken` se `5xx`/`timeout`. Emite chatter. |
| `approval.requested` | `aprovacaoPendente = true`. | Acumula pendencia; emite chatter. |
| `queue.observed` | - | Atualiza `queuePile`. |

## Prioridade de encenacao

Ordem fixa:

1. `0.95` - `aprovacaoPendente` (o unico estado que bloqueia o sistema).
2. `0.80` - `incident > 0.4`.
3. `0.50` - `eventosPendentes > 0`.
4. `0.20` - ocioso, sem runs, nao descansando, acima de `idleToRestMs`.
5. `0.00` - nenhuma acao.

## Comportamentos (`NarrativeIntent.behavior`)

Os comportamentos validos sao:

- `go_to_desk`: sessao de trabalho na mesa. Duracao escalada pelo numero de
  eventos agregados.
- `go_to_break`: descanso na sala de descanso.
- `go_to_door`: aprovacao pendente - o agente vai ate a porta esperar decisao.
- `meet`: incidente - reuniao rapida para tratar problema.
- `work`, `sweep`, `repair`: reservados para extensoes futuras.

A duracao minima e:

- `go_to_door`: `minLegibleMs * 2`
- `meet`: `minLegibleMs * 2.5`
- `go_to_desk`: `minLegibleMs * (1 + log2(1 + eventosPendentes))`
- `go_to_break`: `minLegibleMs * 3`

## Modo ambiente (`AgentAmbient`)

Sinais continuous projetados pelo `WorldEngine` em mesas e salas:

- `heat` (0..1): retrabalho, erros, loops. Visualizado por brilho/cor na mesa.
- `litter` (0..6): volume de trabalho concluido nao coletado. Visualizado como
  pilha de papeis.
- `queuePile` (0..8): profundidade de fila. Visualizado como folhas extras.
- `incident` (0..1): severidade de incidente ativo.
- `lightBroken`: falha de dependencia externa. Visualizado como luz piscando na
  area.

Acoes humanas podem limpar o ambiente:

- `clearLitter(agentId)`: limpa lixo da mesa.
- `repairLight(agentId)`: troca a lampada e reduz incidente.
- `resolveApproval(agentId)`: libera o agente do estado de aprovacao.

## Determinismo

O scheduler e 100% deterministico dado `(cfg, eventos, dtMs)`:

- Ordenacao por `prioridade` e `agentId` (nunca por ordem de insercao).
- `agoraMs` avanca somente via `tick()`.
- IDs de intencao sao sequenciais (`intent-N`).

## Relacao com o resto do sistema

```
DomainEvent -> NarrativeScheduler.ingest()
               NarrativeScheduler.tick(dtMs) -> NarrativeIntent[]
               WorldEngine.tick(intents) -> WorldSnapshot/WorldDelta
               Renderer -> visual
```

## KPIs

`kpis()` devolve:

- `activeRuns`: runs em execucao.
- `costUsdToday` / `budgetUsdToday`: custo e orcamento.
- `errorsLast5Min`: erros nos ultimos 5 min.
- `tokensPerMinute`: tokens no ultimo minuto.
- `pendingApprovals`: aprovacoes pendentes.

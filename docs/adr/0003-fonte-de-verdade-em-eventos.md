# ADR-0003: Fonte unica de verdade em eventos de dominio

- Status: Aceita
- Data: 2026-08-05
- Contexto do produto: `packages/contracts/src/domain-event.ts`, `packages/synthetic/src/index.ts`, `packages/world-engine/src/otlp-ingestor.ts`

## Contexto

A MicroFirma consome telemetria de agentes de duas origens: dados sinteticos (demo) e OTLP (producao). O risco e criar dois mundos distintos: um para demo, outro para producao. A decisao arquitetural precisa garantir que ambos os fluxos alimentem o mesmo `WorldEngine` com a mesma linguagem.

## Investigacao

Os eventos que interessam para o controle espacial sao abstratos: um agente comecou uma tarefa, chamou uma ferramenta, completou, falhou, pediu aprovacao, fila cresceu. Tanto o `SyntheticStream` quanto o `OtlpIngestor` precisam traduzir suas fontes para esse vocabulario comum.

A necessidade emergiu em tres pontos:

1. **SyntheticStream** gerava eventos para demonstracao.
2. **OTLP/JSON** e o formato real de ingestao.
3. **OfficeSession** nao deve saber de onde os eventos vieram.

## Decisao

1. **Contrato unico de `DomainEvent`**: `packages/contracts/src/domain-event.ts` define os tipos canonico (`run.started`, `tool.called`, `llm.completed`, `error.raised`, `approval.requested`, `queue.observed`).
2. **Interface `FonteEventos`**: `SyntheticStream` e `OtlpIngestor` implementam a mesma interface (`poll(dtMs): DomainEvent[]`).
3. **Traducao pura**: `packages/contracts/src/otlp.ts` converte spans OTLP em `DomainEvent`, sem efeitos colaterais, sem acoplamento com o `WorldEngine`.
4. **Ingestao roteada por tenant**: spans reais chegam em `/v1/traces` e sao roteados para o `OtlpIngestor` do tenant via `x-tenant-id`.
5. **Determinismo preservado**: a mesma sequencia de `DomainEvent`s, com a mesma seed, gera o mesmo snapshot independentemente da fonte.

A `OfficeSession` recebe um `fonteEventos` no construtor e nao pergunta se ele e sintetico, OTLP ou outro.

## Consequencias

- Trocar de fonte e uma linha no construtor da `OfficeSession`.
- Testes de carga usam `SyntheticStream` com `carga` multiplicada; producao usa `OtlpIngestor`.
- A mesma interface permite futuras fontes (A2A cards, MCP logs) sem mexer no motor.
- O `WorldEngine` mantem a semantica generica: ele consome `DomainEvent`, nao spans ou logs.

## Alternativas consideradas

- **Dois engines (demo vs producao)**: rejeitada. Duplicaria codigo e perderia determinismo.
- **Ingestao direta de spans no `WorldEngine`**: rejeitada. Acoplaria o motor ao protocolo OTLP.

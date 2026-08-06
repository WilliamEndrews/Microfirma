# ADR-0007: Privacidade por padrao - eventos sem conteudo sensivel

- Status: Aceita
- Data: 2026-08-05
- Contexto do produto: `packages/contracts/src/domain-event.ts`, ingestao OTLP

## Contexto

A MicroFirma observa agentes autonomos que processam dados de clientes: prompts, respostas, conteudo de tickets, codigo fonte. Exibir esse conteudo no canvas ou no painel lateral seria um vazamento de privacidade e um risco de compliance.

## Investigacao

A telemetria real (OTLP) vem com atributos ricos: `gen_ai.prompt`, `gen_ai.completion`, `llm.input`, `llm.output`. Esses atributos sao uteis para debug de custo, mas carregam dados sensiveis. A visualizacao precisa de forma e numeros, nao do conteudo em si.

## Decisao

1. **Eventos de dominio carregam forma, nao conteudo**: duracao, tokens, custo, status, nome da ferramenta, agentId, runId. Nunca o conteudo do prompt/resposta.
2. **Ferramenta por nome**: `tool.called` registra `toolName` (ex: `buscar_crm`), nao os argumentos ou retorno.
3. **Spans com conteudo sensivel sao traduzidos com extracao seletiva**: `packages/contracts/src/otlp.ts` extrai apenas atributos semanticos permitidos.
4. **KPIs agregados nao identificam individuos**: `tokensPerMinute`, `costUsdToday`, `errorsLast5Min` sao numeros globais.
5. **AuditTrail** registra acoes humanas (quem aprovou/pausou/reseed), nao o conteudo observado.

A regra e: se um dado nao e essencial para decidir ou observar o sistema, ele nao entra no `DomainEvent`.

## Consequencias

- A demo pode ser gravada e compartilhada sem expor dados de clientes.
- O canvas e o painel sao seguros para apresentacoes publicas e auditorias externas.
- O `OtlpIngestor` e a unica camada que le atributos sensiveis; ela os descarta antes de gerar `DomainEvent`.
- Compliance por design: PII nao flui para o frontend.

## Alternativas consideradas

- **Exibir conteudo enquanto mascarado**: adicionaria complexidade e risco de vazamento.
- **Permitir opt-in por tenant**: rejeitada para a Fase 0. A padrao deve ser o mais restritivo; opt-in pode ser revisitado futuramente.

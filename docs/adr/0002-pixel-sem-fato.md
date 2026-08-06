# ADR-0002: Nenhum pixel sem fato

- Status: Aceita
- Data: 2026-08-05
- Contexto do produto: `apps/demo/src/App.tsx`, `apps/demo/src/office-renderer-2d.ts`

## Contexto

A MicroFirma apresenta o escritorio dos agentes como uma planta baixa 2D. O risco e o canvas se tornar um "jogo bonito" decorativo: o usuario olha para pixels sem saber de onde eles vieram. Isso destruiria a promessa de observabilidade.

## Investigacao

Toda forma no canvas - cor do ator, estado de uma sala, pilha na mesa, luz acesa - e causada por eventos de dominio processados pelo `WorldEngine`. A pergunta de design foi: **a visualizacao pode inventar informacao?**

A resposta e negativa. Qualquer elemento visual precisa de um `eventId` ou `intentId` de origem. O contrario seria colocar o produto no dominio de videogames, nao de observabilidade.

## Decisao

1. **Nenhum pixel e gerado sem um fato**: cada elemento desenhado no `office-renderer-2d.ts` deriva de um `WorldSnapshot` ou `WorldDelta`.
2. **Fatos visiveis ao usuario**: o painel lateral lista os eventos recentes e o canvas mostra a projecao desses fatos.
3. **Tracabilidade reversivel**: selecionar um ator no canvas revela no painel os eventos que o geraram.
4. **Fatos sao auditaveis**: `AuditTrail` registra acoes humanas e as liga a intencoes e eventos.

A consequencia direta e que o canvas e **sempre** redundante com uma fonte textual acessivel (eventos, KPIs, aprovacoes).

## Consequencias

- O `office-renderer-2d.ts` nao contem strings nem logica de negocio - ele so desenha o que o `WorldSnapshot` manda.
- O painel lateral nao e "acessibilidade extra"; ele e a fonte canonica de informacao, e o canvas e uma projecao.
- A interface pode ser operada sem canvas: um leitor de tela consegue entender o estado todo pelo painel.
- Testes de snapshot garantem que a mesma historia gera os mesmos pixels.

## Alternativas consideradas

- **Canvas como fonte primaria**: rejeitada. Impediría auditoria e acessibilidade.
- **Visualizacao decorativa com animacoes livres**: rejeitada. Quebraria a regra de que cada pixel deve ter um fato.

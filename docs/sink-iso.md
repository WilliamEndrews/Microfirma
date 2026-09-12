# Sink iso — fila Debugpreview → Demo

Fila humana+agente para **sync seletivo** do painter do lab
(`apps/debugpreview`) para o pacote do Demo (`packages/iso-office`).

Debugpreview permanece a bancada. Demo **nao** importa o shell do lab.
Temas/catalogo JSON compartilhados (`temas-arquiteto.json`,
`catalogo-laboratorio.json`) **nao** entram aqui — ja sincronizam sozinhos.

Rotina completa: [`docs/agentes.md`](agentes.md) (secao Sink / fluxo §9).
Regra Cursor: `.cursor/rules/sink-iso.mdc`.

## Frases-gatilho

| Frase do usuario | O que o agente faz |
| --- | --- |
| `mostrar sink` | Lista Pendentes (e resume Aplicados recentes se util) |
| `aplicar sink` / `sincronizar sink` | Drena Pendentes na ordem → porta para `iso-office` com adaptacoes → testes → move item para Aplicados |

## Mapa portavel (candidatos)

- `proto-blit/*`
- `cena-isometrica.ts` (+ teste)
- `desenhar-agencia.ts`
- `montar-agencia.ts` (+ teste)
- `selecionar-pedido.ts` (+ teste)
- `espaco-agencia.ts` (+ teste)
- `oclusao-parede.ts` (+ teste)
- `desenhar-atores.ts`

## Nunca sync (shell do lab)

- `App.tsx`, `PreviewStage.tsx`, `RosaVentos.tsx`
- `tarefa-especial/*`, `simulacao-agentes*`
- CSS blueprint / chrome azul

## Adaptacoes ao portar (obrigatorias)

- seed `demo:` (nao `debugpreview:`)
- labels de lab off; fill claro `#f4f1ea`
- sem overlay D/W nem bolhas de tarefa especial
- elenco real via `construirEspacoAgencia(..., elenco)` quando couber

## Template de item

Copiar para Pendentes / Aplicados / Descartados:

```markdown
### sink-YYYYMMDD-HHMM — titulo curto
- status: pendente | aplicado | descartado
- decisao: agora | depois | nunca
- origem: apps/debugpreview/src/...
- destino: packages/iso-office/src/...
- resumo: 1-3 frases do que mudou
- adaptacoes: seed demo / labels / fill / elenco (se couber)
- testes: quais rodar apos portar (ex.: vitest packages/iso-office)
- chat/data: opcional
- motivo-descarte: so se status=descartado
```

---

## Pendentes

_(vazio — nenhuma mudanca enfileirada)_

---

## Aplicados

### sink-20260912-1629 — hit-test + nameplates Klimmos
- status: aplicado
- decisao: agora
- origem: apps/debugpreview/src/desenhar-atores.ts
- destino: packages/iso-office/src/desenhar-atores.ts
- resumo: `escolherAgenteNoPonto`, nameplates pixel, anel de selecao e opcoes `nomes`/`selecionadoId` no painter de atores. Sem sync do shell do lab.
- adaptacoes: seed demo / labels off / fill claro / elenco real — sem mudanca adicional (so camada dinamica)
- testes: tsc packages/iso-office; vitest packages/iso-characters
- chat/data: wardrobe Klimmos

---

## Descartados

_(vazio)_

# ADR-0011: Internacionalizacao (i18n) da interface da demo

- Status: Aceita
- Data: 2026-08-04
- Contexto do produto: `apps/demo` (painel, legendas, rotulos e eventos)

## Contexto

A MicroFirma precisa ser demonstrada para audiencias internacionais. A
observabilidade de sistemas agenticos e um mercado global; manter a interface em
portugues limita apresentacoes a investidores e compradores nao brasileiros. O
escopo e traduzir o que o usuario LE na demo, nao o codigo, identificadores nem
comentarios (que permanecem em portugues ASCII-only por convencao do repositorio).

## Investigacao

A superficie de strings da UI estava espalhada em `apps/demo/src/App.tsx`:

- Rotulos de atividade (`ROTULO_ATIVIDADE`), estados de conexao, KPIs,
  orcamento, legenda, controles, notas.
- `descreverEvento()` monta frases com interpolacao de nome, ferramenta e
  atividade.
- `aria-label` de secoes e do canvas.
- Dados de demonstracao (`packages/synthetic/src/index.ts`) em portugues:
  nomes de agentes (`Triagem`, `Pesquisa`) e ferramentas (`buscar_crm`, etc.).
- Formatacao numerica manual: `formatarNumero()` concatenava `k` e usava `.` como
  separador decimal fixo.

`apps/demo/src/office-renderer-2d.ts` nao contem strings visiveis (ADR-0009),
entao o renderer nao precisa de i18n.

## Decisao

1. **Idiomas de primeira linha**: `pt-BR` (default), `en-US`, `es-ES`.
2. **Codigo e dados internos**: identificadores, comentarios, nomes de arquivos e
   ADRs permanecem em portugues ASCII-only. Strings visiveis ao usuario vivem em
   arquivos de dicionario.
3. **Dicionario plano**: `apps/demo/src/i18n.ts` contem objetos por idioma, com
   chaves planas e placeholders simples (`{nome}`, `{n}`). Sem ICU complexo
   porque a UI nao exige pluralizacao ou genero na Fase 0.
4. **Hook `useI18n()`**: `apps/demo/src/use-i18n.ts` devolve `t`, `idioma` e
   `setIdioma`. A troca de idioma e em runtime, sem recarregar a pagina, e
   persiste em `localStorage`.
5. **Moeda em USD para todos os locales**: `costUsdToday`/`budgetUsdToday` sao
   exibidos em dolares. Apenas a formatacao do numero e localizada (separador
   decimal, agrupamento) via `Intl.NumberFormat`.
6. **Datas e numeros**: `Intl.DateTimeFormat` e `Intl.NumberFormat` substituem
   formatacao manual.
7. **Acessibilidade**: todos os `aria-label` passam pelo dicionario e `<html
   lang>` e atualizado quando o idioma muda (ADR-0009).
8. **Dados de demonstracao localizaveis**: nomes de agentes e ferramentas na demo
   sao dados de apresentacao, nao parte do contrato. Mantidos em portugues no
   pacote `synthetic`, mas a UI pode optar por rotular genericos quando exibidos.

## Consequencias

- `App.tsx` nao possui mais strings hardcoded em portugues. Toda string visivel
  passa por `t()`.
- Adicionar um novo idioma exige apenas adicionar um novo objeto em `i18n.ts`.
- `formatarNumero()` foi adaptado para usar `Intl.NumberFormat` quando houver
  localizacao; mantem fallback simples para contextos sem `navigator.language`.
- A demo pode ser apresentada em ingles para investidores sem alterar o codigo
  de simulacao.

## Alternativas consideradas

- **i18n-next/react-i18next**: adicionaria dependencias externas e overhead de
  configuracao. Rejeitado porque a superficie de strings e pequena e um hook
  local e suficiente.
- **ICU MessageFormat completo**: rejeitado pela Fase 0. Se a complexidade de
  pluralizacao/genero crescer, a migracao para MessageFormat e um risco
  conhecido, mas nao e justificada agora.
- **Traduzir codigo/identificadores**: rejeitado explicitamente. A convencao do
  repositorio (ASCII-only, portugues) e mais valiosa que o conforto de leitura
  para nao falantes.

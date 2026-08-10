# ADR-0008: Sprites pre-renderizados a partir de 3D

- Status: Aceita (registrada retroativamente em 2026-08-10)
- Data original da decisao: Fase 2
- Contexto do produto: `apps/demo/src/sprite-factory.ts`, `apps/demo/src/office-renderer-2d.ts`

## Nota sobre esta ADR

Esta decisao ja era vigente e citada no codigo
(`office-renderer-2d.ts`, cabecalho "FASE 2 - MELHORIAS (ADR-0008)"), mas nunca
teve arquivo. Este documento registra o que ja valia e serve de base para a
ADR-0012, que a leva a conclusao.

## Contexto

O renderer precisa parecer um ambiente habitado, nao um diagrama. Duas rotas
existiam:

1. **Desenho vetorial em runtime** - cada movel e composto por primitivas
   (losangos extrudados, gradientes, sombras) desenhadas a cada construcao de
   camada estatica.
2. **Sprites pre-renderizados** - a arte e produzida ANTES do runtime (por
   render 3D ou por artista) e o runtime apenas faz `drawImage`.

O custo de GPU/CPU de iluminacao, oclusao e materiais em runtime e alto; num
render offline ele e gratuito, porque e pago uma vez.

## Decisao

Adotar sprites pre-renderizados como caminho de arte do escritorio, com
projecao dimetrica 2:1 (a mesma de `iso()` no renderer, e a mesma de Stardew
Valley e Age of Empires II).

O renderer NAO desenha mobiliario diretamente: ele consome um `SpriteCache` e
faz `drawImage`. Essa fronteira e o que permite trocar a origem da arte sem
tocar no renderer.

## Consequencias

- O renderer ficou agnostico a origem do sprite. `desenharSpriteProp` recebe um
  `CanvasImageSource` - hoje um `HTMLCanvasElement` gerado por
  `sprite-factory.ts`, e no futuro um `HTMLImageElement` vindo de um atlas
  (ver ADR-0012). Essa e a razao pela qual a migracao para catalogo de assets
  nao exige reescrever o renderer.
- Iluminacao, oclusao e material sao pagos uma vez, nao por quadro.
- Trocar tema exige regenerar sprites, nao reescrever renderer.

## Estado real da implementacao (importante)

A decisao foi implementada apenas **parcialmente**. `sprite-factory.ts`
pre-renderiza sprites (o cache existe, o renderer o consome), mas os sprites
sao gerados **proceduralmente com primitivas de Canvas 2D**, nao a partir de
render 3D. Ou seja: a arquitetura da ADR foi cumprida (arte pre-renderizada,
renderer agnostico), mas a fonte de arte prometida (3D) nunca foi construida.

Esse gap e exatamente a causa raiz do problema de qualidade visual relatado
pelo cliente ("conjunto de formas geometricas"), e e o que a ADR-0012 resolve.

## Alternativas consideradas

- **Desenho vetorial puro em runtime**: rejeitada para o alvo final por teto de
  qualidade - primitivas geometricas nao produzem objetos reconheciveis com
  detalhe fino. Permaneceu na pratica como implementacao provisoria.

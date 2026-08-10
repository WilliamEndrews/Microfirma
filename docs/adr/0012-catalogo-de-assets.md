# ADR-0012: Catalogo de assets pre-renderizados (arte como dado, nao como codigo)

- Status: Aceita (direcao aprovada pelo dono do produto em 2026-08-10; implementacao nao iniciada)
- Data: 2026-08-10
- Contexto do produto: `apps/demo/src/sprite-factory.ts`, `apps/demo/src/office-renderer-2d.ts`, `packages/contracts/src/layout.ts`, `packages/world-engine/src/layout-solver.ts`, `packages/world-engine/src/themes.ts`
- Relacionada a: ADR-0002 (nenhum pixel sem fato), ADR-0004 (LLM nao gera coordenadas), ADR-0005 (LLM nunca critico), ADR-0008 (sprites pre-renderizados), ADR-0009 (canvas nunca e fonte unica), ADR-0010 (renderer Canvas 2D)

## Contexto

O cliente avaliou o sandbox e considerou o visual simples demais: "um conjunto
de formas geometricas que juntas dao a impressao de parecer uma mesa". O pedido
e nivel de detalhe comparavel a Stardew Valley, RPG Maker e Gather - armarios,
prateleiras, poltronas, quadros, tapetes, notebooks, xicaras, livros - objetos
que se reconhecem imediatamente.

## Investigacao

A causa raiz NAO e o Canvas 2D (ADR-0010) nem o Agente Arquiteto (que nunca
chegou a rodar - o layout avaliado veio do solver deterministico).

A causa e que **toda a arte e gerada em tempo de execucao por codigo, com
primitivas geometricas**. `sprite-factory.ts` compoe cada movel a partir de
`caixaIso3D()` (losango extrudado + gradiente + sombra). Isso tem teto
intransponivel: primitivas vetoriais nesse tamanho nao carregam detalhe fino.
Stardew e Gather nao desenham moveis em runtime - carregam arte rasterizada
autorada ou pre-renderizada de 3D.

Evidencia que confirma o diagnostico: os **avatares** foram os unicos elementos
considerados bons. Um personagem e uma silhueta simples; uma xicara ou uma
estante com lombadas de livros exige detalhe que primitivas nao entregam.

Dois fatos reduzem drasticamente o custo da correcao:

1. **A ADR-0008 ja decidiu isto** ("sprites pre-renderizados a partir de 3D"),
   mas foi implementada so pela metade: os sprites sao pre-renderizados, porem
   gerados proceduralmente, nao a partir de 3D.
2. **O renderer ja e orientado a sprites.** `desenharSpriteProp(ctx, sprite, x, y)`
   recebe um `CanvasImageSource`. `HTMLCanvasElement` e `HTMLImageElement` sao
   ambos aceitos por `drawImage`. Trocar a origem da arte NAO exige reescrever o
   renderer, NAO exige abandonar Canvas 2D e NAO revoga a ADR-0010.

### Limitacoes do contrato atual (`Prop`)

- `kind` e um enum fechado de 13 valores. Um catalogo tem centenas de itens.
- `cell: Cell` da a todo objeto footprint de exatamente 1 celula. Sofa, estante
  e mesa de reuniao ocupam mais.
- Nao existe relacao de superficie (notebook sobre a mesa, xicara sobre a mesa).

### Conflito com o sistema de temas

Todas as cores do escritorio derivam de `resolverPaleta(layout.theme)`, com 6
temas em `themes.ts`. Arte rasterizada tem cor fixa. Sem decisao explicita, ou
os temas morrem, ou a arte precisa ser refeita depois.

## Decisao

1. **Arte vira dado, nao codigo.** O escritorio passa a ser montado com assets
   pre-renderizados carregados de um atlas, nao com primitivas desenhadas em
   runtime.

2. **Origem da arte: catalogo multi-pack, todos com licenca CC0 (ou
   equivalente que permita redistribuicao + uso comercial) no primeiro ciclo.**
   Nao ha compromisso com um unico pack. Verificados em 2026-08-10, todos
   CC0 e com categoria/estilo compativel com pre-render em Blender:
   - `kenney.nl/assets/furniture-kit` - 140 arquivos, 3D. Mobilia estrutural
     base (mesas, cadeiras, armarios, estantes, sofas).
   - `kenney.nl/assets/nature-kit` - 330 arquivos, 3D. Plantas, vasos,
     elementos naturais.
   - `kenney.nl/assets/isometric-tiles-landscape` - 128 arquivos, 2D, CC0.
     Piso/terreno em projecao isometrica - candidato a base de piso.
   - Foliage Pack (Kenney, 2D, CC0, 100 arquivos) - candidato a vegetacao
     como sprite 2D piano (ver decisao 3b).
   - Packs de terceiros no ecossistema itch.io tambem sob CC0: MrEliptik
     "Office low-poly pack" (25+ itens, com o detalhe de superficie que
     faltava: notebook, xicara, impressora, luminaria, mouse), Omie's Assets
     "Office Set" (mobilia com textura PBR completa), Khaleer "Lowpoly
     Interior Kit" (37 itens, cores facilmente editaveis).
   Motivo da escolha por CC0: a MicroFirma pretende suportar deploy
   on-premises e air-gapped, e num app web o atlas e necessariamente
   redistribuido ao navegador. Licencas tipicas de pack de jogo (Unity Asset
   Store, parte do itch.io, CGTrader) restringem redistribuicao ou restringem
   uso a "jogos" - criariam passivo juridico na venda enterprise.
   **Regra de licenciamento (revisada)**: nao existe "uma licenca para o
   projeto inteiro". Cada asset entra no manifesto com sua PROPRIA licenca
   declarada (`license`, `sourceUrl`, `packId`), e cada uma precisa satisfazer
   INDEPENDENTEMENTE o requisito de redistribuicao + uso comercial +
   on-premises. Misturar varios packs CC0 e seguro, porque cada um satisfaz a
   regra por si só. O que e proibido e introduzir um asset cuja licenca NAO
   satisfaca a regra, nao misturar fontes.

3. **Os assets sao modelos 3D, e nos os pre-renderizamos.** Esta e a
   consequencia mais importante da escolha, e e o que cumpre finalmente a
   ADR-0008. Como controlamos o render (Blender, offline), controlamos:
   - **a projecao**: camera configurada para dimetrica 2:1 exata, batendo com
     `iso()` do renderer. Elimina o risco de assets que nao assentam no piso -
     risco real ao baixar packs 2D prontos, que costumam ser isometrico
     verdadeiro (30 graus) ou top-down;
   - **a iluminacao e o material**: sombras suaves e oclusao pagas uma vez;
   - **a normalizacao entre packs de autores diferentes**: cada pack tem sua
     propria escala e convencao de unidade (Kenney usa grid modular de 1m
     consistente entre seus proprios kits; packs de outros autores, nao). A
     normalizacao (escala, altura de ancoragem, orientacao) acontece uma vez
     por asset, no pipeline de render - e o motivo pelo qual pre-renderizar
     tudo nos mesmos, em vez de usar sprites 2D prontos de fontes variadas, e
     o que torna seguro misturar packs de autores diferentes dentro do mesmo
     tema sem produzir efeito "colcha de retalhos".

   **3b. Vegetacao pode ser sprite 2D plano, nao 3D.** Como a camera nunca
   gira (dimetrica fixa), uma planta nao precisa ser lida de varios angulos -
   um sprite 2D "cutout" (tecnica classica de jogos isometricos) resolve com
   custo de pipeline menor que 3D. Candidato: Foliage Pack (Kenney, CC0, ja
   2D). Avaliar na pratica; se a leitura visual ficar inferior aos moveis 3D
   ao lado, promover para 3D como os demais.

4. **`kind` permanece; `assetId` e adicionado.**
   `kind` NAO e escolha visual, e semantica: liga o movel ao `ownerAgentId`,
   alimenta o painel lateral e o leitor de tela, e dirige a simulacao.
   Substitui-lo por `assetId` violaria ADR-0002 e ADR-0009.
   - `kind` (obrigatorio, enum atual): papel semantico. Dirige simulacao,
     painel, acessibilidade e todos os testes existentes.
   - `assetId` (opcional, string validada contra o manifesto): variante visual.
     Dirige apenas o render.
   Sendo opcional, os 206 testes atuais seguem validos sem alteracao, e o
   sprite procedural atual vira fallback automatico quando o asset nao existir.

5. **Decoracao de superficie vive fora de `props`.** Notebooks, xicaras, livros
   e papeis entram num array `decor[]` separado, explicitamente **nao-colidivel
   e sem semantica**, gerado pelo solver com a mesma seed. O `navgrid` nunca o
   consome. Motivo: se um notebook entrar no array que alimenta o pathfinding,
   ele vira obstaculo e pode quebrar invariantes de alcancabilidade cobertas
   por 39 testes.

6. **Temas: reduzir de 6 para 2-3, e cada tema mapeia para um CONJUNTO DE
   PACKS, nao para uma variante de cor do mesmo modelo.**
   Decisao revisada em 2026-08-10 apos analise conjunta com o dono do produto.
   A formulacao original desta ADR (mesmo modelo 3D, re-renderizado com
   materiais diferentes por tema) foi substituida por uma abordagem superior:
   **cada tema e um conjunto de asset packs**, o que traz diferenciacao real
   de forma (mesas, cadeiras e armarios com desenho proprio), nao so de cor.
   - Um subconjunto de packs e **base compartilhada**, fixo entre todos os
     temas: piso (`isometric-tiles-landscape` ou equivalente) e vegetacao
     (`nature-kit`/Foliage Pack). Motivo: piso e planta aparecem em toda sala
     e em toda mesa; variar entre temas produziria costura visual nas
     transicoes entre salas do mesmo escritorio.
   - O restante do catalogo de cada tema (mobilia estrutural + decor de
     superficie) vem de um pack ou conjunto de packs proprio daquele tema.
   - Isso abre um eixo de produto (nao arquitetural, mas registrado aqui
     porque motiva a decisao): tema "base" usando so packs CC0 gratuitos, e
     tema(s) "premium" usando pack pago/encomendado com fidelidade visual
     maior - um diferenciador de camada de produto, nao so estetico.
   Consequencia: `TEMAS` em `themes.ts` ganha um campo de mapeamento para
   `packId`s (estrutural + base compartilhada), e `resolverPaleta` passa a
   governar apenas piso, paredes e iluminacao ambiente - a mobilia vem
   inteiramente do pack do tema, nao de tingimento em runtime.

7. **O LLM escolhe o estilo; o solver posiciona.** O Agente Decorador escolhe
   tema e subconjunto do catalogo (uma chamada por escritorio, com fallback
   deterministico, ADR-0005). O solver deterministico continua posicionando -
   inclusive escolhendo `assetId` dentro do subconjunto, por seed. O LLM NAO
   posiciona objetos: isso reintroduziria o problema que a ADR-0004 eliminou
   (modelo lidando com restricao espacial).
   O "escritorio nunca igual" vem do espaco de seeds x subconjuntos de
   catalogo, nao da criatividade do modelo.

## Consequencias

### Positivas

- Qualidade visual deixa de ter teto de primitiva geometrica.
- ADR-0010 (Canvas 2D) permanece valida - `drawImage` de atlas nao exige GPU.
- ADR-0008 e finalmente cumprida na integra.
- Determinismo preservado: assets sao escolhidos por seed; replay continua
  reproduzivel.
- Cadeia testada intocada: solver, navgrid, world engine, snapshot/delta e
  painel nao mudam de contrato (exceto o footprint, abaixo).

### Negativas e custos

- **Footprint multi-celula e o custo real de engenharia.** Sofa e estante
  precisam ocupar mais de uma celula, o que toca `navgrid` (colisao) e
  `reservar()` no `layout-solver`, ambos cobertos por testes de invariante.
  E o unico item que exige cuidado com regressao.
- Pipeline de build de arte (Blender headless -> atlas) passa a existir e
  precisa ser reproduzivel e versionado.
- Tamanho do bundle/atlas passa a importar, especialmente para air-gapped.
- Reducao de temas e perda deliberada de funcionalidade existente.

### Riscos aceitos

- CC0 nao oferece indenizacao nem garantia (natureza da licenca). Aceito: o
  risco de terceiro reivindicar direito sobre asset CC0 amplamente distribuido
  e baixo, e a alternativa (pack pago) frequentemente proibe justamente a
  redistribuicao de que precisamos.
- Estetica Kenney e reconhecivel e ja usada por outros produtos. Aceito para o
  primeiro ciclo; mitigavel depois com arte encomendada, sem mudar arquitetura
  nenhuma - o catalogo e uma fronteira, trocar a arte por tras dele e barato.

## Alternativas consideradas

- **Continuar melhorando `sprite-factory.ts`**: rejeitada. E o teto do meio, nao
  falha de execucao. Mais gradiente nao vira uma xicara reconhecivel.
- **Substituir `kind` por `assetId`**: rejeitada. Perderia semantica,
  acessibilidade (ADR-0009) e rastreabilidade pixel-fato (ADR-0002).
- **Migrar para PixiJS/WebGPU junto**: rejeitada por ora. E ortogonal ao
  problema - o problema e a arte, nao o renderer. Misturar as duas mudancas
  dobraria o risco e revisitaria a ADR-0010 sem necessidade.
- **LLM posicionando objetos**: rejeitada por ADR-0004.
- **Assets 2D prontos baixados de packs**: rejeitada como via principal por
  risco de projecao incompativel e por impossibilitar variantes de tema. Os
  modelos 3D CC0 renderizados por nos resolvem os dois problemas.
- **Manter 6 temas com tingimento em runtime**: rejeitada pelo dono do produto;
  limitaria a riqueza de cor por objeto, que e justamente a queixa original.
- **Tema = mesmo modelo 3D com material variado (formulacao original desta
  ADR)**: substituida por tema = conjunto de packs. Motivo: variar so o
  material produz diferenciacao mais pobre que variar a forma do objeto; a
  abordagem de conjunto de packs tambem abre um eixo de produto (tema base
  gratuito vs. tema premium) que a variante de material nao oferecia.
- **Um catalogo monolitico de fonte unica (ex.: so Kenney)**: rejeitada.
  Existe material CC0 de qualidade em multiplas fontes (Kenney, MrEliptik,
  Omie's Assets, Khaleer) cobrindo lacunas diferentes (Kenney: estrutura;
  MrEliptik/Omie's: decor de superficie fino - notebook, xicara, impressora).
  Limitar a uma fonte deixaria de aproveitar decor de superficie que a
  investigacao original apontou como faltante.

# Laboratorio TinyHouse

Passo oficial de ajuste visual do escritorio E biblia do arquiteto:
sprites catalogados, intencao obrigatorio/aleatorio/off, paletas de piso
e parede. Sempre que piso, parede, porta ou um asset parecerem fora do
lugar, volte aqui antes de mexer no renderer da demo.

## Como abrir

Na raiz do repo:

```
pnpm lab:iso
```

Depois abra http://127.0.0.1:3333/scripts/iso-validation/tinyhouse.html
(F5 se o cache grudar).

`lab:iso` sobe o **lab-server** (Node), nao mais o `python -m http.server`.
Alem de servir arquivos da raiz do repo, expoe:

- `POST /api/temas-arquiteto` — grava a biblia no disco ao salvar/apagar tema
- `POST /api/combinacoes-laboratorio` — grava combos no disco ao salvar tema ou combinacao

O **Debugpreview** le `catalogo-laboratorio.json` **e** `combinacoes-laboratorio.json`
(mesma regra do lab: `specPorId` = assets + combos).

O servidor precisa ser a raiz do repo: o HTML busca os PNGs em
`assets-source/`, a calibracao em `apps/demo/src/calibracao-tinyhouse.json`
e o catalogo em `scripts/iso-validation/catalogo-laboratorio.json`.
Temas do Construtor: `packages/world-engine/src/biblia/temas-arquiteto.json`.
Combos: `scripts/iso-validation/combinacoes-laboratorio.json`.

## Fronteira Construtor vs pixel

- **Construtor** (`solveLayout`) le esta biblia e emite grade, `walls`,
  `tileSetId`, `Prop.assetId` e `WallMount`. Nao calcula pe/ancora.
- **Lab + `calibracao-tinyhouse.json`**: pe no vertice, folga da porta,
  spec de mesa/bebedouro. `projecao.ts` deriva ancora (`ancoraDePe`).
- **Renderer**: so blita o `OfficeLayout`. Se o pe mudar, F5 no lab e na demo;
  nao chute ancora no renderer.

## Combinar assets (olho-metro de superficie)

O catalogo nao consegue assentar um notebook no tampo so com ancora de
celula: mesa e laptop ocupam o mesmo losango. O botao **combinar assets**
abre um segundo preview (abaixo das medidas do palco 3x3):

1. Clique **combinar assets** na coluna de cards.
2. Clique a mesa, depois o notebook (e teclado, telefone, etc.).
3. Arraste no canvas de baixo para alinhar. Clique a peca (canvas ou
   lista) e **remover peca** / Delete tira ela da combinacao.
4. Ordem de desenho: a lista vai de **atras** (primeiro, cadeira sob a
   mesa) para **frente** (ultimo, notebook no tampo). Cadeira/sofa
   entram atras sozinhas; tapete mais atras ainda; decor na frente.
   **atras** / **frente** (ou [ / ]) ajustam se o automatico errar.
5. Preencha nome / kind / papel / id (mesmo formato dos cards) e
   **salvar combinacao no catalogo**. O combo vira card (borda verde).
   Com `lab-server` rodando, combos gravam automaticamente em
   `combinacoes-laboratorio.json` (tambem ao salvar/apagar tema).
6. **copiar combinacoes JSON** ainda exporta para colar manualmente, se precisar.
   Combos ficam no laboratorio e no palco 3x3; ainda nao entram no solver.

Clique de novo **combinar assets** para fechar. Combos existentes podem
ser desmontados no preview (as camadas entram soltas, sem aninhar).

## Palco expansivel (grade + andares)

Em vez de um botao por celula (3,0 / 3,1 / 3,2), a barra sob o canvas
cresce a sala inteira:

- **+gx** adiciona a coluna de maior gx (ex.: num 3x3, vira 4x3 e nasce
  `3,0  3,1  3,2`). **−gx** remove essa coluna e o que estiver plantado nela.
- **+gy / −gy** idem na profundidade.
- Paredes **NW** (Wall_R na aresta norte, Wall_L na oeste) acompanham o
  perimetro. A porta fica no centro da aresta norte, como o solver.
- **andares** empilha a mesma malha. A subida e medida no PNG:
  `peWallR.y - bbox.y` (altura da parede acima do pe). Com 2+ andares,
  **subida ±** faz o olhometro; o valor entra no JSON do laboratorio
  (`subidaAndar`). Para gravar na demo, cole em
  `calibracao-tinyhouse.json`.
- O canvas recentra sozinho. Maximo 8x8 e 3 andares. Ainda NAO alimenta
  o world-engine.

## Palco gamificado (caderninho + DnD)

UI atual do laboratorio (2026-09):

1. Modos **Palco Principal** | **Combinar assets** (um canvas por vez).
2. **Caderninho** lateral: abas Assets / Ambiente / Temas. Filtros
   `todos` | `piso` | `parede` | `decor`. Arraste um card para o palco
   (ou clique para plantar na celula/face atual).
3. Hit-test automatico: perto da parede NW ancora como anexo; no centro
   ancora no piso (quarteis internos, sem UI de subdivisao). Clique no
   chao vazio **nao** captura grade — so pecas sao selecionaveis.
4. **Piso, parede e decor empilham** no mesmo slot (um asset novo nao
   substitui o anterior). Arraste a peca selecionada para reposicionar.
5. **Ctrl+Z** / **Ctrl+Y** (ou Ctrl+Shift+Z) desfaz/refaz acoes do
   canvas. **Delete** remove a peca selecionada.
6. Diagnostico (grade azul / ancoras) fica **desligado** por padrao;
   ligue so quando precisar medir.
7. Persistencia: `localStorage` + `lab-server` (temas/combos no disco).
   **resetar JSON do repo** volta ao arquivo.

## Plantar na parede (face + drag)

As paredes NW ja existem: `Wall_R` em `gy=0` (todo `gx`), `Wall_L` em `gx=0`
(todo `gy`). O pe da parede e o da calibracao (32,83) / (95,83). O offset
da peca e olho-metro, como as `camadas` do combinador.

1. Arraste um card `papel: wall` perto da aresta NW, ou clique a peca
   depois de selecionar a face.
2. Nasce com `dx: 0` e `dy` numa fracao da subida medida (`pe.y − bbox.y`).
3. Arraste no palco. O que vale e `{ face, gx, gy, dx, dy }` no item.
4. Chips da lista: **remover**, **espelhar** (L↔R quando elegivel).
   Delete tambem remove.

Persistido no palco (e portanto no tema):

```json
{ "assetId": "office-ac", "papel": "wall", "face": "R", "gx": 1, "gy": 0, "dx": 4, "dy": -42 }
```

Se o pe da parede mudar no JSON da demo, F5 realinha o grupo; os offsets
relativos permanecem. No Construtor, pecas `papel: wall` do tema viram
`WallMount` (nao bloqueiam nav).

## Temas do arquiteto (tileset + mobilia + palco)

1. Escolha piso/parede, tamanho do palco, andares e plante a mobilia
   (piso e/ou parede).
2. Nomeie. **zona** e o `ZoneRequest.kind` (+ `corridor`): private, break
   (copa), boss_room (Boss Room / gerente), open, meeting, reception,
   war_room, corridor. Default `private`.
   **prioridade** (1-9) e **unico na agencia** sao dicas para o Construtor:
   maior prioridade entra primeiro; unico = no maximo uma sala com aquele
   tema por cliente. O Construtor ja consome isso.
3. **salvar tema** grava tileset + pecas (incluindo parede) + `zonaKind` +
   `grade` + `andares` + `subidaAndar` + subdivisao + `postosTrabalho` (assentos
   marcados no lab) + um recorte da calibracao GRAVADA como referencia. Tambem
   persiste automaticamente no disco via `lab-server`. Use **recarregar do disco**
   para descartar rascunho do localStorage e reler o JSON do repo.
4. Combos usados no palco precisam existir em `combinacoes-laboratorio.json`
   (mesclados no boot; disco vence conflitos). Pecas sem asset aparecem no banner
   laranja abaixo do formulario de temas.
5. A lista agrupa por zona (`copa · 3x3 · P5`). **carregar** devolve palco
   e o form. **copiar temas JSON** ainda copia para a area de transferencia
   e tambem dispara a mesma gravacao no disco.

Politica de pisos/paredes (`politicaTiles`) continua sendo do **escritorio
inteiro** por zona; o tema e a **mobilia + palco modelo** daquela zona.
Quando o Construtor consome isto: `room.kind === tema.zonaKind`, depois
`prioridade`, depois `unicoNaAgencia`. Ja ligado em `solveLayout`.

## Pisos e paredes por zona

Camada acima dos temas: o Construtor recebe uma **politica** por zona
(`corridor`, `break`/copa, `private`, `boss_room`, `open`, `meeting`, `reception`,
`war_room` — os kinds do `ZoneRequest` mais o corredor-espinha).

- **default** — usa o piso/parede do tema do arquiteto daquela sala.
- **unico** — uma cor so (ex. corredor sempre `Concrete`).
- **opcoes** — lista fechada; o Construtor escolhe com a seed.

Paredes vazias herdadas do tema mesmo em unico/opcoes. **ver no palco**
aplica a primeira opcao da zona no canvas para o olhometro.
`solveLayout` le `politicaTiles` da biblia do Construtor.

## Subdivisao da celula (experimento, 4 azuis)

Cada losango de piso e 1 celula do solver. O checkbox **subdividir celula**
desenha 4 losangos azuis (2x2, passo 0.5) e o clique seleciona um quarto.
Bebedouro, planta, telefone cabem; mesa 128px transborda os vizinhos — isso
e visivel de proposito. O world-engine continua 1 prop por celula; promover
a malha 0.5 e um passo a parte (invariantes de navgrid).

## Calibracao de mesa e bebedouro (rodada 5)

- **Mesa principal** (`desk`): canvas 128 alinhado ao piso. Ancora (64, 68),
  o mesmo ponto da face do diamante. Nao usa mais o pe da bbox, que puxava
  a mesa para o norte da celula.
- **Bebedouro** (`water`): itens de canto. O pe (64, 63) - vertice norte do
  diamante de chao do sprite - prega no vertice NW da celula (`iso(gx, gy)`),
  o mesmo esquadro amarelo das paredes. Plantar na celula 0,0 para conferir.

Numeros em `apps/demo/src/calibracao-tinyhouse.json` (`objetos.desk` /
`objetos.water`). A demo (`sprite-factory.ts`) le esses valores. Olhometro
aqui, F5, depois a demo.

## Fluxo de calibracao de parede/porta

1. Ligue **diagnostico** (amarelo = perimetro 3x3, magenta = bbox da parede).
2. Se o pe ou a folga da porta mudar, grave os numeros em
   `apps/demo/src/calibracao-tinyhouse.json`.
3. Recarregue o laboratorio (ele le o JSON) e a demo em `?agents=1` / `?agents=7`.
4. Nao chute ancora em `projecao.ts`: ela deriva do JSON (`ancoraDePe`).

## O que esta gravado (rodada 4, plano B)

- Piso: ancora (64, 68), centro da face do diamante.
- Wall_R / Wall_L: pe do chao no vertice da aresta.
- Porta: folha 1:1 em cima da Wall_R, sem esticar e sem substituir o tile.

## Outros arquivos nesta pasta

- `tinyhouse-lab.js` - palco expansivel, catalogo, paletas, temas, combinador, modo parede.
- `catalogo-laboratorio.json` - biblia visual (espelha INITIAL_CATALOG v2.4; copa TinyHouse).
- `combinacoes-laboratorio.json` - combos drag-drop (assetId + dx/dy por camada).
- `temas-arquiteto.json` - copia local; a biblia viva e
  `packages/world-engine/src/biblia/temas-arquiteto.json`.
- `medir-tinyhouse.js` - bbox/IHDR dos PNGs (numeros brutos, nao ancora).
- `index.html` - harness legado do Furniture Kit Kenney (projecao 44x22).

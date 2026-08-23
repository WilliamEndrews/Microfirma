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
Alem de servir arquivos da raiz do repo, expoe `POST /api/temas-arquiteto`
para gravar a biblia no disco quando voce salva/apaga um tema.

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
6. **copiar combinacoes JSON** cola em `combinacoes-laboratorio.json`.
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

## Palco + catalogo (2026-08-17)

1. Clique um losango da malha (celula amarela). Radio **plantar: piso**.
2. Clique um card da tabela (miniatura + nome + kind) para plantar o sprite.
   Clique de novo o mesmo asset na mesma celula para remover. Um `prop` por
   celula; `decor` empilha. Cards de **parede** (borda ocre) nao plantam no
   losango — mude o radio para parede.
3. Radio **obrigatorio** / **aleatorio** / **off** marca a intencao do
   Construtor. Ainda NAO alimenta o solver (`PROP_OBRIGATORIOS` /
   `PROP_OPCIONAIS` em `asset-catalog.ts`). Copie o JSON da pagina para
   `catalogo-laboratorio.json` quando quiser gravar no repo.
4. Catalogo fica ao lado do palco. Paletas (tileset, mix livre, zona, temas)
   e o JSON abrem/fecham no cabecalho **abrir/fechar**; o estado fica no
   navegador. Mix livre de piso/parede nas amostras (rolar; o proto do topo
   explica o produto).
5. Persistencia de brincadeira: `localStorage`. "resetar JSON do repo" volta
   ao arquivo. "diagnostico" religa bbox magenta e pe (o esquadro amarelo
   do palco fica sempre visivel).

## Plantar na parede (face + drag)

As paredes NW ja existem: `Wall_R` em `gy=0` (todo `gx`), `Wall_L` em `gx=0`
(todo `gy`). Nao ha ancora extra em `calibracao-tinyhouse.json`: o pe da
parede e o mesmo da calibracao (32,83) / (95,83). O offset da peca e
olho-metro, como as `camadas` do combinador.

1. Radio **plantar: parede**.
2. Clique a face (bbox da parede, nao o losango do piso). Highlight dourado.
3. Clique um card (`papel: wall` ou qualquer um neste modo). Nasce com
   `dx: 0` e `dy` numa fracao da subida medida (`pe.y − bbox.y`).
4. Arraste no palco. O que vale e `{ face, gx, gy, dx, dy }` no item.
5. **remover** na lista da face, ou Delete, tira a peca. Clique de novo o
   mesmo card na mesma face tambem remove.

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
   (copa), open, meeting, reception, war_room, corridor. Default `private`.
   **prioridade** (1-9) e **unico na agencia** sao dicas para o Construtor:
   maior prioridade entra primeiro; unico = no maximo uma sala com aquele
   tema por cliente. O Construtor ja consome isso.
3. **salvar tema** grava tileset + pecas (incluindo parede) + `zonaKind` +
   `grade` + `andares` + `subidaAndar` + subdivisao + um recorte da
   calibracao GRAVADA como referencia. Tambem persiste automaticamente
   no disco (`packages/world-engine/src/biblia/temas-arquiteto.json` e
   espelho em `scripts/iso-validation/temas-arquiteto.json`) via
   `lab-server`. O blit do laboratorio continua lendo
   `calibracao-tinyhouse.json` — o tema nao inventa ancora.
4. A lista agrupa por zona (`copa · 3x3 · P5`). **carregar** devolve palco
   e o form. **copiar temas JSON** ainda copia para a area de transferencia
   e tambem dispara a mesma gravacao no disco.

Politica de pisos/paredes (`politicaTiles`) continua sendo do **escritorio
inteiro** por zona; o tema e a **mobilia + palco modelo** daquela zona.
Quando o Construtor consome isto: `room.kind === tema.zonaKind`, depois
`prioridade`, depois `unicoNaAgencia`. Ja ligado em `solveLayout`.

## Pisos e paredes por zona

Camada acima dos temas: o Construtor recebe uma **politica** por zona
(`corridor`, `break`/copa, `private`, `open`, `meeting`, `reception`,
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

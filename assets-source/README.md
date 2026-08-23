# assets-source - fontes brutas de assets (ADR-0012)

> Materia-prima para o catalogo de assets do escritorio (mobilia, decoracao,
> piso, vegetacao). O Vite da demo serve esta pasta como `publicDir`: o
> atlas em `apps/demo/src/asset-atlas.ts` carrega PNGs daqui em runtime
> (`basePath` de cada pack em `packages/contracts/src/asset-catalog.ts`).
>
> Versionamento: binarios (`.png`, `.jpg`, `.fbx`, `.obj`, `.dae`, `.stl`,
> `.gltf`, `.glb`, `.zip`, `.rar`, `.blend`, `.blend1`, `.spp`, `.tga`) sob
> esta pasta vao para Git LFS - ver `.gitattributes` na raiz do repositorio.
> Rodar `git lfs install` uma vez por clone antes de trabalhar aqui.

## Proveniencia e licenca (obrigatorio manter atualizado)

Regra do ADR-0012: cada pack declara sua PROPRIA licenca. Nao existe "uma
licenca para o projeto"; cada entrada abaixo precisa satisfazer,
independentemente, redistribuicao + uso comercial + deploy on-premises antes
de entrar aqui. TinyHouse e a unica excecao comercial paga, autorizada
explicitamente para este projeto.

| Pasta | Pack | Fonte | Licenca | Verificado em | Conteudo |
| --- | --- | --- | --- | --- | --- |
| `tinyhouse-pixel-salvaje/` | TinyHouse 0.17 | pixelsalvaje.itch.io/tinyhouse, autor Pixel_Salvaje | commercial-paid (autorizado no projeto; NAO e CC0) | 2026-08-16 | Fonte primaria do escritorio. Canvas 128x128 para tiles de estrutura. Medido: piso bbox 128x72 (y=36..107), Wall_L/R bbox 72x115, porta de vidro 51x122 no mesmo canvas. Pasta `TinyHouse/` com Office, Desks, Chairs, Computer, Floor_Wall_Tiles_128, Doors, Plants, Sofa, Books. `Door_1_Beige.png` e spritesheet 640x128 (5 frames) - nao blit do PNG inteiro. |
| `kenney-furniture-kit/` | Furniture Kit | kenney.nl/assets/furniture-kit | CC0 (arquivo `License.txt` incluso) | 2026-08-10 | 140 modelos 3D (GLTF/FBX/OBJ/DAE/STL) + 560 sprites isometricos pre-renderizados pelo fornecedor (140 x 4 rotacoes NE/NW/SE/SW) + 140 sprites de vista lateral. Mobilia estrutural base: mesas, cadeiras, sofas, armarios, estantes. Registrado em `KNOWN_PACKS`; sem `AssetEntry` no catalogo ativo (TinyHouse substitui). |
| `kenney-nature-kit/` | Nature Kit | kenney.nl/assets/nature-kit | CC0 (arquivo `License.txt` incluso) | 2026-08-10 | Modelos 3D + sprites isometricos em `Isometric/`. Registrado em `KNOWN_PACKS`; vegetacao ativa veio do TinyHouse (`Plant_2`). |
| `kenney-isometric-tiles-landscape/` | Isometric Tiles Landscape | kenney.nl/assets/isometric-tiles-landscape | CC0 (arquivo `License.txt` incluso) | 2026-08-10 | 2D, sprites de piso/terreno. Nao usado no renderer ativo (piso e TinyHouse). |
| `kenney-foliage-pack/` | Foliage Pack | kenney.nl/assets/foliage-pack | CC0 (arquivo `License.txt` incluso) | 2026-08-10 | 2D, 100 arquivos. Candidato a vegetacao como sprite plano. |
| `sbs-isometric-floor-tiles/` | Isometric Tiles - Floor Pack (variante Large 256x128) | screamingbrainstudios.itch.io/isotilepack, autor Screaming Brain Studios | CC0/Public Domain (arquivo `License.txt` incluso) | 2026-08-10 | 2D, 57 arquivos. Projecao 2:1. Nao e o piso ativo: o renderer usa Floor_128 do TinyHouse. |
| `omies-assets-office-set/` | Office Cubicle Set (Office Set) | omies-assets.itch.io/omies-assets-office-set, autor Omie's Assets | CC0 (declarado na pagina do produto) | 2026-08-10 | 138 arquivos, ~582 MB. FBX + PBR. Precisa do pipeline Blender antes de virar `AssetEntry`. |

### Pendentes (nao automatizaveis por download direto)

Este NAO pode ser baixado por mim de forma automatica: o itch.io exige fluxo
de "compra" (mesmo gratuito, "name your own price") com sessao de navegador e
link de download gerado dinamicamente, nao uma URL estatica. Precisa ser
baixado por um humano e entregue (arquivo ou pasta) para entrar aqui com a
mesma estrutura de proveniencia.

| Pasta (a criar) | Pack | Fonte | Licenca declarada pelo fornecedor | Conteudo esperado |
| --- | --- | --- | --- | --- |
| `mreliptik-office-low-poly/` | Office low poly pack | mreliptik.itch.io/office-low-poly-pack | CC0 | 25+ itens 3D: tablet, camera, laptop, impressora, luminaria, caneca, mousepad, PC, monitor ultrawide. |

## Estado atual

Pack ativo no renderer: **TinyHouse** (`tinyhouse-pixel-salvaje`). Constantes
em `apps/demo/src/projecao.ts` (medidas 2026-08-16):

- `LARGURA_TILE=128`, `ALTURA_TILE=64` (2:1, 1:1 com o canvas do pack)
- Piso `ANCORA_PISO = {x:64, y:68}`; paredes/porta derivadas do pe de chao
  em `apps/demo/src/calibracao-tinyhouse.json` (laboratorio
  `pnpm lab:iso`, `scripts/iso-validation/tinyhouse.html`)
- Porta plano B: folha 1:1 sobre Wall_R, nao substitui o tile
- `PX_POR_METRO=56`, `METROS_POR_CELULA~1.28` (aresta hypot(64,32)/56)

`INITIAL_CATALOG` v2.1 cobre desk, chair, bookshelf, sofa, cabinet, plant,
printer, water, coffee, board, lamp, rug, laptop, monitor, keyboard, books,
radio (telefone) + tileset de piso/parede. Variantes extra (mesa, cadeira,
planta, armario, estante, copiadora) estao no manifesto; o atlas ainda usa
o ultimo asset de cada kind. Mouse e meter nao tem PNG de repouso. Kenney/
SBS/Omie's continuam em `KNOWN_PACKS` mas fora do catalogo de `AssetEntry`
ativo.

Pipeline Blender (`scripts/blender-render/`) existe para Omie's Assets; nao
e o caminho do escritorio atual.

## Observacao tecnica (Kenney vs TinyHouse)

A projecao ativa NAO e mais 44x22. Quem for reavaliar o Furniture Kit precisa
comparar contra `LARGURA_TILE=128` / `ALTURA_TILE=64` em `projecao.ts`, nao
contra o renderer PixiJS legado (`office-renderer.ts`).

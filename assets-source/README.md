# assets-source - fontes brutas de assets (ADR-0012)

> Materia-prima para o catalogo de assets do escritorio (mobilia, decoracao,
> piso, vegetacao). Arquivos aqui sao FONTES BRUTAS (modelos 3D, sprites
> prontos do fornecedor) - ainda NAO processados pelo pipeline de render da
> MicroFirma nem referenciados pelo `@microfirma/demo`. Nenhum codigo do
> projeto importa nada desta pasta ainda.
>
> Versionamento: binarios (`.png`, `.fbx`, `.obj`, `.dae`, `.stl`, `.gltf`,
> `.glb`, `.zip`, `.blend`) sob esta pasta vao para Git LFS - ver
> `.gitattributes` na raiz do repositorio. Rodar `git lfs install` uma vez por
> clone antes de trabalhar aqui.

## Proveniencia e licenca (obrigatorio manter atualizado)

Regra do ADR-0012: cada pack declara sua PROPRIA licenca. Nao existe "uma
licenca para o projeto"; cada entrada abaixo precisa satisfazer,
independentemente, redistribuicao + uso comercial + deploy on-premises antes
de entrar aqui.

| Pasta | Pack | Fonte | Licenca | Verificado em | Conteudo |
| --- | --- | --- | --- | --- | --- |
| `kenney-furniture-kit/` | Furniture Kit | kenney.nl/assets/furniture-kit | CC0 (arquivo `License.txt` incluso) | 2026-08-10 | 140 modelos 3D (GLTF/FBX/OBJ/DAE/STL) + 560 sprites isometricos pre-renderizados pelo fornecedor (140 x 4 rotacoes NE/NW/SE/SW) + 140 sprites de vista lateral. Mobilia estrutural base: mesas, cadeiras, sofas, armarios, estantes. |
| `kenney-nature-kit/` | Nature Kit | kenney.nl/assets/nature-kit | CC0 (arquivo `License.txt` incluso) | 2026-08-10 | 3D. Plantas, vasos, arvores, rochas. |
| `kenney-isometric-tiles-landscape/` | Isometric Tiles Landscape | kenney.nl/assets/isometric-tiles-landscape | CC0 (arquivo `License.txt` incluso) | 2026-08-10 | 2D, sprites de piso/terreno ja em projecao isometrica. Candidato a base de piso compartilhada entre temas. |
| `kenney-foliage-pack/` | Foliage Pack | kenney.nl/assets/foliage-pack | CC0 (arquivo `License.txt` incluso) | 2026-08-10 | 2D, 100 arquivos. Candidato a vegetacao como sprite plano (ver ADR-0012, secao 3b - camera nunca gira, folhagem pode nao precisar de render 3D). |

### Pendentes (nao automatizaveis por download direto)

Estes NAO puderam ser baixados por mim de forma automatica: o itch.io exige
fluxo de "compra" (mesmo gratuito, "name your own price") com sessao de
navegador e link de download gerado dinamicamente, nao uma URL estatica.
Precisam ser baixados por um humano e entregues (arquivo ou pasta) para
entrarem aqui com a mesma estrutura de proveniencia.

| Pasta (a criar) | Pack | Fonte | Licenca declarada pelo fornecedor | Conteudo esperado |
| --- | --- | --- | --- | --- |
| `mreliptik-office-low-poly/` | Office low poly pack | mreliptik.itch.io/office-low-poly-pack | CC0 | 25+ itens 3D: notebook, xicara, impressora, luminaria, mouse, monitor - decor de superficie que faltava no catalogo. |
| `omies-assets-office-set/` | Office Set | omies-assets.itch.io/omies-assets-office-set | CC0 | Mobilia de escritorio com textura PBR completa (BaseColor, Normal, Roughness, Metallic, Displacement), inclui "Office Man" rigged. |

## Estado atual

**Nenhum processamento foi feito.** Isto e apenas a etapa de preparacao
(download + verificacao de licenca). O pipeline de render (Blender),
manifesto de catalogo (`assetId`, `packId`, footprint, ancoras de superficie),
e a integracao com `Prop.assetId` no contrato (`packages/contracts`) sao
trabalho futuro, sem "start" ainda - ver `docs/plano-mestre-mvp.md` secao 6.

## Observacao tecnica relevante para o pipeline futuro

O Furniture Kit e o Nature Kit ja vem com uma pasta `Isometric/` contendo
sprites PRE-RENDERIZADOS pelo proprio fornecedor (nao so os modelos 3D crus em
`Models/`). Antes de investir no pipeline Blender proprio para esses dois
packs, vale verificar se a projecao/angulo de camera do fornecedor bate com a
projecao dimetrica 2:1 do renderer da MicroFirma (`LARGURA_TILE=44,
ALTURA_TILE=22` em `apps/demo/src/office-renderer-2d.ts`). Se bater, o
trabalho de pre-renderizacao para esses dois packs ja esta feito pelo
fornecedor; se nao bater, os modelos crus em `Models/` permanecem disponiveis
para re-render no angulo correto.

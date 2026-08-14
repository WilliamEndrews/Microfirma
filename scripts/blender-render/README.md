# Pipeline de render isometrico (ADR-0012, passo 1)

Renderiza modelos FBX (hoje: `omies-assets-office-set`) em sprites PNG na
mesma projecao dimetrica 2:1 do renderer (`LARGURA_TILE=44`,
`ALTURA_TILE=22`, ver `apps/demo/src/office-renderer-2d.ts`), seguindo a
convencao de 4 rotacoes SW/SE/NW/NE ja usada pelos sprites Kenney existentes.

## Requisitos

- Blender 5.2+ instalado (`winget install BlenderFoundation.Blender`).
- Rodar **headless** (`--background`), sem precisar abrir a UI.

## Uso

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python scripts/blender-render/render_isometric.py -- `
  --fbx "assets-source/omies-assets-office-set/Office Cubicle/DeskSetup/Models/SM_Desk.fbx" `
  --out scripts/blender-render/output `
  --name sm-desk `
  --res 512 `
  --ortho-scale 3.0 `
  --rotations SW,SE,NW,NE `
  --sun-energy 6
```

Tudo depois do primeiro `--` vai para o argparse do script, nao para o Blender.

## Como funciona (resumo, ver docstrings no .py para detalhe)

1. **Camera**: rig Empty+Camera ortografica no angulo de "isometria
   verdadeira" (elevacao `arccos(1/sqrt(3))` ~= 54.7356 graus, azimute em
   multiplos de 45 graus para as 4 rotacoes). Esse angulo NAO precisa de
   calibracao - e geometria pura, qualquer quadrado do chao projeta como
   losango 2:1 nesse tilt, a mesma proporcao de `LARGURA_TILE/ALTURA_TILE`.
2. **Texturas**: o FBX do Omie's Assets ja vem com o grafo de material
   correto (BaseColor/Normal/Roughness/Metallic ligados ao Principled BSDF),
   mas o caminho de cada imagem aponta para a maquina do autor original
   (`D:\Blender\AssetLibrary\...`), que nao existe aqui - por isso o render
   sai **totalmente preto** sem `relinkar_texturas()`. O script troca o
   caminho pelo NOME do arquivo (preservado no FBX) e recarrega; nenhum link
   de node e tocado.
3. **Iluminacao**: 3 sois (key/fill/rim) + fundo do World com alguma
   intensidade. Necessario porque alguns materiais do Omie's Assets sao
   escuros/quase pretos (ver achado abaixo) - com luz unica, o objeto vira
   uma silhueta chapada sem leitura de volume.

## Achado importante: a mesa do Omie's Assets E ESCURA DE PROPOSITO

Na primeira tentativa, `SM_Desk.fbx` renderizou solido preto e a suspeita
inicial foi bug de textura/UV. Isolamos com um material de `Emission` ligado
direto na textura BaseColor (bypassa toda iluminacao - `debug_emission.py`,
descartado apos o diagnostico): o resultado permaneceu escuro. Comparado ao
thumbnail promocional do pack
(`assets-source/omies-assets-office-set/Office Cubicle/PromationalFiles/Thumnail/0001.png`),
confirma que a mesa e um design moderno cinza-escuro/preto, nao um bug de
render. Ou seja: **e um achado de estilo, nao um defeito** - o Omie's Assets
diferencia visualmente do Kenney Furniture Kit (que e claro/cartoon) tanto em
FORMA quanto em paleta, o que e exatamente o objetivo da decisao 6 do
ADR-0012 (temas = conjuntos de packs com forma propria, nao so cor).

## Estado atual (nao apagar - ver docs/plano-mestre-mvp.md secao 6, passo 1)

- **Provado com 1 asset** (`SM_Desk.fbx`, rotacoes SW/SE): rig de camera,
  relink de textura e iluminacao funcionam; resultado visualmente coerente
  (mesa reconhecivel, com volume, nao uma mancha).
- **NAO calibrado ainda**: `--ortho-scale`/`--res` sao valores arbitrarios
  (3.0 / 512px). Falta medir o resultado com
  `scripts/iso-validation/bbox.js` (ou equivalente) e ajustar a escala em
  pixels para que o footprint pretendido do objeto (em tiles) bata com
  `LARGURA_TILE=44`/`ALTURA_TILE=22`, do jeito que ja foi feito
  empiricamente para os sprites Kenney.
- **NAO processado**: recorte de padding transparente, deteccao/ajuste de
  ancora, e as outras pecas do `DeskSetup`/`ComputerSetup`/cadeira/cubiculo.
- **NAO integrado**: nenhuma entrada nova em
  `packages/contracts/src/asset-catalog.ts` ainda - isso so deve acontecer
  depois de aprovar o resultado visual, seguindo a mesma ordem que o passo 1
  original (Kenney) usou.

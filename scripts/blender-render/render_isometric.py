"""
Pipeline de render isometrico (ADR-0012, passo 1) - roda DENTRO do Blender.

Importa um FBX, monta o rig de camera "isometrica verdadeira" (2:1, a mesma
familia de projecao do renderer da MicroFirma e dos sprites Kenney ja usados -
ver docs/adr/0008-sprites-pre-renderizados.md e apps/demo/src/office-renderer-2d.ts,
LARGURA_TILE=44/ALTURA_TILE=22) e renderiza as 4 rotacoes SW/SE/NW/NE.

O angulo de elevacao 54.7356 graus (arccos(1/sqrt(3))) e a constante padrao de
"isometria verdadeira": uma camera ortografica nesse tilt, com azimute em
multiplos de 45 graus, projeta qualquer quadrado do plano do chao como um
losango de proporcao EXATA 2:1 (largura:altura) - a mesma proporcao de
LARGURA_TILE/ALTURA_TILE. Isso NAO precisa de calibracao; e geometria.

O que PRECISA de calibracao por asset e a ESCALA em pixels (quantos pixels por
unidade Blender), porque cada pack FBX pode ter uma unidade real diferente
(metros, centimetros...). Ver --ortho-scale e --res: escolha-os para que o
FOOTPRINT DESEJADO (em tiles) do objeto bata com LARGURA_TILE/ALTURA_TILE no
resultado final - meca com scripts/iso-validation/bbox.js e ajuste.

Uso (fora do Blender, via linha de comando):
  blender --background --python scripts/blender-render/render_isometric.py -- \
    --fbx "assets-source/omies-assets-office-set/Office Cubicle/DeskSetup/Models/SM_Desk.fbx" \
    --out scripts/blender-render/output \
    --name sm-desk \
    --res 512 \
    --ortho-scale 3.0 \
    --rotations SW,SE,NW,NE
"""

import argparse
import math
import sys

import bpy
import mathutils

ELEVACAO_ISOMETRICA_VERDADEIRA = math.degrees(math.acos(1 / math.sqrt(3)))  # ~54.7356

# Azimute (rotacao Z do rig, graus) por rotulo de rotacao. Convencao Kenney:
# ver docstring do modulo - calibrado empiricamente comparando com
# assets-source/kenney-furniture-kit/Isometric/table_SW.png e table_SE.png.
AZIMUTE_POR_ROTULO = {
    'SW': 45,
    'SE': 315,
    'NW': 135,
    'NE': 225,
}


def parse_args():
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []
    p = argparse.ArgumentParser()
    p.add_argument('--fbx', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--name', required=True)
    p.add_argument('--res', type=int, default=512)
    p.add_argument('--ortho-scale', type=float, default=3.0)
    p.add_argument('--rotations', default='SW,SE,NW,NE')
    p.add_argument('--sun-energy', type=float, default=3.5)
    p.add_argument(
        '--textures-dir',
        default=None,
        help=(
            'Pasta com os PNGs PBR do Omie\'s Assets (ex.: ".../DeskSetup/Textures"). '
            'O FBX do Omie\'s Assets JA vem com o grafo de material correto '
            '(BaseColor/Normal/Roughness/Metallic ligados ao Principled BSDF), so '
            'que apontando para o caminho da maquina original do autor '
            '("D:\\Blender\\AssetLibrary\\..."), que nao existe aqui - por isso o '
            'render sai preto sem isto. Se omitido, tenta a pasta "Textures" irma '
            'de "Models" (convencao do proprio pack).'
        ),
    )
    return p.parse_args(argv)


def limpar_cena():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for bloco in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights, bpy.data.objects):
        for item in list(bloco):
            if item.users == 0:
                bloco.remove(item)


def importar_fbx(caminho):
    antes = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=caminho)
    depois = set(bpy.context.scene.objects)
    return list(depois - antes)


def bbox_mundo(objs):
    minv = mathutils.Vector((math.inf, math.inf, math.inf))
    maxv = mathutils.Vector((-math.inf, -math.inf, -math.inf))
    encontrado = False
    for o in objs:
        if o.type != 'MESH':
            continue
        encontrado = True
        for corner in o.bound_box:
            world = o.matrix_world @ mathutils.Vector(corner)
            minv.x, minv.y, minv.z = min(minv.x, world.x), min(minv.y, world.y), min(minv.z, world.z)
            maxv.x, maxv.y, maxv.z = max(maxv.x, world.x), max(maxv.y, world.y), max(maxv.z, world.z)
    if not encontrado:
        raise RuntimeError('FBX nao trouxe nenhuma malha (MESH).')
    return minv, maxv


def centralizar_no_chao(objs, minv, maxv):
    """Centraliza X/Y na origem e poe a base (Z minimo) em Z=0."""
    cx = (minv.x + maxv.x) / 2
    cy = (minv.y + maxv.y) / 2
    cz = minv.z
    raizes = [o for o in objs if o.parent is None or o.parent not in objs]
    for o in raizes:
        o.location.x -= cx
        o.location.y -= cy
        o.location.z -= cz
    return maxv.z - minv.z  # altura total, para enquadrar a camera


def relinkar_texturas(pasta_texturas):
    """O FBX do Omie's Assets ja embute o grafo de material correto
    (BaseColor/Normal/Roughness/Metallic -> Principled BSDF), mas o
    `filepath` de cada imagem aponta para a maquina do autor original
    ("D:\\Blender\\AssetLibrary\\...", que nao existe aqui) - por isso o
    render sai totalmente preto sem isto. So trocamos o caminho pelo NOME do
    arquivo (preservado no FBX) e recarregamos; nenhum link de node e tocado."""
    import os

    if not os.path.isdir(pasta_texturas):
        print(f'[render_isometric] AVISO: pasta de texturas nao existe: {pasta_texturas}')
        return

    relinkados, ausentes = 0, []
    for img in bpy.data.images:
        if img.size[0] > 0 and img.size[1] > 0:
            continue  # ja tem pixels validos (ex.: imagem gerada internamente)
        candidato = os.path.join(pasta_texturas, img.name)
        if os.path.isfile(candidato):
            img.filepath = candidato
            img.source = 'FILE'
            img.reload()
            relinkados += 1
        else:
            ausentes.append(img.name)
    print(f'[render_isometric] texturas relinkadas: {relinkados}, ausentes: {ausentes}')


def configurar_luz(energia_sol):
    """3 luzes: key (principal, mesmo lado da camera - define volume), fill
    (lado oposto, fraca - evita silhueta chapada em materiais escuros/pretos,
    o caso mais dificil aqui) e rim (por cima/atras - separa objeto do fundo).
    Mundo com AO ligado para as reentrancias (gavetas, juntas) nao virarem
    uma mancha uniforme."""
    def sol(nome, energia, rot):
        dados = bpy.data.lights.new(name=nome, type='SUN')
        dados.energy = energia
        dados.angle = math.radians(3)
        obj = bpy.data.objects.new(name=nome, object_data=dados)
        bpy.context.collection.objects.link(obj)
        obj.rotation_euler = tuple(math.radians(g) for g in rot)
        return obj

    sol('SolKey', energia_sol, (55, 0, 35))
    sol('SolFill', energia_sol * 0.25, (60, 0, 215))
    sol('SolRim', energia_sol * 0.4, (25, 0, 125))

    mundo = bpy.data.worlds.get('World')
    if mundo is None:
        mundo = bpy.data.worlds.new('World')
    bpy.context.scene.world = mundo
    mundo.use_nodes = True
    fundo = mundo.node_tree.nodes.get('Background')
    if fundo is not None:
        fundo.inputs[0].default_value = (0.75, 0.78, 0.85, 1.0)
        fundo.inputs[1].default_value = 1.1

    # AO ficou de fora: a API mudou entre versoes do EEVEE (Legacy x Next) e
    # nao e essencial para o primeiro passe - 3 luzes ja resolvem a silhueta
    # chapada. Revisitar se overlays de reentrancia (gavetas) precisarem.


def configurar_render(res):
    cena = bpy.context.scene
    cena.render.engine = 'BLENDER_EEVEE'
    cena.render.resolution_x = res
    cena.render.resolution_y = res
    cena.render.film_transparent = True
    cena.render.image_settings.file_format = 'PNG'
    cena.render.image_settings.color_mode = 'RGBA'
    cena.eevee.taa_render_samples = 32


def montar_rig_camera(altura_alvo, distancia, ortho_scale, azimute_graus):
    """Empty no alvo (centro vertical do objeto) + camera parentada, olhando
    para o alvo a partir de SW/SE/NW/NE no tilt de isometria verdadeira."""
    empty = bpy.data.objects.new('EmptyIso', None)
    bpy.context.collection.objects.link(empty)
    empty.location = (0, 0, altura_alvo)
    empty.rotation_euler = (
        math.radians(ELEVACAO_ISOMETRICA_VERDADEIRA),
        0,
        math.radians(azimute_graus),
    )

    dados_cam = bpy.data.cameras.new('CamIso')
    dados_cam.type = 'ORTHO'
    dados_cam.ortho_scale = ortho_scale
    obj_cam = bpy.data.objects.new('CamIso', dados_cam)
    obj_cam.location = (0, -distancia, 0)
    obj_cam.rotation_euler = (math.radians(90), 0, 0)  # olha para +Y local
    obj_cam.parent = empty
    bpy.context.collection.objects.link(obj_cam)
    bpy.context.scene.camera = obj_cam
    return obj_cam


def main():
    args = parse_args()
    rotulos = [r.strip().upper() for r in args.rotations.split(',') if r.strip()]
    for r in rotulos:
        if r not in AZIMUTE_POR_ROTULO:
            raise SystemExit(f'Rotacao desconhecida: {r} (use SW/SE/NW/NE)')

    import os

    limpar_cena()
    objs = importar_fbx(args.fbx)
    minv, maxv = bbox_mundo(objs)
    altura = centralizar_no_chao(objs, minv, maxv)
    minv, maxv = bbox_mundo(objs)  # recalcula pos-centralizacao

    pasta_texturas = args.textures_dir or os.path.join(os.path.dirname(os.path.dirname(args.fbx)), 'Textures')
    relinkar_texturas(pasta_texturas)

    configurar_luz(args.sun_energy)
    configurar_render(args.res)

    diagonal = (maxv - minv).length
    distancia = max(diagonal * 3, 5.0)
    altura_alvo = (minv.z + maxv.z) / 2

    os.makedirs(args.out, exist_ok=True)

    for rotulo in rotulos:
        azimute = AZIMUTE_POR_ROTULO[rotulo]
        montar_rig_camera(altura_alvo, distancia, args.ortho_scale, azimute)
        caminho_saida = os.path.join(args.out, f'{args.name}_{rotulo}.png')
        bpy.context.scene.render.filepath = caminho_saida
        bpy.ops.render.render(write_still=True)
        print(f'[render_isometric] {rotulo} -> {caminho_saida}')
        # Remove o rig desta rotacao antes da proxima (a malha do objeto fica).
        for nome in ('EmptyIso', 'CamIso'):
            obj = bpy.data.objects.get(nome)
            if obj is not None:
                bpy.data.objects.remove(obj, do_unlink=True)

    print(f'[render_isometric] bbox mundo: min={tuple(minv)} max={tuple(maxv)} altura={altura:.4f}')


if __name__ == '__main__':
    main()

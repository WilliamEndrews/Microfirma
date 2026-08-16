"""
Mede a bbox real (pixels com alpha>0) de um render e sugere o fator de escala
para bater com um alvo de largura em pixels (calibracao de --ortho-scale/--res
do render_isometric.py contra o restante do catalogo - ver scripts/blender-render/README.md).

Uso:
  python scripts/blender-render/bbox_calibrar.py <png> [--alvo-largura 134]
"""

import argparse
import sys

from PIL import Image


def bbox_alpha(caminho):
    img = Image.open(caminho).convert('RGBA')
    alpha = img.getchannel('A')
    bbox = alpha.getbbox()
    if bbox is None:
        raise SystemExit(f'{caminho}: imagem totalmente transparente, nada para medir.')
    x0, y0, x1, y1 = bbox
    return img.size, (x0, y0, x1, y1), (x1 - x0, y1 - y0)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('png')
    p.add_argument('--alvo-largura', type=float, default=None, help='Largura de referencia em px (ex.: 134, largura de table_SW.png do Kenney) para sugerir fator de escala.')
    args = p.parse_args()

    tam, bbox, dim = bbox_alpha(args.png)
    print(f'{args.png}')
    print(f'  canvas: {tam[0]}x{tam[1]}')
    print(f'  bbox alpha>0: {bbox}')
    print(f'  bbox largura x altura: {dim[0]}x{dim[1]}')
    if args.alvo_largura:
        fator = args.alvo_largura / dim[0]
        print(f'  fator de escala sugerido para bater largura={args.alvo_largura}px: {fator:.4f}')
        print(f'  (multiplique --res OU --ortho-scale pelo inverso: {1/fator:.4f}x --ortho-scale, ou {fator:.4f}x --res)')


if __name__ == '__main__':
    main()

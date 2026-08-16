"""
Recorta o padding transparente ao redor de um PNG renderizado, deixando a
bbox real (alpha>0) com uma margem pequena opcional - mesma convencao ja
confirmada empiricamente para os sprites Kenney (scripts/iso-validation/bbox.js):
o PNG final deve ficar colado no conteudo visivel, sem padding assimetrico
que faca o objeto "flutuar" no tile.

Uso:
  python scripts/blender-render/trim.py <entrada.png> <saida.png> [--margem 2]
"""

import argparse

from PIL import Image


def main():
    p = argparse.ArgumentParser()
    p.add_argument('entrada')
    p.add_argument('saida')
    p.add_argument('--margem', type=int, default=2)
    args = p.parse_args()

    img = Image.open(args.entrada).convert('RGBA')
    bbox = img.getchannel('A').getbbox()
    if bbox is None:
        raise SystemExit(f'{args.entrada}: imagem totalmente transparente, nada para recortar.')
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - args.margem)
    y0 = max(0, y0 - args.margem)
    x1 = min(img.width, x1 + args.margem)
    y1 = min(img.height, y1 + args.margem)
    recortada = img.crop((x0, y0, x1, y1))
    recortada.save(args.saida)
    print(f'{args.entrada} ({img.width}x{img.height}) -> {args.saida} ({recortada.width}x{recortada.height}), bbox original={bbox}')


if __name__ == '__main__':
    main()

import { ASSET_BASE } from './iso';

const cache = new Map<string, Promise<HTMLImageElement>>();

export function urlPng(fileName: string): string {
  return ASSET_BASE + fileName.split('/').map(encodeURIComponent).join('/');
}

export function carregar(src: string): Promise<HTMLImageElement> {
  const hit = cache.get(src);
  if (hit) return hit;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('falhou ' + src));
    img.src = urlPng(src);
  });
  cache.set(src, p);
  return p;
}

export type Bbox = { x: number; y: number; w: number; h: number };

const bboxCache = new Map<string, Bbox>();

export function medirBbox(img: HTMLImageElement): Bbox {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  if (!g) return { x: 0, y: 0, w: c.width, h: c.height };
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  let minX = c.width;
  let minY = c.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3]! > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: c.width, h: c.height };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export async function bboxDe(src: string): Promise<Bbox> {
  const hit = bboxCache.get(src);
  if (hit) return hit;
  const img = await carregar(src);
  const b = medirBbox(img);
  bboxCache.set(src, b);
  return b;
}

// Mede a caixa delimitadora real (pixels com alpha > 0) de cada sprite, para
// confirmar se a "flutuacao" observada no screenshot e causada por padding
// transparente assimetrico dentro do PNG (nao por erro de projecao).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARQUIVOS = [
  'table_SW.png',
  'chairDesk_SW.png',
  'plantSmall1_SW.png',
  'bookcaseOpen_SW.png',
  'loungeSofa_SW.png',
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const base = path.resolve(__dirname, '..', '..', 'assets-source', 'kenney-furniture-kit', 'Isometric');

  for (const nome of ARQUIVOS) {
    const buf = fs.readFileSync(path.join(base, nome));
    const url = 'data:image/png;base64,' + buf.toString('base64');
    const bbox = await page.evaluate(async (src) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const a = data[(y * c.width + x) * 4 + 3];
          if (a > 10) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      return { canvasW: c.width, canvasH: c.height, minX, minY, maxX, maxY };
    }, url);
    const padBaixo = bbox.canvasH - 1 - bbox.maxY;
    const padTopo = bbox.minY;
    console.log(
      `${nome.padEnd(22)} canvas=${bbox.canvasW}x${bbox.canvasH}  bbox_real=${bbox.maxX - bbox.minX + 1}x${bbox.maxY - bbox.minY + 1}  pad_topo=${padTopo}  pad_baixo=${padBaixo}`,
    );
  }

  await browser.close();
})();

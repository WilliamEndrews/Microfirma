// Script de uso unico: abre index.html localmente e tira um screenshot da
// pagina, para inspecao visual do alinhamento entre os sprites isometricos
// do Furniture Kit (Kenney) e a grade dimetrica 2:1 do renderer real.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 400 } });
  const url = 'file://' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
  await page.goto(url);
  await page.waitForTimeout(500); // aguarda onload das imagens
  await page.screenshot({ path: path.resolve(__dirname, 'saida.png'), fullPage: true });
  await browser.close();
  console.log('OK: saida.png gerado');
})();

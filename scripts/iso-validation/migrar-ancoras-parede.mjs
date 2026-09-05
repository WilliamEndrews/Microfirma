/**
 * Reancora anexos de parede dos temas preservando sua posicao visual.
 * Uso: node scripts/iso-validation/migrar-ancoras-parede.mjs [--write]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { anexoParedeValido, rebasearAnexoParede } from './lab-temas.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const primary = path.join(repo, 'packages/world-engine/src/biblia/temas-arquiteto.json');
const mirror = path.join(here, 'temas-arquiteto.json');
const write = process.argv.includes('--write');
const doc = JSON.parse(fs.readFileSync(primary, 'utf8'));
let changed = 0;
let invalid = 0;

for (const tema of doc.temas || []) {
  const w = tema.grade?.w || 3;
  const h = tema.grade?.h || 3;
  const pes = {
    R: tema.calibracao?.peWallR || { x: 32, y: 83 },
    L: tema.calibracao?.peWallL || { x: 95, y: 83 },
  };
  tema.palco = (tema.palco || []).map((peca) => {
    if (!(peca.papel === 'wall' || peca.face === 'R' || peca.face === 'L')) return peca;
    const next = rebasearAnexoParede(peca, w, h, pes);
    if (
      next.face !== peca.face ||
      next.gx !== peca.gx ||
      next.gy !== peca.gy ||
      next.dx !== peca.dx ||
      next.dy !== peca.dy
    ) changed++;
    if (!anexoParedeValido(next)) invalid++;
    return next;
  });
}

if (write) {
  const text = `${JSON.stringify(doc, null, 2)}\n`;
  fs.writeFileSync(primary, text, 'utf8');
  fs.writeFileSync(mirror, text, 'utf8');
}

console.log(JSON.stringify({ changed, invalid, write, primary, mirror }));
if (invalid > 0) process.exitCode = 2;

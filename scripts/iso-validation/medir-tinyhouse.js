/**
 * Mede IHDR + bbox alfa dos tiles TinyHouse que o renderer realmente usa.
 *
 * Nao depende de Playwright: no Windows usa System.Drawing via PowerShell
 * embarcado. Saida e tabela ASCII para alimentar projecao.ts com numeros
 * medidos, nao chutados.
 *
 * Uso: node scripts/iso-validation/medir-tinyhouse.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = path.resolve(
  __dirname,
  '..',
  '..',
  'assets-source',
  'tinyhouse-pixel-salvaje',
  'TinyHouse',
);

const ARQUIVOS = [
  'Floor_Wall_Tiles_128/Floor_128_WoodLight.png',
  'Floor_Wall_Tiles_128/Wall_L_128_BrokenWhite.png',
  'Floor_Wall_Tiles_128/Wall_R_128_BrokenWhite.png',
  'Doors/Office_Glass_Door_Ani/Office_Glass_Door_1.png',
  'Doors/Door_1_Beige.png',
  'Desks/Office_Main_Table_Desk/Office_Main_Table_Base.png',
  'Chairs/Basic_Office_Chair_A.png',
  'Plants/Plant_2.png',
];

const psScript = `
param([string]$Path)
Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile($Path)
$minX = $bmp.Width; $minY = $bmp.Height; $maxX = -1; $maxY = -1
$opacos = 0
for ($y = 0; $y -lt $bmp.Height; $y++) {
  for ($x = 0; $x -lt $bmp.Width; $x++) {
    $p = $bmp.GetPixel($x, $y)
    if ($p.A -gt 8) {
      $opacos++
      if ($x -lt $minX) { $minX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$centroX = if ($maxX -ge $minX) { [int](($minX + $maxX) / 2) } else { [int]($bmp.Width / 2) }
$peY = if ($maxY -ge 0) { $maxY } else { $bmp.Height - 1 }
$obj = [ordered]@{
  canvasW = $bmp.Width
  canvasH = $bmp.Height
  minX = $minX
  minY = $minY
  maxX = $maxX
  maxY = $maxY
  bboxW = if ($maxX -ge $minX) { $maxX - $minX + 1 } else { 0 }
  bboxH = if ($maxY -ge $minY) { $maxY - $minY + 1 } else { 0 }
  padTopo = if ($maxY -ge $minY) { $minY } else { 0 }
  padBaixo = if ($maxY -ge $minY) { $bmp.Height - 1 - $maxY } else { 0 }
  padEsq = if ($maxX -ge $minX) { $minX } else { 0 }
  padDir = if ($maxX -ge $minX) { $bmp.Width - 1 - $maxX } else { 0 }
  centroBboxX = $centroX
  peY = $peY
  opacos = $opacos
}
$bmp.Dispose()
$obj | ConvertTo-Json -Compress
`;

const psPath = path.join(__dirname, '_medir-tmp.ps1');
fs.writeFileSync(psPath, psScript, 'utf8');

console.log(
  [
    'arquivo'.padEnd(52),
    'canvas',
    'bbox',
    'pad T/B/L/R',
    'centroX',
    'peY',
  ].join('  '),
);
console.log('-'.repeat(110));

for (const rel of ARQUIVOS) {
  const abs = path.join(BASE, rel);
  if (!fs.existsSync(abs)) {
    console.log(`${rel.padEnd(52)}  FALTANDO`);
    continue;
  }
  const json = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-File', psPath, '-Path', abs],
    { encoding: 'utf8' },
  ).trim();
  const m = JSON.parse(json);
  const pads = `${m.padTopo}/${m.padBaixo}/${m.padEsq}/${m.padDir}`;
  console.log(
    [
      rel.padEnd(52),
      `${m.canvasW}x${m.canvasH}`.padEnd(10),
      `${m.bboxW}x${m.bboxH}`.padEnd(10),
      pads.padEnd(14),
      String(m.centroBboxX).padEnd(7),
      String(m.peY),
    ].join('  '),
  );
  console.log(`    json=${json}`);
}

fs.unlinkSync(psPath);

#!/usr/bin/env node
/**
 * Relatorio (somente leitura) de temas da Biblia sem `postosTrabalho`.
 *
 * `Prop.seat` (o destino REAL de pathfinding para "trabalhar") so e
 * preenchido em `colarProto` quando o tema tem um `postoTrabalho` marcado
 * no Lab (botao "marcar assento" - ver `tinyhouse-lab.js`). Sem isso, o
 * agente cai no fallback geometrico de sempre (`seatCellFor`) - nada
 * quebra, mas o ponto exato onde ele "senta" nao e garantido bater com a
 * cadeira desenhada no palco.
 *
 * Este script NAO altera nada; so lista, por zonaKind relevante, quais
 * temas ainda nao tem posto marcado, para voce abrir cada um no Lab
 * (`pnpm lab:iso`) e clicar "marcar assento" no ponto exato - no seu
 * ritmo, tema a tema.
 *
 * Uso (raiz do repo): node scripts/relatorio-postos-trabalho.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BIBLIA_PATH = path.join(
  REPO_ROOT,
  'packages',
  'world-engine',
  'src',
  'biblia',
  'temas-arquiteto.json',
);

/** zonaKind cuja mesa e de UM agente so - onde `postoTrabalho` faz diferenca
 *  hoje (colarProto so grava `Prop.seat` quando a sala e inequivoca). */
const ZONA_KINDS_RELEVANTES = new Set(['private', 'boss_room', 'open', 'meeting', 'war_room']);

function temMesa(tema) {
  return (tema.palco ?? []).some((peca) => {
    const id = String(peca.assetId ?? '');
    return id.includes('table') || id.includes('desk');
  });
}

function main() {
  const raw = fs.readFileSync(BIBLIA_PATH, 'utf8');
  const doc = JSON.parse(raw);
  const temas = doc.temas ?? [];

  const relevantes = temas.filter((t) => ZONA_KINDS_RELEVANTES.has(t.zonaKind) && temMesa(t));
  const semPosto = relevantes.filter((t) => !(t.postosTrabalho ?? []).length);
  const comPosto = relevantes.filter((t) => (t.postosTrabalho ?? []).length > 0);

  console.log(`Biblia: ${temas.length} tema(s) no total.`);
  console.log(`Temas com mesa em zonaKind relevante (${[...ZONA_KINDS_RELEVANTES].join(', ')}): ${relevantes.length}`);
  console.log(`  - com postoTrabalho marcado: ${comPosto.length}`);
  console.log(`  - SEM postoTrabalho (usando fallback generico hoje): ${semPosto.length}`);

  if (semPosto.length > 0) {
    console.log('\nAbra estes temas no Lab (pnpm lab:iso) e clique "marcar assento":\n');
    for (const t of semPosto) {
      console.log(`  - [${t.zonaKind}] ${t.id} (${t.nome})`);
    }
  } else {
    console.log('\nTodos os temas relevantes ja tem postoTrabalho marcado.');
  }
}

main();

/**
 * Laboratorio TinyHouse: palco 3x3 + catalogo do arquiteto.
 * Carrega calibracao-tinyhouse.json, catalogo-laboratorio.json e
 * a biblia de temas do Construtor (world-engine/src/biblia/).
 */
import {
  anexoParedeValido,
  mesclarCombos,
  normalizarPostosTrabalho,
  postoParaGrid,
  rebasearAnexoParede,
  restaurarCoresDoTema,
  validarPalco,
} from './lab-temas.mjs';

const LARGURA_TILE = 128;
const ALTURA_TILE = 64;
const ORIGEM = { x: 360, y: 90 };
const ORIGEM_COMPOSE = { x: 360, y: 90 };
const GRADE_MAX = 8;
const ANDARES_MAX = 3;
const BASE = '../../assets-source/tinyhouse-pixel-salvaje/TinyHouse/';
const ANCORA_PISO = { x: 64, y: 68 };
const URL_CALIBRACAO = '../../apps/demo/src/calibracao-tinyhouse.json';
const URL_CATALOGO = './catalogo-laboratorio.json';
const URL_TEMAS = '../../packages/world-engine/src/biblia/temas-arquiteto.json';
const URL_COMBOS = './combinacoes-laboratorio.json';
/** API do lab-server.mjs — grava a biblia no disco do repo. */
const URL_PERSISTIR_TEMAS = '/api/temas-arquiteto';
const URL_PERSISTIR_COMBOS = '/api/combinacoes-laboratorio';
const STORAGE_KEY = 'microfirma-lab-catalogo-v4';
const COMPOSE_ORIGEM = ORIGEM_COMPOSE;
const DIR_TILES = 'Floor_Wall_Tiles_128';
const PORTA_VIDRO = 'Doors/Office_Glass_Door_Ani/Office_Glass_Door_1.png';

const CALIBRACAO_FALLBACK = {
  rodada: 5,
  plano: 'B',
  ancoraPiso: ANCORA_PISO,
  peWallR: { x: 32, y: 83 },
  peWallL: { x: 95, y: 83 },
  pePorta: { x: 46, y: 101 },
  folgaPorta: { x: 11, y: 4 },
  objetos: {
    desk: { modo: 'centro', ancora: { x: 64, y: 68 } },
    water: { modo: 'canto', pe: { x: 64, y: 63 } },
  },
};

const cacheImg = new Map();

function iso(gx, gy) {
  return { x: ((gx - gy) * LARGURA_TILE) / 2, y: ((gx + gy) * ALTURA_TILE) / 2 };
}

function telaParaGrade(px, py, subdiv) {
  const x = px - ORIGEM.x;
  const y = py - ORIGEM.y;
  const gxF = (x / (LARGURA_TILE / 2) + y / (ALTURA_TILE / 2)) / 2;
  const gyF = (y / (ALTURA_TILE / 2) - x / (LARGURA_TILE / 2)) / 2;
  const gx = Math.floor(gxF);
  const gy = Math.floor(gyF);
  if (!subdiv) return { gx, gy, qx: 0, qy: 0 };
  return {
    gx,
    gy,
    qx: gxF - gx >= 0.5 ? 1 : 0,
    qy: gyF - gy >= 0.5 ? 1 : 0,
  };
}

function origemDoItem(p) {
  const passo = p.passo == null ? 1 : p.passo;
  const qx = p.qx || 0;
  const qy = p.qy || 0;
  return { ox: p.gx + qx * passo, oy: p.gy + qy * passo, passo };
}

function chaveSlot(p) {
  return p.gx + ',' + p.gy + ',' + (p.qx || 0) + ',' + (p.qy || 0);
}

function mesmaCelula(a, b) {
  return a.gx === b.gx && a.gy === b.gy;
}

function mesmoSlot(a, b) {
  return chaveSlot(a) === chaveSlot(b);
}

function slugTema(nome) {
  const s = String(nome || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'tema';
}

function urlPng(fileName) {
  return BASE + fileName.split('/').map(encodeURIComponent).join('/');
}

function carregar(src) {
  if (cacheImg.has(src)) return cacheImg.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('falhou ' + src));
    img.src = urlPng(src);
  });
  cacheImg.set(src, p);
  return p;
}

function fetchJson(url, fallback) {
  return fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .catch((err) => {
      if (fallback) return fallback;
      throw err;
    });
}

function medirBbox(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  let minX = c.width;
  let minY = c.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3] > 8) {
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

function silhuetaChao(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  const pes = [];
  for (let x = 0; x < c.width; x++) {
    let maxY = -1;
    for (let y = 0; y < c.height; y++) {
      if (data[(y * c.width + x) * 4 + 3] > 8) maxY = y;
    }
    if (maxY >= 0) pes.push({ x, y: maxY });
  }
  return pes;
}

function peExtremo(pes, lado) {
  if (!pes.length) return { x: 64, y: 36 };
  return lado === 'dir' ? pes[pes.length - 1] : pes[0];
}

function blitTile(ctx, img, gx, gy, ancora, tam) {
  const passo = tam == null ? 1 : tam;
  const c = iso(gx + passo / 2, gy + passo / 2);
  const x = ORIGEM.x + c.x - ancora.x;
  const y = ORIGEM.y + c.y - ancora.y;
  ctx.drawImage(img, x, y);
  return { x, y };
}

function blitNoPe(ctx, img, telaX, telaY, pe) {
  const x = telaX - pe.x;
  const y = telaY - pe.y;
  ctx.drawImage(img, x, y);
  return { x, y, tela: { x: telaX, y: telaY } };
}

function blitNaVertice(ctx, img, vx, vy, pe) {
  const v = iso(vx, vy);
  return blitNoPe(ctx, img, ORIGEM.x + v.x, ORIGEM.y + v.y, pe);
}

function blitObjeto(ctx, img, bbox, gx, gy) {
  const c = iso(gx + 0.5, gy + 0.5);
  const x = ORIGEM.x + c.x - (bbox.x + bbox.w / 2);
  const y = ORIGEM.y + c.y - (bbox.y + bbox.h);
  ctx.drawImage(img, x, y);
}

function specDoItem(spec, cal) {
  const mapa = (cal && cal.objetos) || {};
  return mapa[spec.kind] || mapa[spec.assetId] || null;
}

function blitCatalogo(ctx, img, bbox, spec, item, cal, diagnostico) {
  const o = specDoItem(spec, cal);
  const { ox, oy, passo } = origemDoItem(item);
  if (o && o.modo === 'canto' && o.pe) {
    const r = blitNaVertice(ctx, img, ox, oy, o.pe);
    if (diagnostico) {
      ctx.strokeStyle = 'rgba(255, 80, 200, 0.9)';
      ctx.strokeRect(r.x + bbox.x, r.y + bbox.y, bbox.w, bbox.h);
      marcarPe(ctx, r.tela);
    }
    return;
  }
  if (o && o.modo === 'centro' && o.ancora) {
    const r = blitTile(ctx, img, ox, oy, o.ancora, passo);
    if (diagnostico) {
      ctx.strokeStyle = 'rgba(255, 80, 200, 0.9)';
      ctx.strokeRect(r.x + bbox.x, r.y + bbox.y, bbox.w, bbox.h);
      const c = iso(ox + passo / 2, oy + passo / 2);
      marcarPe(ctx, { x: ORIGEM.x + c.x, y: ORIGEM.y + c.y });
    }
    return;
  }
  blitObjeto(ctx, img, bbox, ox, oy);
}

function losango(ctx, gx, gy, cor, preencher, tam) {
  const passo = tam == null ? 1 : tam;
  const pts = [iso(gx, gy), iso(gx + passo, gy), iso(gx + passo, gy + passo), iso(gx, gy + passo)];
  ctx.beginPath();
  ctx.moveTo(ORIGEM.x + pts[0].x, ORIGEM.y + pts[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(ORIGEM.x + pts[i].x, ORIGEM.y + pts[i].y);
  ctx.closePath();
  if (preencher) {
    ctx.fillStyle = preencher;
    ctx.fill();
  }
  ctx.strokeStyle = cor;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function perimetroGrade(ctx, w, h) {
  const pts = [iso(0, 0), iso(w, 0), iso(w, h), iso(0, h)];
  ctx.beginPath();
  ctx.moveTo(ORIGEM.x + pts[0].x, ORIGEM.y + pts[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(ORIGEM.x + pts[i].x, ORIGEM.y + pts[i].y);
  ctx.closePath();
  ctx.strokeStyle = '#f5d76e';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function encaixarPalco(canvas, w, h, andares, subida) {
  const pts = [iso(0, 0), iso(w, 0), iso(w, h), iso(0, h)];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const padX = 56;
  const padTop = 100 + Math.max(0, (andares || 1) - 1) * (subida || 0);
  const padBottom = 40;
  const needW = Math.ceil(maxX - minX + padX * 2);
  const needH = Math.ceil(maxY - minY + padTop + padBottom);
  canvas.width = Math.max(720, Math.min(1400, needW));
  canvas.height = Math.max(520, Math.min(980, needH));
  ORIGEM.x = Math.round((canvas.width - (minX + maxX)) / 2);
  ORIGEM.y = Math.round(padTop - minY);
}

function clampInt(n, lo, hi) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function coordsFaixa(eixo, valor, outroMax) {
  const out = [];
  for (let i = 0; i < outroMax; i++) {
    out.push(eixo === 'gx' ? valor + ',' + i : i + ',' + valor);
  }
  return out.join('  ');
}

function marcarPe(ctx, tela) {
  ctx.strokeStyle = '#7fff00';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(tela.x + 0.5, tela.y + 0.5, 4, 0, Math.PI * 2);
  ctx.stroke();
}

function thumb(img, bbox, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#222';
  g.fillRect(0, 0, w, h);
  if (!img || !bbox) return c;
  const escala = Math.min(w / bbox.w, h / bbox.h) * 0.9;
  const dw = bbox.w * escala;
  const dh = bbox.h * escala;
  g.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return c;
}

function clampGrade(g) {
  return {
    w: clampInt(g && g.w, 1, GRADE_MAX),
    h: clampInt(g && g.h, 1, GRADE_MAX),
  };
}

function inferirGrade(palco) {
  let maxX = 2;
  let maxY = 2;
  for (const p of palco || []) {
    if (p.gx > maxX) maxX = p.gx;
    if (p.gy > maxY) maxY = p.gy;
  }
  return clampGrade({ w: maxX + 1, h: maxY + 1 });
}

function paineisPadrao() {
  return {
    tilesets: false,
    piso: false,
    parede: false,
    zona: false,
    temas: false,
    json: false,
  };
}

function normalizarPaineis(bruto) {
  const base = paineisPadrao();
  if (!bruto || typeof bruto !== 'object') return base;
  for (const id of Object.keys(base)) {
    if (typeof bruto[id] === 'boolean') base[id] = bruto[id];
  }
  return base;
}

function zonaKindOk(id) {
  return ZONAS_TILE.some((z) => z.id === id) ? id : 'private';
}

function itemEParede(p) {
  return !!(p && (p.papel === 'wall' || p.face === 'R' || p.face === 'L'));
}

function palcoItemNormalizado(p) {
  if (itemEParede(p)) {
    return {
      assetId: p.assetId,
      papel: 'wall',
      face: p.face === 'L' ? 'L' : 'R',
      gx: typeof p.gx === 'number' ? p.gx : 0,
      gy: typeof p.gy === 'number' ? p.gy : 0,
      dx: typeof p.dx === 'number' ? p.dx : 0,
      dy: typeof p.dy === 'number' ? p.dy : 0,
    };
  }
  return { qx: 0, qy: 0, passo: 1, ...p };
}

function normalizarTema(t) {
  const palco = (t.palco || []).map(palcoItemNormalizado);
  return {
    ...t,
    palco,
    grade: t.grade ? clampGrade(t.grade) : inferirGrade(palco),
    andares: clampInt(t.andares != null ? t.andares : 1, 1, ANDARES_MAX),
    subidaAndar: typeof t.subidaAndar === 'number' ? t.subidaAndar : null,
    subdiv: t.subdiv !== false,
    prioridade: clampInt(t.prioridade != null ? t.prioridade : 5, 1, 9),
    unicoNaAgencia: !!t.unicoNaAgencia,
    zonaKind: zonaKindOk(t.zonaKind),
    calibracao: t.calibracao && typeof t.calibracao === 'object' ? t.calibracao : null,
    postosTrabalho: normalizarPostosTrabalho(t.postosTrabalho),
  };
}

function estadoDoCatalogo(catalogo, temasArquivo) {
  return {
    tilesetAtivo: catalogo.tilesetAtivo || 'nordic-calm',
    pisoLivre: catalogo.pisoLivre || null,
    paredeLivre: catalogo.paredeLivre || null,
    usos: Object.fromEntries(catalogo.assets.map((a) => [a.assetId, a.uso])),
    palco: (catalogo.palcoPadrao || []).map(palcoItemNormalizado),
    celula: { gx: 1, gy: 1, qx: 0, qy: 0 },
    diagnostico: false,
    subdiv: true,
    modoPlantar: 'piso',
    paredeSel: null,
    temas: Array.isArray(temasArquivo) ? temasArquivo.map(normalizarTema) : [],
    combos: [],
    combinando: false,
    composeCamadas: [],
    grade: clampGrade(catalogo.palcoGrade || { w: 3, h: 3 }),
    andares: clampInt(catalogo.andares || 1, 1, ANDARES_MAX),
    subidaAndar: typeof catalogo.subidaAndar === 'number' ? catalogo.subidaAndar : null,
    politicaTiles: politicaPadrao(),
    previewZona: null,
    postosTrabalho: [],
    paineis: paineisPadrao(),
  };
}

function carregarEstado(catalogo, temasArquivo, politicaArquivo) {
  try {
    const bruto = localStorage.getItem(STORAGE_KEY);
    if (!bruto) {
      const base = estadoDoCatalogo(catalogo, temasArquivo);
      base.politicaTiles = normalizarPolitica(politicaArquivo, catalogo);
      return base;
    }
    const salvo = JSON.parse(bruto);
    const base = estadoDoCatalogo(catalogo, temasArquivo);
    const temasLocais = Array.isArray(salvo.temas) && salvo.temas.length
      ? salvo.temas.map(normalizarTema)
      : base.temas;
    return {
      ...base,
      ...salvo,
      usos: { ...base.usos, ...(salvo.usos || {}) },
      palco: Array.isArray(salvo.palco) ? salvo.palco.map(palcoItemNormalizado) : base.palco,
      celula: { gx: 1, gy: 1, qx: 0, qy: 0, ...(salvo.celula || {}) },
      temas: temasLocais,
      subdiv: salvo.subdiv !== false,
      combos: Array.isArray(salvo.combos) ? salvo.combos : base.combos,
      combinando: false,
      composeCamadas: Array.isArray(salvo.composeCamadas) ? salvo.composeCamadas : [],
      modoPlantar: salvo.modoPlantar === 'parede' ? 'parede' : 'piso',
      paredeSel: null,
      grade: clampGrade(salvo.grade || base.grade),
      andares: clampInt(salvo.andares != null ? salvo.andares : base.andares, 1, ANDARES_MAX),
      subidaAndar: typeof salvo.subidaAndar === 'number' ? salvo.subidaAndar : base.subidaAndar,
      politicaTiles: normalizarPolitica(salvo.politicaTiles || politicaArquivo, catalogo),
      previewZona: null,
      postosTrabalho: Array.isArray(salvo.postosTrabalho) ? normalizarPostosTrabalho(salvo.postosTrabalho) : [],
      paineis: normalizarPaineis(salvo.paineis),
    };
  } catch {
    const base = estadoDoCatalogo(catalogo, temasArquivo);
    base.politicaTiles = normalizarPolitica(politicaArquivo, catalogo);
    return base;
  }
}

function gravarEstado(estado) {
  const slim = {
    tilesetAtivo: estado.tilesetAtivo,
    pisoLivre: estado.pisoLivre,
    paredeLivre: estado.paredeLivre,
    usos: estado.usos,
    palco: estado.palco,
    celula: estado.celula,
    diagnostico: estado.diagnostico,
    subdiv: estado.subdiv,
    modoPlantar: estado.modoPlantar === 'parede' ? 'parede' : 'piso',
    temas: estado.temas,
    combos: estado.combos,
    composeCamadas: estado.composeCamadas,
    grade: estado.grade,
    andares: estado.andares,
    subidaAndar: estado.subidaAndar,
    politicaTiles: estado.politicaTiles,
    postosTrabalho: estado.postosTrabalho,
    paineis: normalizarPaineis(estado.paineis),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
}

function withOrigemOffset(dx, dy, fn) {
  ORIGEM.x += dx || 0;
  ORIGEM.y += dy || 0;
  try {
    fn();
  } finally {
    ORIGEM.x -= dx || 0;
    ORIGEM.y -= dy || 0;
  }
}

function withOrigemAbs(x, y, fn) {
  const ox = ORIGEM.x;
  const oy = ORIGEM.y;
  ORIGEM.x = x;
  ORIGEM.y = y;
  try {
    fn();
  } finally {
    ORIGEM.x = ox;
    ORIGEM.y = oy;
  }
}

const ZONAS_TILE = [
  { id: 'corridor', nome: 'corredor' },
  { id: 'break', nome: 'copa' },
  { id: 'private', nome: 'privativo' },
  { id: 'boss_room', nome: 'Boss Room' },
  { id: 'open', nome: 'open space' },
  { id: 'meeting', nome: 'reuniao' },
  { id: 'reception', nome: 'recepcao' },
  { id: 'war_room', nome: 'war room' },
];

function slotTilesPadrao() {
  return { modo: 'default', pisos: [], paredes: [] };
}

function politicaPadrao() {
  const o = {};
  for (const z of ZONAS_TILE) o[z.id] = slotTilesPadrao();
  return o;
}

function normalizarPolitica(bruto, catalogo) {
  const pisosOk = new Set((catalogo && catalogo.pisos) || []);
  const paredesOk = new Set((catalogo && catalogo.paredes) || []);
  const base = politicaPadrao();
  const src = bruto && typeof bruto === 'object' ? bruto : {};
  for (const z of ZONAS_TILE) {
    const s = src[z.id] || {};
    let modo = s.modo === 'unico' || s.modo === 'opcoes' ? s.modo : 'default';
    let pisos = (Array.isArray(s.pisos) ? s.pisos : []).filter((n) => !pisosOk.size || pisosOk.has(n));
    let paredes = (Array.isArray(s.paredes) ? s.paredes : []).filter((n) => !paredesOk.size || paredesOk.has(n));
    if (modo === 'default') {
      base[z.id] = slotTilesPadrao();
    } else if (modo === 'unico') {
      base[z.id] = {
        modo: 'unico',
        pisos: pisos.slice(0, 1),
        paredes: paredes.slice(0, 1),
      };
    } else {
      base[z.id] = { modo: 'opcoes', pisos: pisos, paredes: paredes };
    }
  }
  return base;
}

function tilesPreviewZona(estado) {
  const id = estado.previewZona;
  if (!id || !estado.politicaTiles) return null;
  const slot = estado.politicaTiles[id];
  if (!slot || slot.modo === 'default') return null;
  return {
    piso: slot.pisos && slot.pisos[0] ? slot.pisos[0] : null,
    parede: slot.paredes && slot.paredes[0] ? slot.paredes[0] : null,
  };
}

function resolverCores(catalogo, estado) {
  const ts = catalogo.tilesets.find((t) => t.tileSetId === estado.tilesetAtivo) || catalogo.tilesets[0];
  const preview = tilesPreviewZona(estado);
  return {
    piso: (preview && preview.piso) || estado.pisoLivre || ts.piso,
    parede: (preview && preview.parede) || estado.paredeLivre || ts.parede,
    tileSetId: ts.tileSetId,
    previewZona: estado.previewZona || null,
  };
}

function nomeZonaTile(id) {
  const z = ZONAS_TILE.find((x) => x.id === id);
  return z ? z.nome : id;
}

function resumoPolitica(politica) {
  const bits = [];
  for (const z of ZONAS_TILE) {
    const s = politica && politica[z.id];
    if (!s || s.modo === 'default') continue;
    const n = (s.pisos || []).length + (s.paredes || []).length;
    bits.push(z.nome + ' ' + s.modo + (n ? ' (' + (s.pisos || []).join(',') + ')' : ''));
  }
  return bits.length ? bits.join('  |  ') : 'todas as zonas no tema do arquiteto';
}

(async () => {
  const canvas = document.getElementById('palco');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const [cal, catalogo, temasDoc, combosDoc] = await Promise.all([
    fetchJson(URL_CALIBRACAO, CALIBRACAO_FALLBACK),
    fetchJson(URL_CATALOGO),
    fetchJson(URL_TEMAS, { temas: [] }),
    fetchJson(URL_COMBOS, { combinacoes: [] }),
  ]);

  const ancoraPiso = cal.ancoraPiso || ANCORA_PISO;
  const peR = cal.peWallR;
  const peL = cal.peWallL;
  const peP = cal.pePorta;
  const FOLGA_PORTA = cal.folgaPorta;
  const bboxPorSrc = new Map();

  const estado = carregarEstado(catalogo, temasDoc.temas || [], temasDoc.politicaTiles);
  estado.combos = mesclarCombos(combosDoc.combinacoes || [], estado.combos || []);
  let temasOrigem = localStorage.getItem(STORAGE_KEY) ? 'localStorage' : 'disco';

  function todosAssets() {
    return catalogo.assets.concat(estado.combos || []);
  }

  function specPorId(id) {
    return todosAssets().find((a) => a.assetId === id);
  }

  async function bboxDe(src) {
    if (bboxPorSrc.has(src)) return bboxPorSrc.get(src);
    const img = await carregar(src);
    const b = medirBbox(img);
    bboxPorSrc.set(src, b);
    return b;
  }

  let ultBboxWall = null;
  let paredePecaIx = -1;
  let arrasteParede = null;
  let arrastePiso = null;
  let arraste = null;
  let pulouClickPalco = false;
  let filtroPapel = '';
  let arrasteCatalogo = null;
  let bookAberto = true;
  const UNDO_MAX = 60;
  let historicoUndo = [];
  let historicoRedo = [];
  let undoDoArraste = false;
  let composeSel = -1;
  document.body.classList.add('book-open');
  // Ancoragem fina sempre ativa por tras dos panos (UI de subdiv removida).
  estado.subdiv = true;

  const ESPELHAVEL_OFF = new Set([
    'projector-screen',
    'japanese-shelf',
    'japanese-canvas',
    'kitchen-cabinet-glass',
    'kitchen-shelf',
  ]);

  function assetEspelhavel(spec) {
    if (!spec || spec.papel !== 'wall') return false;
    if (spec.espelhavel === false) return false;
    if (spec.espelhavel === true) return true;
    return !ESPELHAVEL_OFF.has(spec.assetId);
  }

  function peDaFace(face) {
    return face === 'L' ? peL : peR;
  }
  function verticeDaFace(face, gx, gy) {
    return face === 'L' ? { vx: 0, vy: gy } : { vx: gx, vy: 0 };
  }
  function posBlitVertice(vx, vy, pe, dx, dy) {
    const v = iso(vx, vy);
    return {
      x: ORIGEM.x + (dx || 0) + v.x - pe.x,
      y: ORIGEM.y + (dy || 0) + v.y - pe.y,
    };
  }
  function rectFromBlit(o, bbox) {
    return { x: o.x + bbox.x, y: o.y + bbox.y, w: bbox.w, h: bbox.h };
  }
  function rectFace(face, gx, gy, bbox) {
    const pe = peDaFace(face);
    const v = verticeDaFace(face, gx, gy);
    return rectFromBlit(posBlitVertice(v.vx, v.vy, pe, 0, 0), bbox);
  }
  function rectPecaParede(item, bbox) {
    const pe = peDaFace(item.face);
    const v = verticeDaFace(item.face, item.gx, item.gy);
    return rectFromBlit(posBlitVertice(v.vx, v.vy, pe, item.dx || 0, item.dy || 0), bbox);
  }
  function rectPecaPiso(item, bbox, spec) {
    const { ox, oy, passo } = origemDoItem(item);
    const o = specDoItem(spec, cal);
    if (o && o.modo === 'canto' && o.pe) {
      return rectFromBlit(posBlitVertice(ox, oy, o.pe, 0, 0), bbox);
    }
    if (o && o.modo === 'centro' && o.ancora) {
      const c = iso(ox + passo / 2, oy + passo / 2);
      return {
        x: ORIGEM.x + c.x - o.ancora.x + bbox.x,
        y: ORIGEM.y + c.y - o.ancora.y + bbox.y,
        w: bbox.w,
        h: bbox.h,
      };
    }
    const c = iso(ox + 0.5, oy + 0.5);
    return {
      x: ORIGEM.x + c.x - (bbox.x + bbox.w / 2) + bbox.x,
      y: ORIGEM.y + c.y - (bbox.y + bbox.h) + bbox.y,
      w: bbox.w,
      h: bbox.h,
    };
  }
  function pontoNoRect(px, py, r) {
    return px >= r.x && py >= r.y && px <= r.x + r.w && py <= r.y + r.h;
  }
  function facesDoPalco() {
    const faces = [];
    for (let gx = 0; gx < gradeW(); gx++) faces.push({ face: 'R', gx: gx, gy: 0 });
    for (let gy = 0; gy < gradeH(); gy++) faces.push({ face: 'L', gx: 0, gy: gy });
    return faces;
  }
  function faceSobPonto(px, py) {
    if (!ultBboxWall) return null;
    let best = null;
    let bestD = Infinity;
    for (const f of facesDoPalco()) {
      const bbox = f.face === 'L' ? ultBboxWall.L : ultBboxWall.R;
      const r = rectFace(f.face, f.gx, f.gy, bbox);
      if (!pontoNoRect(px, py, r)) continue;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const d = (px - cx) * (px - cx) + (py - cy) * (py - cy);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }
  function dyInicialParede(assetId) {
    const subida = subidaEfetiva(null);
    if (assetId === 'office-ac' || assetId === 'office-window') return Math.round(-subida * 0.72);
    if (assetId === 'projector-screen') return Math.round(-subida * 0.55);
    return Math.round(-subida * 0.45);
  }
  function pecasDaFace(sel) {
    if (!sel) return [];
    return estado.palco.filter((p) =>
      itemEParede(p) && p.face === sel.face && p.gx === sel.gx && p.gy === sel.gy,
    );
  }
  function pecaParedeSobPonto(px, py) {
    for (let i = estado.palco.length - 1; i >= 0; i--) {
      const p = estado.palco[i];
      if (!itemEParede(p)) continue;
      const spec = specPorId(p.assetId);
      const src = spec && spec.fileName;
      if (!src || !bboxPorSrc.has(src)) continue;
      if (pontoNoRect(px, py, rectPecaParede(p, bboxPorSrc.get(src)))) return i;
    }
    return -1;
  }
  function pecaPisoSobPonto(px, py) {
    for (let i = estado.palco.length - 1; i >= 0; i--) {
      const p = estado.palco[i];
      if (itemEParede(p)) continue;
      const spec = specPorId(p.assetId);
      const src = spec && spec.fileName;
      if (!src || !bboxPorSrc.has(src)) continue;
      if (pontoNoRect(px, py, rectPecaPiso(p, bboxPorSrc.get(src), spec))) return i;
    }
    return -1;
  }
  /** Qualquer peca do palco (parede tem prioridade visual se sobrepor). */
  function pecaPalcoSobPonto(px, py) {
    const w = pecaParedeSobPonto(px, py);
    if (w >= 0) return w;
    return pecaPisoSobPonto(px, py);
  }
  function mesmaFace(a, b) {
    return a && b && a.face === b.face && a.gx === b.gx && a.gy === b.gy;
  }

  function snapshotCanvas() {
    return {
      palco: JSON.parse(JSON.stringify(estado.palco)),
      celula: {
        gx: estado.celula.gx,
        gy: estado.celula.gy,
        qx: estado.celula.qx || 0,
        qy: estado.celula.qy || 0,
      },
      paredeSel: estado.paredeSel
        ? { face: estado.paredeSel.face, gx: estado.paredeSel.gx, gy: estado.paredeSel.gy }
        : null,
      paredePecaIx,
      composeCamadas: JSON.parse(JSON.stringify(estado.composeCamadas || [])),
      composeSel,
    };
  }

  function aplicarSnapshotCanvas(snap) {
    estado.palco = JSON.parse(JSON.stringify(snap.palco || []));
    estado.celula = {
      gx: snap.celula && snap.celula.gx != null ? snap.celula.gx : 1,
      gy: snap.celula && snap.celula.gy != null ? snap.celula.gy : 1,
      qx: snap.celula && snap.celula.qx != null ? snap.celula.qx : 0,
      qy: snap.celula && snap.celula.qy != null ? snap.celula.qy : 0,
    };
    estado.paredeSel = snap.paredeSel
      ? { face: snap.paredeSel.face, gx: snap.paredeSel.gx, gy: snap.paredeSel.gy }
      : null;
    paredePecaIx = typeof snap.paredePecaIx === 'number' ? snap.paredePecaIx : -1;
    estado.composeCamadas = JSON.parse(JSON.stringify(snap.composeCamadas || []));
    composeSel = typeof snap.composeSel === 'number' ? snap.composeSel : -1;
  }

  function marcarUndo() {
    historicoUndo.push(snapshotCanvas());
    if (historicoUndo.length > UNDO_MAX) historicoUndo.shift();
    historicoRedo.length = 0;
  }

  function refreshAposUndo() {
    gravarEstado(estado);
    pintarListaParede();
    pintarCamadasLocais();
    if (typeof pintarListaCamadas === 'function') pintarListaCamadas();
    if (estado.combinando && typeof desenharCompose === 'function') desenharCompose();
    else desenharPalco();
  }

  function desfazer() {
    if (arrasteParede || arrastePiso || arraste || arrasteCatalogo) return;
    if (!historicoUndo.length) return;
    historicoRedo.push(snapshotCanvas());
    aplicarSnapshotCanvas(historicoUndo.pop());
    refreshAposUndo();
  }

  function refazer() {
    if (arrasteParede || arrastePiso || arraste || arrasteCatalogo) return;
    if (!historicoRedo.length) return;
    historicoUndo.push(snapshotCanvas());
    aplicarSnapshotCanvas(historicoRedo.pop());
    refreshAposUndo();
  }

  function espelharFacePeca(idx) {
    const peca = estado.palco[idx];
    if (!peca || !itemEParede(peca)) return;
    const spec = specPorId(peca.assetId);
    if (!assetEspelhavel(spec)) return;
    marcarUndo();
    const faceNova = peca.face === 'L' ? 'R' : 'L';
    const peAntigo = peDaFace(peca.face);
    const peNovo = peDaFace(faceNova);
    const dx = peca.dx || 0;
    // Reflexao horizontal aproximada em torno do pe da face.
    const dxNovo = Math.round(-(dx + (peAntigo.x - peNovo.x) * 0.15));
    if (faceNova === 'L') {
      peca.face = 'L';
      peca.gx = 0;
      peca.gy = clampInt(peca.gy || 0, 0, gradeH() - 1);
    } else {
      peca.face = 'R';
      peca.gy = 0;
      peca.gx = clampInt(peca.gx || 0, 0, gradeW() - 1);
    }
    peca.dx = dxNovo;
    estado.palco[idx] = rebasearAnexoParede(peca, gradeW(), gradeH(), { R: peR, L: peL });
    estado.paredeSel = {
      face: estado.palco[idx].face,
      gx: estado.palco[idx].gx,
      gy: estado.palco[idx].gy,
    };
    paredePecaIx = idx;
    gravarEstado(estado);
    pintarListaParede();
    pintarCamadasLocais();
    desenharPalco();
  }

  /** Hit-test: face de parede sob o ponto ou null (cai no piso). */
  function destinoDoPonto(px, py, preferWall) {
    const face = faceSobPonto(px, py);
    if (face && (preferWall || preferWall == null)) {
      // Se o ponto esta claramente na silhueta da parede, prioriza anexo.
      return { tipo: 'parede', face };
    }
    const g = telaParaGrade(px, py, true);
    if (g.gx < 0 || g.gx >= gradeW() || g.gy < 0 || g.gy >= gradeH()) {
      if (face) return { tipo: 'parede', face };
      return null;
    }
    // Proximidade as arestas NW: se qx/qy perto da borda oeste/norte, vira parede.
    if (!preferWall && face) {
      const nearL = g.gx === 0 && (g.qx || 0) < 0.35;
      const nearR = g.gy === 0 && (g.qy || 0) < 0.35;
      if ((face.face === 'L' && nearL) || (face.face === 'R' && nearR)) {
        return { tipo: 'parede', face };
      }
    }
    if (preferWall && face) return { tipo: 'parede', face };
    return { tipo: 'piso', celula: g };
  }

  function plantarNoPonto(spec, px, py) {
    if (!spec) return;
    if (estado.combinando) {
      adicionarAoCompose(spec);
      return;
    }
    const preferWall = spec.papel === 'wall';
    const dest = destinoDoPonto(px, py, preferWall ? true : false);
    if (!dest) return;
    if (dest.tipo === 'parede' || (preferWall && dest.tipo === 'parede')) {
      const face = dest.face || faceSobPonto(px, py);
      if (!face) return;
      marcarUndo();
      estado.modoPlantar = 'parede';
      estado.paredeSel = face;
      estado.palco.push({
        assetId: spec.assetId,
        papel: 'wall',
        face: face.face,
        gx: face.gx,
        gy: face.gy,
        dx: 0,
        dy: dyInicialParede(spec.assetId),
      });
      paredePecaIx = estado.palco.length - 1;
      if (spec.fileName) bboxDe(spec.fileName).catch(() => undefined);
      desenharPalco();
      return;
    }
    if (spec.papel === 'wall') {
      // Wall asset dropado no meio: ancora na face mais proxima.
      const face = faceSobPonto(px, py) || { face: 'R', gx: dest.celula.gx, gy: 0 };
      marcarUndo();
      estado.paredeSel = face;
      estado.palco.push({
        assetId: spec.assetId,
        papel: 'wall',
        face: face.face,
        gx: face.gx,
        gy: face.gy,
        dx: 0,
        dy: dyInicialParede(spec.assetId),
      });
      paredePecaIx = estado.palco.length - 1;
      desenharPalco();
      return;
    }
    marcarUndo();
    estado.modoPlantar = 'piso';
    const sel = dest.celula;
    estado.celula = sel;
    const alvo = {
      assetId: spec.assetId,
      gx: sel.gx,
      gy: sel.gy,
      qx: sel.qx || 0,
      qy: sel.qy || 0,
      passo: 0.5,
    };
    estado.palco.push(alvo);
    paredePecaIx = estado.palco.length - 1;
    desenharPalco();
  }

  function vizinhosRelevantes(idx) {
    const peca = estado.palco[idx];
    if (!peca) return [];
    const out = [];
    for (let i = 0; i < estado.palco.length; i++) {
      if (i === idx) continue;
      const o = estado.palco[i];
      if (itemEParede(peca) && itemEParede(o)) {
        if (mesmaFace(peca, o)) out.push(i);
        continue;
      }
      if (!itemEParede(peca) && !itemEParede(o)) {
        if (Math.abs(peca.gx - o.gx) <= 1 && Math.abs(peca.gy - o.gy) <= 1) out.push(i);
      }
    }
    return out;
  }

  function moverPecaPalco(idx, dir) {
    if (idx < 0 || idx >= estado.palco.length) return;
    const j = idx + dir;
    if (j < 0 || j >= estado.palco.length) return;
    marcarUndo();
    const tmp = estado.palco[idx];
    estado.palco[idx] = estado.palco[j];
    estado.palco[j] = tmp;
    paredePecaIx = j;
    gravarEstado(estado);
    pintarListaParede();
    pintarCamadasLocais();
    desenharPalco();
  }

  function pintarCamadasLocais() {
    const wrap = document.getElementById('camadas-locais');
    const root = document.getElementById('lista-camadas-locais');
    if (!wrap || !root) return;
    if (estado.combinando || paredePecaIx < 0) {
      wrap.hidden = true;
      root.innerHTML = '';
      return;
    }
    const viz = vizinhosRelevantes(paredePecaIx);
    if (!viz.length) {
      wrap.hidden = true;
      root.innerHTML = '';
      return;
    }
    wrap.hidden = false;
    root.innerHTML = '';
    const self = estado.palco[paredePecaIx];
    const selfSpec = specPorId(self.assetId);
    const chipSelf = document.createElement('div');
    chipSelf.className = 'chip sel';
    chipSelf.textContent = (selfSpec ? selfSpec.nome : self.assetId) + ' (selecionado)';
    root.appendChild(chipSelf);
    for (const i of viz) {
      const p = estado.palco[i];
      const s = specPorId(p.assetId);
      const chip = document.createElement('div');
      chip.className = 'chip';
      const nome = document.createElement('span');
      nome.textContent = s ? s.nome : p.assetId;
      const atras = document.createElement('button');
      atras.type = 'button';
      atras.textContent = 'atras';
      atras.addEventListener('click', () => {
        // Move vizinho para antes do selecionado (atras no painter se idx menor).
        if (i > paredePecaIx) moverPecaPalco(i, paredePecaIx - i);
        else moverPecaPalco(paredePecaIx, 1);
      });
      const frente = document.createElement('button');
      frente.type = 'button';
      frente.textContent = 'frente';
      frente.addEventListener('click', () => {
        if (i < paredePecaIx) moverPecaPalco(i, paredePecaIx - i);
        else moverPecaPalco(paredePecaIx, -1);
      });
      chip.appendChild(nome);
      chip.appendChild(atras);
      chip.appendChild(frente);
      root.appendChild(chip);
    }
  }

  function setBookOpen(on) {
    bookAberto = !!on;
    document.body.classList.toggle('book-open', bookAberto);
    const edge = document.getElementById('btn-book-edge');
    const top = document.getElementById('btn-toggle-book');
    if (edge) edge.classList.toggle('ativo', bookAberto);
    if (top) top.classList.toggle('ativo', bookAberto);
  }

  function setBookTab(tab) {
    const tabs = ['assets', 'ambiente', 'temas'];
    const id = tabs.includes(tab) ? tab : 'assets';
    document.querySelectorAll('[data-book-tab]').forEach((b) => {
      b.classList.toggle('ativo', b.dataset.bookTab === id);
    });
    document.getElementById('pane-assets').hidden = id !== 'assets';
    document.getElementById('pane-ambiente').hidden = id !== 'ambiente';
    document.getElementById('pane-temas').hidden = id !== 'temas';
  }

  function setModoLab(modo) {
    const combinar = modo === 'combinar';
    setCombinando(combinar);
  }

  function jsonAtual() {
    return {
      ...catalogo,
      tilesetAtivo: estado.tilesetAtivo,
      pisoLivre: estado.pisoLivre,
      paredeLivre: estado.paredeLivre,
      assets: catalogo.assets.map((a) => ({
        ...a,
        uso: estado.usos[a.assetId] || a.uso,
      })),
      palcoPadrao: estado.palco,
      palcoGrade: { w: estado.grade.w, h: estado.grade.h },
      andares: estado.andares,
      subidaAndar: estado.subidaAndar,
    };
  }

  function jsonTemas() {
    const hoje = new Date().toISOString().slice(0, 10);
    return {
      versao: '1.5',
      data: hoje,
      notas:
        'Cada zonaKind e um ProtoComodo completo (grade + tileset + palco + calibracao). Persistido automaticamente pelo lab em packages/world-engine/src/biblia/temas-arquiteto.json.',
      temas: estado.temas,
      politicaTiles: estado.politicaTiles,
    };
  }

  async function persistirCombosNoDisco(motivo) {
    const payload = jsonCombos();
    try {
      const res = await fetch(URL_PERSISTIR_COMBOS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        throw new Error(body.erro || 'HTTP ' + res.status);
      }
      return { ok: true, combinacoes: body.combinacoes, motivo };
    } catch (err) {
      console.warn('[lab] persistencia de combos no disco falhou:', err);
      return { ok: false, motivo };
    }
  }

  /**
   * Grava a biblia no disco do projeto via lab-server (POST /api/temas-arquiteto).
   * localStorage continua como rascunho local; o disco e a fonte para o Construtor.
   */
  async function persistirTemasNoDisco(motivo) {
    const payload = jsonTemas();
    const btn = document.getElementById('btn-salvar-tema');
    const statusEl = document.getElementById('tema-persist-status');
    function setStatus(txt, ok) {
      if (statusEl) {
        statusEl.textContent = txt;
        statusEl.dataset.ok = ok ? '1' : '0';
      }
      if (btn && motivo === 'salvar') {
        const prev = btn.dataset.label || btn.textContent;
        btn.dataset.label = prev;
        btn.textContent = ok ? 'salvo no disco' : 'falha no disco';
        setTimeout(() => {
          btn.textContent = btn.dataset.label || 'salvar tema';
        }, 1400);
      }
    }
    try {
      const res = await fetch(URL_PERSISTIR_TEMAS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        throw new Error(body.erro || 'HTTP ' + res.status);
      }
      setStatus(
        'disco · ' + (body.temas != null ? body.temas + ' temas' : 'ok') +
          (motivo ? ' · ' + motivo : ''),
        true,
      );
      const combos = await persistirCombosNoDisco(motivo);
      if (combos.ok && combos.combinacoes != null) {
        setStatus(
          'disco · ' + (body.temas != null ? body.temas + ' temas' : 'ok') +
            ' · ' + combos.combinacoes + ' combos' +
            (motivo ? ' · ' + motivo : ''),
          true,
        );
      }
      temasOrigem = 'disco';
      return true;
    } catch (err) {
      console.warn('[lab] persistencia no disco falhou:', err);
      setStatus(
        'disco offline — rode pnpm lab:iso (lab-server). localStorage ok.',
        false,
      );
      return false;
    }
  }

  function jsonCombos() {
    return {
      versao: '1.0',
      data: '2026-08-17',
      notas: 'Combinacoes do laboratorio. Ordem das camadas = atras para frente. Cole em combinacoes-laboratorio.json. Ainda nao entra no solver.',
      combinacoes: (estado.combos || []).map((c) => ({
        ...c,
        uso: estado.usos[c.assetId] || c.uso || 'aleatorio',
      })),
    };
  }

  function atualizarJsonOut() {
    document.getElementById('json-out').value = JSON.stringify(jsonAtual(), null, 2);
    gravarEstado(estado);
  }

  function atualizarCelulaTxt() {
    const el = document.getElementById('celula-txt');
    if (estado.combinando) {
      el.textContent = 'modo combinar: clique um card para adicionar no preview de baixo, depois arraste.';
      pintarListaParede();
      return;
    }
    if (estado.modoPlantar === 'parede') {
      const sel = estado.paredeSel;
      if (!sel) {
        el.textContent = 'modo parede: clique a face NW (Wall_R no norte, Wall_L no oeste), depois um card. Arraste para alinhar.';
      } else {
        const pecas = pecasDaFace(sel).map((p) => {
          const s = specPorId(p.assetId);
          return s ? s.nome : p.assetId;
        });
        el.textContent =
          'face ' + sel.face + ' @ ' + sel.gx + ',' + sel.gy +
          (pecas.length ? ' — ' + pecas.join(', ') : ' — vazia. Clique um card para plantar, arraste para alinhar.');
      }
      pintarListaParede();
      return;
    }
    const ocupado = estado.palco
      .filter((p) => !itemEParede(p) && p.gx === estado.celula.gx && p.gy === estado.celula.gy)
      .map((p) => (specPorId(p.assetId) ? specPorId(p.assetId).nome : p.assetId));
    el.textContent = 'celula selecionada: ' + estado.celula.gx + ',' + estado.celula.gy +
      (ocupado.length ? ' — ' + ocupado.join(', ') : ' — vazia. Clique um card para plantar.');
    pintarListaParede();
  }

  function gradeW() {
    return estado.grade.w;
  }
  function gradeH() {
    return estado.grade.h;
  }
  function celulasDoPalco() {
    const celulas = [];
    for (let gy = 0; gy < gradeH(); gy++) {
      for (let gx = 0; gx < gradeW(); gx++) celulas.push({ gx, gy });
    }
    celulas.sort((a, b) => a.gx + a.gy - (b.gx + b.gy));
    return celulas;
  }
  let subidaMedida = null;
  function subidaEfetiva(bboxR) {
    if (typeof estado.subidaAndar === 'number') return estado.subidaAndar;
    if (typeof cal.subidaAndar === 'number') return cal.subidaAndar;
    if (bboxR) return Math.max(8, peR.y - bboxR.y);
    if (subidaMedida != null) return subidaMedida;
    return Math.max(8, peR.y - 8);
  }
  function cortarPalcoFora() {
    const w = gradeW();
    const h = gradeH();
    estado.palco = estado.palco.filter((p) => p.gx >= 0 && p.gy >= 0 && p.gx < w && p.gy < h);
    if (estado.celula.gx >= w) estado.celula.gx = w - 1;
    if (estado.celula.gy >= h) estado.celula.gy = h - 1;
    if (estado.celula.gx < 0) estado.celula.gx = 0;
    if (estado.celula.gy < 0) estado.celula.gy = 0;
  }
  function pintarBarraGrade() {
    const w = gradeW();
    const h = gradeH();
    const txtG = document.getElementById('txt-grade');
    const txtA = document.getElementById('txt-andares');
    const txtS = document.getElementById('txt-subida');
    const hint = document.getElementById('grade-hint');
    const wrapS = document.getElementById('wrap-subida');
    if (txtG) txtG.textContent = w + ' × ' + h;
    if (txtA) txtA.textContent = String(estado.andares);
    const gxPlus = document.getElementById('btn-gx-plus');
    const gxMinus = document.getElementById('btn-gx-minus');
    const gyPlus = document.getElementById('btn-gy-plus');
    const gyMinus = document.getElementById('btn-gy-minus');
    if (gxPlus) {
      gxPlus.disabled = w >= GRADE_MAX;
      gxPlus.title = w >= GRADE_MAX ? 'maximo ' + GRADE_MAX : 'Adiciona ' + coordsFaixa('gx', w, h);
    }
    if (gxMinus) {
      gxMinus.disabled = w <= 1;
      gxMinus.title = w <= 1 ? 'minimo 1' : 'Remove ' + coordsFaixa('gx', w - 1, h);
    }
    if (gyPlus) {
      gyPlus.disabled = h >= GRADE_MAX;
      gyPlus.title = h >= GRADE_MAX ? 'maximo ' + GRADE_MAX : 'Adiciona ' + coordsFaixa('gy', h, w);
    }
    if (gyMinus) {
      gyMinus.disabled = h <= 1;
      gyMinus.title = h <= 1 ? 'minimo 1' : 'Remove ' + coordsFaixa('gy', h - 1, w);
    }
    const aPlus = document.getElementById('btn-andar-plus');
    const aMinus = document.getElementById('btn-andar-minus');
    if (aPlus) aPlus.disabled = estado.andares >= ANDARES_MAX;
    if (aMinus) aMinus.disabled = estado.andares <= 1;
    if (wrapS) wrapS.hidden = estado.andares < 2;
    if (txtS) txtS.textContent = estado.andares < 2 ? '—' : String(subidaEfetiva(null)) + 'px';
    if (hint) {
      hint.textContent = w >= GRADE_MAX
        ? 'Palco no maximo ' + GRADE_MAX + 'x' + GRADE_MAX + '. Paredes NW acompanham. Andar extra empilha a mesma malha.'
        : '+gx adiciona ' + coordsFaixa('gx', w, h) + '. +gy adiciona ' + coordsFaixa('gy', h, w) +
          '. Paredes NW acompanham. Andar extra empilha com subida = pe.y − bbox.y da Wall_R.';
    }
  }
  function alterarGrade(dw, dh) {
    estado.grade = clampGrade({ w: gradeW() + dw, h: gradeH() + dh });
    cortarPalcoFora();
    pintarBarraGrade();
    desenharPalco();
  }
  function alterarAndares(d) {
    estado.andares = clampInt(estado.andares + d, 1, ANDARES_MAX);
    pintarBarraGrade();
    desenharPalco();
  }
  function alterarSubida(d) {
    const atual = subidaEfetiva(null);
    estado.subidaAndar = clampInt(atual + d, 16, 160);
    pintarBarraGrade();
    desenharPalco();
  }

  async function blitSpecNoPalco(ctx, spec, item, diagnostico) {
    if (spec.camadas && spec.camadas.length) {
      for (const cam of spec.camadas) {
        const s = specPorId(cam.assetId);
        if (!s || s.camadas) continue;
        try {
          const img = await carregar(s.fileName);
          const bbox = await bboxDe(s.fileName);
          withOrigemOffset(cam.dx || 0, cam.dy || 0, () => {
            blitCatalogo(ctx, img, bbox, s, item, cal, diagnostico);
          });
        } catch { /* png ausente */ }
      }
      return;
    }
    try {
      const img = await carregar(spec.fileName);
      const bbox = await bboxDe(spec.fileName);
      blitCatalogo(ctx, img, bbox, spec, item, cal, diagnostico);
    } catch { /* png ausente */ }
  }

  async function blitPecaParede(ctx, item, spec, diagnostico) {
    const pe = peDaFace(item.face);
    const v = verticeDaFace(item.face, item.gx, item.gy);
    const dx = item.dx || 0;
    const dy = item.dy || 0;
    async function blitUma(s, odx, ody) {
      if (!s || s.camadas || !s.fileName) return;
      try {
        const img = await carregar(s.fileName);
        const bbox = await bboxDe(s.fileName);
        withOrigemOffset(odx, ody, () => {
          const o = blitNaVertice(ctx, img, v.vx, v.vy, pe);
          if (diagnostico) {
            ctx.strokeStyle = 'rgba(255, 80, 200, 0.9)';
            ctx.strokeRect(o.x + bbox.x, o.y + bbox.y, bbox.w, bbox.h);
            marcarPe(ctx, o.tela);
          }
        });
      } catch { /* png ausente */ }
    }
    if (spec.camadas && spec.camadas.length) {
      for (const cam of spec.camadas) {
        await blitUma(specPorId(cam.assetId), dx + (cam.dx || 0), dy + (cam.dy || 0));
      }
      return;
    }
    await blitUma(spec, dx, dy);
  }

  let geraPalco = 0;
  async function desenharPalco() {
    const eu = ++geraPalco;
    const cores = resolverCores(catalogo, estado);
    const pisoSrc = DIR_TILES + '/Floor_128_' + cores.piso + '.png';
    const wallLSrc = DIR_TILES + '/Wall_L_128_' + cores.parede + '.png';
    const wallRSrc = DIR_TILES + '/Wall_R_128_' + cores.parede + '.png';

    let piso;
    let wallL;
    let wallR;
    let porta;
    try {
      [piso, wallL, wallR, porta] = await Promise.all([
        carregar(pisoSrc),
        carregar(wallLSrc),
        carregar(wallRSrc),
        carregar(PORTA_VIDRO),
      ]);
    } catch (err) {
      document.getElementById('meta').textContent = String(err) +
        '\nPar de piso/parede inexistente: ' + cores.piso + ' / ' + cores.parede;
      return;
    }
    if (eu !== geraPalco) return;
    cortarPalcoFora();
    const bboxL = medirBbox(wallL);
    const bboxR = medirBbox(wallR);
    const bboxP = medirBbox(porta);
    const medidoR = peExtremo(silhuetaChao(wallR), 'esq');
    const medidoL = peExtremo(silhuetaChao(wallL), 'dir');
    const medidoP = peExtremo(silhuetaChao(porta), 'esq');

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const w = gradeW();
    const h = gradeH();
    const nAndares = estado.andares;
    subidaMedida = Math.max(8, peR.y - bboxR.y);
    const subida = subidaEfetiva(bboxR);
    encaixarPalco(canvas, w, h, nAndares, subida);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const celulas = celulasDoPalco();
    const gxPorta = Math.floor((w - 1) / 2);

    function blitEstrutura(andar) {
      withOrigemOffset(0, -andar * subida, () => {
        for (const c of celulas) blitTile(ctx, piso, c.gx, c.gy, ancoraPiso);
        for (let gx = 0; gx < w; gx++) {
          const o = blitNaVertice(ctx, wallR, gx, 0, peR);
          if (estado.diagnostico) {
            ctx.strokeStyle = 'rgba(255, 80, 200, 0.9)';
            ctx.strokeRect(o.x + bboxR.x, o.y + bboxR.y, bboxR.w, bboxR.h);
            marcarPe(ctx, o.tela);
          }
        }
        if (andar === 0) {
          const vMeio = iso(gxPorta, 0);
          const oPorta = blitNoPe(
            ctx,
            porta,
            ORIGEM.x + vMeio.x + FOLGA_PORTA.x,
            ORIGEM.y + vMeio.y + FOLGA_PORTA.y,
            peP,
          );
          if (estado.diagnostico) {
            ctx.strokeStyle = 'rgba(255, 80, 200, 0.9)';
            ctx.strokeRect(oPorta.x + bboxP.x, oPorta.y + bboxP.y, bboxP.w, bboxP.h);
            marcarPe(ctx, oPorta.tela);
          }
        }
        for (let gy = 0; gy < h; gy++) {
          const o = blitNaVertice(ctx, wallL, 0, gy, peL);
          if (estado.diagnostico) {
            ctx.strokeStyle = 'rgba(255, 80, 200, 0.9)';
            ctx.strokeRect(o.x + bboxL.x, o.y + bboxL.y, bboxL.w, bboxL.h);
            marcarPe(ctx, o.tela);
          }
        }
      });
    }

    for (let a = nAndares - 1; a >= 0; a--) blitEstrutura(a);

    ultBboxWall = { R: bboxR, L: bboxL };

    const itensParede = estado.palco.filter((p) => {
      if (!itemEParede(p)) return false;
      if (p.face === 'R') return p.gx >= 0 && p.gx < w;
      return p.gy >= 0 && p.gy < h;
    });
    for (const item of itensParede) {
      if (eu !== geraPalco) return;
      const spec = specPorId(item.assetId);
      if (!spec) continue;
      await blitPecaParede(ctx, item, spec, estado.diagnostico);
    }

    const itens = estado.palco
      .map((p) => ({ ...p, spec: specPorId(p.assetId) }))
      .filter((p) => !itemEParede(p) && p.spec && p.gx >= 0 && p.gy >= 0 && p.gx < w && p.gy < h);
    itens.sort((a, b) => {
      const da = a.gx + a.gy + (a.spec.papel === 'decor' ? 0.5 : 0);
      const db = b.gx + b.gy + (b.spec.papel === 'decor' ? 0.5 : 0);
      return da - db;
    });
    for (const item of itens) {
      if (eu !== geraPalco) return;
      await blitSpecNoPalco(ctx, item.spec, item, estado.diagnostico);
    }

    if (estado.postosTrabalho && estado.postosTrabalho.length) {
      for (const posto of estado.postosTrabalho) {
        const g = postoParaGrid(posto);
        losango(ctx, g.x, g.y, '#34d399', 'rgba(52, 211, 153, 0.25)', posto.passo || 1);
      }
    }

    atualizarAvisoPalco(estado.palco);

    // Grade / quartos / ancoras: so no diagnostico. No modo normal o palco fica limpo
    // para nao atrapalhar drag-and-drop.
    if (estado.diagnostico) {
      for (const c of celulas) {
        for (let qy = 0; qy < 2; qy++) {
          for (let qx = 0; qx < 2; qx++) {
            const sel = c.gx === estado.celula.gx && c.gy === estado.celula.gy &&
              qx === (estado.celula.qx || 0) && qy === (estado.celula.qy || 0);
            losango(
              ctx,
              c.gx + qx * 0.5,
              c.gy + qy * 0.5,
              sel ? '#7ec8ff' : 'rgba(80, 160, 255, 0.55)',
              sel ? 'rgba(80, 160, 255, 0.14)' : null,
              0.5,
            );
          }
        }
        const p = iso(c.gx + 0.5, c.gy + 0.5);
        ctx.fillStyle = '#ff3b3b';
        ctx.beginPath();
        ctx.arc(ORIGEM.x + p.x, ORIGEM.y + p.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(200, 230, 255, 0.85)';
        ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
        ctx.fillText(c.gx + ',' + c.gy, ORIGEM.x + p.x + 4, ORIGEM.y + p.y - 4);
      }
    }
    perimetroGrade(ctx, w, h);

    // Destaque so da peca selecionada (nao da malha do piso).
    if (paredePecaIx >= 0 && paredePecaIx < estado.palco.length) {
      const peca = estado.palco[paredePecaIx];
      const specP = specPorId(peca.assetId);
      const src = specP && specP.fileName;
      const bboxPeca = src ? bboxPorSrc.get(src) : null;
      if (bboxPeca && specP) {
        const rP = itemEParede(peca)
          ? rectPecaParede(peca, bboxPeca)
          : rectPecaPiso(peca, bboxPeca, specP);
        ctx.strokeStyle = '#c4a35a';
        ctx.lineWidth = 2;
        ctx.strokeRect(rP.x - 0.5, rP.y - 0.5, rP.w + 1, rP.h + 1);
        ctx.lineWidth = 1;
      }
    }
    if (estado.diagnostico && estado.paredeSel && ultBboxWall) {
      const sel = estado.paredeSel;
      const bboxF = sel.face === 'L' ? ultBboxWall.L : ultBboxWall.R;
      const rF = rectFace(sel.face, sel.gx, sel.gy, bboxF);
      ctx.strokeStyle = 'rgba(196, 163, 90, 0.7)';
      ctx.strokeRect(rF.x - 0.5, rF.y - 0.5, rF.w + 1, rF.h + 1);
    }

    document.getElementById('meta').textContent =
      'GRAVADO  rodada ' + (cal.rodada ?? '?') + '  plano ' + (cal.plano ?? '?') +
      '  |  ' + (cal === CALIBRACAO_FALLBACK ? 'fallback local' : 'JSON da demo') + '\n' +
      'ANCORA_PISO   ' + ancoraPiso.x + ',' + ancoraPiso.y + '\n' +
      'Wall_R peEsq ' + peR.x + ',' + peR.y + '  (PNG medido ' + medidoR.x + ',' + medidoR.y + ')\n' +
      'Wall_L peDir ' + peL.x + ',' + peL.y + '  (PNG medido ' + medidoL.x + ',' + medidoL.y + ')\n' +
      'Porta  peEsq ' + peP.x + ',' + peP.y + '  folga ' + FOLGA_PORTA.x + ',' + FOLGA_PORTA.y +
      '  (PNG medido ' + medidoP.x + ',' + medidoP.y + ')  gx=' + gxPorta + '\n' +
      'TEMA ' + cores.tileSetId + '  piso ' + cores.piso + '  parede ' + cores.parede + '\n' +
      'PALCO  ' + w + ' x ' + h + '  |  andares ' + nAndares +
      '  |  subida ' + subida + 'px' +
      (estado.subidaAndar == null && cal.subidaAndar == null ? ' (PNG Wall_R pe.y − bbox.y)' : ' (override lab/JSON)') + '\n' +
      'POLITICA  ' + resumoPolitica(estado.politicaTiles) +
      (cores.previewZona ? '  |  palco mostra ' + nomeZonaTile(cores.previewZona) : '') + '\n' +
      'MESA ancora 64,68 (centro da face). BEBEDOURO pe 64,63 no vertice NW.' + '\n' +
      'alvo: mesa no centro do losango; bebedouro no esquadro; azul = quarto de celula.';
    atualizarCelulaTxt();
    atualizarJsonOut();
    pintarTemas();
    pintarBarraGrade();
  }

  function pintarTemas() {
    const box = document.getElementById('swatches-tema');
    if (box.dataset.ready === '1') {
      box.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('ativo', b.dataset.id === estado.tilesetAtivo && !estado.pisoLivre && !estado.paredeLivre);
      });
      return;
    }
    box.dataset.ready = '1';
    for (const ts of catalogo.tilesets) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch';
      btn.dataset.id = ts.tileSetId;
      btn.classList.toggle('ativo', ts.tileSetId === estado.tilesetAtivo && !estado.pisoLivre && !estado.paredeLivre);
      btn.title = ts.tileSetId + ' (' + ts.piso + ' / ' + ts.parede + ')';
      btn.setAttribute('aria-label', 'Tema ' + ts.tileSetId);
      carregar(DIR_TILES + '/Floor_128_' + ts.piso + '.png').then((img) => {
        const b = medirBbox(img);
        btn.appendChild(thumb(img, b, 34, 24));
      }).catch(() => {
        btn.textContent = ts.tileSetId.slice(0, 3);
      });
      btn.addEventListener('click', () => {
        estado.tilesetAtivo = ts.tileSetId;
        estado.pisoLivre = null;
        estado.paredeLivre = null;
        document.getElementById('sel-piso').value = ts.piso;
        document.getElementById('sel-parede').value = ts.parede;
        desenharPalco();
      });
      box.appendChild(btn);
    }
  }

  async function montarSwatches(ids, dirPrefix, selId, boxId, campo) {
    const sel = document.getElementById(selId);
    const box = document.getElementById(boxId);
    sel.innerHTML = '';
    for (const nome of ids) {
      const opt = document.createElement('option');
      opt.value = nome;
      opt.textContent = nome;
      sel.appendChild(opt);
    }
    const atual = campo === 'pisoLivre'
      ? (estado.pisoLivre || resolverCores(catalogo, estado).piso)
      : (estado.paredeLivre || resolverCores(catalogo, estado).parede);
    sel.value = atual;
    sel.addEventListener('change', () => {
      estado[campo] = sel.value;
      desenharPalco();
    });

    const amostra = ids;
    for (const nome of amostra) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch';
      btn.title = nome;
      btn.setAttribute('aria-label', (campo === 'pisoLivre' ? 'Piso ' : 'Parede ') + nome);
      const src = campo === 'pisoLivre'
        ? DIR_TILES + '/Floor_128_' + nome + '.png'
        : DIR_TILES + '/Wall_R_128_' + nome + '.png';
      carregar(src).then((img) => {
        btn.appendChild(thumb(img, medirBbox(img), 34, 24));
      }).catch(() => {
        btn.textContent = nome.slice(0, 2);
      });
      btn.addEventListener('click', () => {
        estado[campo] = nome;
        sel.value = nome;
        desenharPalco();
      });
      box.appendChild(btn);
    }
  }

  function zonaPoliticaAtual() {
    const sel = document.getElementById('sel-zona-politica');
    return (sel && sel.value) || 'corridor';
  }

  function slotZona(id) {
    if (!estado.politicaTiles[id]) estado.politicaTiles[id] = slotTilesPadrao();
    return estado.politicaTiles[id];
  }

  function syncPreviewZona() {
    const chk = document.getElementById('chk-preview-zona');
    const id = zonaPoliticaAtual();
    const slot = slotZona(id);
    const querVer = chk ? chk.checked : true;
    estado.previewZona = querVer && slot.modo !== 'default' ? id : null;
  }

  function pintarPolitica() {
    const id = zonaPoliticaAtual();
    const slot = slotZona(id);
    const selModo = document.getElementById('sel-modo-zona');
    const bloco = document.getElementById('bloco-tiles-zona');
    const hint = document.getElementById('hint-zona');
    if (selModo) selModo.value = slot.modo;
    if (bloco) bloco.hidden = slot.modo === 'default';
    if (hint) {
      if (slot.modo === 'default') {
        hint.textContent = nomeZonaTile(id) + ': herda piso/parede do tema do arquiteto daquela sala.';
      } else if (slot.modo === 'unico') {
        hint.textContent = nomeZonaTile(id) + ': unico. Clique uma amostra. Piso ' +
          (slot.pisos[0] || '(tema)') + '  parede ' + (slot.paredes[0] || '(tema)');
      } else {
        hint.textContent = nomeZonaTile(id) + ': opcoes. Clique para marcar. Pisos [' +
          (slot.pisos.join(', ') || '—') + ']  paredes [' + (slot.paredes.join(', ') || '—') + ']';
      }
    }
    const boxP = document.getElementById('swatches-zona-piso');
    const boxW = document.getElementById('swatches-zona-parede');
    if (boxP) {
      boxP.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('ativo', slot.pisos.indexOf(b.dataset.nome) >= 0);
      });
    }
    if (boxW) {
      boxW.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('ativo', slot.paredes.indexOf(b.dataset.nome) >= 0);
      });
    }
    syncPreviewZona();
  }

  function setModoZona(modo) {
    const id = zonaPoliticaAtual();
    const slot = slotZona(id);
    slot.modo = modo === 'unico' || modo === 'opcoes' ? modo : 'default';
    if (slot.modo === 'default') {
      slot.pisos = [];
      slot.paredes = [];
    } else if (slot.modo === 'unico') {
      slot.pisos = slot.pisos.slice(0, 1);
      slot.paredes = slot.paredes.slice(0, 1);
    }
    estado.politicaTiles[id] = slot;
    pintarPolitica();
    desenharPalco();
  }

  function toggleTileZona(campo, nome) {
    const id = zonaPoliticaAtual();
    const slot = slotZona(id);
    if (slot.modo === 'default') return;
    let arr = slot[campo] || [];
    if (slot.modo === 'unico') arr = arr[0] === nome ? [] : [nome];
    else arr = arr.indexOf(nome) >= 0 ? arr.filter((x) => x !== nome) : arr.concat([nome]);
    slot[campo] = arr;
    estado.politicaTiles[id] = slot;
    pintarPolitica();
    desenharPalco();
  }

  function montarSelTemaZona() {
    const sel = document.getElementById('tema-zona');
    if (!sel || sel.dataset.ready === '1') return;
    sel.dataset.ready = '1';
    for (const z of ZONAS_TILE) {
      const opt = document.createElement('option');
      opt.value = z.id;
      opt.textContent = z.nome + ' (' + z.id + ')';
      sel.appendChild(opt);
    }
    sel.value = 'private';
  }

  function montarSelZonas() {
    const sel = document.getElementById('sel-zona-politica');
    if (!sel || sel.dataset.ready === '1') return;
    sel.dataset.ready = '1';
    for (const z of ZONAS_TILE) {
      const opt = document.createElement('option');
      opt.value = z.id;
      opt.textContent = z.nome + ' (' + z.id + ')';
      sel.appendChild(opt);
    }
    sel.value = 'corridor';
    sel.addEventListener('change', () => {
      pintarPolitica();
      desenharPalco();
    });
  }

  async function montarSwatchesZona(ids, dirPrefix, boxId, campo) {
    const box = document.getElementById(boxId);
    if (!box) return;
    box.innerHTML = '';
    for (const nome of ids) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch';
      btn.dataset.nome = nome;
      btn.title = nome;
      btn.setAttribute('aria-label', campo + ' ' + nome);
      const src = DIR_TILES + '/' + dirPrefix + nome + '.png';
      carregar(src).then((img) => {
        btn.appendChild(thumb(img, medirBbox(img), 34, 24));
      }).catch(() => {
        btn.textContent = nome.slice(0, 2);
      });
      btn.addEventListener('click', () => toggleTileZona(campo, nome));
      box.appendChild(btn);
    }
  }

  async function montarCards() {
    const root = document.getElementById('cards');
    if (!root) return;
    root.innerHTML = '';
    const q = (document.getElementById('filtro')?.value || '').trim().toLowerCase();
    const kindSel = document.getElementById('filtro-kind')?.value || '';
    const usoSel = document.getElementById('filtro-uso')?.value || '';
    const soEsp = !!document.getElementById('filtro-espelhavel')?.checked;
    const kinds = new Set();
    for (const a of todosAssets()) {
      if (a.kind) kinds.add(a.kind);
      const blob = (a.nome + ' ' + a.kind + ' ' + a.assetId + ' ' + a.papel + (a.camadas ? ' combo' : '')).toLowerCase();
      if (q && !blob.includes(q)) continue;
      if (filtroPapel && a.papel !== filtroPapel) continue;
      if (kindSel && a.kind !== kindSel) continue;
      const uso = estado.usos[a.assetId] || a.uso;
      if (usoSel && uso !== usoSel) continue;
      if (soEsp && !assetEspelhavel(a)) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card' + (uso === 'off' ? ' uso-off' : '') + (a.camadas ? ' combo' : '') + (a.papel === 'wall' ? ' card-wall' : '');
      btn.setAttribute('role', 'listitem');
      btn.dataset.id = a.assetId;
      if (assetEspelhavel(a)) {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'espelho';
        btn.appendChild(badge);
      }
      const cv = document.createElement('canvas');
      cv.width = 140;
      cv.height = 72;
      cv.setAttribute('aria-hidden', 'true');
      btn.appendChild(cv);
      const nome = document.createElement('span');
      nome.className = 'nome';
      nome.textContent = a.nome;
      btn.appendChild(nome);
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = a.camadas
        ? a.kind + ' · ' + a.papel + ' · combo'
        : a.kind + ' · ' + a.papel;
      btn.appendChild(kind);
      const usos = document.createElement('div');
      usos.className = 'usos';
      for (const u of ['obrigatorio', 'aleatorio', 'off']) {
        const lab = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'uso-' + a.assetId;
        radio.value = u;
        radio.checked = uso === u;
        radio.addEventListener('click', (ev) => ev.stopPropagation());
        radio.addEventListener('change', (ev) => {
          ev.stopPropagation();
          estado.usos[a.assetId] = u;
          if (a.camadas) a.uso = u;
          btn.classList.toggle('uso-off', u === 'off');
          atualizarJsonOut();
        });
        lab.appendChild(radio);
        lab.appendChild(document.createTextNode(' ' + u));
        usos.appendChild(lab);
      }
      btn.appendChild(usos);
      btn.addEventListener('pointerdown', (ev) => {
        if (ev.target.closest('.usos')) return;
        if (ev.button != null && ev.button !== 0) return;
        arrasteCatalogo = {
          spec: a,
          x0: ev.clientX,
          y0: ev.clientY,
          moved: false,
          ghost: null,
        };
        btn.classList.add('dragging');
        btn.setPointerCapture?.(ev.pointerId);
        ev.preventDefault();
      });
      btn.addEventListener('click', (ev) => {
        if (ev.target.closest('.usos')) return;
        if (arrasteCatalogo && arrasteCatalogo.moved) return;
        if (estado.combinando) adicionarAoCompose(a);
        else {
          // Clique simples: planta na celula/face atual (legado) ou centro do palco.
          if (estado.paredeSel && a.papel === 'wall') {
            estado.modoPlantar = 'parede';
            plantar(a);
          } else if (a.papel !== 'wall') {
            estado.modoPlantar = 'piso';
            plantar(a);
          } else {
            const face = estado.paredeSel || { face: 'R', gx: Math.floor(gradeW() / 2), gy: 0 };
            estado.paredeSel = face;
            estado.modoPlantar = 'parede';
            plantar(a);
          }
        }
      });
      root.appendChild(btn);
      if (a.camadas) {
        preencherThumbCombo(cv, a);
      } else {
        carregar(a.fileName).then((img) => {
          const b = medirBbox(img);
          bboxPorSrc.set(a.fileName, b);
          const t = thumb(img, b, 140, 72);
          cv.getContext('2d').drawImage(t, 0, 0);
        }).catch(() => {
          const g = cv.getContext('2d');
          g.fillStyle = '#422';
          g.fillRect(0, 0, 140, 72);
          g.fillStyle = '#faa';
          g.font = '11px sans-serif';
          g.fillText('PNG ausente', 8, 40);
        });
      }
    }
    const selKind = document.getElementById('filtro-kind');
    if (selKind && selKind.options.length <= 1) {
      [...kinds].sort().forEach((k) => {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = k;
        selKind.appendChild(opt);
      });
    }
  }

  function pintarListaParede() {
    const root = document.getElementById('lista-parede');
    if (!root) return;
    root.innerHTML = '';
    if (estado.combinando) {
      root.hidden = true;
      return;
    }
    const pecas = estado.palco
      .map((p, i) => ({ p, i }))
      .filter((x) => itemEParede(x.p));
    if (!pecas.length) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    for (const { p, i } of pecas) {
      const s = specPorId(p.assetId);
      const row = document.createElement('div');
      row.className = 'chip' + (i === paredePecaIx ? ' sel' : '');
      const nome = document.createElement('span');
      nome.textContent = s ? s.nome : p.assetId;
      const meta = document.createElement('span');
      meta.className = 'meta-chip';
      meta.textContent = p.face + ' dx ' + (p.dx || 0) + ' dy ' + (p.dy || 0);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = 'remover';
      rm.addEventListener('click', (ev) => {
        ev.stopPropagation();
        removerPecaParede(i);
      });
      row.appendChild(nome);
      row.appendChild(meta);
      if (assetEspelhavel(s)) {
        const esp = document.createElement('button');
        esp.type = 'button';
        esp.textContent = 'espelhar';
        esp.title = 'Trocar face L ↔ R';
        esp.addEventListener('click', (ev) => {
          ev.stopPropagation();
          espelharFacePeca(i);
        });
        row.appendChild(esp);
      }
      row.appendChild(rm);
      row.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        paredePecaIx = i;
        estado.paredeSel = { face: p.face, gx: p.gx, gy: p.gy };
        pintarListaParede();
        pintarCamadasLocais();
        desenharPalco();
      });
      root.appendChild(row);
    }
    pintarCamadasLocais();
  }

  function removerPecaPalco(idx) {
    if (idx == null) idx = paredePecaIx;
    if (idx < 0 || idx >= estado.palco.length) return;
    marcarUndo();
    estado.palco.splice(idx, 1);
    if (paredePecaIx === idx) paredePecaIx = -1;
    else if (paredePecaIx > idx) paredePecaIx -= 1;
    desenharPalco();
    pintarListaParede();
    pintarCamadasLocais();
  }

  function removerPecaParede(idx) {
    if (idx == null) idx = paredePecaIx;
    if (idx < 0 || idx >= estado.palco.length || !itemEParede(estado.palco[idx])) return;
    removerPecaPalco(idx);
  }

  function plantar(spec) {
    if (spec.papel === 'wall' || estado.modoPlantar === 'parede') {
      const face = estado.paredeSel || { face: 'R', gx: Math.floor(gradeW() / 2), gy: 0 };
      estado.paredeSel = face;
      marcarUndo();
      const mesma = estado.palco.findIndex((p) =>
        itemEParede(p) && p.assetId === spec.assetId && mesmaFace(p, face),
      );
      if (mesma >= 0) {
        estado.palco.splice(mesma, 1);
        if (paredePecaIx === mesma) paredePecaIx = -1;
        else if (paredePecaIx > mesma) paredePecaIx -= 1;
        desenharPalco();
        pintarListaParede();
        return;
      }
      estado.palco.push({
        assetId: spec.assetId,
        papel: 'wall',
        face: face.face,
        gx: face.gx,
        gy: face.gy,
        dx: 0,
        dy: dyInicialParede(spec.assetId),
      });
      paredePecaIx = estado.palco.length - 1;
      if (spec.fileName) bboxDe(spec.fileName).catch(() => undefined);
      desenharPalco();
      pintarListaParede();
      return;
    }
    const sel = estado.celula;
    if (sel.gx < 0 || sel.gx >= gradeW() || sel.gy < 0 || sel.gy >= gradeH()) return;
    const passo = 0.5;
    const alvo = {
      assetId: spec.assetId,
      gx: sel.gx,
      gy: sel.gy,
      qx: sel.qx || 0,
      qy: sel.qy || 0,
      passo,
    };
    marcarUndo();
    estado.palco.push(alvo);
    paredePecaIx = estado.palco.length - 1;
    desenharPalco();
  }

  function sincronizarUiCores(cores) {
    const selPiso = document.getElementById('sel-piso');
    const selParede = document.getElementById('sel-parede');
    if (selPiso) selPiso.value = cores.pisoEfetivo || selPiso.value;
    if (selParede) selParede.value = cores.paredeEfetiva || selParede.value;
    pintarTemas();
    const boxPiso = document.getElementById('swatches-piso');
    const boxParede = document.getElementById('swatches-parede');
    if (boxPiso) {
      boxPiso.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('ativo', b.dataset.nome === estado.pisoLivre);
      });
    }
    if (boxParede) {
      boxParede.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('ativo', b.dataset.nome === estado.paredeLivre);
      });
    }
    const chkPrev = document.getElementById('chk-preview-zona');
    if (chkPrev) chkPrev.checked = false;
  }

  function atualizarAvisoPalco(palco) {
    const el = document.getElementById('palco-aviso');
    if (!el) return;
    const v = validarPalco(palco, specPorId);
    if (v.ok) {
      el.dataset.ok = '1';
      el.textContent = '';
      return;
    }
    el.dataset.ok = '0';
    el.textContent =
      v.missingAssetIds.length +
      ' peca(s) sem asset no catalogo/combos: ' +
      v.missingAssetIds.join(', ') +
      ' — recarregue combos ou reset JSON do repo.';
  }

  function aplicarTema(tema) {
    const t = normalizarTema(tema);

    estado.previewZona = null;
    estado.tilesetAtivo = t.tilesetAtivo || 'nordic-calm';
    const ts = catalogo.tilesets.find((x) => x.tileSetId === estado.tilesetAtivo) || catalogo.tilesets[0];
    const coresRestauradas = restaurarCoresDoTema(t, {
      piso: ts ? ts.piso : '',
      parede: ts ? ts.parede : '',
    });
    estado.pisoLivre = coresRestauradas.pisoLivre;
    estado.paredeLivre = coresRestauradas.paredeLivre;

    estado.grade = t.grade;
    estado.andares = t.andares;
    estado.subidaAndar = t.subidaAndar;
    estado.subdiv = true;
    estado.palco = t.palco.map((p) => ({ ...p }));
    estado.postosTrabalho = (t.postosTrabalho || []).slice();

    if (estado.celula.gx >= estado.grade.w) estado.celula.gx = Math.max(0, estado.grade.w - 1);
    if (estado.celula.gy >= estado.grade.h) estado.celula.gy = Math.max(0, estado.grade.h - 1);
    cortarPalcoFora();

    sincronizarUiCores(coresRestauradas);

    const nomeEl = document.getElementById('nome-tema');
    const prioEl = document.getElementById('tema-prioridade');
    const unicoEl = document.getElementById('tema-unico');
    const zonaEl = document.getElementById('tema-zona');
    const subdivEl = document.getElementById('chk-subdiv');
    if (nomeEl) nomeEl.value = t.nome || '';
    if (prioEl) prioEl.value = String(t.prioridade);
    if (unicoEl) unicoEl.checked = !!t.unicoNaAgencia;
    if (zonaEl) zonaEl.value = zonaKindOk(t.zonaKind);
    if (subdivEl) subdivEl.checked = true;

    atualizarAvisoPalco(estado.palco);

    desenharPalco();
  }

  function snapshotCalibracao() {
    return {
      rodada: cal.rodada,
      plano: cal.plano,
      ancoraPiso: cal.ancoraPiso || ANCORA_PISO,
      peWallR: cal.peWallR,
      peWallL: cal.peWallL,
      pePorta: cal.pePorta,
      folgaPorta: cal.folgaPorta,
      objetos: cal.objetos || {},
    };
  }

  function lerFormTema() {
    const prioEl = document.getElementById('tema-prioridade');
    const unicoEl = document.getElementById('tema-unico');
    const zonaEl = document.getElementById('tema-zona');
    return {
      prioridade: clampInt(prioEl ? prioEl.value : 5, 1, 9),
      unicoNaAgencia: !!(unicoEl && unicoEl.checked),
      zonaKind: zonaKindOk(zonaEl ? zonaEl.value : 'private'),
    };
  }

  function snapshotTema(nome) {
    const cores = resolverCores(catalogo, estado);
    const form = lerFormTema();
    return normalizarTema({
      id: slugTema(nome),
      nome: nome.trim(),
      tilesetAtivo: estado.tilesetAtivo,
      pisoLivre: estado.pisoLivre,
      paredeLivre: estado.paredeLivre,
      palco: estado.palco.map((p) => ({ ...p })),
      grade: { w: estado.grade.w, h: estado.grade.h },
      andares: estado.andares,
      subidaAndar: estado.subidaAndar,
      subdiv: estado.subdiv !== false,
      prioridade: form.prioridade,
      unicoNaAgencia: form.unicoNaAgencia,
      zonaKind: form.zonaKind,
      piso: cores.piso,
      parede: cores.parede,
      calibracao: snapshotCalibracao(),
      postosTrabalho: normalizarPostosTrabalho(estado.postosTrabalho),
    });
  }

  function pintarListaTemas() {
    const root = document.getElementById('lista-temas');
    if (!root) return;
    root.innerHTML = '';
    if (!estado.temas.length) {
      const vazio = document.createElement('p');
      vazio.textContent = 'Nenhum tema salvo. Monte o palco e clique em salvar tema.';
      root.appendChild(vazio);
      return;
    }
    const porZona = {};
    for (const z of ZONAS_TILE) porZona[z.id] = [];
    for (const tema of estado.temas) {
      porZona[zonaKindOk(tema.zonaKind)].push(tema);
    }
    for (const z of ZONAS_TILE) {
      const grupo = porZona[z.id];
      if (!grupo.length) continue;
      const cab = document.createElement('div');
      cab.className = 'tema-grupo';
      cab.textContent = z.nome + ' · ' + z.id;
      root.appendChild(cab);
      grupo.sort((a, b) => (b.prioridade || 0) - (a.prioridade || 0) || a.nome.localeCompare(b.nome));
      for (const tema of grupo) {
        const g = tema.grade || { w: '?', h: '?' };
        const row = document.createElement('div');
        row.className = 'tema-row';
        row.setAttribute('role', 'listitem');
        const lab = document.createElement('span');
        lab.textContent =
          tema.nome +
          ' · ' + z.nome +
          ' · ' + g.w + 'x' + g.h +
          ' · P' + (tema.prioridade || 5) +
          (tema.unicoNaAgencia ? ' · unico' : '') +
          ' · ' + (tema.palco || []).length + ' pecas' +
          ' · ' + (tema.piso || tema.tilesetAtivo) +
          (temasOrigem === 'localStorage' ? ' · rascunho local' : '');
        const carregarBtn = document.createElement('button');
        carregarBtn.type = 'button';
        carregarBtn.textContent = 'carregar';
        carregarBtn.addEventListener('click', () => aplicarTema(tema));
        const apagarBtn = document.createElement('button');
        apagarBtn.type = 'button';
        apagarBtn.textContent = 'apagar';
        apagarBtn.addEventListener('click', () => {
          estado.temas = estado.temas.filter((x) => x.id !== tema.id);
          atualizarJsonOut();
          pintarListaTemas();
          void persistirTemasNoDisco('apagar');
        });
        row.appendChild(lab);
        row.appendChild(carregarBtn);
        row.appendChild(apagarBtn);
        root.appendChild(row);
      }
    }
  }

  async function preencherThumbCombo(cv, combo) {
    const g = cv.getContext('2d');
    g.fillStyle = '#222';
    g.fillRect(0, 0, 140, 72);
    for (const cam of combo.camadas || []) {
      const s = specPorId(cam.assetId);
      if (!s || !s.fileName) continue;
      try {
        const img = await carregar(s.fileName);
        const b = medirBbox(img);
        const t = thumb(img, b, 80, 56);
        g.drawImage(t, 30 + (cam.dx || 0) * 0.25, 8 + (cam.dy || 0) * 0.25);
      } catch { /* ignore */ }
    }
  }

  const canvasCompose = document.getElementById('palco-compose');
  const ctxCompose = canvasCompose ? canvasCompose.getContext('2d') : null;
  if (ctxCompose) ctxCompose.imageSmoothingEnabled = false;
  let geraCompose = 0;

  const DECOR_KINDS = { laptop: 1, monitor: 1, keyboard: 1, mouse: 1, books: 1, radio: 1 };

  /** Menor = desenhado primeiro = atras na perspectiva da camera. */
  function faixaDeCamada(spec) {
    if (!spec) return 2;
    if (spec.kind === 'rug') return 0;
    if (spec.kind === 'chair' || spec.kind === 'sofa') return 1;
    if (spec.papel === 'decor' || DECOR_KINDS[spec.kind]) return 3;
    return 2;
  }

  function indiceInsercao(spec) {
    const faixa = faixaDeCamada(spec);
    for (let i = 0; i < estado.composeCamadas.length; i++) {
      const s = specPorId(estado.composeCamadas[i].assetId);
      if (faixaDeCamada(s) > faixa) return i;
    }
    return estado.composeCamadas.length;
  }

  function retanguloCamada(cam, spec, bbox) {
    const item = { gx: 0, gy: 0, qx: 0, qy: 0, passo: 1 };
    const origem = {
      x: COMPOSE_ORIGEM.x + (cam.dx || 0),
      y: COMPOSE_ORIGEM.y + (cam.dy || 0),
    };
    const o = specDoItem(spec, cal);
    const { ox, oy, passo } = origemDoItem(item);
    let x;
    let y;
    if (o && o.modo === 'canto' && o.pe) {
      const v = iso(ox, oy);
      x = origem.x + v.x - o.pe.x;
      y = origem.y + v.y - o.pe.y;
    } else if (o && o.modo === 'centro' && o.ancora) {
      const c = iso(ox + passo / 2, oy + passo / 2);
      x = origem.x + c.x - o.ancora.x;
      y = origem.y + c.y - o.ancora.y;
    } else {
      const c = iso(ox + 0.5, oy + 0.5);
      x = origem.x + c.x - (bbox.x + bbox.w / 2);
      y = origem.y + c.y - (bbox.y + bbox.h);
    }
    return { x: x + bbox.x, y: y + bbox.y, w: bbox.w, h: bbox.h };
  }

  async function desenharCompose() {
    if (!ctxCompose || !canvasCompose) return;
    const eu = ++geraCompose;
    const pisoSrc = DIR_TILES + '/Floor_128_' + resolverCores(catalogo, estado).piso + '.png';
    let piso = null;
    try {
      piso = await carregar(pisoSrc);
    } catch { /* piso */ }
    const loaded = [];
    for (const cam of estado.composeCamadas) {
      const s = specPorId(cam.assetId);
      if (!s || s.camadas || !s.fileName) continue;
      try {
        const img = await carregar(s.fileName);
        const bbox = await bboxDe(s.fileName);
        loaded.push({ cam, s, img, bbox });
      } catch { /* png */ }
    }
    if (eu !== geraCompose) return;
    withOrigemAbs(COMPOSE_ORIGEM.x, COMPOSE_ORIGEM.y, () => {
      ctxCompose.clearRect(0, 0, canvasCompose.width, canvasCompose.height);
      if (piso) blitTile(ctxCompose, piso, 0, 0, ancoraPiso, 1);
      losango(ctxCompose, 0, 0, '#f5d76e', 'rgba(245, 215, 110, 0.08)', 1);
      const c = iso(0.5, 0.5);
      ctxCompose.fillStyle = '#ff3b3b';
      ctxCompose.beginPath();
      ctxCompose.arc(ORIGEM.x + c.x, ORIGEM.y + c.y, 2, 0, Math.PI * 2);
      ctxCompose.fill();
      const item = { gx: 0, gy: 0, qx: 0, qy: 0, passo: 1 };
      for (const L of loaded) {
        withOrigemOffset(L.cam.dx || 0, L.cam.dy || 0, () => {
          blitCatalogo(ctxCompose, L.img, L.bbox, L.s, item, cal, estado.diagnostico);
        });
      }
      if (composeSel >= 0 && composeSel < estado.composeCamadas.length) {
        const cam = estado.composeCamadas[composeSel];
        const s = specPorId(cam.assetId);
        const bbox = s && s.fileName ? bboxPorSrc.get(s.fileName) : null;
        if (s && bbox) {
          const r = retanguloCamada(cam, s, bbox);
          ctxCompose.strokeStyle = '#f5d76e';
          ctxCompose.lineWidth = 1;
          ctxCompose.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);
        }
      }
    });
  }

  function preencherFormCombo(spec) {
    const nomeEl = document.getElementById('combo-nome');
    const kindEl = document.getElementById('combo-kind');
    const papelEl = document.getElementById('combo-papel');
    const idEl = document.getElementById('combo-id');
    if (estado.composeCamadas.length !== 1) return;
    if (nomeEl && !nomeEl.value) nomeEl.value = spec.nome || '';
    if (kindEl) kindEl.value = spec.papel === 'decor' ? 'desk' : (spec.kind || 'desk');
    if (papelEl) papelEl.value = spec.papel === 'decor' ? 'prop' : (spec.papel || 'prop');
    if (idEl && !idEl.value && spec.assetId) idEl.value = spec.assetId + '-combo';
  }

  function adicionarAoCompose(spec) {
    marcarUndo();
    if (spec.camadas && spec.camadas.length) {
      for (const cam of spec.camadas) {
        estado.composeCamadas.push({
          assetId: cam.assetId,
          dx: cam.dx || 0,
          dy: cam.dy || 0,
        });
      }
      composeSel = estado.composeCamadas.length - 1;
    } else {
      const peca = {
        assetId: spec.assetId,
        dx: 0,
        dy: spec.papel === 'decor' ? -16 : 0,
      };
      const ix = indiceInsercao(spec);
      estado.composeCamadas.splice(ix, 0, peca);
      composeSel = ix;
      preencherFormCombo(spec);
    }
    if (spec.fileName) bboxDe(spec.fileName).catch(() => undefined);
    desenharCompose();
    pintarListaCamadas();
    gravarEstado(estado);
  }

  function selecionarCamada(idx) {
    composeSel = idx;
    pintarListaCamadas();
    desenharCompose();
  }

  function removerCamada(idx) {
    if (idx == null) idx = composeSel;
    if (idx < 0 || idx >= estado.composeCamadas.length) return;
    marcarUndo();
    estado.composeCamadas.splice(idx, 1);
    if (!estado.composeCamadas.length) composeSel = -1;
    else if (composeSel === idx) composeSel = Math.min(idx, estado.composeCamadas.length - 1);
    else if (composeSel > idx) composeSel -= 1;
    desenharCompose();
    pintarListaCamadas();
    gravarEstado(estado);
  }

  function moverCamada(dir) {
    const i = composeSel;
    const j = i + dir;
    if (i < 0 || j < 0 || j >= estado.composeCamadas.length) return;
    marcarUndo();
    const tmp = estado.composeCamadas[i];
    estado.composeCamadas[i] = estado.composeCamadas[j];
    estado.composeCamadas[j] = tmp;
    composeSel = j;
    desenharCompose();
    pintarListaCamadas();
    gravarEstado(estado);
  }

  function pintarListaCamadas() {
    const root = document.getElementById('lista-camadas');
    if (!root) return;
    root.innerHTML = '';
    if (!estado.composeCamadas.length) {
      const vazio = document.createElement('p');
      vazio.className = 'hint-combo';
      vazio.textContent = 'Nenhuma peca ainda. Clique um card para comecar.';
      root.appendChild(vazio);
      return;
    }
    const last = estado.composeCamadas.length - 1;
    estado.composeCamadas.forEach((cam, i) => {
      const s = specPorId(cam.assetId);
      const row = document.createElement('li');
      row.className = 'camada-row' + (i === composeSel ? ' sel' : '');
      row.setAttribute('role', 'listitem');
      const zlab = document.createElement('span');
      zlab.className = 'zlab';
      zlab.textContent = i === 0 ? 'atras' : (i === last ? 'frente' : String(i + 1));
      const nome = document.createElement('button');
      nome.type = 'button';
      nome.className = 'nome-cam';
      nome.textContent = (s ? s.nome : cam.assetId) + '  ' + (s ? s.kind : '');
      nome.addEventListener('click', () => selecionarCamada(i));
      const acoes = document.createElement('span');
      acoes.className = 'acoes';
      const bAtras = document.createElement('button');
      bAtras.type = 'button';
      bAtras.textContent = 'atras';
      bAtras.disabled = i === 0;
      bAtras.addEventListener('click', (ev) => {
        ev.stopPropagation();
        composeSel = i;
        moverCamada(-1);
      });
      const bFrente = document.createElement('button');
      bFrente.type = 'button';
      bFrente.textContent = 'frente';
      bFrente.disabled = i === last;
      bFrente.addEventListener('click', (ev) => {
        ev.stopPropagation();
        composeSel = i;
        moverCamada(1);
      });
      const bRem = document.createElement('button');
      bRem.type = 'button';
      bRem.textContent = 'remover';
      bRem.addEventListener('click', (ev) => {
        ev.stopPropagation();
        removerCamada(i);
      });
      acoes.appendChild(bAtras);
      acoes.appendChild(bFrente);
      acoes.appendChild(bRem);
      row.appendChild(zlab);
      row.appendChild(nome);
      row.appendChild(acoes);
      row.addEventListener('click', () => selecionarCamada(i));
      root.appendChild(row);
    });
  }

  function camadaSobPonto(px, py) {
    const folga = 10;
    for (let i = estado.composeCamadas.length - 1; i >= 0; i--) {
      const cam = estado.composeCamadas[i];
      const s = specPorId(cam.assetId);
      if (!s || !s.fileName) continue;
      const bbox = bboxPorSrc.get(s.fileName);
      if (!bbox) continue;
      const r = retanguloCamada(cam, s, bbox);
      if (px >= r.x - folga && px <= r.x + r.w + folga && py >= r.y - folga && py <= r.y + r.h + folga) {
        return i;
      }
    }
    return -1;
  }

  function aplicarPaineis() {
    document.querySelectorAll('details[data-painel]').forEach((el) => {
      const id = el.dataset.painel;
      el.open = !!(estado.paineis && estado.paineis[id]);
    });
  }

  function ligarPaineis() {
    document.querySelectorAll('details[data-painel]').forEach((el) => {
      el.addEventListener('toggle', () => {
        if (!estado.paineis) estado.paineis = paineisPadrao();
        estado.paineis[el.dataset.painel] = el.open;
        gravarEstado(estado);
      });
    });
    aplicarPaineis();
  }

  function setCombinando(on) {
    estado.combinando = !!on;
    const painel = document.getElementById('painel-combinar');
    const btn = document.getElementById('btn-combinar');
    const listaCam = document.getElementById('lista-camadas');
    const canvasPalco = document.getElementById('palco');
    const canvasComp = document.getElementById('palco-compose');
    const toolbarPalco = document.getElementById('toolbar-palco');
    const barraGrade = document.getElementById('barra-grade');
    const btnPalco = document.getElementById('btn-modo-palco');
    const btnComb = document.getElementById('btn-modo-combinar');
    if (painel) painel.hidden = !estado.combinando;
    if (listaCam) listaCam.hidden = !estado.combinando;
    if (canvasPalco) canvasPalco.hidden = !!estado.combinando;
    if (canvasComp) canvasComp.hidden = !estado.combinando;
    if (toolbarPalco) toolbarPalco.hidden = !!estado.combinando;
    if (barraGrade) barraGrade.hidden = !!estado.combinando;
    if (btn) {
      btn.classList.toggle('ativo', estado.combinando);
      btn.setAttribute('aria-pressed', estado.combinando ? 'true' : 'false');
    }
    if (btnPalco) {
      btnPalco.classList.toggle('ativo', !estado.combinando);
      btnPalco.setAttribute('aria-selected', estado.combinando ? 'false' : 'true');
    }
    if (btnComb) {
      btnComb.classList.toggle('ativo', estado.combinando);
      btnComb.setAttribute('aria-selected', estado.combinando ? 'true' : 'false');
    }
    if (estado.combinando) {
      desenharCompose();
      pintarListaCamadas();
    } else {
      pintarListaParede();
      desenharPalco();
    }
    atualizarCelulaTxt();
  }

  function kindsDoCatalogo() {
    return new Set(catalogo.assets.map((a) => a.kind));
  }

  function salvarCombinacao() {
    const nomeEl = document.getElementById('combo-nome');
    const kindEl = document.getElementById('combo-kind');
    const papelEl = document.getElementById('combo-papel');
    const idEl = document.getElementById('combo-id');
    const nome = (nomeEl.value || '').trim();
    let kind = (kindEl.value || '').trim();
    const papel = papelEl.value === 'decor' ? 'decor' : 'prop';
    let id = slugTema((idEl.value || nome).trim());
    if (!nome) {
      nomeEl.focus();
      return;
    }
    if (estado.composeCamadas.length < 2) {
      const b = document.getElementById('btn-compose-salvar');
      if (b) {
        const old = b.textContent;
        b.textContent = 'precisa de 2 pecas';
        setTimeout(() => { b.textContent = old; }, 1400);
      }
      return;
    }
    const kindsOk = kindsDoCatalogo();
    const primeira = specPorId(estado.composeCamadas[0].assetId);
    if (!kindsOk.has(kind)) kind = (primeira && primeira.kind) || 'desk';
    const baseId = id;
    let n = 2;
    while (catalogo.assets.some((a) => a.assetId === id)) {
      id = baseId + '-' + n;
      n += 1;
    }
    const combo = {
      assetId: id,
      nome: nome,
      kind: kind,
      papel: papel,
      uso: 'aleatorio',
      camadas: estado.composeCamadas.map((c) => ({
        assetId: c.assetId,
        dx: Math.round(c.dx || 0),
        dy: Math.round(c.dy || 0),
      })),
    };
    const ix = estado.combos.findIndex((c) => c.assetId === id);
    if (ix >= 0) estado.combos[ix] = combo;
    else estado.combos.push(combo);
    estado.usos[id] = combo.uso;
    idEl.value = id;
    kindEl.value = kind;
    montarCards();
    gravarEstado(estado);
    void persistirCombosNoDisco('combo');
  }

  if (canvasCompose) {
    canvasCompose.addEventListener('mousedown', (ev) => {
      const r = canvasCompose.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (canvasCompose.width / r.width);
      const py = (ev.clientY - r.top) * (canvasCompose.height / r.height);
      const idx = camadaSobPonto(px, py);
      composeSel = idx;
      pintarListaCamadas();
      desenharCompose();
      if (idx < 0) return;
      const cam = estado.composeCamadas[idx];
      arraste = { idx, x0: px, y0: py, dx0: cam.dx || 0, dy0: cam.dy || 0 };
      canvasCompose.classList.add('arrastando');
      ev.preventDefault();
    });
    window.addEventListener('mousemove', (ev) => {
      if (!arraste) return;
      const r = canvasCompose.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (canvasCompose.width / r.width);
      const py = (ev.clientY - r.top) * (canvasCompose.height / r.height);
      const cam = estado.composeCamadas[arraste.idx];
      if (!cam) return;
      if (!undoDoArraste) {
        marcarUndo();
        undoDoArraste = true;
      }
      cam.dx = Math.round(arraste.dx0 + (px - arraste.x0));
      cam.dy = Math.round(arraste.dy0 + (py - arraste.y0));
      desenharCompose();
    });
    window.addEventListener('mouseup', () => {
      if (arraste) {
        arraste = null;
        undoDoArraste = false;
        if (canvasCompose) canvasCompose.classList.remove('arrastando');
        gravarEstado(estado);
      }
    });
  }

  function pontoDoCanvas(cv, ev) {
    const r = cv.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * (cv.width / r.width),
      y: (ev.clientY - r.top) * (cv.height / r.height),
    };
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if (estado.combinando) return;
    const pt = pontoDoCanvas(canvas, ev);
    const ix = pecaPalcoSobPonto(pt.x, pt.y);
    if (ix < 0) return;
    const peca = estado.palco[ix];
    paredePecaIx = ix;
    if (itemEParede(peca)) {
      estado.paredeSel = { face: peca.face, gx: peca.gx, gy: peca.gy };
      arrasteParede = { idx: ix, x0: pt.x, y0: pt.y, dx0: peca.dx || 0, dy0: peca.dy || 0 };
      arrastePiso = null;
    } else {
      estado.celula = {
        gx: peca.gx,
        gy: peca.gy,
        qx: peca.qx || 0,
        qy: peca.qy || 0,
      };
      arrastePiso = {
        idx: ix,
        x0: pt.x,
        y0: pt.y,
        gx0: peca.gx,
        gy0: peca.gy,
        qx0: peca.qx || 0,
        qy0: peca.qy || 0,
      };
      arrasteParede = null;
    }
    canvas.classList.add('arrastando');
    pintarListaParede();
    pintarCamadasLocais();
    desenharPalco();
    ev.preventDefault();
  });
  window.addEventListener('pointermove', (ev) => {
    if (arrasteCatalogo) {
      const dx = ev.clientX - arrasteCatalogo.x0;
      const dy = ev.clientY - arrasteCatalogo.y0;
      if (!arrasteCatalogo.moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        arrasteCatalogo.moved = true;
        const ghost = document.createElement('canvas');
        ghost.className = 'ghost-drag';
        ghost.width = 96;
        ghost.height = 64;
        ghost.style.left = ev.clientX - 48 + 'px';
        ghost.style.top = ev.clientY - 32 + 'px';
        document.body.appendChild(ghost);
        arrasteCatalogo.ghost = ghost;
        const spec = arrasteCatalogo.spec;
        if (spec.fileName) {
          carregar(spec.fileName).then((img) => {
            const b = medirBbox(img);
            const t = thumb(img, b, 96, 64);
            ghost.getContext('2d').drawImage(t, 0, 0);
          }).catch(() => undefined);
        }
      }
      if (arrasteCatalogo.ghost) {
        arrasteCatalogo.ghost.style.left = ev.clientX - 48 + 'px';
        arrasteCatalogo.ghost.style.top = ev.clientY - 32 + 'px';
      }
      return;
    }
    if (arrasteParede) {
      const peca = estado.palco[arrasteParede.idx];
      if (!peca || !itemEParede(peca)) return;
      const pt = pontoDoCanvas(canvas, ev);
      if (!undoDoArraste) {
        marcarUndo();
        undoDoArraste = true;
      }
      peca.dx = Math.round(arrasteParede.dx0 + (pt.x - arrasteParede.x0));
      peca.dy = Math.round(arrasteParede.dy0 + (pt.y - arrasteParede.y0));
      pulouClickPalco = true;
      desenharPalco();
      return;
    }
    if (arrastePiso) {
      const peca = estado.palco[arrastePiso.idx];
      if (!peca || itemEParede(peca)) return;
      const pt = pontoDoCanvas(canvas, ev);
      const g = telaParaGrade(pt.x, pt.y, true);
      if (g.gx >= 0 && g.gx < gradeW() && g.gy >= 0 && g.gy < gradeH()) {
        if (!undoDoArraste) {
          marcarUndo();
          undoDoArraste = true;
        }
        peca.gx = g.gx;
        peca.gy = g.gy;
        peca.qx = g.qx || 0;
        peca.qy = g.qy || 0;
        peca.passo = 0.5;
        estado.celula = { gx: g.gx, gy: g.gy, qx: g.qx || 0, qy: g.qy || 0 };
        pulouClickPalco = true;
        desenharPalco();
      }
    }
  });
  window.addEventListener('pointerup', (ev) => {
    if (arrasteCatalogo) {
      const drag = arrasteCatalogo;
      arrasteCatalogo = null;
      document.querySelectorAll('.card.dragging').forEach((el) => el.classList.remove('dragging'));
      if (drag.ghost) drag.ghost.remove();
      if (drag.moved) {
        const alvo = estado.combinando ? canvasCompose : canvas;
        if (alvo && !alvo.hidden) {
          const r = alvo.getBoundingClientRect();
          if (
            ev.clientX >= r.left &&
            ev.clientX <= r.right &&
            ev.clientY >= r.top &&
            ev.clientY <= r.bottom
          ) {
            const px = (ev.clientX - r.left) * (alvo.width / r.width);
            const py = (ev.clientY - r.top) * (alvo.height / r.height);
            if (estado.combinando) adicionarAoCompose(drag.spec);
            else plantarNoPonto(drag.spec, px, py);
            gravarEstado(estado);
            pintarListaParede();
            pintarCamadasLocais();
          }
        }
        pulouClickPalco = true;
      }
      return;
    }
    if (arrasteParede) {
      const peca = estado.palco[arrasteParede.idx];
      if (peca && itemEParede(peca)) {
        estado.palco[arrasteParede.idx] = rebasearAnexoParede(
          peca,
          gradeW(),
          gradeH(),
          { R: peR, L: peL },
        );
        estado.paredeSel = {
          face: estado.palco[arrasteParede.idx].face,
          gx: estado.palco[arrasteParede.idx].gx,
          gy: estado.palco[arrasteParede.idx].gy,
        };
        if (!anexoParedeValido(estado.palco[arrasteParede.idx])) {
          const status = document.getElementById('tema-persist-status');
          if (status) {
            status.dataset.ok = '0';
            status.textContent = 'anexo fora da parede; reposicione antes de salvar';
          }
        }
      }
      arrasteParede = null;
      undoDoArraste = false;
      canvas.classList.remove('arrastando');
      gravarEstado(estado);
      pintarListaParede();
      pintarCamadasLocais();
      desenharPalco();
      return;
    }
    if (arrastePiso) {
      arrastePiso = null;
      undoDoArraste = false;
      canvas.classList.remove('arrastando');
      gravarEstado(estado);
      pintarCamadasLocais();
      desenharPalco();
    }
  });

  canvas.addEventListener('click', (ev) => {
    if (pulouClickPalco) {
      pulouClickPalco = false;
      return;
    }
    if (estado.combinando) return;
    const pt = pontoDoCanvas(canvas, ev);
    const ix = pecaPalcoSobPonto(pt.x, pt.y);
    if (ix >= 0) {
      const peca = estado.palco[ix];
      paredePecaIx = ix;
      if (itemEParede(peca)) {
        estado.paredeSel = { face: peca.face, gx: peca.gx, gy: peca.gy };
      } else {
        estado.celula = {
          gx: peca.gx,
          gy: peca.gy,
          qx: peca.qx || 0,
          qy: peca.qy || 0,
        };
      }
      atualizarCelulaTxt();
      pintarListaParede();
      pintarCamadasLocais();
      desenharPalco();
      return;
    }
    // Clique no chao vazio: limpa selecao. Nao captura celula/face —
    // isso atrapalhava o DnD e forçava overlays mentais de grade.
    paredePecaIx = -1;
    if (!estado.diagnostico) estado.paredeSel = null;
    atualizarCelulaTxt();
    pintarListaParede();
    pintarCamadasLocais();
    desenharPalco();
  });
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };
  bind('btn-gx-plus', () => alterarGrade(1, 0));
  bind('btn-gx-minus', () => alterarGrade(-1, 0));
  bind('btn-gy-plus', () => alterarGrade(0, 1));
  bind('btn-gy-minus', () => alterarGrade(0, -1));
  bind('btn-andar-plus', () => alterarAndares(1));
  bind('btn-andar-minus', () => alterarAndares(-1));
  bind('btn-subida-plus', () => alterarSubida(1));
  bind('btn-subida-minus', () => alterarSubida(-1));
  pintarBarraGrade();
  const chkDiag = document.getElementById('chk-diag');
  if (chkDiag) {
    chkDiag.checked = !!estado.diagnostico;
    chkDiag.addEventListener('change', (ev) => {
      estado.diagnostico = ev.target.checked;
      desenharPalco();
    });
  }
  const chkSubdiv = document.getElementById('chk-subdiv');
  if (chkSubdiv) {
    chkSubdiv.checked = true;
    estado.subdiv = true;
  }
  function setModoPlantar(modo) {
    estado.modoPlantar = modo === 'parede' ? 'parede' : 'piso';
    const radioP = document.getElementById('radio-piso');
    const radioW = document.getElementById('radio-parede');
    if (radioP) radioP.checked = estado.modoPlantar === 'piso';
    if (radioW) radioW.checked = estado.modoPlantar === 'parede';
    if (canvas) canvas.style.cursor = 'grab';
    if (estado.modoPlantar === 'piso') {
      /* keep paredePecaIx for chip selection */
    }
    atualizarCelulaTxt();
    gravarEstado(estado);
    desenharPalco();
  }
  setModoPlantar(estado.modoPlantar);
  document.getElementById('btn-padrao').addEventListener('click', () => {
    marcarUndo();
    estado.palco = (catalogo.palcoPadrao || []).map(palcoItemNormalizado);
    estado.celula = { gx: 1, gy: 1, qx: 0, qy: 0 };
    desenharPalco();
  });
  document.getElementById('btn-limpar').addEventListener('click', () => {
    marcarUndo();
    estado.palco = [];
    desenharPalco();
  });
  document.getElementById('btn-reset').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    const fresco = estadoDoCatalogo(catalogo, temasDoc.temas || []);
    Object.assign(estado, fresco);
    estado.usos = fresco.usos;
    estado.palco = fresco.palco;
    estado.temas = fresco.temas;
    estado.combos = (combosDoc.combinacoes || []).slice();
    estado.composeCamadas = [];
    estado.combinando = false;
    composeSel = -1;
    estado.subdiv = true;
    estado.modoPlantar = 'piso';
    estado.paredeSel = null;
    paredePecaIx = -1;
    estado.politicaTiles = normalizarPolitica(temasDoc.politicaTiles, catalogo);
    estado.previewZona = null;
    estado.postosTrabalho = [];
    temasOrigem = 'disco';
    estado.paineis = paineisPadrao();
    document.getElementById('chk-diag').checked = false;
    const chkSub = document.getElementById('chk-subdiv');
    if (chkSub) chkSub.checked = true;
    estado.subdiv = true;
    const chkPrev = document.getElementById('chk-preview-zona');
    if (chkPrev) chkPrev.checked = true;
    document.getElementById('sel-piso').value = resolverCores(catalogo, estado).piso;
    document.getElementById('sel-parede').value = resolverCores(catalogo, estado).parede;
    const zonaTema = document.getElementById('tema-zona');
    if (zonaTema) zonaTema.value = 'private';
    setModoPlantar('piso');
    setCombinando(false);
    aplicarPaineis();
    montarCards();
    pintarListaTemas();
    pintarPolitica();
    desenharPalco();
  });
  document.getElementById('btn-salvar-tema').addEventListener('click', async () => {
    const nome = document.getElementById('nome-tema').value.trim();
    if (!nome) {
      document.getElementById('nome-tema').focus();
      return;
    }
    const aviso = validarPalco(estado.palco, specPorId);
    if (!aviso.ok) {
      atualizarAvisoPalco(estado.palco);
      return;
    }
    const anexosInvalidos = estado.palco.filter((p) => itemEParede(p) && !anexoParedeValido(p));
    if (anexosInvalidos.length) {
      const status = document.getElementById('tema-persist-status');
      if (status) {
        status.dataset.ok = '0';
        status.textContent = anexosInvalidos.length + ' anexo(s) fora da parede; reposicione antes de salvar';
      }
      return;
    }
    const novo = snapshotTema(nome);
    const ix = estado.temas.findIndex((t) => t.id === novo.id || t.nome === novo.nome);
    if (ix >= 0) estado.temas[ix] = novo;
    else estado.temas.push(novo);
    temasOrigem = 'localStorage';
    atualizarJsonOut();
    pintarListaTemas();
    await persistirTemasNoDisco('salvar');
  });
  const btnRecarregarDisco = document.getElementById('btn-recarregar-disco');
  if (btnRecarregarDisco) {
    btnRecarregarDisco.addEventListener('click', async () => {
      try {
        const res = await fetch(URL_PERSISTIR_TEMAS);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const doc = await res.json();
        estado.temas = (doc.temas || []).map(normalizarTema);
        estado.politicaTiles = normalizarPolitica(doc.politicaTiles, catalogo);
        temasOrigem = 'disco';
        gravarEstado(estado);
        pintarListaTemas();
        pintarPolitica();
        atualizarJsonOut();
        const statusEl = document.getElementById('tema-persist-status');
        if (statusEl) {
          statusEl.textContent = 'recarregado do disco · ' + estado.temas.length + ' temas';
          statusEl.dataset.ok = '1';
        }
      } catch (err) {
        const statusEl = document.getElementById('tema-persist-status');
        if (statusEl) {
          statusEl.textContent = 'falha ao recarregar — rode pnpm lab:iso';
          statusEl.dataset.ok = '0';
        }
        console.warn('[lab] recarregar do disco:', err);
      }
    });
  }
  const btnMarcarAssento = document.getElementById('btn-marcar-assento');
  if (btnMarcarAssento) {
    btnMarcarAssento.addEventListener('click', () => {
      const passo = estado.subdiv ? 0.5 : 1;
      const zonaEl = document.getElementById('tema-zona');
      const slot =
        zonaEl && zonaEl.value === 'boss_room'
          ? 'agent-boss'
          : 'default';
      const entry = {
        agentSlot: slot,
        gx: estado.celula.gx,
        gy: estado.celula.gy,
        qx: estado.subdiv ? (estado.celula.qx || 0) : 0,
        qy: estado.subdiv ? (estado.celula.qy || 0) : 0,
        passo,
        facing: 2,
      };
      estado.postosTrabalho = estado.postosTrabalho.filter((p) => p.agentSlot !== slot);
      estado.postosTrabalho.push(entry);
      estado.postosTrabalho = normalizarPostosTrabalho(estado.postosTrabalho);
      gravarEstado(estado);
      desenharPalco();
    });
  }
  document.getElementById('btn-copiar-temas').addEventListener('click', async () => {
    const txt = JSON.stringify(jsonTemas(), null, 2);
    try {
      await navigator.clipboard.writeText(txt);
      document.getElementById('btn-copiar-temas').textContent = 'copiado';
      setTimeout(() => {
        document.getElementById('btn-copiar-temas').textContent = 'copiar temas JSON';
      }, 1200);
    } catch {
      document.getElementById('json-out').value = txt;
      document.getElementById('json-out').select();
    }
    await persistirTemasNoDisco('copiar');
  });
  document.getElementById('btn-copiar').addEventListener('click', async () => {
    const txt = document.getElementById('json-out').value;
    try {
      await navigator.clipboard.writeText(txt);
      document.getElementById('btn-copiar').textContent = 'copiado';
      setTimeout(() => {
        document.getElementById('btn-copiar').textContent = 'copiar JSON';
      }, 1200);
    } catch {
      document.getElementById('json-out').select();
    }
  });
  document.getElementById('filtro').addEventListener('input', () => montarCards());
  const filtroKind = document.getElementById('filtro-kind');
  if (filtroKind) filtroKind.addEventListener('change', () => montarCards());
  const filtroUso = document.getElementById('filtro-uso');
  if (filtroUso) filtroUso.addEventListener('change', () => montarCards());
  const filtroEsp = document.getElementById('filtro-espelhavel');
  if (filtroEsp) filtroEsp.addEventListener('change', () => montarCards());
  document.querySelectorAll('#filtros-papel .chip-filter').forEach((b) => {
    b.addEventListener('click', () => {
      filtroPapel = b.dataset.papel || '';
      document.querySelectorAll('#filtros-papel .chip-filter').forEach((x) => {
        x.classList.toggle('ativo', x === b);
      });
      montarCards();
    });
  });
  const btnModoPalco = document.getElementById('btn-modo-palco');
  const btnModoCombinar = document.getElementById('btn-modo-combinar');
  if (btnModoPalco) btnModoPalco.addEventListener('click', () => setModoLab('palco'));
  if (btnModoCombinar) btnModoCombinar.addEventListener('click', () => setModoLab('combinar'));
  const btnToggleBook = document.getElementById('btn-toggle-book');
  const btnBookEdge = document.getElementById('btn-book-edge');
  if (btnToggleBook) btnToggleBook.addEventListener('click', () => setBookOpen(!bookAberto));
  if (btnBookEdge) btnBookEdge.addEventListener('click', () => setBookOpen(!bookAberto));
  document.querySelectorAll('[data-book-tab]').forEach((b) => {
    b.addEventListener('click', () => setBookTab(b.dataset.bookTab));
  });
  const btnInfo = document.getElementById('btn-info-tec');
  if (btnInfo) {
    btnInfo.addEventListener('click', () => {
      const meta = document.getElementById('meta');
      if (!meta) return;
      meta.hidden = !meta.hidden;
      btnInfo.classList.toggle('ativo', !meta.hidden);
      btnInfo.setAttribute('aria-pressed', meta.hidden ? 'false' : 'true');
    });
  }
  const helpDrawer = document.getElementById('help-drawer');
  const btnHelp = document.getElementById('btn-help');
  const btnHelpClose = document.getElementById('btn-help-close');
  if (btnHelp && helpDrawer) {
    btnHelp.addEventListener('click', () => helpDrawer.classList.add('open'));
  }
  if (btnHelpClose && helpDrawer) {
    btnHelpClose.addEventListener('click', () => helpDrawer.classList.remove('open'));
  }
  if (helpDrawer) {
    helpDrawer.addEventListener('click', (ev) => {
      if (ev.target === helpDrawer) helpDrawer.classList.remove('open');
    });
  }
  setBookTab('assets');
  setBookOpen(true);
  setCombinando(false);
  const btnCombinar = document.getElementById('btn-combinar');
  if (btnCombinar) {
    btnCombinar.addEventListener('click', () => setCombinando(!estado.combinando));
  }
  const btnComposeLimpar = document.getElementById('btn-compose-limpar');
  if (btnComposeLimpar) {
    btnComposeLimpar.addEventListener('click', () => {
      marcarUndo();
      estado.composeCamadas = [];
      composeSel = -1;
      desenharCompose();
      pintarListaCamadas();
      gravarEstado(estado);
    });
  }
  const btnComposeAtras = document.getElementById('btn-compose-atras');
  if (btnComposeAtras) {
    btnComposeAtras.addEventListener('click', () => moverCamada(-1));
  }
  const btnComposeFrente = document.getElementById('btn-compose-frente');
  if (btnComposeFrente) {
    btnComposeFrente.addEventListener('click', () => moverCamada(1));
  }
  const btnComposeRemover = document.getElementById('btn-compose-remover');
  if (btnComposeRemover) {
    btnComposeRemover.addEventListener('click', () => removerCamada());
  }
  window.addEventListener('keydown', (ev) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const cmd = ev.ctrlKey || ev.metaKey;
    if (cmd && (ev.key === 'z' || ev.key === 'Z')) {
      ev.preventDefault();
      if (ev.shiftKey) refazer();
      else desfazer();
      return;
    }
    if (cmd && (ev.key === 'y' || ev.key === 'Y')) {
      ev.preventDefault();
      refazer();
      return;
    }
    if (estado.combinando) {
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        removerCamada();
        ev.preventDefault();
      } else if (ev.key === '[' || ev.key === 'PageDown') {
        moverCamada(-1);
        ev.preventDefault();
      } else if (ev.key === ']' || ev.key === 'PageUp') {
        moverCamada(1);
        ev.preventDefault();
      }
      return;
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      removerPecaPalco();
      ev.preventDefault();
    }
  });
  const btnComposeSalvar = document.getElementById('btn-compose-salvar');
  if (btnComposeSalvar) {
    btnComposeSalvar.addEventListener('click', () => salvarCombinacao());
  }
  const btnCopiarCombos = document.getElementById('btn-copiar-combos');
  if (btnCopiarCombos) {
    btnCopiarCombos.addEventListener('click', async () => {
      const txt = JSON.stringify(jsonCombos(), null, 2);
      try {
        await navigator.clipboard.writeText(txt);
        btnCopiarCombos.textContent = 'copiado';
        setTimeout(() => {
          btnCopiarCombos.textContent = 'copiar combinacoes JSON';
        }, 1200);
      } catch {
        document.getElementById('json-out').value = txt;
        document.getElementById('json-out').select();
      }
      await persistirCombosNoDisco('copiar');
    });
  }
  await montarSwatches(catalogo.pisos, 'Floor_128_', 'sel-piso', 'swatches-piso', 'pisoLivre');
  await montarSwatches(catalogo.paredes, 'Wall_R_128_', 'sel-parede', 'swatches-parede', 'paredeLivre');
  montarSelTemaZona();
  montarSelZonas();
  await montarSwatchesZona(catalogo.pisos, 'Floor_128_', 'swatches-zona-piso', 'pisos');
  await montarSwatchesZona(catalogo.paredes, 'Wall_R_128_', 'swatches-zona-parede', 'paredes');
  const selModoZona = document.getElementById('sel-modo-zona');
  if (selModoZona) {
    selModoZona.addEventListener('change', () => setModoZona(selModoZona.value));
  }
  const chkPrevZona = document.getElementById('chk-preview-zona');
  if (chkPrevZona) {
    chkPrevZona.addEventListener('change', () => {
      syncPreviewZona();
      desenharPalco();
    });
  }
  pintarPolitica();
  await montarCards();
  pintarListaTemas();
  await desenharPalco();
  atualizarAvisoPalco(estado.palco);
})().catch((err) => {
  document.getElementById('meta').textContent = String(err);
});

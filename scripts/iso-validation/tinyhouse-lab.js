/**
 * Laboratorio TinyHouse: palco 3x3 + catalogo do arquiteto.
 * Carrega calibracao-tinyhouse.json, catalogo-laboratorio.json e
 * a biblia de temas do Construtor (world-engine/src/biblia/).
 */
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
  if (!(estado.combos && estado.combos.length)) {
    estado.combos = (combosDoc.combinacoes || []).slice();
  }

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
  let pulouClickPalco = false;

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
  function mesmaFace(a, b) {
    return a && b && a.face === b.face && a.gx === b.gx && a.gy === b.gy;
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

    for (const c of celulas) {
      if (estado.subdiv) {
        for (let qy = 0; qy < 2; qy++) {
          for (let qx = 0; qx < 2; qx++) {
            const sel = c.gx === estado.celula.gx && c.gy === estado.celula.gy &&
              qx === (estado.celula.qx || 0) && qy === (estado.celula.qy || 0);
            losango(
              ctx,
              c.gx + qx * 0.5,
              c.gy + qy * 0.5,
              sel ? '#7ec8ff' : 'rgba(80, 160, 255, 0.7)',
              sel ? 'rgba(80, 160, 255, 0.18)' : null,
              0.5,
            );
          }
        }
      }
      const selCel = c.gx === estado.celula.gx && c.gy === estado.celula.gy && !estado.subdiv;
      losango(
        ctx,
        c.gx,
        c.gy,
        selCel ? '#f5d76e' : 'rgba(80, 200, 255, 0.35)',
        selCel ? 'rgba(245, 215, 110, 0.12)' : null,
      );
      const p = iso(c.gx + 0.5, c.gy + 0.5);
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath();
      ctx.arc(ORIGEM.x + p.x, ORIGEM.y + p.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(200, 230, 255, 0.85)';
      ctx.font = '10px ui-monospace, Consolas, monospace';
      ctx.fillText(c.gx + ',' + c.gy, ORIGEM.x + p.x + 4, ORIGEM.y + p.y - 4);
    }
    perimetroGrade(ctx, w, h);

    if (estado.modoPlantar === 'parede' && estado.paredeSel && ultBboxWall) {
      const sel = estado.paredeSel;
      const bboxF = sel.face === 'L' ? ultBboxWall.L : ultBboxWall.R;
      const rF = rectFace(sel.face, sel.gx, sel.gy, bboxF);
      ctx.strokeStyle = '#f5d76e';
      ctx.lineWidth = 2;
      ctx.strokeRect(rF.x - 0.5, rF.y - 0.5, rF.w + 1, rF.h + 1);
      ctx.lineWidth = 1;
    }
    if (paredePecaIx >= 0 && paredePecaIx < estado.palco.length) {
      const peca = estado.palco[paredePecaIx];
      const specP = specPorId(peca.assetId);
      const src = specP && specP.fileName;
      const bboxPeca = src ? bboxPorSrc.get(src) : null;
      if (itemEParede(peca) && bboxPeca) {
        const rP = rectPecaParede(peca, bboxPeca);
        ctx.strokeStyle = '#f5d76e';
        ctx.strokeRect(rP.x - 0.5, rP.y - 0.5, rP.w + 1, rP.h + 1);
      }
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
    root.innerHTML = '';
    const q = document.getElementById('filtro').value.trim().toLowerCase();
    for (const a of todosAssets()) {
      const blob = (a.nome + ' ' + a.kind + ' ' + a.assetId + ' ' + a.papel + (a.camadas ? ' combo' : '')).toLowerCase();
      if (q && !blob.includes(q)) continue;
      const uso = estado.usos[a.assetId] || a.uso;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card' + (uso === 'off' ? ' uso-off' : '') + (a.camadas ? ' combo' : '') + (a.papel === 'wall' ? ' card-wall' : '');
      btn.setAttribute('role', 'listitem');
      btn.dataset.id = a.assetId;
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
        ? a.kind + ' · ' + a.papel + ' · ' + a.assetId + ' · combo'
        : a.kind + ' · ' + a.papel + ' · ' + a.assetId;
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
      btn.addEventListener('click', () => {
        if (estado.combinando) adicionarAoCompose(a);
        else plantar(a);
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
  }

  function pintarListaParede() {
    const root = document.getElementById('lista-parede');
    if (!root) return;
    const noParede = estado.modoPlantar === 'parede' && !estado.combinando;
    root.hidden = !noParede;
    root.innerHTML = '';
    if (!noParede) return;
    const sel = estado.paredeSel;
    if (!sel) {
      const p = document.createElement('p');
      p.className = 'hint-combo';
      p.textContent = 'Selecione uma face da parede no palco.';
      root.appendChild(p);
      return;
    }
    const pecas = estado.palco
      .map((p, i) => ({ p, i }))
      .filter((x) => itemEParede(x.p) && mesmaFace(x.p, sel));
    if (!pecas.length) {
      const p = document.createElement('p');
      p.className = 'hint-combo';
      p.textContent = 'Nada nesta face. Clique um card, depois arraste.';
      root.appendChild(p);
      return;
    }
    for (const { p, i } of pecas) {
      const s = specPorId(p.assetId);
      const row = document.createElement('div');
      row.className = 'camada-row' + (i === paredePecaIx ? ' sel' : '');
      const nome = document.createElement('span');
      nome.className = 'nome-cam';
      nome.textContent = (s ? s.nome : p.assetId) + '  dx ' + (p.dx || 0) + ' dy ' + (p.dy || 0);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = 'remover';
      rm.addEventListener('click', () => removerPecaParede(i));
      row.addEventListener('click', (ev) => {
        if (ev.target === rm) return;
        paredePecaIx = i;
        pintarListaParede();
        desenharPalco();
      });
      row.appendChild(nome);
      row.appendChild(rm);
      root.appendChild(row);
    }
  }

  function removerPecaParede(idx) {
    if (idx == null) idx = paredePecaIx;
    if (idx < 0 || idx >= estado.palco.length || !itemEParede(estado.palco[idx])) return;
    estado.palco.splice(idx, 1);
    if (paredePecaIx === idx) paredePecaIx = -1;
    else if (paredePecaIx > idx) paredePecaIx -= 1;
    desenharPalco();
  }

  function plantar(spec) {
    if (estado.modoPlantar === 'parede') {
      const face = estado.paredeSel;
      if (!face) {
        atualizarCelulaTxt();
        return;
      }
      const mesma = estado.palco.findIndex((p) =>
        itemEParede(p) && p.assetId === spec.assetId && mesmaFace(p, face),
      );
      if (mesma >= 0) {
        estado.palco.splice(mesma, 1);
        if (paredePecaIx === mesma) paredePecaIx = -1;
        else if (paredePecaIx > mesma) paredePecaIx -= 1;
        desenharPalco();
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
      return;
    }
    if (spec.papel === 'wall') {
      const el = document.getElementById('celula-txt');
      if (el) {
        el.textContent = 'Esse card e de parede. Mude plantar para parede, clique a face NW, depois o card.';
      }
      return;
    }
    const sel = estado.celula;
    if (sel.gx < 0 || sel.gx >= gradeW() || sel.gy < 0 || sel.gy >= gradeH()) return;
    const passo = estado.subdiv ? 0.5 : 1;
    const alvo = {
      assetId: spec.assetId,
      gx: sel.gx,
      gy: sel.gy,
      qx: estado.subdiv ? (sel.qx || 0) : 0,
      qy: estado.subdiv ? (sel.qy || 0) : 0,
      passo,
    };
    const mesma = estado.palco.findIndex((p) =>
      !itemEParede(p) && p.assetId === spec.assetId &&
      (estado.subdiv ? mesmoSlot(p, alvo) : mesmaCelula(p, alvo)),
    );
    if (mesma >= 0) {
      estado.palco.splice(mesma, 1);
      desenharPalco();
      return;
    }
    if (spec.papel === 'prop') {
      estado.palco = estado.palco.filter((p) => {
        if (itemEParede(p)) return true;
        const s = specPorId(p.assetId);
        if (!s || s.papel !== 'prop') return true;
        return estado.subdiv ? !mesmoSlot(p, alvo) : !mesmaCelula(p, alvo);
      });
    }
    estado.palco.push(alvo);
    desenharPalco();
  }

  function aplicarTema(tema) {
    const t = normalizarTema(tema);
    estado.tilesetAtivo = t.tilesetAtivo || 'nordic-calm';
    estado.pisoLivre = t.pisoLivre != null ? t.pisoLivre : null;
    estado.paredeLivre = t.paredeLivre != null ? t.paredeLivre : null;
    estado.grade = t.grade;
    estado.andares = t.andares;
    estado.subidaAndar = t.subidaAndar;
    estado.subdiv = t.subdiv !== false;
    estado.palco = t.palco.map((p) => ({ ...p }));
    if (estado.celula.gx >= estado.grade.w) estado.celula.gx = Math.max(0, estado.grade.w - 1);
    if (estado.celula.gy >= estado.grade.h) estado.celula.gy = Math.max(0, estado.grade.h - 1);
    cortarPalcoFora();
    const ts = catalogo.tilesets.find((x) => x.tileSetId === estado.tilesetAtivo);
    if (ts) {
      document.getElementById('sel-piso').value = estado.pisoLivre || ts.piso;
      document.getElementById('sel-parede').value = estado.paredeLivre || ts.parede;
    }
    const nomeEl = document.getElementById('nome-tema');
    const prioEl = document.getElementById('tema-prioridade');
    const unicoEl = document.getElementById('tema-unico');
    const zonaEl = document.getElementById('tema-zona');
    const subdivEl = document.getElementById('chk-subdiv');
    if (nomeEl) nomeEl.value = t.nome || '';
    if (prioEl) prioEl.value = String(t.prioridade);
    if (unicoEl) unicoEl.checked = !!t.unicoNaAgencia;
    if (zonaEl) zonaEl.value = zonaKindOk(t.zonaKind);
    if (subdivEl) subdivEl.checked = estado.subdiv;
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
          ' · ' + (tema.piso || tema.tilesetAtivo);
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
  let arraste = null;
  let geraCompose = 0;
  let composeSel = -1;

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
    if (painel) painel.hidden = !estado.combinando;
    if (btn) {
      btn.classList.toggle('ativo', estado.combinando);
      btn.setAttribute('aria-pressed', estado.combinando ? 'true' : 'false');
    }
    if (estado.combinando) {
      desenharCompose();
      pintarListaCamadas();
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
      cam.dx = Math.round(arraste.dx0 + (px - arraste.x0));
      cam.dy = Math.round(arraste.dy0 + (py - arraste.y0));
      desenharCompose();
    });
    window.addEventListener('mouseup', () => {
      if (arraste) {
        arraste = null;
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
    if (estado.combinando || estado.modoPlantar !== 'parede') return;
    const pt = pontoDoCanvas(canvas, ev);
    const ix = pecaParedeSobPonto(pt.x, pt.y);
    if (ix < 0) return;
    const peca = estado.palco[ix];
    paredePecaIx = ix;
    estado.paredeSel = { face: peca.face, gx: peca.gx, gy: peca.gy };
    arrasteParede = { idx: ix, x0: pt.x, y0: pt.y, dx0: peca.dx || 0, dy0: peca.dy || 0 };
    canvas.classList.add('arrastando');
    pintarListaParede();
    desenharPalco();
    ev.preventDefault();
  });
  window.addEventListener('pointermove', (ev) => {
    if (!arrasteParede) return;
    const peca = estado.palco[arrasteParede.idx];
    if (!peca || !itemEParede(peca)) return;
    const pt = pontoDoCanvas(canvas, ev);
    peca.dx = Math.round(arrasteParede.dx0 + (pt.x - arrasteParede.x0));
    peca.dy = Math.round(arrasteParede.dy0 + (pt.y - arrasteParede.y0));
    pulouClickPalco = true;
    desenharPalco();
  });
  window.addEventListener('pointerup', () => {
    if (arrasteParede) {
      arrasteParede = null;
      canvas.classList.remove('arrastando');
      gravarEstado(estado);
    }
  });

  canvas.addEventListener('click', (ev) => {
    if (pulouClickPalco) {
      pulouClickPalco = false;
      return;
    }
    if (estado.combinando) return;
    const pt = pontoDoCanvas(canvas, ev);
    if (estado.modoPlantar === 'parede') {
      const ix = pecaParedeSobPonto(pt.x, pt.y);
      if (ix >= 0) {
        const peca = estado.palco[ix];
        paredePecaIx = ix;
        estado.paredeSel = { face: peca.face, gx: peca.gx, gy: peca.gy };
        atualizarCelulaTxt();
        desenharPalco();
        return;
      }
      const face = faceSobPonto(pt.x, pt.y);
      if (!face) return;
      estado.paredeSel = face;
      paredePecaIx = -1;
      atualizarCelulaTxt();
      desenharPalco();
      return;
    }
    const g = telaParaGrade(pt.x, pt.y, estado.subdiv);
    if (g.gx < 0 || g.gx >= gradeW() || g.gy < 0 || g.gy >= gradeH()) return;
    estado.celula = g;
    atualizarCelulaTxt();
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
  document.getElementById('chk-diag').checked = !!estado.diagnostico;
  document.getElementById('chk-diag').addEventListener('change', (ev) => {
    estado.diagnostico = ev.target.checked;
    desenharPalco();
  });
  document.getElementById('chk-subdiv').checked = estado.subdiv !== false;
  document.getElementById('chk-subdiv').addEventListener('change', (ev) => {
    estado.subdiv = ev.target.checked;
    if (!estado.subdiv) {
      estado.celula.qx = 0;
      estado.celula.qy = 0;
    }
    desenharPalco();
  });
  function setModoPlantar(modo) {
    estado.modoPlantar = modo === 'parede' ? 'parede' : 'piso';
    const radioP = document.getElementById('radio-piso');
    const radioW = document.getElementById('radio-parede');
    if (radioP) radioP.checked = estado.modoPlantar === 'piso';
    if (radioW) radioW.checked = estado.modoPlantar === 'parede';
    canvas.style.cursor = estado.modoPlantar === 'parede' ? 'pointer' : 'crosshair';
    if (estado.modoPlantar === 'piso') {
      paredePecaIx = -1;
    }
    atualizarCelulaTxt();
    gravarEstado(estado);
    desenharPalco();
  }
  const radioPiso = document.getElementById('radio-piso');
  const radioParede = document.getElementById('radio-parede');
  if (radioPiso) radioPiso.addEventListener('change', () => setModoPlantar('piso'));
  if (radioParede) radioParede.addEventListener('change', () => setModoPlantar('parede'));
  setModoPlantar(estado.modoPlantar);
  document.getElementById('btn-padrao').addEventListener('click', () => {
    estado.palco = (catalogo.palcoPadrao || []).map(palcoItemNormalizado);
    estado.celula = { gx: 1, gy: 1, qx: 0, qy: 0 };
    desenharPalco();
  });
  document.getElementById('btn-limpar').addEventListener('click', () => {
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
    estado.paineis = paineisPadrao();
    document.getElementById('chk-diag').checked = false;
    document.getElementById('chk-subdiv').checked = true;
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
    const novo = snapshotTema(nome);
    const ix = estado.temas.findIndex((t) => t.id === novo.id || t.nome === novo.nome);
    if (ix >= 0) estado.temas[ix] = novo;
    else estado.temas.push(novo);
    atualizarJsonOut();
    pintarListaTemas();
    await persistirTemasNoDisco('salvar');
  });
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
  const btnCombinar = document.getElementById('btn-combinar');
  if (btnCombinar) {
    btnCombinar.addEventListener('click', () => setCombinando(!estado.combinando));
  }
  const btnComposeLimpar = document.getElementById('btn-compose-limpar');
  if (btnComposeLimpar) {
    btnComposeLimpar.addEventListener('click', () => {
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
    if (estado.modoPlantar === 'parede' && (ev.key === 'Delete' || ev.key === 'Backspace')) {
      removerPecaParede();
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
    });
  }

  ligarPaineis();
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
  // Migra temas ja no localStorage (ou do arquivo) para o disco do projeto.
  if (estado.temas.length) {
    void persistirTemasNoDisco('boot');
  }
})().catch((err) => {
  document.getElementById('meta').textContent = String(err);
});

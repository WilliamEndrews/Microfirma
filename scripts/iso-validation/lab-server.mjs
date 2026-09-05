/**
 * Servidor do laboratorio TinyHouse + API de persistencia dos temas.
 *
 * Substitui `python -m http.server` para poder gravar
 * packages/world-engine/src/biblia/temas-arquiteto.json no disco
 * quando o lab salva/apaga um tema.
 *
 * Uso (raiz do repo): node scripts/iso-validation/lab-server.mjs
 * Lab: http://127.0.0.1:3333/scripts/iso-validation/tinyhouse.html
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const PORT = Number(process.env.LAB_PORT || 3333);
const HOST = process.env.LAB_HOST || '127.0.0.1';

const BIBLIA_PATH = path.join(
  REPO_ROOT,
  'packages',
  'world-engine',
  'src',
  'biblia',
  'temas-arquiteto.json',
);
const MIRROR_PATH = path.join(__dirname, 'temas-arquiteto.json');
const COMBOS_PATH = path.join(__dirname, 'combinacoes-laboratorio.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, status, body) {
  const txt = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(txt);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    const MAX = 8 * 1024 * 1024;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX) {
        reject(new Error('payload grande demais'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function validarPayload(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return 'JSON raiz invalido';
  }
  if (!Array.isArray(doc.temas)) {
    return 'campo temas (array) obrigatorio';
  }
  if (doc.politicaTiles != null && typeof doc.politicaTiles !== 'object') {
    return 'politicaTiles invalida';
  }
  return null;
}

function validarPayloadCombos(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return 'JSON raiz invalido';
  }
  if (!Array.isArray(doc.combinacoes)) {
    return 'campo combinacoes (array) obrigatorio';
  }
  return null;
}

function gravarCombos(doc) {
  const hoje = new Date().toISOString().slice(0, 10);
  const out = {
    versao: typeof doc.versao === 'string' ? doc.versao : '1.0',
    data: hoje,
    notas:
      typeof doc.notas === 'string' && doc.notas.trim()
        ? doc.notas
        : 'Combinacoes criadas no laboratorio (drag-drop). Camadas: ordem de desenho atras -> frente, dx/dy em px. Persistido automaticamente pelo lab.',
    combinacoes: doc.combinacoes,
  };
  const txt = `${JSON.stringify(out, null, 2)}\n`;
  fs.writeFileSync(COMBOS_PATH, txt, 'utf8');
  return { bytes: Buffer.byteLength(txt, 'utf8'), combinacoes: out.combinacoes.length };
}

function gravarTemas(doc) {
  const hoje = new Date().toISOString().slice(0, 10);
  const out = {
    versao: typeof doc.versao === 'string' ? doc.versao : '1.5',
    data: hoje,
    notas:
      typeof doc.notas === 'string' && doc.notas.trim()
        ? doc.notas
        : 'Cada zonaKind e um ProtoComodo completo (grade + tileset + palco + calibracao). Persistido automaticamente pelo lab.',
    politicaTiles: doc.politicaTiles || {},
    temas: doc.temas,
  };
  const txt = `${JSON.stringify(out, null, 2)}\n`;
  fs.mkdirSync(path.dirname(BIBLIA_PATH), { recursive: true });
  fs.writeFileSync(BIBLIA_PATH, txt, 'utf8');
  fs.writeFileSync(MIRROR_PATH, txt, 'utf8');
  return { bytes: Buffer.byteLength(txt, 'utf8'), temas: out.temas.length };
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = decoded.replace(/^\/+/, '');
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
  return abs;
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/temas-arquiteto' && req.method === 'GET') {
    try {
      const raw = fs.readFileSync(BIBLIA_PATH, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(raw);
    } catch (err) {
      sendJson(res, 404, { ok: false, erro: String(err.message || err) });
    }
    return true;
  }

  if (pathname === '/api/temas-arquiteto' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const doc = JSON.parse(raw);
      const erro = validarPayload(doc);
      if (erro) {
        sendJson(res, 400, { ok: false, erro });
        return true;
      }
      const info = gravarTemas(doc);
      sendJson(res, 200, {
        ok: true,
        ...info,
        biblia: path.relative(REPO_ROOT, BIBLIA_PATH).replace(/\\/g, '/'),
        mirror: path.relative(REPO_ROOT, MIRROR_PATH).replace(/\\/g, '/'),
      });
    } catch (err) {
      sendJson(res, 500, { ok: false, erro: String(err.message || err) });
    }
    return true;
  }

  if (pathname === '/api/combinacoes-laboratorio' && req.method === 'GET') {
    try {
      const raw = fs.readFileSync(COMBOS_PATH, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(raw);
    } catch (err) {
      sendJson(res, 404, { ok: false, erro: String(err.message || err) });
    }
    return true;
  }

  if (pathname === '/api/combinacoes-laboratorio' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const doc = JSON.parse(raw);
      const erro = validarPayloadCombos(doc);
      if (erro) {
        sendJson(res, 400, { ok: false, erro });
        return true;
      }
      const info = gravarCombos(doc);
      sendJson(res, 200, {
        ok: true,
        ...info,
        combos: path.relative(REPO_ROOT, COMBOS_PATH).replace(/\\/g, '/'),
      });
    } catch (err) {
      sendJson(res, 500, { ok: false, erro: String(err.message || err) });
    }
    return true;
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, persistencia: true });
    return true;
  }

  return false;
}

function serveStatic(req, res, pathname) {
  const filePath = safeJoin(REPO_ROOT, pathname === '/' ? '/scripts/iso-validation/tinyhouse.html' : pathname);
  if (!filePath) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const pathname = url.pathname;

  try {
    if (await handleApi(req, res, pathname)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end('method not allowed');
      return;
    }
    serveStatic(req, res, pathname);
  } catch (err) {
    sendJson(res, 500, { ok: false, erro: String(err.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[lab] http://${HOST}:${PORT}/scripts/iso-validation/tinyhouse.html`);
  console.log(`[lab] persistencia POST /api/temas-arquiteto -> ${path.relative(REPO_ROOT, BIBLIA_PATH)}`);
  console.log(`[lab] persistencia POST /api/combinacoes-laboratorio -> ${path.relative(REPO_ROOT, COMBOS_PATH)}`);
});

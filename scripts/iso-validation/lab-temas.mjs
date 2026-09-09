/**
 * Helpers puros para salvar/carregar temas do arquiteto no lab.
 * Testados via vitest; importados por tinyhouse-lab.js (module).
 */

/**
 * Restaura pisoLivre/paredeLivre a partir do snapshot do tema.
 * Materializa t.piso/t.parede quando livre e null.
 */
export function restaurarCoresDoTema(tema, tilesetDefaults = { piso: '', parede: '' }) {
  const out = {
    tilesetAtivo: tema.tilesetAtivo || 'nordic-calm',
    pisoLivre: null,
    paredeLivre: null,
  };

  if (tema.pisoLivre != null && tema.pisoLivre !== '') {
    out.pisoLivre = tema.pisoLivre;
  } else if (tema.piso != null && tema.piso !== '') {
    out.pisoLivre = tema.piso;
  } else {
    out.pisoLivre = null;
  }

  if (tema.paredeLivre != null && tema.paredeLivre !== '') {
    out.paredeLivre = tema.paredeLivre;
  } else if (tema.parede != null && tema.parede !== '') {
    out.paredeLivre = tema.parede;
  } else {
    out.paredeLivre = null;
  }

  const pisoEfetivo = out.pisoLivre || tilesetDefaults.piso || tema.piso || '';
  const paredeEfetiva = out.paredeLivre || tilesetDefaults.parede || tema.parede || '';

  return { ...out, pisoEfetivo, paredeEfetiva };
}

/** Lista assetIds do palco sem spec no catalogo/combos. */
export function validarPalco(palco, specPorId) {
  const missing = [];
  const seen = new Set();
  for (const p of palco || []) {
    if (!p || !p.assetId) continue;
    if (seen.has(p.assetId)) continue;
    if (!specPorId(p.assetId)) {
      missing.push(p.assetId);
      seen.add(p.assetId);
    }
  }
  return { ok: missing.length === 0, missingAssetIds: missing };
}

/** Mescla combos: disco vence conflito de assetId. */
export function mesclarCombos(combosDisco, combosLocal) {
  const porId = new Map();
  for (const c of combosLocal || []) {
    if (c && c.assetId) porId.set(c.assetId, c);
  }
  for (const c of combosDisco || []) {
    if (c && c.assetId) porId.set(c.assetId, c);
  }
  return [...porId.values()];
}

/** Normaliza postos de trabalho salvos no tema. */
export function normalizarPostosTrabalho(postos) {
  if (!Array.isArray(postos)) return [];
  return postos
    .filter((p) => p && typeof p.gx === 'number' && typeof p.gy === 'number')
    .map((p) => ({
      agentSlot: typeof p.agentSlot === 'string' ? p.agentSlot : 'default',
      gx: p.gx,
      gy: p.gy,
      qx: typeof p.qx === 'number' ? p.qx : 0,
      qy: typeof p.qy === 'number' ? p.qy : 0,
      passo: typeof p.passo === 'number' ? p.passo : 1,
      facing: [0, 1, 2, 3].includes(p.facing) ? p.facing : 2,
      facingOrigem:
        p.facingOrigem === 'manual' || p.facingOrigem === 'olhar_mesa'
          ? p.facingOrigem
          : 'padrao_norte',
      ...(typeof p.deskAssetId === 'string' ? { deskAssetId: p.deskAssetId } : {}),
    }));
}

/** Cardinal dominante para o assento olhar para a mesa. */
export function facingOlhandoPara(de, para) {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 2;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 3 : 1;
  return dy > 0 ? 0 : 2;
}

/** Mesa mais proxima, considerando o centro visual da subcelula. */
export function mesaMaisProximaDoPosto(posto, mesas) {
  const p = postoParaGrid(posto);
  return [...(mesas || [])].sort((a, b) => {
    const da = Math.hypot(a.gx + 0.5 - p.x, a.gy + 0.5 - p.y);
    const db = Math.hypot(b.gx + 0.5 - p.x, b.gy + 0.5 - p.y);
    return da - db;
  })[0];
}

export function inferirFacingAssento(posto, mesa) {
  if (!mesa || (mesa.gx === posto.gx && mesa.gy === posto.gy)) {
    return { facing: 2, facingOrigem: 'padrao_norte' };
  }
  const de = postoParaGrid(posto);
  return {
    facing: facingOlhandoPara(de, { x: mesa.gx + 0.5, y: mesa.gy + 0.5 }),
    facingOrigem: 'olhar_mesa',
  };
}

/** Converte posto (subcelula) para coordenada fracionaria de grid. */
export function postoParaGrid(posto) {
  const passo = posto.passo == null ? 1 : posto.passo;
  return {
    x: posto.gx + (posto.qx || 0) * passo + passo * 0.5,
    y: posto.gy + (posto.qy || 0) * passo + passo * 0.5,
    facing: posto.facing ?? 2,
  };
}

function isoLocal(gx, gy) {
  return { x: (gx - gy) * 64, y: (gx + gy) * 32 };
}

/**
 * Reancora um anexo na face mais proxima sem alterar sua posicao visual.
 * Isso transforma offsets globais enormes em ajustes locais auditaveis.
 */
export function rebasearAnexoParede(
  peca,
  w,
  h,
  pes = { R: { x: 32, y: 83 }, L: { x: 95, y: 83 } },
) {
  const faceOriginal = peca.face === 'L' ? 'L' : 'R';
  const peOriginal = pes[faceOriginal];
  const verticeOriginal =
    faceOriginal === 'L' ? isoLocal(0, peca.gy || 0) : isoLocal(peca.gx || 0, 0);
  // Posicao real do canto da imagem, exatamente como blitNaVertice.
  const alvo = {
    x: verticeOriginal.x + (peca.dx || 0) - peOriginal.x,
    y: verticeOriginal.y + (peca.dy || 0) - peOriginal.y,
  };
  const candidatos = [];
  for (let gx = 0; gx < w; gx++) candidatos.push({ face: 'R', gx, gy: 0, p: isoLocal(gx, 0) });
  for (let gy = 0; gy < h; gy++) candidatos.push({ face: 'L', gx: 0, gy, p: isoLocal(0, gy) });

  let melhor = candidatos[0];
  let custo = Infinity;
  for (const candidato of candidatos) {
    const pe = pes[candidato.face];
    const dx = alvo.x - candidato.p.x + pe.x;
    const dy = alvo.y - candidato.p.y + pe.y;
    const atual = Math.abs(dx) + Math.abs(dy) * 1.5;
    if (atual < custo) {
      custo = atual;
      melhor = candidato;
    }
  }
  if (!melhor) return { ...peca };
  const peMelhor = pes[melhor.face];
  return {
    ...peca,
    face: melhor.face,
    gx: melhor.gx,
    gy: melhor.gy,
    dx: Math.round(alvo.x - melhor.p.x + peMelhor.x),
    dy: Math.round(alvo.y - melhor.p.y + peMelhor.y),
  };
}

export function anexoParedeValido(peca) {
  return Math.abs(peca.dx || 0) <= 96 && Math.abs(peca.dy || 0) <= 180;
}

// Cálculo de comidas sin IA con la base de alimentos propia (lo que ya has comido y revisado). Funciones puras.
// Solo responde cuando entiende TODO el texto con seguridad; si no, devuelve null y se pregunta a la IA.

const NUMEROS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, medio: 0.5, media: 0.5, 'un par de': 2 };
const UNIDADES = [
  [/^(g|gr|grs|gramos?)$/, 'g', 1], [/^(kg|kilos?|kilogramos?)$/, 'g', 1000], [/^(ml|mililitros?)$/, 'ml', 1], [/^(l|litros?)$/, 'ml', 1000],
  [/^(unidad(es)?|piezas?)$/, 'unidad', 1], [/^(racion(es)?)$/, 'ración', 1], [/^(tazas?)$/, 'taza', 1], [/^(cucharadas?)$/, 'cucharada', 1]
];
const NUM_KEYS = ['kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'saturatedFatG', 'sodiumMg', 'potassiumMg', 'calciumMg', 'ironMg', 'magnesiumMg',
  'zincMg', 'vitAUg', 'vitCMg', 'vitDUg', 'vitEMg', 'vitKUg', 'b1Mg', 'b2Mg', 'b3Mg', 'b6Mg', 'folateUg', 'b12Ug', 'omega3G'];

/** Minúsculas, sin tildes ni signos, y cada palabra en singular aproximado ("huevos" y "huevo", "panes" y "pan", "melones" y "melón"). */
export function normalizar(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ')
    .split(/\s+/).filter((w) => w && !['de', 'del', 'la', 'el', 'los', 'las'].includes(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .map((w) => (w.length > 3 && /[lnrdz]e$/.test(w) ? w.slice(0, -1) : w)).join(' ');
}

/** Índice: nombre normalizado → alimentos (puede haber uno por gramos y otro por unidad). */
export function indiceAlimentos(foods) {
  const idx = new Map();
  (foods || []).forEach((f) => { const k = normalizar(f.name); if (!idx.has(k)) idx.set(k, []); idx.get(k).push(f); });
  return idx;
}

/** Trozo del texto → { cantidad, unidad, nombre } (cantidad o unidad null si no se dicen). */
export function leerTrozo(t) {
  let s = String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  let cantidad = null;
  const num = /^(\d+(?:[.,]\d+)?)\s*/.exec(s);
  if (num) { cantidad = Number(num[1].replace(',', '.')); s = s.slice(num[0].length); }
  else {
    const pal = Object.keys(NUMEROS).sort((a, b) => b.length - a.length).find((w) => s === w || s.startsWith(w + ' '));
    if (pal) { cantidad = NUMEROS[pal]; s = s.slice(pal.length).trim(); }
  }
  let unidad = null; let factor = 1;
  const w = /^(\S+)\s+/.exec(s);
  if (w) { const u = UNIDADES.find(([re]) => re.test(w[1])); if (u) { unidad = u[1]; factor = u[2]; s = s.slice(w[0].length); } }
  else { const u = UNIDADES.find(([re]) => re.test(s)); if (u && cantidad !== null) return null; }
  s = s.replace(/^de\s+/, '').trim();
  if (!s) return null;
  return { cantidad: cantidad === null ? null : cantidad * factor, unidad, nombre: s };
}

/** Un alimento calculado: cantidad y nutrientes a partir de su base (por 100 g/ml o por unidad). null si la cantidad es ambigua. */
function calcular(trozo, candidatos) {
  const porPeso = candidatos.find((f) => f.base === 100);
  const porUnidad = candidatos.find((f) => f.base === 1);
  let f = null; let q = null;
  if (trozo.unidad === 'g' || trozo.unidad === 'ml') { f = candidatos.find((x) => x.unit === trozo.unidad); q = trozo.cantidad; }
  else if (trozo.unidad) { f = candidatos.find((x) => x.unit === trozo.unidad); q = trozo.cantidad === null ? (f && f.tipica) : trozo.cantidad; }
  else if (trozo.cantidad !== null) { f = porUnidad || null; q = trozo.cantidad; }   // "2 huevos": cuenta solo si se come por unidades
  else { f = porUnidad || porPeso; q = f && f.tipica; }                             // "arroz" a secas: lo de siempre
  if (!f || !(q > 0)) return null;
  const k = q / f.base;
  const it = { name: f.name, quantity: Math.round(q * 10) / 10, unit: f.unit, confidence: 0.85 };
  NUM_KEYS.forEach((key) => { if (typeof f.n[key] === 'number') it[key] = Math.round(f.n[key] * k * 100) / 100; });
  ['kcal', 'proteinG', 'carbsG', 'fatG'].forEach((key) => { if (typeof it[key] !== 'number') it[key] = 0; });
  it.kcal = Math.round(it.kcal);
  return it;
}

/** Texto → { items } calculado sin IA, o null si hay algo que no reconoce o es ambiguo. */
export function estimarLocal(texto, foods) {
  const t = String(texto || '').trim();
  if (!t || t.length > 300 || !(foods || []).length) return null;
  const idx = indiceAlimentos(foods);
  const trozos = t.split(/[,;\n+]|\s+y\s+|\s+e\s+/).map((x) => x.trim()).filter(Boolean);
  if (!trozos.length || trozos.length > 12) return null;
  const items = [];
  for (const tr of trozos) {
    const p = leerTrozo(tr);
    if (!p) return null;
    const cand = idx.get(normalizar(p.nombre));
    if (!cand) return null;
    const it = calcular(p, cand);
    if (!it) return null;
    items.push(it);
  }
  return { items, mealType: null, time: null, warnings: [], transcript: null, local: true };
}

// ---------- Cuenta de lo ahorrado en este móvil (para Ajustes) ----------

const CLAVE_AHORRO = 'comandante.ahorroLocal';
export function contarAhorroLocal(storage, via, ahora = new Date()) {
  try {
    const mes = ahora.toISOString().slice(0, 7);
    let a = JSON.parse(storage.getItem(CLAVE_AHORRO) || 'null');
    if (!a || a.mes !== mes) a = { mes, vias: {} };
    a.vias[via] = (a.vias[via] || 0) + 1;
    storage.setItem(CLAVE_AHORRO, JSON.stringify(a));
    return a;
  } catch (_) { return null; }
}
export function leerAhorroLocal(storage, ahora = new Date()) {
  try { const a = JSON.parse(storage.getItem(CLAVE_AHORRO) || 'null'); return a && a.mes === ahora.toISOString().slice(0, 7) ? a : null; } catch (_) { return null; }
}

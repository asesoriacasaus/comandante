/**
 * Suplementos (PLAN 8.5). Cada suplemento se guarda una vez en los ajustes con lo que aporta por toma
 * (estimado por la IA a partir del nombre o la marca y revisado por el usuario). Marcarlo como tomado un día
 * crea una "comida" de tipo supplement con id fijo, así suma a calorías y micronutrientes sin duplicarse.
 */
const SUPPLEMENTS_MAX_ = 20;
const SUP_ID_RE_ = /^sup_[a-z0-9]{6,20}$/;
const SUP_UNITS_ = ['g', 'ml', 'cápsula', 'comprimido', 'sobre', 'cacito', 'gota', 'unidad'];
// Funciones y no constantes: dependen de MICRO_KEYS_ (Nutrition.gs) y Apps Script no garantiza el orden de carga.
function supNumKeys_() { return ['kcal', 'proteinG', 'carbsG', 'fatG'].concat(MICRO_KEYS_); }

function validateSupplements_(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) return ['nutrition.supplements debe ser una lista'];
  const e = [];
  if (list.length > SUPPLEMENTS_MAX_) e.push('como mucho ' + SUPPLEMENTS_MAX_ + ' suplementos');
  const ids = {};
  list.forEach((s, i) => {
    const l = 'suplemento ' + (i + 1);
    if (!s || typeof s !== 'object') { e.push(l + ': inválido'); return; }
    if (!SUP_ID_RE_.test(String(s.id))) e.push(l + ': id inválido');
    if (ids[s.id]) e.push(l + ': id repetido');
    ids[s.id] = true;
    if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 60) e.push(l + ': nombre inválido');
    if (!isNum_(s.dose) || s.dose <= 0 || s.dose > 1000) e.push(l + ': dosis inválida');
    if (SUP_UNITS_.indexOf(s.unit) < 0) e.push(l + ': unidad inválida');
    const n = s.nutrients || {};
    Object.keys(n).forEach((k) => { if (supNumKeys_().indexOf(k) < 0 || !isNum_(n[k]) || n[k] < 0 || n[k] > 100000) e.push(l + ': nutriente ' + k + ' inválido'); });
    if (s.notes !== undefined && s.notes !== null && (typeof s.notes !== 'string' || s.notes.length > 300)) e.push(l + ': notas demasiado largas');
  });
  return e;
}

function supSchema_() {
  return { type: 'OBJECT', properties: Object.assign({
  name: { type: 'STRING' }, dose: { type: 'NUMBER' }, unit: { type: 'STRING' }, known: { type: 'BOOLEAN' },
  notes: { type: 'STRING', nullable: true }
}, supNumKeys_().reduce((o, k) => { o[k] = { type: 'NUMBER', nullable: true }; return o; }, {})), required: ['name', 'dose', 'unit', 'known'] };
}

const SUP_SYSTEM_ = 'Eres un nutricionista. Recibes cómo describe una persona un suplemento que toma (nombre genérico o marca comercial ' +
  'española y, a veces, la dosis). Devuelve "name" (nombre claro, con la marca si la dijo), "dose" y "unit" de UNA toma (si no la dice, la ' +
  'dosis habitual del producto), con "unit" una de: g, ml, cápsula, comprimido, sobre, cacito, gota, unidad. ' +
  'Devuelve lo que aporta ESA toma: kcal, proteinG, carbsG, fatG y los micronutrientes que contenga (fiberG, potassiumMg, calciumMg, ironMg, ' +
  'magnesiumMg, zincMg, vitAUg, vitCMg, vitDUg (1 µg = 40 UI), vitEMg, vitKUg, b1Mg, b2Mg, b3Mg, b6Mg, folateUg, b12Ug, omega3G (EPA+DHA en g), ' +
  'sodiumMg, sugarG). Lo que no contenga o no sepas, null. La creatina, la cafeína o el colágeno no aportan micronutrientes: déjalos en null. ' +
  '"known": true si conoces la composición de ese producto o del genérico; false si es una marca que no conoces y has supuesto. ' +
  '"notes": una frase útil y prudente (por ejemplo, tomar el hierro separado del café o del calcio, o no pasar de la dosis sin consejo ' +
  'médico); null si no hace falta. No hagas diagnósticos. Responde solo con el JSON pedido.';

function validateSupAi_(o) {
  const e = [];
  if (!o || typeof o.name !== 'string' || !o.name.trim()) e.push('falta el nombre');
  if (!isNum_(o && o.dose) || o.dose <= 0) e.push('dosis inválida');
  if (SUP_UNITS_.indexOf(o && o.unit) < 0) e.push('unidad inválida');
  return e;
}

/** Suplemento listo para revisar: nutrientes limpios (solo números razonables). Pura. */
function supFromAi_(o, id) {
  const nutrients = {};
  supNumKeys_().forEach((k) => { if (isNum_(o[k]) && o[k] > 0 && o[k] < 100000) nutrients[k] = Math.round(o[k] * 1000) / 1000; });
  return { id: id, name: String(o.name).trim().slice(0, 60), dose: Math.round(o.dose * 100) / 100, unit: o.unit, nutrients: nutrients,
    known: o.known === true, notes: typeof o.notes === 'string' && o.notes.trim() ? o.notes.trim().slice(0, 300) : null };
}

function newSupId_() { return 'sup_' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toLowerCase(); }

// ---------- Catálogo local: suplementos genéricos sin gastar IA ----------
// Composición típica por toma. Las marcas que no encajan aquí (por ejemplo, Sideral Forte) se preguntan a la IA.

function sinTildes_(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

/** Pura: primer número con su unidad ("2000 ui", "5 g", "300 mg", "1000 mcg"). */
function dosisEnTexto_(t) {
  const m = /(?:^|[^a-z0-9])(\d+(?:[.,]\d+)?)\s*(ui|iu|mg|mcg|µg|ug|g|gr|gramos?|capsulas?|comprimidos?|perlas?)?(?![a-z])/.exec(t);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  const u = (m[2] || '').replace(/s$/, '');
  const unidad = { ui: 'ui', iu: 'ui', mg: 'mg', mcg: 'ug', 'µg': 'ug', ug: 'ug', g: 'g', gr: 'g', gramo: 'g', capsula: 'n', comprimido: 'n', perla: 'n' }[u] || null;
  return n > 0 ? { n: n, u: unidad } : null;
}

const SUP_CATALOGO_ = [
  { re: /creatina/, nombre: 'Creatina monohidrato', unidad: 'g', base: 5, por: () => ({}) },
  { re: /colageno/, nombre: 'Colágeno hidrolizado', unidad: 'g', base: 10, por: (g) => ({ kcal: 3.6 * g, proteinG: 0.9 * g }) },
  { re: /(proteina|whey|batido de prote)/, nombre: 'Proteína de suero (whey)', unidad: 'g', base: 30,
    por: (g) => ({ kcal: 4 * g, proteinG: 0.8 * g, carbsG: 0.1 * g, fatG: 0.05 * g, calciumMg: 4 * g }) },
  { re: /(vitamina d3?|vit\.? ?d3?\b|\bd3\b|colecalciferol)/, nombre: 'Vitamina D3', unidad: 'cápsula', mg: false,
    dosis: (d) => (d && d.u === 'ui' ? d.n / 40 : d && d.u === 'ug' ? d.n : 25), etiqueta: (ug) => fmtNum_(ug * 40) + ' UI', clave: 'vitDUg' },
  { re: /(omega ?3|aceite de pescado|\bepa\b|\bdha\b)/, nombre: 'Omega 3', unidad: 'cápsula', base: 1, por: (n) => ({ kcal: 9 * n, fatG: 1 * n, omega3G: 0.3 * n }) },
  { re: /magnesio/, nombre: 'Magnesio', unidad: 'comprimido', mgDef: 300, clave: 'magnesiumMg' },
  { re: /\bzinc\b/, nombre: 'Zinc', unidad: 'comprimido', mgDef: 15, clave: 'zincMg' },
  { re: /(vitamina c|vit\.? ?c\b|ascorbico)/, nombre: 'Vitamina C', unidad: 'comprimido', mgDef: 500, clave: 'vitCMg' },
  { re: /(vitamina b12|vit\.? ?b12|\bb12\b|cobalamina)/, nombre: 'Vitamina B12', unidad: 'comprimido', ugDef: 1000, clave: 'b12Ug' },
  { re: /cafeina/, nombre: 'Cafeína', unidad: 'comprimido', mgDef: 200, clave: null }
];

function fmtNum_(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }

/** Pura: suplemento genérico reconocido sin IA, o null si hay que preguntar (marcas, multivitamínicos, combinados). */
function supplementLocal_(text, id) {
  const t = sinTildes_(text);
  if (/multi|complejo|\+| y /.test(t)) return null;   // combinados: mejor la IA
  const e = SUP_CATALOGO_.find((x) => x.re.test(t));
  if (!e) return null;
  const d = dosisEnTexto_(t.replace(new RegExp(e.re.source, 'g'), ' '));   // sin el nombre: el "3" de "omega 3" o de "D3" no es la dosis
  let dose; let unit = e.unidad; let nutrients = {}; let nombre = e.nombre; let supuesta = !d;
  if (e.por) {                                    // por gramos o por cápsulas
    const n = d && (e.unidad === 'g' ? d.u === 'g' || d.u === null : d.u === 'n' || d.u === null) ? d.n : e.base;
    supuesta = n === e.base && !d;
    dose = n; nutrients = e.por(n);
  } else if (e.clave === 'vitDUg') {             // vitamina D: UI o µg por cápsula
    const ug = e.dosis(d);
    dose = 1; nutrients = { vitDUg: ug }; nombre += ' ' + e.etiqueta(ug);
  } else {                                       // mg o µg por comprimido
    const cant = d && (d.u === 'mg' || d.u === 'ug') ? d.n : e.mgDef || e.ugDef;
    dose = 1; nombre += ' ' + fmtNum_(cant) + (e.ugDef ? ' µg' : ' mg');
    if (e.clave) nutrients[e.clave] = cant;
  }
  const limpio = {};
  Object.keys(nutrients).forEach((k) => { if (nutrients[k] > 0) limpio[k] = Math.round(nutrients[k] * 1000) / 1000; });
  return { id: id, name: nombre.slice(0, 60), dose: dose, unit: unit, nutrients: limpio, known: true, local: true,
    notes: supuesta ? 'Dosis habitual supuesta: compárala con el envase.' : null };
}

/** "Sideral Forte, una cápsula" → propuesta para revisar. No guarda nada. Los genéricos se resuelven sin IA. */
function supplementAnalyze(p) {
  const text = String(validateText_(p && p.text)).trim();
  if (!text) throw { code: 'VALIDATION', message: 'Escribe qué suplemento tomas' };
  const local = supplementLocal_(text, newSupId_());
  if (local) { aiCount_('ahorro', 'suplementos'); return { supplement: local }; }
  const ai = callJson_('FAST', SUP_SYSTEM_, { suplemento: text.slice(0, 200) }, supSchema_(), validateSupAi_);
  return { supplement: supFromAi_(ai, newSupId_()) };
}

function supplementSave(p) {
  const s = p && p.supplement;
  if (!s || typeof s !== 'object') throw { code: 'VALIDATION', message: 'suplemento requerido' };
  const clean = { id: s.id, name: String(s.name || '').trim(), dose: s.dose, unit: s.unit, nutrients: s.nutrients || {}, known: s.known === true,
    notes: typeof s.notes === 'string' && s.notes.trim() ? s.notes.trim().slice(0, 300) : null };
  const list = ((getSettings().nutrition || {}).supplements || []).filter((x) => x.id !== clean.id).concat([clean]);
  const merged = updateSettings({ nutrition: { supplements: list } });
  return { supplements: merged.nutrition.supplements };
}

function supplementDelete(p) {
  const list = ((getSettings().nutrition || {}).supplements || []).filter((x) => x.id !== (p && p.id));
  return { supplements: updateSettings({ nutrition: { supplements: list } }).nutrition.supplements };
}

/** Id de la "comida" de un suplemento tomado un día: fijo, así marcar dos veces no duplica. Pura. */
function supMealId_(date, supId) { return 'p_' + date.replace(/-/g, '') + '_' + supId.slice(4); }

/** La toma de un día como comida de tipo supplement. Pura. */
function supMeal_(sup, date) {
  const item = { name: sup.name, quantity: sup.dose, unit: sup.unit, confidence: sup.known ? 0.9 : 0.6 };
  ['kcal', 'proteinG', 'carbsG', 'fatG'].forEach((k) => { item[k] = isNum_(sup.nutrients[k]) ? sup.nutrients[k] : 0; });
  item.kcal = Math.round(item.kcal);
  MICRO_KEYS_.forEach((k) => { if (isNum_(sup.nutrients[k])) item[k] = sup.nutrients[k]; });
  return { id: supMealId_(date, sup.id), date: date, time: null, mealType: 'supplement', source: 'supplement', supplementId: sup.id, items: [item] };
}

/** Marca o desmarca un suplemento como tomado un día (también días pasados). */
function supplementTake(p) {
  requireDate_(p && p.date);
  const settings = getSettings();
  const sup = ((settings.nutrition || {}).supplements || []).find((x) => x.id === p.id);
  if (!sup) throw { code: 'NOT_FOUND', message: 'Suplemento no encontrado' };
  const id = supMealId_(p.date, sup.id);
  if (p.taken) {
    commitMeal_(supMeal_(sup, p.date), settings.profile.timezone, todayIso_(settings.profile.timezone));
  } else {
    const path = 'meals/' + p.date.slice(0, 7) + '.json';
    withLock_(() => {
      const arr = readJson_(path, []);
      const next = arr.filter((m) => m.id !== id);
      if (next.length !== arr.length) { writeFile_(path, next); bumpRevision_(); }
    });
  }
  return { ok: true, taken: !!p.taken };
}

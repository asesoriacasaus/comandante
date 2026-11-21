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

/** "Sideral Forte, una cápsula" → propuesta para revisar. No guarda nada. */
function supplementAnalyze(p) {
  const text = String(validateText_(p && p.text)).trim();
  if (!text) throw { code: 'VALIDATION', message: 'Escribe qué suplemento tomas' };
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

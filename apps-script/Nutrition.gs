/**
 * Nutrición (PLAN 6.4 y 8.5). Objetivos, extracción de comidas y totales. Casi todo son funciones puras.
 * Las calorías y nutrientes de los alimentos son una ESTIMACIÓN de la IA: se marcan con su confianza
 * y los micronutrientes se muestran siempre como aproximados.
 */

const MACRO_KEYS_ = ['kcal', 'proteinG', 'carbsG', 'fatG'];

// Valores de referencia de nutrientes (VRN) de la UE para un adulto. kind 'min': conviene llegar; 'max': conviene no pasarse.
const MICROS_ = [
  { key: 'fiberG', label: 'Fibra', unit: 'g', ref: 25, kind: 'min' },
  { key: 'sugarG', label: 'Azúcares', unit: 'g', ref: 90, kind: 'max' },
  { key: 'saturatedFatG', label: 'Grasa saturada', unit: 'g', ref: 20, kind: 'max' },
  { key: 'sodiumMg', label: 'Sodio', unit: 'mg', ref: 2400, kind: 'max' },
  { key: 'potassiumMg', label: 'Potasio', unit: 'mg', ref: 2000, kind: 'min' },
  { key: 'calciumMg', label: 'Calcio', unit: 'mg', ref: 800, kind: 'min' },
  { key: 'ironMg', label: 'Hierro', unit: 'mg', ref: 14, kind: 'min' },
  { key: 'magnesiumMg', label: 'Magnesio', unit: 'mg', ref: 375, kind: 'min' },
  { key: 'zincMg', label: 'Zinc', unit: 'mg', ref: 10, kind: 'min' },
  { key: 'vitAUg', label: 'Vitamina A', unit: 'µg', ref: 800, kind: 'min' },
  { key: 'vitCMg', label: 'Vitamina C', unit: 'mg', ref: 80, kind: 'min' },
  { key: 'vitDUg', label: 'Vitamina D', unit: 'µg', ref: 5, kind: 'min' },
  { key: 'vitEMg', label: 'Vitamina E', unit: 'mg', ref: 12, kind: 'min' },
  { key: 'vitKUg', label: 'Vitamina K', unit: 'µg', ref: 75, kind: 'min' },
  { key: 'b1Mg', label: 'Vitamina B1', unit: 'mg', ref: 1.1, kind: 'min' },
  { key: 'b2Mg', label: 'Vitamina B2', unit: 'mg', ref: 1.4, kind: 'min' },
  { key: 'b3Mg', label: 'Vitamina B3', unit: 'mg', ref: 16, kind: 'min' },
  { key: 'b6Mg', label: 'Vitamina B6', unit: 'mg', ref: 1.4, kind: 'min' },
  { key: 'folateUg', label: 'Folato', unit: 'µg', ref: 200, kind: 'min' },
  { key: 'b12Ug', label: 'Vitamina B12', unit: 'µg', ref: 2.5, kind: 'min' },
  { key: 'omega3G', label: 'Omega 3 (EPA+DHA)', unit: 'g', ref: 0.25, kind: 'min' }
];
const MICRO_KEYS_ = MICROS_.map((m) => m.key);
const MEAL_NUM_KEYS_ = MACRO_KEYS_.concat(MICRO_KEYS_);
const MEAL_ITEM_MAX_ = 20;

// ---------- Objetivos (8.5) ----------

function mifflinBmr_(sex, weightKg, heightCm, age) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'female' ? -161 : 5);
}

/** Objetivos diarios. Devuelve null si faltan datos del perfil. */
function nutritionTargets_(settings, weightKg, year) {
  const p = settings.profile;
  const n = settings.nutrition || {};
  if (!p.sex || !p.birthYear || !p.heightCm || !isNum_(weightKg)) return null;
  const bmr = mifflinBmr_(p.sex, weightKg, p.heightCm, year - p.birthYear);
  const tdee = bmr * (n.activityFactor || 1.55);
  const kcal = (n.kcalStrategy === 'maintenance' ? tdee : tdee * 0.9) + (isNum_(n.kcalAdjust) ? n.kcalAdjust : 0);
  const proteinG = (n.proteinGPerKg || 2.0) * weightKg;
  const fatG = (n.fatGPerKg || 0.9) * weightKg;
  const carbsG = Math.max(0, (kcal - 4 * proteinG - 9 * fatG) / 4);
  const r = Math.round;
  return { bmr: r(bmr), tdee: r(tdee), kcal: r(kcal), proteinG: r(proteinG), fatG: r(fatG), carbsG: r(carbsG), weightKg: weightKg };
}

// ---------- Extracción por voz o texto ----------

const NUM_N_ = { type: 'NUMBER', nullable: true };
const MEAL_SCHEMA_ = { type: 'OBJECT', properties: {
  transcript: { type: 'STRING', nullable: true },
  mealType: { type: 'STRING', nullable: true },
  time: { type: 'STRING', nullable: true },
  items: { type: 'ARRAY', items: { type: 'OBJECT', properties: Object.assign({
    name: { type: 'STRING' }, quantity: { type: 'NUMBER' }, unit: { type: 'STRING' },
    kcal: NUM_N_, proteinG: NUM_N_, carbsG: NUM_N_, fatG: NUM_N_, confidence: { type: 'NUMBER' }
  }, MICRO_KEYS_.reduce((o, k) => { o[k] = NUM_N_; return o; }, {})), required: ['name', 'quantity', 'unit', 'proteinG', 'carbsG', 'fatG', 'confidence'] } }
}, required: ['items'] };

const MEAL_SYSTEM_ = 'Eres un nutricionista que estima lo que una persona ha comido a partir de su descripción (audio o texto, en español). ' +
  'Devuelve un elemento en "items" por cada alimento o bebida distinto que mencione, con la cantidad realmente comida. ' +
  '"unit" es una de: g, ml, unidad, ración, cucharada, taza. Cuando sea posible usa g o ml con una cantidad estimada razonable ' +
  '(una ración habitual en España si no se dice). Los valores nutricionales son del total de esa cantidad, NO por 100 g: ' +
  'kcal, proteinG, carbsG, fatG y, si puedes estimarlos, fiberG, sugarG, saturatedFatG, sodiumMg, potassiumMg, calciumMg, ironMg, ' +
  'magnesiumMg, zincMg, vitAUg, vitCMg, vitDUg, vitEMg, vitKUg, b1Mg, b2Mg, b3Mg, b6Mg, folateUg, b12Ug y omega3G (EPA+DHA en g). ' +
  'b3Mg es solo la niacina ya presente en el alimento (nicotinamida y ácido nicotínico): NO sumes la que el cuerpo fabrica con el triptófano, ' +
  'que la añade la app aparte. ' +
  'Los micronutrientes son aproximaciones: si no tienes una estimación razonable, pon null. ' +
  '"confidence" va de 0 a 1: baja si la cantidad o el alimento son vagos. ' +
  '"mealType": breakfast, lunch, dinner, snack, pre_workout, post_workout o null; "time": HH:MM solo si lo dice, si no null. ' +
  'Incluye aceites, salsas y bebidas con calorías solo si se mencionan. No añadas alimentos que no se hayan dicho. ' +
  'Si hay audio, transcríbelo en "transcript". ' +
  'Si hay fotos: identifica cada alimento visible y estima la cantidad por el tamaño del plato, los cubiertos, la mano o el envase como ' +
  'referencia; cuenta el aceite o la salsa que se vea. Si una etiqueta nutricional es legible, usa sus datos. Si el texto o el audio dan ' +
  'cantidades o aclaran qué es algo, mandan sobre lo que parece en la foto. Si con la foto no se sabe la cantidad, baja "confidence". ' +
  'Si "repartoAparte" es true, estima TODO lo que se ve en las fotos (el plato o la fuente entera) aunque la descripción diga que se ' +
  'compartió o que solo se comió una parte: la app aplica después la parte de esta persona. Sin "repartoAparte", si dice que lo compartió ' +
  'o que comió una parte, estima solo lo que comió esta persona. ' +
  'Responde solo con el JSON pedido.';

function validateMealExtraction_(o) {
  const e = [];
  if (!o || !Array.isArray(o.items)) return ['items debe ser una lista'];
  if (o.items.length === 0) return ['no hay ningún alimento'];
  if (o.items.length > MEAL_ITEM_MAX_) e.push('demasiados alimentos');
  o.items.forEach((it, i) => {
    const l = 'alimento ' + (i + 1);
    if (!it.name || typeof it.name !== 'string') e.push(l + ': falta el nombre');
    if (UNITS_.indexOf(it.unit) < 0) e.push(l + ': unidad inválida');
    if (!isNum_(it.quantity) || it.quantity <= 0) e.push(l + ': cantidad inválida');
    ['proteinG', 'carbsG', 'fatG'].forEach((k) => { if (!isNum_(it[k])) e.push(l + ': ' + k + ' debe ser un número'); });
    if (!isNum_(it.confidence)) e.push(l + ': confidence inválido');
  });
  return e;
}

/** Limpia un alimento: rangos, coherencia de calorías (Atwater) y confianza. Devuelve { item, flags }. */
function normalizeMealItem_(raw) {
  const flags = [];
  const item = { name: String(raw.name).trim().slice(0, 80), quantity: Math.round(raw.quantity * 10) / 10, unit: raw.unit };
  const clampNum = (v, max) => (isNum_(v) ? Math.round(Math.min(Math.max(v, 0), max) * 100) / 100 : null);
  item.proteinG = clampNum(raw.proteinG, 300); item.carbsG = clampNum(raw.carbsG, 600); item.fatG = clampNum(raw.fatG, 400);
  const calc = 4 * item.proteinG + 4 * item.carbsG + 9 * item.fatG;
  const kcal = clampNum(raw.kcal, 5000);
  if (kcal === null) { item.kcal = Math.round(calc); flags.push('kcal_from_macros'); }
  else if (Math.abs(kcal - calc) > Math.max(0.25 * calc, 40)) { item.kcal = Math.round(calc); flags.push('kcal_fixed'); }
  else item.kcal = Math.round(kcal);
  MICRO_KEYS_.forEach((k) => { const v = clampNum(raw[k], 100000); if (v !== null) item[k] = v; });
  item.confidence = Math.min(1, Math.max(0, Math.round(raw.confidence * 100) / 100));
  return { item: item, flags: flags };
}

function sanitizeMeal_(ai) {
  const items = [];
  const warnings = [];
  (ai.items || []).forEach((raw) => {
    const r = normalizeMealItem_(raw);
    items.push(r.item);
    r.flags.forEach((f) => warnings.push({ name: r.item.name, flag: f }));
    if (r.item.confidence < 0.5) warnings.push({ name: r.item.name, flag: 'low_confidence' });
  });
  if (!items.length) throw { code: 'VALIDATION', message: 'No he entendido ningún alimento' };
  return { mealType: MEAL_TYPES_.indexOf(ai.mealType) >= 0 ? ai.mealType : null,
    time: typeof ai.time === 'string' && HHMM_RE_.test(ai.time) ? ai.time : null, items: items, warnings: warnings };
}

const MEAL_MAX_IMAGES_ = 3;

/**
 * Qué se manda a la IA para estimar una comida: texto, audio y hasta 3 fotos, en cualquier combinación.
 * Acepta también el formato antiguo ({ kind: 'text', text } o { kind: 'audio', mime, data }). Pura salvo la validación.
 */
function mealInputs_(p) {
  const text = String(p.text == null ? '' : validateText_(p.text)).trim();
  let audio = p.audio || null;
  if (!audio && p.kind === 'audio') audio = { mime: p.mime, data: p.data };
  const images = Array.isArray(p.images) ? p.images : [];
  if (images.length > MEAL_MAX_IMAGES_) throw { code: 'VALIDATION', message: 'Como mucho ' + MEAL_MAX_IMAGES_ + ' fotos por comida' };
  const parts = [];
  if (audio) parts.push({ inlineData: { mimeType: validateMedia_('audio', audio.mime, audio.data), data: audio.data } });
  images.forEach((im) => parts.push({ inlineData: { mimeType: validateMedia_('image', im && im.mime, im && im.data), data: im.data } }));
  if (!text && !parts.length) throw { code: 'VALIDATION', message: 'Añade una foto, un audio o un texto con lo que has comido' };
  const user = { tarea: 'Estima la comida', fotos: images.length, audio: !!audio };
  if (text) user.descripcion = text;
  // El usuario dice aparte qué parte se comió (compartido o un porcentaje): la IA estima el plato ENTERO y la app reparte.
  if (p.shared === true) user.repartoAparte = true;
  return { user: user, parts: parts };
}

function mealProcess(p) {
  const inp = mealInputs_(p || {});
  const ai = callJson_('FAST', MEAL_SYSTEM_, inp.user, MEAL_SCHEMA_, validateMealExtraction_, inp.parts);
  const res = sanitizeMeal_(ai);
  res.transcript = typeof ai.transcript === 'string' ? ai.transcript.slice(0, 2000) : null;
  return res;
}

// ---------- Totales y alertas ----------

function sumMeals_(meals) {
  const out = {};
  (meals || []).forEach((m) => (m.items || []).forEach((it) => {
    MEAL_NUM_KEYS_.forEach((k) => { if (isNum_(it[k])) out[k] = (out[k] || 0) + it[k]; });
  }));
  MEAL_NUM_KEYS_.forEach((k) => { if (out[k] !== undefined) out[k] = Math.round(out[k] * 100) / 100; });
  return out;
}

/** Media diaria de los últimos 7 días (solo cuentan los días con comidas) y avisos de micronutrientes. */
/**
 * Media diaria de los últimos 7 días (solo cuentan los días con comidas) y avisos de micronutrientes.
 * `extraFn(totalesDelDia, fecha)` (opcional) devuelve los aportes que no vienen de las comidas (niacina fabricada, sol, agua): se suman
 * al total de cada día ANTES de promediar y de valorar los avisos; su media se devuelve aparte en `extras` para enseñar el desglose.
 */
function weekNutrition_(meals, todayIso, extraFn) {
  const byDay = {};
  // Un día cuenta si tiene alguna comida de verdad: un día con solo suplementos (no apuntaste lo que comiste) no baja la media.
  const real = {};
  (meals || []).forEach((m) => { if (m.mealType !== 'supplement') real[m.date] = true; });
  (meals || []).forEach((m) => { if (real[m.date] && daysBetween_(m.date, todayIso) >= 0 && daysBetween_(m.date, todayIso) < 7) (byDay[m.date] = byDay[m.date] || []).push(m); });
  const days = Object.keys(byDay);
  const avg = {};
  const porDia = days.map((d) => { const t = sumMeals_(byDay[d]); const ex = extraFn ? extraFn(t, d) : {}; return { t: conExtras_(t, ex), ex: ex }; });
  const avgExtras = {};
  MEAL_NUM_KEYS_.forEach((k) => {
    const vals = porDia.map((x) => x.t[k]).filter((v) => v !== undefined);
    if (vals.length) avg[k] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100;
    const exv = porDia.map((x) => x.ex[k] || 0);
    const media = exv.length ? exv.reduce((a, b) => a + b, 0) / exv.length : 0;
    if (media > 0) avgExtras[k] = Math.round(media * 100) / 100;
  });
  const alerts = [];
  if (days.length >= 3) {
    MICROS_.forEach((m) => {
      const v = avg[m.key];
      if (v === undefined) return;
      if (m.kind === 'min' && v < 0.6 * m.ref) alerts.push({ key: m.key, level: 'low', pct: Math.round(v / m.ref * 100) });
      if (m.kind === 'max' && v > 1.3 * m.ref) alerts.push({ key: m.key, level: 'high', pct: Math.round(v / m.ref * 100) });
    });
  }
  return { days: days.length, avg: avg, extras: avgExtras, alerts: alerts };
}

/** Lunes de la semana de una fecha ISO. Pura. */
function mondayOf_(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}

// ---------- Acciones con Drive ----------

function loadMeals_(fromIso, toIso) {
  const out = [];
  monthsBetween_(fromIso, toIso).forEach((ym) => readJson_('meals/' + ym + '.json', []).forEach((m) => out.push(m)));
  return out.filter((m) => m.date >= fromIso && m.date <= toIso);
}

function nutritionState(p) {
  const settings = getSettings();
  const today = todayIso_(settings.profile.timezone);
  const date = p && isIsoDate_(p.date) ? p.date : today;
  const bw = latestBodyweight_(settings);
  const targets = nutritionTargets_(settings, bw, Number(today.slice(0, 4)));
  const weekMeals = loadMeals_(addDays_(date, -6), date);
  const dayMeals = weekMeals.filter((m) => m.date === date).sort(sortByDateTime_);
  // Semana (lunes a domingo) del día que se mira: qué días tienen comidas apuntadas, para enseñarlo y rellenar huecos.
  const ws = mondayOf_(date);
  const logged = {};
  loadMeals_(ws, addDays_(ws, 6)).forEach((m) => { if (m.mealType !== 'supplement') logged[m.date] = true; });
  const supplements = (settings.nutrition || {}).supplements || [];
  const takenIds = dayMeals.filter((m) => m.mealType === 'supplement').map((m) => m.supplementId);
  // Un solo sitio donde se suman los aportes que no vienen de las comidas (niacina fabricada, sol, agua): los totales y las medias ya los llevan.
  const nut = settings.nutrition || {};
  const dayTotals = sumMeals_(dayMeals);
  const extras = extrasDia_(nut, dayTotals, date);
  const week = weekNutrition_(weekMeals, date, (t, d) => extrasDia_(nut, t, d));
  return { date: date, today: today, targets: targets, meals: dayMeals, totals: conExtras_(dayTotals, extras), extras: extras, week: week,
    habits: { sun: nut.sun || null, water: nut.water || null },
    micros: MICROS_, week7: { start: ws, logged: Object.keys(logged).sort() }, supplements: supplements, supplementsTaken: takenIds };
}

function mealDelete(p) {
  requireDate_(p.date);
  if (typeof p.id !== 'string') throw { code: 'VALIDATION', message: 'id requerido' };
  const path = 'meals/' + p.date.slice(0, 7) + '.json';
  return withLock_(() => {
    const arr = readJson_(path, []);
    const next = arr.filter((m) => m.id !== p.id);
    if (next.length === arr.length) throw { code: 'NOT_FOUND', message: 'Comida no encontrada' };
    writeFile_(path, next);
    return { revision: bumpRevision_() };
  });
}

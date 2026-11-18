/**
 * Recetas y lista de la compra para cubrir lo que falta (PLAN 8.5). El código decide QUÉ falta
 * (objetivos, medias de 7 días y micronutrientes); la IA solo propone recetas con esos huecos y tus
 * hábitos. La lista de la compra la suma el código a partir de los ingredientes.
 */

const SHOP_SECTIONS_ = ['fruta_verdura', 'carne_pescado', 'lacteos_huevos', 'panaderia', 'despensa', 'congelados', 'otros'];
const RECIPE_MOMENTS_ = ['desayuno', 'comida', 'cena', 'snack', 'post_entreno'];
const RECIPE_UNITS_ = ['g', 'ml', 'unidad', 'cucharada', 'cucharadita', 'diente', 'pizca', 'lata', 'paquete'];
const RECIPES_PATH_ = 'nutrition/suggestions.json';

/** Lo que falta o sobra. `week` es la salida de weekNutrition_. Pura. */
function nutritionGaps_(targets, totals, week) {
  const t = totals || {};
  const remaining = {};
  if (targets) MACRO_KEYS_.forEach((k) => { remaining[k] = Math.round(Math.max(0, targets[k] - (t[k] || 0))); });
  const avg = (week && week.days) ? week.avg : t;
  const low = []; const high = [];
  MICROS_.forEach((m) => {
    const v = avg[m.key];
    if (v === undefined) return;
    const p = Math.round(v / m.ref * 100);
    if (m.kind === 'min' && p < 80) low.push({ key: m.key, label: m.label, pct: p });
    if (m.kind === 'max' && p > 110) high.push({ key: m.key, label: m.label, pct: p });
  });
  low.sort((a, b) => a.pct - b.pct);
  let proteinPct = null;
  if (targets && avg.proteinG !== undefined) proteinPct = Math.round(avg.proteinG / targets.proteinG * 100);
  return { remaining: remaining, low: low.slice(0, 6), high: high, proteinPct: proteinPct, days: week ? week.days : 0 };
}

/** Alimentos que más se repiten (para que las recetas encajen con lo que ya se come). Pura. */
function frequentFoods_(meals, n) {
  const count = {};
  (meals || []).forEach((m) => (m.items || []).forEach((it) => {
    const k = String(it.name || '').trim().toLowerCase();
    if (k) count[k] = (count[k] || 0) + 1;
  }));
  return Object.keys(count).sort((a, b) => count[b] - count[a] || (a < b ? -1 : 1)).slice(0, n || 15);
}

const RECIPES_SCHEMA_ = { type: 'OBJECT', properties: {
  summary: { type: 'STRING' },
  recipes: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
    name: { type: 'STRING' }, moment: { type: 'STRING' }, minutes: { type: 'INTEGER' }, servings: { type: 'INTEGER' },
    covers: { type: 'ARRAY', items: { type: 'STRING' } }, why: { type: 'STRING' },
    kcal: { type: 'NUMBER' }, proteinG: { type: 'NUMBER' }, carbsG: { type: 'NUMBER' }, fatG: { type: 'NUMBER' },
    ingredients: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      name: { type: 'STRING' }, quantity: { type: 'NUMBER' }, unit: { type: 'STRING' }, section: { type: 'STRING' }
    }, required: ['name', 'quantity', 'unit', 'section'] } },
    steps: { type: 'ARRAY', items: { type: 'STRING' } }
  }, required: ['name', 'moment', 'minutes', 'servings', 'covers', 'why', 'kcal', 'proteinG', 'carbsG', 'fatG', 'ingredients', 'steps'] } }
}, required: ['summary', 'recipes'] };

const RECIPES_SYSTEM_ = 'Eres un nutricionista deportivo español que propone recetas caseras, sencillas y baratas para una persona que ' +
  'entrena fuerza y quiere ganar músculo y perder grasa. Recibes lo que le falta (macros que quedan hoy y micronutrientes por debajo ' +
  'de la referencia en la media de 7 días), lo que le sobra, los alimentos que suele comer y sus notas (alergias, lo que no le gusta). ' +
  'Propón exactamente 3 recetas que cubran lo que falta, priorizando la proteína si va corta y los micronutrientes más bajos. ' +
  'Reglas: ingredientes de supermercado español; nada que contradiga sus notas; evita lo que le sobra (por ejemplo, sodio o azúcar); ' +
  'como mucho 30 minutos salvo que se pueda cocinar en lote; 3 a 8 pasos cortos. ' +
  '"covers": claves de lo que cubre, de esta lista: proteinG, fiberG, potassiumMg, calciumMg, ironMg, magnesiumMg, zincMg, vitAUg, vitCMg, ' +
  'vitDUg, vitEMg, vitKUg, b1Mg, b2Mg, b3Mg, b6Mg, folateUg, b12Ug, omega3G. "why": una frase que diga qué aporta y por qué ahora. ' +
  'kcal y macros son POR RACIÓN. Ingredientes para todas las raciones, con "unit" una de: g, ml, unidad, cucharada, cucharadita, diente, ' +
  'pizca, lata, paquete; y "section" una de: fruta_verdura, carne_pescado, lacteos_huevos, panaderia, despensa, congelados, otros. ' +
  '"moment": desayuno, comida, cena, snack o post_entreno. "summary": 1 o 2 frases claras, sin tecnicismos, sobre qué falta y cómo lo cubren las recetas. ' +
  'Responde solo con el JSON pedido.';

function validateRecipes_(o) {
  const e = [];
  if (!o || typeof o.summary !== 'string' || !Array.isArray(o.recipes)) return ['faltan summary o recipes'];
  if (o.recipes.length < 1 || o.recipes.length > 4) e.push('se esperaban 3 recetas');
  o.recipes.forEach((r, i) => {
    const l = 'receta ' + (i + 1);
    if (!r.name) e.push(l + ': falta el nombre');
    if (RECIPE_MOMENTS_.indexOf(r.moment) < 0) e.push(l + ': momento inválido');
    if (!(r.servings >= 1 && r.servings <= 8)) e.push(l + ': raciones inválidas');
    if (!(r.minutes >= 1 && r.minutes <= 240)) e.push(l + ': minutos inválidos');
    ['kcal', 'proteinG', 'carbsG', 'fatG'].forEach((k) => { if (!isNum_(r[k]) || r[k] < 0) e.push(l + ': ' + k + ' inválido'); });
    if (!Array.isArray(r.ingredients) || !r.ingredients.length || r.ingredients.length > 20) e.push(l + ': ingredientes inválidos');
    else r.ingredients.forEach((g, j) => {
      if (!g.name || !isNum_(g.quantity) || g.quantity <= 0) e.push(l + ' ingrediente ' + (j + 1) + ': cantidad inválida');
      if (RECIPE_UNITS_.indexOf(g.unit) < 0) e.push(l + ' ingrediente ' + (j + 1) + ': unidad inválida');
      if (SHOP_SECTIONS_.indexOf(g.section) < 0) e.push(l + ' ingrediente ' + (j + 1) + ': sección inválida');
    });
    if (!Array.isArray(r.steps) || !r.steps.length || r.steps.length > 12) e.push(l + ': pasos inválidos');
  });
  return e;
}

/** Recorta textos y descarta claves desconocidas. Pura. */
function sanitizeRecipes_(o) {
  const known = ['proteinG'].concat(MICRO_KEYS_);
  const txt = (s, n) => String(s || '').trim().slice(0, n);
  return { summary: txt(o.summary, 400), recipes: o.recipes.slice(0, 3).map((r) => ({
    name: txt(r.name, 80), moment: r.moment, minutes: Math.round(r.minutes), servings: Math.round(r.servings),
    covers: (r.covers || []).filter((k) => known.indexOf(k) >= 0).slice(0, 6), why: txt(r.why, 240),
    kcal: Math.round(r.kcal), proteinG: Math.round(r.proteinG), carbsG: Math.round(r.carbsG), fatG: Math.round(r.fatG),
    ingredients: r.ingredients.map((g) => ({ name: txt(g.name, 60), quantity: Math.round(g.quantity * 10) / 10, unit: g.unit, section: g.section })),
    steps: r.steps.map((s) => txt(s, 300)).filter(Boolean)
  })) };
}

/** Suma los ingredientes de todas las recetas por nombre y unidad, agrupados por sección del súper. Pura. */
function shoppingList_(recipes) {
  const by = {};
  (recipes || []).forEach((r) => (r.ingredients || []).forEach((g) => {
    const name = String(g.name).trim();
    const k = name.toLowerCase() + '|' + g.unit;
    if (!by[k]) by[k] = { name: name, quantity: 0, unit: g.unit, section: g.section, recipes: [] };
    by[k].quantity = Math.round((by[k].quantity + g.quantity) * 10) / 10;
    if (by[k].recipes.indexOf(r.name) < 0) by[k].recipes.push(r.name);
  }));
  const list = Object.keys(by).map((k) => by[k]);
  list.sort((a, b) => SHOP_SECTIONS_.indexOf(a.section) - SHOP_SECTIONS_.indexOf(b.section) || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
  return list;
}

/** Recetas guardadas (si las hay) junto con lo que falta ahora. No llama a la IA. */
function nutritionSuggestions(p) {
  const saved = readJson_(RECIPES_PATH_, null);
  return { suggestions: saved };
}

/** Pide recetas nuevas a la IA con lo que falta ahora y las guarda en Drive. */
function nutritionSuggest(p) {
  const settings = getSettings();
  const today = todayIso_(settings.profile.timezone);
  const st = nutritionState({ date: today });
  const gaps = nutritionGaps_(st.targets, st.totals, st.week);
  const habits = frequentFoods_(loadMeals_(addDays_(today, -13), today), 15);
  const user = {
    quedaHoy: gaps.remaining, proteinaMedia7DiasPct: gaps.proteinPct,
    microsBajos: gaps.low.map((g) => g.label + ' (' + g.pct + ' %)'), aEvitar: gaps.high.map((g) => g.label + ' (' + g.pct + ' %)'),
    diasConDatos: gaps.days, suelesComer: habits, notas: String((settings.nutrition || {}).foodNotes || '').slice(0, 300) || null
  };
  const ai = sanitizeRecipes_(callJson_('SMART', RECIPES_SYSTEM_, user, RECIPES_SCHEMA_, validateRecipes_));
  const out = { date: today, createdAt: new Date().toISOString(), gaps: gaps, summary: ai.summary, recipes: ai.recipes, shopping: shoppingList_(ai.recipes) };
  withLock_(() => writeFile_(RECIPES_PATH_, out));
  return { suggestions: out };
}

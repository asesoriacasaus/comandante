/**
 * Base de alimentos propia (PLAN 7.5): se construye sola con lo que el usuario ya ha comido y revisado. El móvil la usa para
 * calcular sin IA las comidas que escribe con alimentos conocidos ("2 huevos y 200 g de arroz") y para repetir comidas
 * frecuentes con un toque.
 */
const FOODS_DIAS_ = 180;
const FOODS_MAX_ = 400;
const FOODS_NUM_ = ['kcal', 'proteinG', 'carbsG', 'fatG'];

function claveAlimento_(name) {
  return sinTildes_(name).replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Pura: un alimento por nombre, con lo que aporta por 100 g o 100 ml (si se pesó) o por unidad, ración, taza…
 * Se queda con la vez más reciente (la última revisión del usuario manda) y la cantidad típica que suele comer.
 */
function buildFoodDb_(meals) {
  const by = {};
  (meals || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).forEach((m) => {
    if (m.mealType === 'supplement') return;
    (m.items || []).forEach((it) => {
      if (!it || !it.name || !(it.quantity > 0) || (isNum_(it.confidence) && it.confidence < 0.5)) return;
      const k = claveAlimento_(it.name);
      if (!k) return;
      const porPeso = it.unit === 'g' || it.unit === 'ml';
      const base = porPeso ? 100 : 1;
      const f = base / it.quantity;
      const n = {};
      FOODS_NUM_.concat(MICRO_KEYS_).forEach((key) => { if (isNum_(it[key])) n[key] = Math.round(it[key] * f * 1000) / 1000; });
      const prev = by[k + '|' + it.unit];
      by[k + '|' + it.unit] = { name: String(it.name).trim().slice(0, 80), unit: it.unit, base: base, n: n, tipica: it.quantity,
        veces: (prev ? prev.veces : 0) + 1, ultima: m.date };
    });
  });
  return Object.keys(by).map((k) => by[k]).sort((a, b) => b.veces - a.veces || (a.ultima < b.ultima ? 1 : -1)).slice(0, FOODS_MAX_);
}

/** Pura: comidas que se repiten (los mismos alimentos al menos 2 veces en 60 días), la más reciente de cada una. */
function frequentMeals_(meals, todayIso) {
  const by = {};
  (meals || []).forEach((m) => {
    if (m.mealType === 'supplement' || !(m.items || []).length || daysBetween_(m.date, todayIso) > 60) return;
    const firma = m.items.map((it) => claveAlimento_(it.name)).sort().join('|');
    const prev = by[firma];
    if (!prev || prev.ultima <= m.date) by[firma] = { mealType: m.mealType || null, items: m.items, ultima: m.date, veces: (prev ? prev.veces : 0) + 1 };
    else prev.veces += 1;
  });
  return Object.keys(by).map((k) => by[k]).filter((x) => x.veces >= 2)
    .sort((a, b) => b.veces - a.veces || (a.ultima < b.ultima ? 1 : -1)).slice(0, 6);
}

function foodsList() {
  const settings = getSettings();
  const today = todayIso_(settings.profile.timezone);
  const meals = loadMeals_(addDays_(today, -FOODS_DIAS_), today);
  return { foods: buildFoodDb_(meals), frecuentes: frequentMeals_(meals, today), creado: new Date().toISOString() };
}

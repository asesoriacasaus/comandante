/**
 * Validadores puros (sin acceso a Drive ni propiedades).
 * Devuelven un array de errores en español; vacío = válido.
 */

const MEAL_TYPES_ = ['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout', 'supplement'];
const UNITS_ = ['g', 'ml', 'unidad', 'ración', 'cucharada', 'taza', 'cápsula', 'comprimido', 'sobre', 'cacito', 'gota'];
const EXPERIENCE_ = ['beginner', 'intermediate', 'advanced'];

const ISO_DATE_RE_ = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE_ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const HHMM_RE_ = /^\d{2}:\d{2}$/;

function isIsoDate_(s) {
  if (typeof s !== 'string' || !ISO_DATE_RE_.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function isIsoDateTime_(s) {
  return typeof s === 'string' && ISO_DATETIME_RE_.test(s) && !isNaN(Date.parse(s));
}

/** Devuelve el mensaje de error o null. Valida número opcional en un rango. */
function checkNum_(v, label, min, max, integer) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !isFinite(v)) return label + ' debe ser un número o null';
  if (integer && !Number.isInteger(v)) return label + ' debe ser un entero';
  if (v < min || v > max) return label + ' fuera de rango (' + min + '-' + max + ')';
  return null;
}

function pushIf_(arr, msg) {
  if (msg) arr.push(msg);
}

/** Fecha válida y no futura (permite hoy + 1 día por desfase de zona horaria). */
function validateDate_(date, today) {
  if (!isIsoDate_(date)) return ['date debe tener formato YYYY-MM-DD'];
  const limit = new Date(today + 'T00:00:00Z');
  limit.setUTCDate(limit.getUTCDate() + 1);
  if (date > limit.toISOString().slice(0, 10)) return ['date no puede ser futura'];
  return [];
}

function validateSession_(s, today, equipment) {
  const e = [];
  if (!s.id) e.push('id requerido');
  if (SESSION_STATUS_.indexOf(s.status) < 0) e.push('status inválido');
  if (s.status === 'planned') {
    if (!isIsoDate_(s.date)) e.push('date debe tener formato YYYY-MM-DD');
  } else {
    e.push(...validateDate_(s.date, today));
  }
  if (s.startedAt && !isIsoDateTime_(s.startedAt)) e.push('startedAt inválido');
  if (s.endedAt && !isIsoDateTime_(s.endedAt)) e.push('endedAt inválido');
  if (s.startedAt && s.endedAt && isIsoDateTime_(s.startedAt) && isIsoDateTime_(s.endedAt) &&
      Date.parse(s.endedAt) < Date.parse(s.startedAt)) {
    e.push('endedAt es anterior a startedAt');
  }
  (s.groups || []).forEach((g) => { if (GROUPS_.indexOf(g) < 0) e.push('grupo inválido: ' + g); });

  const exercises = s.exercises || [];
  if (s.status === 'done' && exercises.length === 0) e.push('la sesión no tiene ejercicios');
  exercises.forEach((ex, i) => {
    const label = 'exercises[' + i + ']';
    if (!ex.exerciseId && !ex.name) e.push(label + ': falta exerciseId o name');
    if (!Array.isArray(ex.sets)) {
      e.push(label + ': sets debe ser una lista');
      return;
    }
    ex.sets.forEach((set, j) => e.push(...validateSet_(set, label + '.sets[' + j + ']', equipment)));
  });
  return e;
}

function validateMeal_(m, today) {
  const e = [];
  if (!m.id) e.push('id requerido');
  e.push(...validateDate_(m.date, today));
  if (m.time !== null && m.time !== undefined && !HHMM_RE_.test(m.time)) e.push('time debe ser HH:MM o null');
  if (m.mealType !== null && m.mealType !== undefined && MEAL_TYPES_.indexOf(m.mealType) < 0) {
    e.push('mealType inválido');
  }
  if (!Array.isArray(m.items) || m.items.length === 0) {
    e.push('items debe tener al menos un alimento');
    return e;
  }

  let sumKcal = 0;
  let sumProtein = 0;
  m.items.forEach((it, i) => {
    const label = 'items[' + i + ']';
    if (!it.name || typeof it.name !== 'string') e.push(label + ': name requerido');
    if (UNITS_.indexOf(it.unit) < 0) e.push(label + ': unit inválida');
    pushIf_(e, checkNum_(it.quantity, label + ' quantity', 0, 100000, false));
    pushIf_(e, checkNum_(it.kcal, label + ' kcal', 0, 100000, false));
    pushIf_(e, checkNum_(it.proteinG, label + ' proteinG', 0, 10000, false));
    pushIf_(e, checkNum_(it.carbsG, label + ' carbsG', 0, 10000, false));
    pushIf_(e, checkNum_(it.fatG, label + ' fatG', 0, 10000, false));
    MICRO_KEYS_.forEach((k) => pushIf_(e, checkNum_(it[k], label + ' ' + k, 0, 100000, false)));
    pushIf_(e, checkNum_(it.confidence, label + ' confidence', 0, 1, false));
    sumKcal += Number(it.kcal) || 0;
    sumProtein += Number(it.proteinG) || 0;
  });

  // Si llegan totales, deben coincidir con los ítems (±2 %).
  if (m.totals) {
    const within = (sum, tot) => Math.abs(sum - tot) <= 0.02 * Math.max(Math.abs(tot), 1);
    if (typeof m.totals.kcal === 'number' && !within(sumKcal, m.totals.kcal)) {
      e.push('totals.kcal no coincide con la suma de items');
    }
    if (typeof m.totals.proteinG === 'number' && !within(sumProtein, m.totals.proteinG)) {
      e.push('totals.proteinG no coincide con la suma de items');
    }
  }
  return e;
}

function validateBody_(b, today) {
  const e = [];
  e.push(...validateDate_(b.date, today));
  SCALE_FIELDS_.forEach((f) => pushIf_(e, checkNum_(b[f.key], f.key, f.min, f.max, false)));
  e.push(...validateMeasurements_(b.measurementsCm));
  return e;
}

function validateSettings_(s) {
  const e = [];
  const p = s.profile || {};
  const g = s.goal || {};
  const q = s.equipment || {};
  if (typeof p.timezone !== 'string' || !p.timezone) e.push('profile.timezone requerida');
  if (p.sex !== null && p.sex !== undefined && ['male', 'female'].indexOf(p.sex) < 0) e.push('profile.sex debe ser male, female o null');
  pushIf_(e, checkNum_(p.birthYear, 'profile.birthYear', 1920, 2015, true));
  pushIf_(e, checkNum_(p.heightCm, 'profile.heightCm', 120, 230, false));
  pushIf_(e, checkNum_(g.startWeightKg, 'goal.startWeightKg', 30, 300, false));
  pushIf_(e, checkNum_(g.targetWeightKg, 'goal.targetWeightKg', 30, 300, false));
  pushIf_(e, checkNum_(g.startWaistCm, 'goal.startWaistCm', 40, 250, false));
  if (g.startDate && !isIsoDate_(g.startDate)) e.push('goal.startDate inválida');
  if (g.targetDate && !isIsoDate_(g.targetDate)) e.push('goal.targetDate inválida');
  ['barbellKg', 'ezBarKg', 'dumbbellStepKg', 'plateMinKg', 'stackStepKg'].forEach((k) => {
    if (typeof q[k] !== 'number' || !(q[k] > 0 && q[k] <= 60)) e.push('equipment.' + k + ' debe ser un número entre 0 y 60');
  });
  pushIf_(e, checkNum_((s.strength || {}).referenceTotalKg, 'strength.referenceTotalKg', 5, 500, false));
  pushIf_(e, checkNum_((s.nutrition || {}).proteinGPerKg, 'nutrition.proteinGPerKg', 0.8, 3.5, false));
  pushIf_(e, checkNum_((s.nutrition || {}).activityFactor, 'nutrition.activityFactor', 1.2, 2.2, false));
  pushIf_(e, checkNum_((s.nutrition || {}).kcalAdjust, 'nutrition.kcalAdjust', -KCAL_ADJUST_MAX_, KCAL_ADJUST_MAX_, false));
  pushIf_(e, checkNum_((s.nutrition || {}).fatGPerKg, 'nutrition.fatGPerKg', 0.4, 2, false));
  e.push(...validateSupplements_((s.nutrition || {}).supplements));
  pushIf_(e, checkNum_((s.training || {}).secPerRep, 'training.secPerRep', 1, 15, false));
  e.push(...validateExtrasSettings_(s.nutrition));
  const notes = (s.nutrition || {}).foodNotes;
  if (notes !== undefined && notes !== null && (typeof notes !== 'string' || notes.length > 300)) e.push('nutrition.foodNotes debe ser un texto de hasta 300 caracteres');
  if (!s.coach || ['baja', 'media', 'alta'].indexOf(s.coach.intensity) < 0) e.push('coach.intensity debe ser baja, media o alta');
  if (s.coach && s.coach.messages !== undefined && ['ahorro', 'ia'].indexOf(s.coach.messages) < 0) e.push('coach.messages debe ser ahorro o ia');
  return e;
}

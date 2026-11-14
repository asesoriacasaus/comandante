/**
 * Validadores puros (sin acceso a Drive ni propiedades).
 * Devuelven un array de errores en español; vacío = válido.
 */

const SESSION_TYPES_ = ['strength', 'bodyweight', 'cardio', 'mixed'];
const SET_TYPES_ = ['warmup', 'working', 'drop'];
const MEAL_TYPES_ = ['breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout'];
const UNITS_ = ['g', 'ml', 'unidad', 'ración', 'cucharada', 'taza'];
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

function isRunExercise_(item) {
  const probe = (String(item.exerciseId || '') + ' ' + String(item.name || '')).toLowerCase();
  return /run|correr|trote/.test(probe);
}

function validateSet_(set, label) {
  const e = [];
  if (!set || typeof set !== 'object') return [label + ': set inválido'];
  if (SET_TYPES_.indexOf(set.type) < 0) e.push(label + ': type inválido');
  pushIf_(e, checkNum_(set.reps, label + ' reps', 0, 1000, true));
  pushIf_(e, checkNum_(set.weightKg, label + ' weightKg', 0, 1000, false));
  pushIf_(e, checkNum_(set.rir, label + ' rir', 0, 10, true));
  pushIf_(e, checkNum_(set.restSec, label + ' restSec', 0, 3600, true));
  if (set.durationSec !== null && set.durationSec !== undefined) {
    pushIf_(e, checkNum_(set.durationSec, label + ' durationSec', 0.001, 86400, false));
  }
  return e;
}

function validateSession_(s, today) {
  const e = [];
  if (!s.id) e.push('id requerido');
  e.push(...validateDate_(s.date, today));
  if (SESSION_TYPES_.indexOf(s.type) < 0) e.push('type inválido');
  if (s.startedAt && !isIsoDateTime_(s.startedAt)) e.push('startedAt inválido');
  if (s.endedAt && !isIsoDateTime_(s.endedAt)) e.push('endedAt inválido');
  if (s.startedAt && s.endedAt && isIsoDateTime_(s.startedAt) && isIsoDateTime_(s.endedAt) &&
      Date.parse(s.endedAt) < Date.parse(s.startedAt)) {
    e.push('endedAt es anterior a startedAt');
  }

  if ((s.exercises || []).length === 0 && (s.cardio || []).length === 0) {
    e.push('la sesión no tiene ejercicios ni cardio');
  }

  (s.exercises || []).forEach((ex, i) => {
    const label = 'exercises[' + i + ']';
    if (!ex.exerciseId && !ex.name) e.push(label + ': falta exerciseId o name');
    if (!Array.isArray(ex.sets)) {
      e.push(label + ': sets debe ser una lista');
      return;
    }
    ex.sets.forEach((set, j) => e.push(...validateSet_(set, label + '.sets[' + j + ']')));
    pushIf_(e, checkNum_(ex.addedWeightKg, label + ' addedWeightKg', 0, 500, false));
    pushIf_(e, checkNum_(ex.bodyweightKg, label + ' bodyweightKg', 0, 400, false));
  });

  (s.cardio || []).forEach((c, i) => {
    const label = 'cardio[' + i + ']';
    if (!c.exerciseId && !c.name) e.push(label + ': falta exerciseId o name');
    if (typeof c.durationSec !== 'number') e.push(label + ': durationSec es obligatorio');
    else pushIf_(e, checkNum_(c.durationSec, label + ' durationSec', 1, 86400, false));
    pushIf_(e, checkNum_(c.distanceM, label + ' distanceM', 0, 1000000, false));
    pushIf_(e, checkNum_(c.avgHr, label + ' avgHr', 30, 250, false));
    pushIf_(e, checkNum_(c.maxHr, label + ' maxHr', 30, 250, false));
    pushIf_(e, checkNum_(c.rpe, label + ' rpe', 1, 10, false));
    if (c.distanceM && c.durationSec && isRunExercise_(c)) {
      const minPerKm = (c.durationSec / 60) / (c.distanceM / 1000);
      if (minPerKm < 3 || minPerKm > 20) {
        e.push(label + ': ritmo fuera de 3:00-20:00 min/km (coherencia distancia/duración)');
      }
    }
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
    pushIf_(e, checkNum_(it.fiberG, label + ' fiberG', 0, 10000, false));
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
  pushIf_(e, checkNum_(b.weightKg, 'weightKg', 20, 400, false));
  pushIf_(e, checkNum_(b.bodyFatPct, 'bodyFatPct', 1, 70, false));
  pushIf_(e, checkNum_(b.muscleMassKg, 'muscleMassKg', 1, 200, false));
  if (b.measurementsCm && typeof b.measurementsCm === 'object') {
    Object.keys(b.measurementsCm).forEach((k) => {
      pushIf_(e, checkNum_(b.measurementsCm[k], 'measurementsCm.' + k, 1, 300, false));
    });
  }
  return e;
}

function validateSettings_(s) {
  const e = [];
  if (!s.profile || typeof s.profile.timezone !== 'string' || !s.profile.timezone) {
    e.push('profile.timezone requerida');
  }
  if (!s.units || ['kg', 'lb'].indexOf(s.units.weight) < 0) e.push('units.weight debe ser kg o lb');
  if (!s.units || ['km', 'mi'].indexOf(s.units.distance) < 0) e.push('units.distance debe ser km o mi');
  if (!s.units || ['cm', 'in'].indexOf(s.units.length) < 0) e.push('units.length debe ser cm o in');
  if (EXPERIENCE_.indexOf(s.experience) < 0) e.push('experience inválida');
  if (s.goal) pushIf_(e, checkNum_(s.goal.targetKcal, 'goal.targetKcal', 500, 10000, false));
  return e;
}

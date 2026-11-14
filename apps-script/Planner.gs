/**
 * Planificador (PLAN 8). Funciones puras: sin Drive, sin Gemini, sin reloj.
 * Las reglas fijan límites y estructura; Gemini elige ejercicios y redacta.
 * Cualquier propuesta de la IA pasa por applyPlanRules_ antes de guardarse.
 */

const LEG_GROUPS_ = ['quads', 'hamstrings', 'glutes', 'calves'];
const LONG_RUN_MIN_SEC_ = 60 * 60;
const LONG_RUN_KM_ = 10;
const LONG_RUN_HOURS_ = 36;
const LAYOFF_DAYS_ = 7;
const MAX_LOAD_CHANGE_ = 0.10;
const MIN_WEEKLY_SETS_ = 8;

// ---------- Fechas ----------

function dayNumber_(iso) {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000;
}
function daysBetween_(a, b) { return Math.round(dayNumber_(b) - dayNumber_(a)); }
function hoursSince_(isoDateTime, nowIso) { return (Date.parse(nowIso) - Date.parse(isoDateTime)) / 3600000; }

// ---------- 8.1 Rotación ----------

function sortDone_(sessions) {
  return (sessions || []).filter((s) => s.status === 'done')
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1)
      : String(a.startedAt || '') < String(b.startedAt || '') ? -1 : 1));
}

/** Claves del ciclo hechas en la vuelta en curso (una vuelta completa reinicia la cuenta). */
function lapDone_(cycle, sessions) {
  const keys = cycle.sessions.map((s) => s.key);
  let lap = [];
  sortDone_(sessions).forEach((s) => {
    if (keys.indexOf(s.cycleKey) < 0) return;
    if (lap.indexOf(s.cycleKey) < 0) lap.push(s.cycleKey);
    if (lap.length === keys.length) lap = [];
  });
  return lap;
}

/** Claves pendientes de la vuelta, en el orden del ciclo. */
function pendingKeys_(cycle, sessions) {
  const done = lapDone_(cycle, sessions);
  return cycle.sessions.map((s) => s.key).filter((k) => done.indexOf(k) < 0);
}

function isLongRun_(run) {
  return (run.durationSec || 0) >= LONG_RUN_MIN_SEC_ || (run.distanceKm || 0) >= LONG_RUN_KM_;
}

/** ¿Hubo una tirada larga hace menos de 36 h? Sin hora en la carrera, se asume mediodía. */
function recentLongRun_(runs, nowIso) {
  return (runs || []).some((r) => {
    if (!isLongRun_(r)) return false;
    const when = r.startedAt || (r.date + 'T12:00:00Z');
    const h = hoursSince_(when, nowIso);
    return h >= 0 && h < LONG_RUN_HOURS_;
  });
}

function hasLegs_(groups) { return (groups || []).some((g) => LEG_GROUPS_.indexOf(g) >= 0); }

/**
 * Siguiente sesión: primera pendiente de la vuelta; si es de pierna y hubo tirada larga
 * hace menos de 36 h, se adelanta la siguiente sin pierna.
 */
function pickNextSession_(cycle, sessions, runs, nowIso) {
  const pending = pendingKeys_(cycle, sessions);
  const byKey = (k) => cycle.sessions.find((s) => s.key === k);
  const first = pending[0];
  const out = { key: first, groups: byKey(first).groups, reason: 'rotation', skippedKey: null, warning: null };
  if (hasLegs_(byKey(first).groups) && recentLongRun_(runs, nowIso)) {
    const alt = pending.find((k) => !hasLegs_(byKey(k).groups));
    if (alt) {
      out.key = alt; out.groups = byKey(alt).groups; out.reason = 'long_run_skip_legs'; out.skippedKey = first;
    } else {
      out.warning = 'legs_after_long_run';
    }
  }
  return out;
}

/** Regla de vuelta: más de 7 días sin entrenar → carga −10 % y una serie menos por ejercicio. */
function returnAdjust_(sessions, todayIso) {
  const done = sortDone_(sessions);
  if (!done.length) return { days: null, loadFactor: 1, setsDelta: 0 };
  const days = daysBetween_(done[done.length - 1].date, todayIso);
  return days > LAYOFF_DAYS_ ? { days: days, loadFactor: 0.9, setsDelta: -1 } : { days: days, loadFactor: 1, setsDelta: 0 };
}

/** Valida un ciclo: 1-2 regiones por sesión (la pierna cuenta como una) y todos los grupos cubiertos. */
function validateCycle_(cycle) {
  const e = [];
  if (!cycle || !Array.isArray(cycle.sessions) || cycle.sessions.length < 3 || cycle.sessions.length > 6) {
    return ['el ciclo debe tener entre 3 y 6 sesiones'];
  }
  const keys = {};
  const covered = {};
  cycle.sessions.forEach((s, i) => {
    if (!s.key || keys[s.key]) e.push('sesión ' + (i + 1) + ': clave ausente o repetida');
    keys[s.key] = 1;
    const groups = s.groups || [];
    if (!groups.length) e.push('sesión ' + s.key + ': sin grupos');
    groups.forEach((g) => {
      if (GROUPS_.indexOf(g) < 0) e.push('sesión ' + s.key + ': grupo inválido ' + g);
      covered[g] = 1;
    });
    const regions = groups.filter((g) => LEG_GROUPS_.indexOf(g) < 0).length + (hasLegs_(groups) ? 1 : 0);
    if (regions > 2) e.push('sesión ' + s.key + ': más de 2 grupos musculares');
  });
  GROUPS_.forEach((g) => { if (!covered[g]) e.push('el ciclo no cubre ' + g); });
  return e;
}

// ---------- 8.2 Volumen ----------

function weeklyGroupSets_(sessions, fromIso, toIso) {
  const out = {};
  sortDone_(sessions).filter((s) => s.date >= fromIso && s.date <= toIso).forEach((s) => {
    const by = (s.metrics && s.metrics.setsByGroup) || {};
    Object.keys(by).forEach((g) => { out[g] = (out[g] || 0) + by[g]; });
  });
  return out;
}

function groupsBelowMin_(setsByGroup, min) {
  const m = min === undefined ? MIN_WEEKLY_SETS_ : min;
  return GROUPS_.filter((g) => (setsByGroup[g] || 0) < m);
}

// ---------- Cargas: escalones y redondeo ----------

function equipmentWithDefaults_(eq) { return Object.assign({}, DEFAULT_EQUIPMENT_, eq || {}); }

function roundTo_(v, step, mode) {
  const q = v / step;
  const n = mode === 'floor' ? Math.floor(q + 1e-9) : Math.round(q);
  return round2_(n * step);
}

/** Escalón mínimo de subida, en kg totales, para un implemento. */
function stepKg_(load, eq) {
  const e = equipmentWithDefaults_(eq);
  switch (load.implement) {
    case 'barbell': case 'ezbar': case 'smith': return round2_(2 * e.plateMinKg);
    case 'dumbbell': case 'kettlebell': return round2_(e.dumbbellStepKg * (load.count || 1));
    case 'machine': case 'cable': return e.stackStepKg;
    default: return round2_(2 * e.plateMinKg); // lastre
  }
}

/** Construye una carga del mismo tipo que `tpl` con `totalKg` aproximado. mode: 'nearest' | 'floor'. */
function loadFromTotal_(tpl, totalKg, eq, mode) {
  const e = equipmentWithDefaults_(eq);
  const m = mode || 'nearest';
  const t = Math.max(0, totalKg);
  let raw;
  switch (tpl.implement) {
    case 'barbell': case 'ezbar': case 'smith': {
      const bar = isNum_(tpl.barKg) ? tpl.barKg : (tpl.implement === 'ezbar' ? e.ezBarKg : e.barbellKg);
      raw = { implement: tpl.implement, barKg: bar, perSideKg: Math.max(0, roundTo_((t - bar) / 2, e.plateMinKg, m)) };
      break;
    }
    case 'dumbbell': case 'kettlebell': {
      const count = tpl.count || (tpl.implement === 'dumbbell' ? 2 : 1);
      // El escalón se mide desde la carga actual: de 15 kg se sube a 17, no a un múltiplo absoluto de 2.
      const base = isNum_(tpl.perHandKg) ? tpl.perHandKg : 0;
      raw = { implement: tpl.implement, count: count,
        perHandKg: Math.max(0, round2_(base + roundTo_(t / count - base, e.dumbbellStepKg, m))) };
      break;
    }
    case 'machine': case 'cable':
      const baseStack = isNum_(tpl.stackKg) ? tpl.stackKg : 0;
      raw = { implement: tpl.implement, stackKg: Math.max(0, round2_(baseStack + roundTo_(t - baseStack, e.stackStepKg, m))) };
      break;
    default:
      raw = { implement: 'bodyweight', addedKg: Math.max(0, roundTo_(t, round2_(2 * e.plateMinKg), m)) };
  }
  return normalizeLoad_(raw, e).load;
}

/**
 * Límite duro (8.3): un cambio no puede superar ±10 % respecto a la última vez,
 * o un escalón de carga si es mayor (así las cargas ligeras pueden progresar).
 * No se aplica en descarga, vuelta ni primera sesión.
 */
function clampLoadChange_(prev, proposed, eq) {
  if (!prev || !proposed || prev.implement !== proposed.implement) return { load: proposed, clamped: false };
  const step = stepKg_(prev, eq);
  const allowed = Math.max(prev.totalKg * MAX_LOAD_CHANGE_, step);
  const delta = proposed.totalKg - prev.totalKg;
  if (Math.abs(delta) <= allowed + 1e-9) return { load: proposed, clamped: false };
  const target = prev.totalKg + Math.sign(delta) * allowed;
  let cand = loadFromTotal_(prev, target, eq, 'floor');
  if (delta < 0) cand = loadFromTotal_(prev, prev.totalKg - allowed, eq, 'nearest');
  // Tras redondear no puede quedar fuera del límite.
  while (cand && Math.abs(cand.totalKg - prev.totalKg) > allowed + 1e-9) {
    cand = loadFromTotal_(prev, cand.totalKg - Math.sign(delta) * step, eq, 'floor');
  }
  return { load: cand, clamped: true };
}

// ---------- 8.3 Progresión (doble progresión con RIR) ----------

function workingOnly_(sets) {
  return (sets || []).filter((s) => s.type === 'working' || s.type === 'failure');
}

/** Carga de referencia de una sesión: la de la serie de trabajo más pesada. */
function topLoad_(sets) {
  let best = null;
  workingOnly_(sets).forEach((s) => { if (s.load && (!best || s.load.totalKg > best.totalKg)) best = s.load; });
  return best;
}

/** rx = { repsMin, repsMax, targetRir }. RIR sin registrar (null) no bloquea la subida. */
function evaluateSets_(sets, rx) {
  const w = workingOnly_(sets);
  if (!w.length) return { status: 'none', rirUnknown: false };
  const known = (s) => isNum_(s.rir);
  const allMax = w.every((s) => s.reps >= rx.repsMax && (!known(s) || s.rir >= rx.targetRir));
  const below = w.some((s) => s.reps < rx.repsMin || (known(s) && s.rir < rx.targetRir - 1));
  return { status: allMax ? 'max' : below ? 'below' : 'in_range', rirUnknown: w.some((s) => !known(s)) };
}

/**
 * Decide la carga de la próxima sesión para un ejercicio.
 * `history`: sesiones anteriores del ejercicio, de la más antigua a la más reciente: [{ sets }].
 * Devuelve { action: 'increase'|'hold'|'decrease', load, reason, suggestVariant, rirUnknown }.
 */
function nextProgression_(history, rx, eq) {
  const last = history[history.length - 1];
  const lastLoad = last && topLoad_(last.sets);
  if (!lastLoad) return { action: 'hold', load: null, reason: 'no_history', suggestVariant: false, rirUnknown: false };
  const ev = evaluateSets_(last.sets, rx);
  if (ev.status === 'max') {
    const up = loadFromTotal_(lastLoad, lastLoad.totalKg + stepKg_(lastLoad, eq), eq, 'nearest');
    return { action: 'increase', load: up, reason: 'top_of_range', suggestVariant: false, rirUnknown: ev.rirUnknown };
  }
  if (ev.status === 'below') {
    const prev = history.length > 1 ? evaluateSets_(history[history.length - 2].sets, rx) : null;
    if (prev && prev.status === 'below') {
      const drop = Math.max(lastLoad.totalKg * 0.075, stepKg_(lastLoad, eq));
      const down = loadFromTotal_(lastLoad, lastLoad.totalKg - drop, eq, 'nearest');
      return { action: 'decrease', load: down, reason: 'two_misses', suggestVariant: true, rirUnknown: ev.rirUnknown };
    }
    return { action: 'hold', load: lastLoad, reason: 'below_target', suggestVariant: false, rirUnknown: ev.rirUnknown };
  }
  return { action: 'hold', load: lastLoad, reason: 'in_range', suggestVariant: false, rirUnknown: ev.rirUnknown };
}

// ---------- Descarga ----------

/** Descarga cada 6 semanas, o antes si se estancan 2 o más ejercicios principales. */
function shouldDeload_(weeksSinceDeload, stalledMainLifts) {
  return weeksSinceDeload >= 6 || (weeksSinceDeload >= 3 && stalledMainLifts >= 2);
}

function applyDeload_(ex, eq) {
  const out = Object.assign({}, ex, { sets: Math.max(1, Math.round(ex.sets * 0.6)) });
  if (ex.targetLoad && isNum_(ex.targetLoad.totalKg)) {
    out.targetLoad = loadFromTotal_(ex.targetLoad, ex.targetLoad.totalKg * 0.9, eq, 'nearest');
  }
  return out;
}

// ---------- Filtro final de la propuesta de la IA ----------

/**
 * Aplica las reglas duras a los ejercicios propuestos por Gemini.
 * planned: [{ exerciseId, sets, repsMin, repsMax, targetLoad, targetRir, restSec }]
 * ctx: { lastLoads: { exerciseId: carga }, returnAdjust, deload, firstSession, equipment }
 * Devuelve { exercises, notes }. Los números del entrenador nunca los decide el estilo del texto.
 */
function applyPlanRules_(planned, ctx) {
  const notes = [];
  const lastLoads = ctx.lastLoads || {};
  const exercises = planned.map((raw) => {
    let ex = Object.assign({}, raw);
    if (ctx.firstSession) {
      ex.targetRir = Math.max(ex.targetRir || 0, 3);
      return ex;
    }
    if (ctx.deload) {
      notes.push('deload');
      return applyDeload_(ex, ctx.equipment);
    }
    if (ctx.returnAdjust && ctx.returnAdjust.loadFactor < 1) {
      ex.sets = Math.max(1, ex.sets + ctx.returnAdjust.setsDelta);
      if (ex.targetLoad && isNum_(ex.targetLoad.totalKg)) {
        ex.targetLoad = loadFromTotal_(ex.targetLoad, ex.targetLoad.totalKg * ctx.returnAdjust.loadFactor, ctx.equipment, 'nearest');
      }
      return ex;
    }
    const prev = lastLoads[ex.exerciseId];
    if (prev && ex.targetLoad) {
      const r = clampLoadChange_(prev, ex.targetLoad, ctx.equipment);
      if (r.clamped) notes.push('clamped:' + ex.exerciseId);
      ex.targetLoad = r.load;
    }
    return ex;
  });
  if (ctx.returnAdjust && ctx.returnAdjust.loadFactor < 1 && !ctx.deload && !ctx.firstSession) notes.push('layoff');
  if (ctx.firstSession) notes.push('first_session');
  return { exercises: exercises, notes: notes };
}

/** Carga inicial conservadora (8.4): 85 % de la estimación de un 10RM, redondeada hacia abajo. */
function conservativeStart_(implement, est10RmTotalKg, eq) {
  const tpl = { implement: implement };
  return loadFromTotal_(tpl, est10RmTotalKg * 0.85, eq, 'floor');
}

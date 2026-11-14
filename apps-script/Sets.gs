/**
 * Modelo de serie y cálculo de cargas (PLAN 6.2). Funciones puras.
 * La IA solo extrae lo que el usuario dice; los kilos totales los calcula este código.
 */

const IMPLEMENTS_ = ['barbell', 'ezbar', 'dumbbell', 'kettlebell', 'machine', 'cable', 'bodyweight', 'smith'];
const SET_TYPES_ = ['warmup', 'working', 'drop', 'failure'];
const SESSION_STATUS_ = ['planned', 'in_progress', 'review', 'done'];

const DEFAULT_EQUIPMENT_ = { barbellKg: 20, ezBarKg: 10, dumbbellStepKg: 2, plateMinKg: 1.25 };

function round2_(n) { return Math.round(n * 100) / 100; }
function isNum_(v) { return typeof v === 'number' && isFinite(v); }

/**
 * Normaliza la carga de una serie. Devuelve { load, errors }.
 * Acepta la forma dictada (por lado, por mano, pila) o el total, y rellena el resto.
 */
function normalizeLoad_(load, equipment) {
  const eq = Object.assign({}, DEFAULT_EQUIPMENT_, equipment || {});
  const errors = [];
  if (!load || typeof load !== 'object') return { load: null, errors: ['carga ausente'] };
  const out = Object.assign({}, load);
  const imp = out.implement;
  if (IMPLEMENTS_.indexOf(imp) < 0) return { load: null, errors: ['implemento inválido: ' + imp] };

  const check = (name, v, min, max) => {
    if (v === null || v === undefined) return;
    if (!isNum_(v) || v < min || v > max) errors.push(name + ' fuera de rango (' + min + '-' + max + ')');
  };

  if (imp === 'barbell' || imp === 'ezbar' || imp === 'smith') {
    const defBar = imp === 'ezbar' ? eq.ezBarKg : eq.barbellKg;
    if (!isNum_(out.barKg)) out.barKg = defBar;
    check('barKg', out.barKg, 0, 60);
    check('perSideKg', out.perSideKg, 0, 400);
    check('totalKg', out.totalKg, 0, 800);
    if (isNum_(out.perSideKg)) {
      const total = round2_(out.barKg + 2 * out.perSideKg);
      if (isNum_(out.totalKg) && Math.abs(out.totalKg - total) > 0.01) {
        errors.push('totalKg no cuadra con barKg + 2 × perSideKg');
      }
      out.totalKg = total;
    } else if (isNum_(out.totalKg)) {
      out.perSideKg = round2_((out.totalKg - out.barKg) / 2);
      if (out.perSideKg < 0) errors.push('totalKg menor que el peso de la barra');
    } else {
      errors.push('falta perSideKg o totalKg');
    }
  } else if (imp === 'dumbbell' || imp === 'kettlebell') {
    if (!isNum_(out.count)) out.count = imp === 'dumbbell' ? 2 : 1;
    if (out.count !== 1 && out.count !== 2) errors.push('count debe ser 1 o 2');
    check('perHandKg', out.perHandKg, 0, 150);
    if (isNum_(out.perHandKg)) out.totalKg = round2_(out.perHandKg * out.count);
    else errors.push('falta perHandKg');
  } else if (imp === 'machine' || imp === 'cable') {
    check('stackKg', out.stackKg, 0, 500);
    if (isNum_(out.stackKg)) out.totalKg = out.stackKg;
    else errors.push('falta stackKg');
  } else { // bodyweight
    if (!isNum_(out.addedKg)) out.addedKg = 0;
    check('addedKg', out.addedKg, 0, 200);
    out.totalKg = out.addedKg;
  }
  return { load: errors.length ? null : out, errors: errors };
}

/** Volumen de una serie en kg. Peso corporal: reps × (peso × factor + lastre). Calentamiento = 0. */
function setVolume_(set, bodyweightKg, bodyweightFactor) {
  if (!set || set.type === 'warmup' || !isNum_(set.reps) || !set.load) return 0;
  if (set.load.implement === 'bodyweight') {
    const factor = isNum_(bodyweightFactor) ? bodyweightFactor : 1;
    return round2_(set.reps * ((bodyweightKg || 0) * factor + (set.load.addedKg || 0)));
  }
  return round2_(set.reps * (set.load.totalKg || 0));
}

/** Valida una serie ya normalizada. Devuelve errores en español. */
function validateSet_(set, label, equipment) {
  const e = [];
  if (!set || typeof set !== 'object') return [label + ': serie inválida'];
  if (SET_TYPES_.indexOf(set.type) < 0) e.push(label + ': type inválido');
  pushIf_(e, checkNum_(set.reps, label + ' reps', 0, 100, true));
  if (set.reps === null || set.reps === undefined) e.push(label + ': reps es obligatorio');
  pushIf_(e, checkNum_(set.rir, label + ' rir', 0, 10, true));   // null = no mencionado
  pushIf_(e, checkNum_(set.restSec, label + ' restSec', 0, 3600, true));
  pushIf_(e, checkNum_(set.order, label + ' order', 0, 1000, true));
  if (set.side !== null && set.side !== undefined && ['left', 'right'].indexOf(set.side) < 0) e.push(label + ': side inválido');
  const n = normalizeLoad_(set.load, equipment);
  n.errors.forEach((m) => e.push(label + ': ' + m));
  return e;
}

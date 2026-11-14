// Funciones puras: convierten la salida del parser (contrato §6.2) en registros
// del modelo de datos (§4) y crean borradores vacíos para el modo manual.

const pad = (n) => String(n).padStart(2, '0');

/** ID con formato <prefijo>_<yyyyMMdd>_<hhmm>_<rand4>. Se genera una vez por borrador. */
export function uid(prefix, now = new Date()) {
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  const day = '' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate());
  return prefix + '_' + day + '_' + pad(now.getHours()) + pad(now.getMinutes()) + '_' + rand;
}

/** Identificador de ejercicio a partir del nombre: "Press banca" → "press_banca". */
export function slug(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

/** Masa muscular estimada con la fórmula de Boer (§4.5). */
export function boerMuscleMassKg(weightKg, heightCm, sex) {
  if (!num(weightKg) || !num(heightCm)) return null;
  const v = sex === 'female'
    ? 0.252 * weightKg + 0.473 * heightCm - 48.3
    : 0.407 * weightKg + 0.267 * heightCm - 19.2;
  return Math.round(v * 10) / 10;
}

function mapSets(sets) {
  return (sets || []).map((s) => ({
    type: s.type || 'working',
    reps: num(s.reps),
    weightKg: num(s.weightKg),
    rir: num(s.rir),
    restSec: num(s.restSec),
    durationSec: num(s.durationSec)
  }));
}

/**
 * intent + data del parser → { entity, record } listo para `commit`.
 * Devuelve null para intents que aún no tienen registro (query, plan, recomendación, unknown).
 * ctx: { date, timezone, transcript, profile: { sex, heightCm }, lastBodyweightKg }
 */
export function toCommit(intent, data, ctx) {
  const date = data.date || ctx.date;
  const base = {
    date,
    source: 'voice',
    transcript: ctx.transcript || '',
    notes: data.notes || ''
  };

  if (intent === 'log_strength' || intent === 'log_bodyweight') {
    const isBw = intent === 'log_bodyweight';
    const exercises = (data.exercises || []).map((ex) => {
      const item = {
        exerciseId: ex.exerciseId || slug(ex.exerciseName),
        name: ex.exerciseName || '',
        kind: isBw ? 'bodyweight' : 'strength',
        sets: mapSets(ex.sets),
        notes: ''
      };
      if (isBw) {
        item.bodyweightKg = num(ctx.lastBodyweightKg);
        item.addedWeightKg = num(ex.addedWeightKg);
      }
      return item;
    });
    return {
      entity: 'session',
      record: Object.assign({
        id: ctx.id || uid('s'),
        type: isBw ? 'bodyweight' : 'strength',
        startedAt: null,
        endedAt: null,
        exercises,
        cardio: []
      }, base)
    };
  }

  if (intent === 'log_cardio') {
    const cardio = (data.cardio || []).map((c) => ({
      exerciseId: c.exerciseId || slug(c.exerciseName),
      name: c.exerciseName || '',
      durationSec: num(c.durationSec),
      distanceM: num(c.distanceM),
      avgHr: num(c.avgHr),
      maxHr: null,
      zone: c.zone || null,
      rpe: num(c.rpe),
      notes: ''
    }));
    return {
      entity: 'session',
      record: Object.assign({
        id: ctx.id || uid('s'),
        type: 'cardio',
        startedAt: null,
        endedAt: null,
        exercises: [],
        cardio
      }, base)
    };
  }

  if (intent === 'log_meal') {
    const items = (data.items || []).map((it) => ({
      name: it.name || '',
      quantity: num(it.quantity),
      unit: it.unit || 'g',
      kcal: num(it.kcal),
      proteinG: num(it.proteinG),
      carbsG: num(it.carbsG),
      fatG: num(it.fatG),
      fiberG: num(it.fiberG),
      confidence: num(it.confidence)
    }));
    return {
      entity: 'meal',
      record: Object.assign({
        id: ctx.id || uid('m'),
        time: data.time || null,
        mealType: data.mealType || null,
        items
      }, base)
    };
  }

  if (intent === 'log_body') {
    let muscle = num(data.muscleMassKg);
    let muscleSource = 'manual';
    if (muscle === null) {
      muscle = boerMuscleMassKg(data.weightKg, ctx.profile && ctx.profile.heightCm, ctx.profile && ctx.profile.sex);
      if (muscle !== null) muscleSource = 'formula';
    }
    return {
      entity: 'body',
      record: Object.assign({
        weightKg: num(data.weightKg),
        bodyFatPct: num(data.bodyFatPct),
        muscleMassKg: muscle,
        muscleMassSource: muscle === null ? null : muscleSource,
        measurementsCm: data.measurementsCm || {}
      }, base)
    };
  }

  return null;
}

/** Borrador vacío para el modo manual, con la misma forma que produce toCommit. */
export function emptyDraft(intent, ctx) {
  const date = ctx.date;
  if (intent === 'log_strength' || intent === 'log_bodyweight') {
    const isBw = intent === 'log_bodyweight';
    return {
      entity: 'session',
      record: {
        id: uid('s'), date, type: isBw ? 'bodyweight' : 'strength', startedAt: null, endedAt: null,
        source: 'manual', transcript: '', notes: '',
        exercises: [{
          exerciseId: '', name: '', kind: isBw ? 'bodyweight' : 'strength',
          sets: [{ type: 'working', reps: null, weightKg: null, rir: null, restSec: null, durationSec: null }],
          notes: ''
        }],
        cardio: []
      }
    };
  }
  if (intent === 'log_cardio') {
    return {
      entity: 'session',
      record: {
        id: uid('s'), date, type: 'cardio', startedAt: null, endedAt: null,
        source: 'manual', transcript: '', notes: '',
        exercises: [],
        cardio: [{ exerciseId: '', name: '', durationSec: null, distanceM: null, avgHr: null, maxHr: null, zone: null, rpe: null, notes: '' }]
      }
    };
  }
  if (intent === 'log_meal') {
    return {
      entity: 'meal',
      record: {
        id: uid('m'), date, time: null, mealType: null, source: 'manual', transcript: '', notes: '',
        items: [{ name: '', quantity: null, unit: 'g', kcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null, confidence: 1 }]
      }
    };
  }
  return {
    entity: 'body',
    record: {
      date, weightKg: null, bodyFatPct: null, muscleMassKg: null, muscleMassSource: null,
      measurementsCm: {}, source: 'manual', transcript: '', notes: ''
    }
  };
}

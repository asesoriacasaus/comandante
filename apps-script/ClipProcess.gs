/**
 * Interpretación del dictado (PLAN 7.3). Parte pura: instrucciones, validación de lo que devuelve la IA,
 * conversión de eventos en series y operaciones de edición. La IA solo extrae lo dicho;
 * los kilos totales los calcula normalizeLoad_.
 */

const NUM_NULL_ = { type: 'NUMBER', nullable: true };
const CLIP_SCHEMA_ = { type: 'OBJECT', properties: {
  transcript: { type: 'STRING' },
  events: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
    type: { type: 'STRING' },
    exerciseName: { type: 'STRING', nullable: true },
    implement: { type: 'STRING', nullable: true },
    setType: { type: 'STRING', nullable: true },
    reps: { type: 'INTEGER', nullable: true },
    rir: { type: 'INTEGER', nullable: true },
    perSideKg: NUM_NULL_, perHandKg: NUM_NULL_, totalKg: NUM_NULL_, stackKg: NUM_NULL_, addedKg: NUM_NULL_,
    count: { type: 'INTEGER', nullable: true },
    repeatLast: { type: 'BOOLEAN' },
    unclear: { type: 'BOOLEAN', nullable: true },
    side: { type: 'STRING', nullable: true },
    text: { type: 'STRING', nullable: true }
  }, required: ['type', 'repeatLast'] } }
}, required: ['transcript', 'events'] };

const CLIP_SYSTEM_ = 'Eres el asistente de un diario de entrenamiento de pesas. Recibes el audio de un clip en español ' +
  'y un contexto (plan de hoy, ejercicio en curso y últimas series). Transcribe el audio en "transcript" y extrae en "events", ' +
  'en el orden en que se dicen, cada serie realizada ("type":"set"), cada molestia o dolor ("type":"pain", con "text") y cada ' +
  'comentario útil ("type":"comment", con "text"). Reglas: ' +
  '1) Solo extrae lo que se dice. NO calcules kilos totales ni inventes números: lo que falta va a null. ' +
  'Rellena totalKg solo si el usuario dice el peso total; si dice "20 a cada lado", perSideKg es 20 y totalKg es null (no sumes la barra). ' +
  'Un número seguido de "repeticiones", "reps" o "veces" son reps; un número con "kilos", "kg" o "a cada lado" es peso. ' +
  'Ejemplo: "press banca, 20 a cada lado, 8 repeticiones" es perSideKg 20 y reps 8, nunca reps 20. ' +
  '2) Barra: "20 a cada lado" es perSideKg 20; "barra sola" es perSideKg 0; si dice el peso total de la barra, ponlo en totalKg. ' +
  'Mancuernas: "de 15" son 15 kg por mano (perHandKg 15) y count 2; una sola mancuerna es count 1. ' +
  'Máquina o polea: stackKg con lo que marque la pila. Peso corporal: addedKg solo si hay lastre. ' +
  '3) "otra igual", "lo mismo", "otra serie" sin más datos: repeatLast true. ' +
  '4) RIR: "me quedaban dos" es 2; "al fallo" es 0; si no lo menciona, null. Nunca lo inventes. ' +
  '5) Si no nombra ejercicio, exerciseName es null (se asume el ejercicio en curso). Usa el nombre tal como lo dice. ' +
  '6) setType: "warmup" para calentamiento, "drop" para dropset o "bajé a", "failure" para al fallo, si no "working". ' +
  '7) implement: barbell, ezbar, dumbbell, kettlebell, machine, cable, bodyweight o smith, solo si se deduce; si no, null. ' +
  '8) Si el audio no contiene ninguna serie, devuelve events vacío. ' +
  '9) Gimnasio con ruido: hay música, otras voces, golpes de discos y máquinas. Ignora letras de canciones, anuncios y ' +
  'conversaciones ajenas; transcribe solo a quien habla cerca del micrófono dictando su entrenamiento. ' +
  '10) Habla andaluza: el usuario puede aspirar o comerse la s final y otras consonantes, sesear o cecear y abreviar. ' +
  'Interprétalo así: "do", "doh" = dos; "tre", "treh" = tres; "sei", "seih" = seis; "die", "dieh", "dié" = diez; ' +
  '"once", "doce", "quince", "veinte" igual aunque suenen recortados; "sinco", "zinco" = cinco; "kilo", "kilô", "kiloh" = kilos; ' +
  '"repe", "repeh", "repetisione" = repeticiones; "pa", "pa\'l" = para; "na" = nada; "mancuerna" puede sonar "mancuenna"; ' +
  '"polea" puede sonar "polé"; "me quedaban do" = RIR 2. Usa el contexto del plan (ejercicios y objetivos de reps y carga) ' +
  'para decidir entre números que suenan parecido (por ejemplo "dos" o "doce", "seis" o "siete"). ' +
  '11) Si un número o el ejercicio de una serie no se entiende con seguridad por el ruido o la pronunciación, NO lo adivines: ' +
  'pon ese dato a null y marca la serie con "unclear": true. Es mejor que el usuario lo complete a que se guarde un dato falso. ' +
  'Responde solo con el JSON pedido. ' +
  'Si no hay audio y recibes "transcripcionDelMovil", es lo que transcribió el reconocimiento de voz del iPhone: puede traer errores ' +
  '(números o palabras parecidas mal oídos, por ejemplo "presbanca" o "doce" por "dos"); interprétalo con el contexto del plan y ' +
  'pon en "transcript" ese mismo texto.';

function validateClipResponse_(o) {
  const e = [];
  if (!o || typeof o.transcript !== 'string') return ['falta transcript'];
  if (!Array.isArray(o.events)) return ['events debe ser una lista'];
  if (o.events.length > 40) e.push('demasiados eventos');
  const optNum = (v, name, min, max, int) => { if (v === null || v === undefined) return; if (typeof v !== 'number' || !isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) e.push(name + ' inválido'); };
  o.events.forEach((ev, i) => {
    const l = 'evento ' + (i + 1);
    if (['set', 'pain', 'comment'].indexOf(ev.type) < 0) e.push(l + ': type inválido');
    if (ev.implement !== null && ev.implement !== undefined && IMPLEMENTS_.indexOf(ev.implement) < 0) e.push(l + ': implement inválido');
    if (ev.setType !== null && ev.setType !== undefined && SET_TYPES_.indexOf(ev.setType) < 0) e.push(l + ': setType inválido');
    if (ev.side !== null && ev.side !== undefined && ['left', 'right'].indexOf(ev.side) < 0) e.push(l + ': side inválido');
    optNum(ev.reps, l + ' reps', 0, 100, true);
    optNum(ev.rir, l + ' rir', 0, 10, true);
    ['perSideKg', 'perHandKg', 'totalKg', 'stackKg', 'addedKg'].forEach((k) => optNum(ev[k], l + ' ' + k, 0, 800, false));
    optNum(ev.count, l + ' count', 1, 2, true);
  });
  return e;
}

function buildClipUser_(session, library) {
  const planned = (session.plannedExercises || []).map((p) => {
    const d = exerciseById_(p.exerciseId, library);
    return { id: p.exerciseId, nombre: p.name || (d && d.name), implementos: d ? d.implements : [],
      objetivo: { series: p.sets, reps: [p.repsMin, p.repsMax], carga: p.targetLoad || null } };
  });
  const exs = session.exercises || [];
  const cur = exs.length ? exs[exs.length - 1] : null;
  const recent = [];
  exs.forEach((x) => x.sets.forEach((s) => recent.push({ ejercicio: x.name, reps: s.reps, rir: s.rir, carga: s.load })));
  return { planDeHoy: planned, ejercicioEnCurso: cur ? cur.name : null, ultimasSeries: recent.slice(-3) };
}

/** Los números que la IA entendió, para enseñárselos al usuario junto al aviso. */
function heardOf_(ev) {
  if (!ev) return null;
  const out = {};
  ['reps', 'rir', 'perSideKg', 'perHandKg', 'totalKg', 'stackKg', 'addedKg'].forEach((k) => { if (isNum_(ev[k])) out[k] = ev[k]; });
  return out;
}

function hasLoadInfo_(ev) {
  return ['perSideKg', 'perHandKg', 'totalKg', 'stackKg', 'addedKg'].some((k) => isNum_(ev[k]));
}

/**
 * Convierte los eventos de un clip en series. Devuelve { exercises, pending, pain, warnings }.
 * Lo que no se puede resolver sin inventar (ejercicio desconocido, falta de repeticiones, carga inválida)
 * va a `pending`, nunca se guarda como serie.
 */
function eventsToSets_(events, session, ctx) {
  const lib = ctx.library;
  const eq = ctx.equipment;
  const clipId = ctx.clipId;
  const exercises = JSON.parse(JSON.stringify(session.exercises || []));
  const planned = session.plannedExercises || [];
  const pending = []; const pain = []; const warnings = [];
  let currentId = exercises.length ? exercises[exercises.length - 1].exerciseId : null;

  const nextPlanned = () => planned.find((p) => !exercises.some((x) => x.exerciseId === p.exerciseId && x.sets.length));
  const addPending = (reason, text, extra, ev) => pending.push(Object.assign({ clipId: clipId, reason: reason, text: String(text || '').slice(0, 200), heard: heardOf_(ev) }, extra || {}));

  events.forEach((ev) => {
    if (ev.type === 'pain') { pain.push({ clipId: clipId, text: String(ev.text || '').slice(0, 200), exerciseId: currentId }); return; }
    if (ev.type !== 'set') return;

    let def = null;
    if (ev.exerciseName) {
      def = findExercise_(ev.exerciseName, lib);
      if (!def) { addPending('unknown_exercise', ev.exerciseName, null, ev); return; }
    } else if (currentId) {
      def = exerciseById_(currentId, lib);
    } else {
      const np = nextPlanned();
      if (np) { def = exerciseById_(np.exerciseId, lib); warnings.push('assumed_exercise:' + np.exerciseId); }
    }
    if (!def) { addPending('no_exercise', ev.text || '', null, ev); return; }
    // La IA no lo oyó claro: mejor que el usuario lo complete con lo entendido a guardar un número falso.
    if (ev.unclear === true) { addPending('unclear', def.name, { exerciseId: def.id }, ev); return; }

    const entry = exercises.find((x) => x.exerciseId === def.id) || null;
    const last = entry && entry.sets.length ? entry.sets[entry.sets.length - 1] : null;
    const plan = planned.find((p) => p.exerciseId === def.id) || null;
    const flags = [];
    let load = null;
    let reps = isNum_(ev.reps) ? ev.reps : null;
    let rir = isNum_(ev.rir) ? ev.rir : null;
    let type = ev.setType || 'working';

    if (ev.repeatLast && !hasLoadInfo_(ev)) {
      if (!last) { addPending('nothing_to_repeat', def.name, { exerciseId: def.id }, ev); return; }
      load = last.load;
      if (reps === null) reps = last.reps;
      if (ev.rir === null || ev.rir === undefined) rir = last.rir;
      if (!ev.setType) type = last.type;
    } else if (hasLoadInfo_(ev)) {
      const implement = ev.implement || (last && last.load.implement) || (plan && plan.targetLoad && plan.targetLoad.implement) || def.implements[0];
      const raw = { implement: implement };
      ['perSideKg', 'perHandKg', 'totalKg', 'stackKg', 'addedKg', 'count'].forEach((k) => { if (isNum_(ev[k])) raw[k] = ev[k]; });
      if (last && last.load.implement === implement && isNum_(last.load.barKg)) raw.barKg = last.load.barKg;
      let n = normalizeLoad_(raw, eq, { inferBar: true });
      if (!n.load && isNum_(raw.perSideKg) && isNum_(raw.totalKg) && ['barbell', 'ezbar', 'smith'].indexOf(implement) >= 0) {
        // Los dos números no cuadran ni deduciendo la barra: se fía de "a cada lado" y se avisa.
        const raw2 = Object.assign({}, raw); delete raw2.totalKg;
        n = normalizeLoad_(raw2, eq);
        if (n.load) flags.push('total_ignored');
      }
      if (!n.load) { addPending('invalid_load', def.name + ': ' + n.errors.join(', '), { exerciseId: def.id }, ev); return; }
      load = n.load;
      if (load.barInferred) { flags.push('bar_inferred'); delete load.barInferred; }
    } else {
      const implement = ev.implement || (last && last.load.implement);
      if (last && (!implement || implement === last.load.implement)) { load = last.load; flags.push('inherited_load'); }
      else if (plan && plan.targetLoad && (!implement || implement === plan.targetLoad.implement)) { load = plan.targetLoad; flags.push('load_from_plan'); }
      else if ((implement || def.implements[0]) === 'bodyweight') load = normalizeLoad_({ implement: 'bodyweight' }, eq).load;
      else { addPending('missing_load', def.name, { exerciseId: def.id }, ev); return; }
    }
    if (reps === null) { addPending('missing_reps', def.name, { exerciseId: def.id }, ev); return; }

    let target = exercises.find((x) => x.exerciseId === def.id);
    if (!target) { target = { exerciseId: def.id, name: def.name, sets: [] }; exercises.push(target); }
    target.sets.push({ order: target.sets.length + 1, type: type, reps: reps, rir: rir, load: load, restSec: null,
      side: ev.side || null, clipId: clipId, at: ctx.at || null, notes: '', flags: flags });
    currentId = def.id;
  });
  return { exercises: exercises, pending: pending, pain: pain, warnings: warnings };
}

/**
 * Hora de una serie (para el reloj de descanso). Se acepta la del móvil si es una fecha ISO razonable
 * (no más de un día de diferencia); si no, la del servidor.
 */
function setTime_(at, nowMs) {
  const now = nowMs === undefined ? Date.now() : nowMs;
  const t = typeof at === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(at) ? Date.parse(at) : NaN;
  return new Date(!isNaN(t) && Math.abs(t - now) < 86400000 ? t : now).toISOString();
}

/** Traduce los errores de validación de una serie a frases para el usuario. */
function friendlySetError_(msg) {
  const m = String(msg || '').replace(/^serie:?\s*/, '');
  if (/^reps es obligatorio/.test(m)) return 'Faltan las repeticiones.';
  if (/^reps debe ser un entero/.test(m)) return 'Las repeticiones deben ser un número entero.';
  if (/^reps (fuera de rango|debe ser un número)/.test(m)) return 'Las repeticiones deben estar entre 0 y 100.';
  if (/^rir /.test(m)) return 'El RIR debe ser un número entero entre 0 y 10, o quedar vacío.';
  if (/^restSec /.test(m)) return 'El descanso no es válido.';
  if (/^order /.test(m)) return 'El orden de la serie no es válido.';
  if (/^type inválido/.test(m)) return 'El tipo de serie no es válido.';
  if (/^side inválido/.test(m)) return 'El lado no es válido.';
  return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? '' : '.');
}

/**
 * Pura salvo por mutar `s`. Cambia `de` por `a` en lo planificado: hereda series, repeticiones, RIR y descanso; la carga
 * del plan solo si el implemento habitual coincide. Lo ya hecho se queda con el ejercicio original salvo con `moverSeries`
 * (corregir un registro). Igual que aplicarOpLocal en js/lib/ediciones.js.
 */
function swapExercise_(s, de, a, moverSeries) {
  s.plannedExercises = s.plannedExercises || [];
  const i = s.plannedExercises.findIndex((p) => p.exerciseId === de.id);
  const yaEsta = s.plannedExercises.some((p) => p.exerciseId === a.id);
  if (i >= 0 && yaEsta) s.plannedExercises.splice(i, 1);
  else if (i >= 0) {
    const p = s.plannedExercises[i];
    const carga = p.targetLoad && (a.implements || []).indexOf(p.targetLoad.implement) >= 0 ? p.targetLoad : null;
    s.plannedExercises[i] = Object.assign({}, p, { exerciseId: a.id, name: a.name, targetLoad: carga, swappedFrom: de.id });
  } else if (!yaEsta) {
    s.plannedExercises.push({ exerciseId: a.id, name: a.name, sets: 3, repsMin: 8, repsMax: 12, targetRir: 2, restSec: 90, targetLoad: null, swappedFrom: de.id });
  }
  if (moverSeries) {
    const x = (s.exercises || []).find((q) => q.exerciseId === de.id);
    if (x) {
      let y = s.exercises.find((q) => q.exerciseId === a.id);
      if (!y) { y = { exerciseId: a.id, name: a.name, sets: [] }; s.exercises.splice(s.exercises.indexOf(x), 0, y); }
      y.sets = y.sets.concat(x.sets).sort((m, n) => String(m.at || '').localeCompare(String(n.at || '')));
      y.sets.forEach((st, k) => { st.order = k + 1; });
      s.exercises = s.exercises.filter((q) => q !== x);
    }
  }
  s.swaps = (s.swaps || []).concat([{ from: de.id, to: a.id, at: new Date().toISOString(), moved: !!moverSeries }]);
  return s;
}

/** Operaciones de edición manual sobre una sesión. Devuelve una copia nueva o lanza VALIDATION. */
function applyEditOp_(session, op, eq, library) {
  const s = JSON.parse(JSON.stringify(session));
  const fail = (m) => { throw { code: 'VALIDATION', message: m }; };
  s.exercises = s.exercises || [];
  const findEx = () => s.exercises.find((x) => x.exerciseId === op.exerciseId) || fail('ejercicio no encontrado');
  const reindex = (x) => x.sets.forEach((st, i) => { st.order = i + 1; });
  const checkSet = (st) => { const errs = validateSet_(st, 'serie', eq); if (errs.length) fail(errs.map(friendlySetError_).join(' ')); };

  if (op.op === 'update') {
    const x = findEx();
    const st = x.sets.find((q) => q.order === op.order) || fail('serie no encontrada');
    const p = op.patch || {};
    if (p.reps !== undefined) st.reps = p.reps;
    if (p.rir !== undefined) st.rir = p.rir;
    if (p.type !== undefined) st.type = p.type;
    if (p.load) {
      const raw = Object.assign({}, p.load);
      delete raw.totalKg;
      const n = normalizeLoad_(Object.assign({}, st.load, raw, { totalKg: undefined }), eq);
      if (!n.load) fail(n.errors.join('; '));
      st.load = n.load;
    }
    st.flags = [];
    checkSet(st);
  } else if (op.op === 'delete') {
    const x = findEx();
    const i = x.sets.findIndex((q) => q.order === op.order);
    if (i < 0) fail('serie no encontrada');
    x.sets.splice(i, 1);
    reindex(x);
    if (!x.sets.length) s.exercises = s.exercises.filter((q) => q !== x);
  } else if (op.op === 'add') {
    const def = exerciseById_(op.exerciseId, library) || fail('ejercicio desconocido');
    let x = s.exercises.find((q) => q.exerciseId === def.id);
    if (!x) { x = { exerciseId: def.id, name: def.name, sets: [] }; s.exercises.push(x); }
    const n = normalizeLoad_(op.set && op.set.load, eq);
    if (!n.load) fail(n.errors.join('; '));
    const st = { order: x.sets.length + 1, type: (op.set && op.set.type) || 'working', reps: op.set && op.set.reps,
      rir: op.set && op.set.rir !== undefined ? op.set.rir : null, load: n.load, restSec: null, side: null, clipId: null, at: setTime_(op.at), notes: '', flags: [] };
    checkSet(st);
    x.sets.push(st);
    // Al completar un pendiente a mano, se resuelve en el mismo paso.
    if (Number.isInteger(op.dismissPending)) {
      s.pending = s.pending || [];
      if (op.dismissPending < 0 || op.dismissPending >= s.pending.length) fail('pendiente no encontrado');
      s.pending.splice(op.dismissPending, 1);
    }
  } else if (op.op === 'swap') {
    // Cambiar un ejercicio por otro equivalente (máquina ocupada, falta de espacio...). Ver swapExercise_.
    const de = exerciseById_(op.from, library) || fail('ejercicio desconocido');
    const a = exerciseById_(op.to, library) || fail('ejercicio desconocido');
    if (de.id === a.id) fail('elige un ejercicio distinto');
    swapExercise_(s, de, a, !!op.moveSets);
  } else if (op.op === 'dismiss_pending') {
    s.pending = s.pending || [];
    if (!Number.isInteger(op.index) || op.index < 0 || op.index >= s.pending.length) fail('pendiente no encontrado');
    s.pending.splice(op.index, 1);
  } else {
    fail('operación desconocida');
  }
  return s;
}

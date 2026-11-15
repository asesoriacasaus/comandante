/**
 * Revisión de la sesión (PLAN 6.3 y 9). Parte pura: compara lo hecho con el plan y con la última vez,
 * lista lo que no cuadra y valida el guardado. La IA solo redacta el mensaje; ningún número sale de ella.
 */

function nonWarmup_(sets) { return (sets || []).filter((s) => s.type !== 'warmup'); }

function heaviest_(sets) {
  let best = null;
  nonWarmup_(sets).forEach((s) => { if (s.load && (!best || s.load.totalKg > best.totalKg)) best = s.load; });
  return best;
}

function exerciseVolume_(ex, def, bodyweightKg) {
  return nonWarmup_(ex.sets).reduce((acc, s) => acc + setVolume_(s, bodyweightKg, def && def.bodyweightFactor), 0);
}

/**
 * session: sesión a revisar. prev: última sesión hecha de la misma clave del ciclo (o null).
 * Devuelve { summary, exercises, missing, issues }.
 */
function buildReview_(session, prev, library, opts) {
  opts = opts || {};
  const bw = opts.bodyweightKg || null;
  const planned = session.plannedExercises || [];
  const exs = session.exercises || [];
  const issues = [];

  const exercises = exs.map((ex) => {
    const def = exerciseById_(ex.exerciseId, library);
    const p = planned.find((q) => q.exerciseId === ex.exerciseId) || null;
    const prevEx = prev ? (prev.exercises || []).find((q) => q.exerciseId === ex.exerciseId) : null;
    const work = nonWarmup_(ex.sets);
    const top = heaviest_(ex.sets);
    const reps = work.map((s) => s.reps);
    const rirs = work.filter((s) => isNum_(s.rir)).map((s) => s.rir);
    const out = {
      exerciseId: ex.exerciseId, name: ex.name, doneSets: work.length, plannedSets: p ? p.sets : null,
      repsMin: reps.length ? Math.min.apply(null, reps) : null, repsMax: reps.length ? Math.max.apply(null, reps) : null,
      avgRir: rirs.length ? round2_(rirs.reduce((a, b) => a + b, 0) / rirs.length) : null,
      rirUnknown: work.length - rirs.length, topLoad: top, plannedLoad: p ? p.targetLoad : null,
      volumeKg: round2_(exerciseVolume_(ex, def, bw)), inPlan: !!p, vsPlanKg: null, vsLast: null
    };
    if (top && p && p.targetLoad && p.targetLoad.implement === top.implement) out.vsPlanKg = round2_(top.totalKg - p.targetLoad.totalKg);
    const prevTop = prevEx ? heaviest_(prevEx.sets) : null;
    if (prevEx) {
      const pv = round2_(exerciseVolume_(prevEx, def, bw));
      out.vsLast = { topKg: prevTop ? prevTop.totalKg : null, volumeKg: pv,
        deltaKg: top && prevTop && top.implement === prevTop.implement ? round2_(top.totalKg - prevTop.totalKg) : null,
        volumePct: pv > 0 ? Math.round((out.volumeKg - pv) / pv * 100) : null };
    }
    if (planned.length && !p) issues.push({ type: 'unplanned', name: ex.name });
    if (p && out.doneSets < p.sets) issues.push({ type: 'fewer_sets', name: ex.name, done: out.doneSets, planned: p.sets });
    return out;
  });

  const doneIds = exs.map((x) => x.exerciseId);
  const missing = planned.filter((p) => doneIds.indexOf(p.exerciseId) < 0).map((p) => ({ exerciseId: p.exerciseId, name: p.name, sets: p.sets }));
  missing.forEach((m) => issues.push({ type: 'missing', name: m.name, planned: m.sets }));

  (session.pending || []).forEach((p) => issues.push({ type: 'pending', reason: p.reason, text: p.text }));
  const inh = [];
  const fromPlan = [];
  exs.forEach((x) => (x.sets || []).forEach((s) => {
    if ((s.flags || []).indexOf('inherited_load') >= 0 && inh.indexOf(x.name) < 0) inh.push(x.name);
    if ((s.flags || []).indexOf('load_from_plan') >= 0 && fromPlan.indexOf(x.name) < 0) fromPlan.push(x.name);
  }));
  if (inh.length) issues.push({ type: 'inherited_load', names: inh });
  if (fromPlan.length) issues.push({ type: 'load_from_plan', names: fromPlan });
  const rirUnknown = exercises.reduce((a, e) => a + e.rirUnknown, 0);
  if (rirUnknown) issues.push({ type: 'rir_unknown', n: rirUnknown });
  (session.painFlags || []).forEach((p) => issues.push({ type: 'pain', text: p.text }));

  const metrics = computeSessionMetrics_(session, { bodyweightKg: bw, library: library });
  return { summary: metrics, exercises: exercises, missing: missing, issues: issues, hasPrevious: !!prev };
}

/** Errores que impiden guardar la sesión como hecha. */
function validateForSave_(session, today, equipment) {
  const e = [];
  const pending = (session.pending || []).length;
  if (pending) e.push('Quedan ' + pending + ' elemento(s) pendientes: añade la serie a mano o descártalos.');
  const sets = (session.exercises || []).reduce((a, x) => a + nonWarmup_(x.sets).length, 0);
  if (sets === 0) e.push('No hay ninguna serie de trabajo registrada.');
  const candidate = Object.assign({}, session, { status: 'done', endedAt: session.endedAt || new Date().toISOString() });
  validateSession_(candidate, today, equipment).forEach((m) => e.push(m));
  return e;
}

/** Texto de cierre cuando la IA no responde. Solo usa datos calculados. */
function neutralReviewMessage_(review) {
  const s = review.summary;
  let m = 'Sesión cerrada: ' + s.workingSets + ' series de trabajo y ' + Math.round(s.totalVolumeKg) + ' kg de volumen.';
  if (review.missing.length) m += ' Quedaron sin hacer: ' + review.missing.map((x) => x.name).join(', ') + '.';
  if (review.issues.some((i) => i.type === 'pain')) m += ' Anotaste una molestia: si persiste, baja la carga o consulta antes de seguir.';
  return m;
}

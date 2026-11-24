/**
 * Descanso real entre series (PLAN 17.1, opción A). El usuario registra cada serie justo al terminarla, así que la hora de
 * registro (`at`) es el FINAL de la serie. El inicio no se conoce: se estima restando lo que dura la serie (repeticiones × segundos
 * por repetición). El descanso de una serie es entonces su inicio estimado menos el final de la anterior. Se recalcula entero
 * en cada cambio de la sesión (series nuevas, ediciones, borrados), así siempre es coherente.
 */
const REST_MAX_SEC_ = 900;       // más de 15 min entre series ya no es un descanso (se fue, cambió de plan...)
const SEC_PER_REP_DEFAULT_ = 4;

/** Hora (ms) de una serie: la suya o, en series antiguas, la del clip que la creó. null si no se sabe. */
function setMs_(set, session) {
  const at = set && set.at ? Date.parse(set.at) : NaN;
  if (!isNaN(at)) return at;
  const clip = set && set.clipId ? (session.clips || []).find((c) => c.id === set.clipId) : null;
  const ts = clip ? Date.parse(clip.ts) : NaN;
  return isNaN(ts) ? null : ts;
}

const REST_MIN_SEC_ = 60;        // menos de 1 minuto entre series no es posible en la práctica: serie apuntada tarde o a mano

/**
 * Pura salvo por mutar `restSec` y `restImputed` de las series. Devuelve la sesión.
 * Cada serie recibe un entero de segundos, o null si no se puede saber: la primera de la sesión, una sin hora o un hueco de más
 * de 15 minutos. Si el cálculo da menos de 1 minuto (o negativo: dos series del mismo clip, series metidas a mano de golpe),
 * se pone a la fuerza el descanso habitual: el medio de ese ejercicio en el histórico, si no el medio general, si no el del plan.
 * Esas series llevan `restImputed: true` y no cuentan para el histórico. Sin ninguna referencia, se queda en null.
 * `hist` = { porEjercicio: { id: s }, general: s } (de restHistory_), opcional.
 */
function applyRestSecs_(session, secPerRep, hist) {
  const spr = isNum_(secPerRep) && secPerRep > 0 ? secPerRep : SEC_PER_REP_DEFAULT_;
  const h = hist || {};
  const plan = {};
  (session.plannedExercises || []).forEach((p) => { if (isNum_(p.restSec) && p.restSec > 0) plan[p.exerciseId] = p.restSec; });
  const habitual = (id) => (h.porEjercicio && isNum_(h.porEjercicio[id]) ? h.porEjercicio[id] : isNum_(h.general) ? h.general : isNum_(plan[id]) ? plan[id] : null);
  const lista = [];
  (session.exercises || []).forEach((x, i) => (x.sets || []).forEach((s, j) => {
    s.restSec = null;
    delete s.restImputed;
    const ms = setMs_(s, session);
    if (ms !== null) lista.push({ set: s, ms: ms, orden: i * 1000 + j, ex: x.exerciseId });
  }));
  lista.sort((a, b) => a.ms - b.ms || a.orden - b.orden);
  for (let k = 1; k < lista.length; k++) {
    const hueco = (lista[k].ms - lista[k - 1].ms) / 1000;
    if (hueco > REST_MAX_SEC_) continue;
    const dur = (isNum_(lista[k].set.reps) ? lista[k].set.reps : 0) * spr;
    const rest = hueco - dur;
    if (rest >= REST_MIN_SEC_) { lista[k].set.restSec = Math.round(rest); continue; }
    const forzado = habitual(lista[k].ex);
    if (forzado !== null) { lista[k].set.restSec = Math.round(forzado); lista[k].set.restImputed = true; }
  }
  return session;
}

/** Pura: descanso medio real (sin los puestos a la fuerza) por ejercicio y general, de otras sesiones no descartadas. */
function restHistory_(sessions, excludeId) {
  const por = {}; let n = 0; let suma = 0;
  (sessions || []).forEach((s) => {
    if (!s || s.id === excludeId || s.status === 'discarded') return;
    (s.exercises || []).forEach((x) => (x.sets || []).forEach((st) => {
      if (!isNum_(st.restSec) || st.restImputed || st.restSec < REST_MIN_SEC_) return;
      const e = por[x.exerciseId] || (por[x.exerciseId] = { n: 0, suma: 0 });
      e.n++; e.suma += st.restSec; n++; suma += st.restSec;
    }));
  });
  const porEjercicio = {};
  Object.keys(por).forEach((id) => { if (por[id].n >= 2) porEjercicio[id] = Math.round(por[id].suma / por[id].n); });
  return { porEjercicio: porEjercicio, general: n >= 3 ? Math.round(suma / n) : null };
}

/** Pura: descanso medio (s) de todas las series con descanso conocido, o null. */
function avgRestSec_(session) {
  let n = 0; let suma = 0;
  (session.exercises || []).forEach((x) => (x.sets || []).forEach((s) => { if (isNum_(s.restSec)) { n++; suma += s.restSec; } }));
  return n ? Math.round(suma / n) : null;
}

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

/**
 * Pura salvo por mutar `restSec` de las series. Devuelve la sesión.
 * Cada serie recibe un entero de segundos, o null si no se puede saber: la primera de la sesión, una sin hora, un hueco de más de
 * 15 minutos o un resultado negativo (por ejemplo, dos series dictadas en el mismo clip comparten hora).
 */
function applyRestSecs_(session, secPerRep) {
  const spr = isNum_(secPerRep) && secPerRep > 0 ? secPerRep : SEC_PER_REP_DEFAULT_;
  const lista = [];
  (session.exercises || []).forEach((x, i) => (x.sets || []).forEach((s, j) => {
    s.restSec = null;
    const ms = setMs_(s, session);
    if (ms !== null) lista.push({ set: s, ms: ms, orden: i * 1000 + j });
  }));
  lista.sort((a, b) => a.ms - b.ms || a.orden - b.orden);
  for (let k = 1; k < lista.length; k++) {
    const dur = (isNum_(lista[k].set.reps) ? lista[k].set.reps : 0) * spr * 1000;
    const rest = (lista[k].ms - dur - lista[k - 1].ms) / 1000;
    if (rest >= 0 && rest <= REST_MAX_SEC_) lista[k].set.restSec = Math.round(rest);
  }
  return session;
}

/** Pura: descanso medio (s) de todas las series con descanso conocido, o null. */
function avgRestSec_(session) {
  let n = 0; let suma = 0;
  (session.exercises || []).forEach((x) => (x.sets || []).forEach((s) => { if (isNum_(s.restSec)) { n++; suma += s.restSec; } }));
  return n ? Math.round(suma / n) : null;
}

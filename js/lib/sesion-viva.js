// Cuentas de la pantalla Sesión que no tocan la interfaz: descanso y objetivo de cada ejercicio. Funciones puras.
import { formatClock, formatRest, formatLoad } from './format.js';

export const DESCANSO_MAX_SEC = 15 * 60;   // más allá ya no es un descanso entre series: se deja de contar

/** Hora (ms) de una serie: la que guarda el servidor o, en series antiguas, la del clip que la creó. */
export function horaSerie(set, session) {
  const at = set && set.at ? Date.parse(set.at) : NaN;
  if (!isNaN(at)) return at;
  const clip = set && set.clipId ? (session.clips || []).find((c) => c.id === set.clipId) : null;
  const ts = clip ? Date.parse(clip.ts) : NaN;
  return isNaN(ts) ? null : ts;
}

/** { ts, exerciseId } de la última serie registrada con hora conocida. */
export function ultimaSerie(session) {
  let best = null;
  (session.exercises || []).forEach((x) => (x.sets || []).forEach((s) => {
    const ts = horaSerie(s, session);
    if (ts !== null && (!best || ts > best.ts)) best = { ts, exerciseId: x.exerciseId };
  }));
  return best;
}

/** Texto del reloj de descanso y si ya se puede empezar la siguiente serie. */
export function descanso(session, nowMs) {
  const l = ultimaSerie(session);
  if (!l) return { texto: 'Descanso: registra tu primera serie', listo: false };
  const plan = (session.plannedExercises || []).find((p) => p.exerciseId === l.exerciseId);
  const objetivo = plan && plan.restSec ? plan.restSec : 0;
  const sec = Math.max(0, (nowMs - l.ts) / 1000);
  if (sec > DESCANSO_MAX_SEC) return { texto: 'Descanso: más de 15 min desde la última serie', listo: true };
  if (objetivo && sec >= objetivo) return { texto: 'Listo: ' + formatClock(sec) + ' de descanso (objetivo ' + formatRest(objetivo) + ')', listo: true };
  return { texto: 'Descanso ' + formatClock(sec) + (objetivo ? ' de ' + formatRest(objetivo) : ''), listo: false };
}

/** "Serie 3 de 4 · objetivo 8-10 rep · RIR 2 · 15 kg por lado" para un ejercicio del plan, o null si no está en el plan. */
export function objetivo(session, exerciseId, hechas) {
  const p = (session.plannedExercises || []).find((q) => q.exerciseId === exerciseId);
  if (!p) return null;
  const n = hechas === undefined ? 0 : hechas;
  const partes = [n >= p.sets ? 'Series del plan completadas (' + n + ' de ' + p.sets + ')' : 'Serie ' + (n + 1) + ' de ' + p.sets];
  if (n < p.sets) {
    partes.push('objetivo ' + (p.repsMin === p.repsMax ? p.repsMin : p.repsMin + '-' + p.repsMax) + ' rep');
    if (p.targetRir !== undefined && p.targetRir !== null) partes.push('RIR ' + p.targetRir);
    if (p.targetLoad) partes.push(formatLoad(p.targetLoad));
  }
  return partes.join(' · ');
}

/** Series efectivas (sin calentamiento) de un ejercicio de la sesión. */
export function seriesHechas(x) {
  return ((x && x.sets) || []).filter((s) => s.type !== 'warmup').length;
}

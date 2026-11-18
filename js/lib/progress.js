// Cuentas de la pantalla Progreso. Funciones puras.
import { weekStart } from './diary.js';

/** 1RM estimado (Epley). Por encima de 12 repeticiones deja de ser fiable y no se calcula. */
export function epley(kg, reps) {
  if (!(kg > 0) || !(reps >= 1) || reps > 12) return null;
  return Math.round(kg * (reps === 1 ? 1 : 1 + reps / 30) * 10) / 10;
}

/** Mejor 1RM estimado de una lista de series (sin calentamientos ni peso corporal). */
export function bestE1rm(sets) {
  let best = null;
  for (const s of sets || []) {
    if (s.type === 'warmup' || !s.load || s.load.implement === 'bodyweight') continue;
    const v = epley(s.load.totalKg, s.reps);
    if (v !== null && (best === null || v > best)) best = v;
  }
  return best;
}

/** Mejor 1RM de un ejercicio de sesión: ya calculado en el resumen del servidor (e1rm) o a partir de sus series. */
export function bestOf(x) {
  return x && 'e1rm' in x ? (x.e1rm ?? null) : bestE1rm(x && x.sets);
}

/** Ejercicios con al menos un 1RM estimable, del más frecuente al menos. */
export function exerciseList(sessions) {
  const m = {};
  for (const s of sessions) for (const x of s.exercises || []) {
    if (bestOf(x) === null) continue;
    m[x.exerciseId] = m[x.exerciseId] || { id: x.exerciseId, name: x.name, count: 0 };
    m[x.exerciseId].count++;
  }
  return Object.values(m).sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
}

/** [{ date, value }] del mejor 1RM estimado del ejercicio en cada sesión hecha. */
export function e1rmSeries(sessions, exerciseId) {
  const out = [];
  for (const s of [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (s.status !== 'done') continue;
    for (const x of s.exercises || []) {
      if (x.exerciseId !== exerciseId) continue;
      const v = bestOf(x);
      if (v !== null) out.push({ date: s.date, value: v });
    }
  }
  return out;
}

/** Semanas (lunes) de las últimas `n`, de la más antigua a la actual. */
export function lastWeeks(todayIso, n) {
  const [y, m, d] = weekStart(todayIso).split('-').map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, d - 7 * (n - 1 - i))).toISOString().slice(0, 10));
}

/** { semana: { grupo: series } } y { semana: kg } para las últimas `n` semanas. */
export function weeklyTables(sessions, todayIso, n = 8) {
  const weeks = lastWeeks(todayIso, n);
  const groups = {}; const volume = {};
  weeks.forEach((w) => { groups[w] = {}; volume[w] = 0; });
  for (const s of sessions) {
    if (s.status !== 'done') continue;
    const w = weekStart(s.date);
    if (!(w in groups)) continue;
    const by = (s.metrics || {}).setsByGroup || {};
    for (const g of Object.keys(by)) groups[w][g] = Math.round(((groups[w][g] || 0) + by[g]) * 10) / 10;
    volume[w] += (s.metrics || {}).totalVolumeKg || 0;
  }
  weeks.forEach((w) => { volume[w] = Math.round(volume[w]); });
  return { weeks, groups, volume };
}

/** Clase de color de una celda de series por semana y grupo (objetivo 10-16 series). */
export function cellClass(sets) {
  if (!sets) return 'c0';
  if (sets < 8) return 'c1';
  if (sets <= 16) return 'c2';
  return 'c3';
}

/** Número de semana ISO de una fecha 'AAAA-MM-DD'. */
export function isoWeek(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dia = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - dia + 3);
  const primerJueves = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((dt - primerJueves) / 86400000 - 3 + ((primerJueves.getUTCDay() + 6) % 7)) / 7);
}

/**
 * Matriz de las últimas `n` semanas: por semana, el volumen de cada día (lunes a domingo), el total y el cambio
 * frente a la semana anterior. Para dibujar puntos cuyo tamaño es el volumen del día.
 */
export function matrizSemanal(sessions, todayIso, n = 6) {
  const semanas = lastWeeks(todayIso, n + 1);
  const filas = semanas.map((w) => ({ week: w, num: isoWeek(w), days: [0, 0, 0, 0, 0, 0, 0], total: 0, sesiones: 0, cambio: null }));
  const por = Object.fromEntries(filas.map((f) => [f.week, f]));
  for (const s of sessions) {
    if (s.status !== 'done') continue;
    const f = por[weekStart(s.date)];
    if (!f) continue;
    const [y, m, d] = s.date.split('-').map(Number);
    const dia = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    const v = (s.metrics || {}).totalVolumeKg || 0;
    f.days[dia] += v; f.total += v; f.sesiones += 1;
  }
  filas.forEach((f, i) => {
    f.total = Math.round(f.total);
    const prev = i > 0 ? filas[i - 1].total : 0;
    f.cambio = prev > 0 ? Math.round((f.total - prev) / prev * 100) : null;
  });
  const max = Math.max(1, ...filas.flatMap((f) => f.days));
  // La semana actual aún no ha terminado: compararla con una completa engaña.
  const ultima = filas[filas.length - 1];
  ultima.enCurso = true; ultima.cambio = null;
  return { filas: filas.slice(1), max };
}

/** Las `n` mejores marcas (1RM estimado) de un ejercicio, una por sesión, de la mejor a la peor. */
export function records(sessions, exerciseId, n = 3) {
  return e1rmSeries(sessions, exerciseId).sort((a, b) => b.value - a.value || (a.date < b.date ? -1 : 1)).slice(0, n);
}

/** Últimos 28 días frente a los 28 anteriores: volumen, sesiones y cambio del volumen en %. */
export function comparativa(sessions, todayIso) {
  const [y, m, d] = todayIso.split('-').map(Number);
  const hace = (k) => new Date(Date.UTC(y, m - 1, d - k)).toISOString().slice(0, 10);
  const a = hace(27); const b = hace(55);
  const sum = (desde, hasta) => sessions.filter((s) => s.status === 'done' && s.date >= desde && s.date <= hasta)
    .reduce((o, s) => ({ volumen: o.volumen + ((s.metrics || {}).totalVolumeKg || 0), sesiones: o.sesiones + 1 }), { volumen: 0, sesiones: 0 });
  const ahora = sum(a, todayIso); const antes = sum(b, hace(28));
  return { volumen: Math.round(ahora.volumen), sesiones: ahora.sesiones, volumenAntes: Math.round(antes.volumen), sesionesAntes: antes.sesiones,
    cambio: antes.volumen > 0 ? Math.round((ahora.volumen - antes.volumen) / antes.volumen * 100) : null };
}

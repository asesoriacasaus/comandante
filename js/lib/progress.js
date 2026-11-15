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

/** Ejercicios con al menos un 1RM estimable, del más frecuente al menos. */
export function exerciseList(sessions) {
  const m = {};
  for (const s of sessions) for (const x of s.exercises || []) {
    if (bestE1rm(x.sets) === null) continue;
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
      const v = bestE1rm(x.sets);
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

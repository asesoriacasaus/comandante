// Utilidades del Diario: resumen de sesiones y totales por semana. Funciones puras.

/** Lunes de la semana de una fecha ISO (la semana empieza en lunes). */
export function weekStart(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const back = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - back);
  return dt.toISOString().slice(0, 10);
}

export function sortSessions(list) {
  return [...list].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : String(b.startedAt || '') < String(a.startedAt || '') ? -1 : 1));
}

/** { sets, volumeKg, durationMin } de una sesión hecha, a partir de sus métricas. */
export function summarizeSession(s) {
  const m = s.metrics || {};
  return { sets: m.workingSets || 0, volumeKg: Math.round(m.totalVolumeKg || 0), durationMin: m.durationMin ?? null, avgRestSec: typeof m.avgRestSec === 'number' ? m.avgRestSec : null };
}

/** Totales de las sesiones hechas de la semana que empieza en `start`. */
export function weekTotals(sessions, start) {
  const out = { sessions: 0, sets: 0, volumeKg: 0 };
  sessions.filter((s) => s.status === 'done' && weekStart(s.date) === start).forEach((s) => {
    const t = summarizeSession(s);
    out.sessions += 1; out.sets += t.sets; out.volumeKg += t.volumeKg;
  });
  return out;
}

/** Separa miles con punto: 3200 → "3.200". */
export function thousands(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

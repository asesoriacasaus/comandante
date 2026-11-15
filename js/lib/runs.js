// Utilidades de carreras. Las conversiones coinciden con parseDuration_ y parsePace_ de apps-script/Runs.gs (hay un test que lo comprueba).
import { weekStart } from './diary.js';

/** "00:14:51" | "1:05:03" | "14:51" → segundos. null si no se entiende. */
export function parseDuration(text) {
  const m = /^\s*(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\s*$/.exec(String(text || ''));
  if (!m) return null;
  const h = Number(m[1] || 0); const min = Number(m[2]); const s = Number(m[3]);
  if (s > 59 || (m[1] !== undefined && min > 59)) return null;
  return h * 3600 + min * 60 + s;
}

/** `7'35"` | "7:35" → segundos por km. */
export function parsePace(text) {
  const m = /^\s*(\d{1,2})\s*(?:['’′:])\s*(\d{1,2})\s*(?:["”″])?\s*(?:\/\s*km)?\s*$/.exec(String(text || ''));
  if (!m) return null;
  return Number(m[2]) > 59 ? null : Number(m[1]) * 60 + Number(m[2]);
}

const p2 = (n) => String(n).padStart(2, '0');

export function formatDuration(sec) {
  if (typeof sec !== 'number') return '';
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = Math.round(sec % 60);
  return h > 0 ? h + ':' + p2(m) + ':' + p2(s) : m + ':' + p2(s);
}

export function formatPace(secPerKm) {
  if (typeof secPerKm !== 'number') return '';
  return Math.floor(secPerKm / 60) + ':' + p2(Math.round(secPerKm % 60)) + ' /km';
}

export function paceFrom(distanceKm, durationSec) {
  return distanceKm > 0 && durationSec > 0 ? Math.round(durationSec / distanceKm) : null;
}

/** "2026-10-31" + "11:17" + 60 → "2026-10-31T11:17:00+01:00". */
export function isoWithOffset(date, time, offsetMinutes) {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const a = Math.abs(offsetMinutes);
  return date + 'T' + time + ':00' + sign + p2(Math.floor(a / 60)) + ':' + p2(a % 60);
}

export function weekKm(runs, todayIso) {
  const start = weekStart(todayIso);
  return Math.round(runs.filter((r) => weekStart(r.date) === start).reduce((a, r) => a + (r.distanceKm || 0), 0) * 10) / 10;
}

export function isLongRun(r) { return (r.durationSec || 0) >= 3600 || (r.distanceKm || 0) >= 10; }

export function warningText(flag) {
  return ({ pace_from_data: 'el ritmo se ha calculado con la distancia y la duración', pace_mismatch: 'el ritmo leído no cuadra con la distancia y la duración: revísalo',
    maxhr_below_avg: 'el pulso máximo era menor que el medio y se ha descartado' })[flag] || '';
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekStart, sortSessions, summarizeSession, weekTotals, thousands } from '../js/lib/diary.js';

test('la semana empieza en lunes', () => {
  assert.equal(weekStart('2026-11-16'), '2026-11-16'); // lunes
  assert.equal(weekStart('2026-11-22'), '2026-11-16'); // domingo
  assert.equal(weekStart('2026-11-15'), '2026-11-09'); // domingo anterior
  assert.equal(weekStart('2027-01-01'), '2026-12-28'); // cruce de año
});
test('orden: más reciente primero', () => {
  const l = sortSessions([{ date: '2026-11-10' }, { date: '2026-11-16', startedAt: 'a' }, { date: '2026-11-16', startedAt: 'b' }]);
  assert.deepEqual(l.map((s) => s.date + (s.startedAt || '')), ['2026-11-16b', '2026-11-16a', '2026-11-10']);
});
test('resumen y totales semanales', () => {
  const s = (date, sets, vol, status = 'done') => ({ date, status, metrics: { workingSets: sets, totalVolumeKg: vol, durationMin: 60 } });
  assert.deepEqual(summarizeSession(s('2026-11-16', 12, 3200.4)), { sets: 12, volumeKg: 3200, durationMin: 60 });
  assert.deepEqual(summarizeSession({}), { sets: 0, volumeKg: 0, durationMin: null });
  const list = [s('2026-11-16', 12, 3200), s('2026-11-18', 10, 2800), s('2026-11-10', 8, 1000), s('2026-11-17', 5, 999, 'discarded')];
  assert.deepEqual(weekTotals(list, '2026-11-16'), { sessions: 2, sets: 22, volumeKg: 6000 });
  assert.deepEqual(weekTotals(list, '2026-12-01'), { sessions: 0, sets: 0, volumeKg: 0 });
});
test('miles', () => { assert.equal(thousands(3200), '3.200'); assert.equal(thousands(950), '950'); assert.equal(thousands(1234567), '1.234.567'); });

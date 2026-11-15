import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysBetween, seriesOf, movingAverage, goalProgress, timeline, scalePoints } from '../js/lib/charts.js';

test('días entre fechas', () => {
  assert.equal(daysBetween('2026-11-14', '2027-05-14'), 181);
  assert.equal(daysBetween('2026-11-15', '2026-11-14'), -1);
});
test('serie: filtra no numéricos y ordena', () => {
  const s = seriesOf([{ date: '2026-11-10', weightKg: 88 }, { date: '2026-11-03', weightKg: 89 }, { date: '2026-11-05' }], (r) => r.weightKg);
  assert.deepEqual(s, [{ date: '2026-11-03', value: 89 }, { date: '2026-11-10', value: 88 }]);
});
test('media de 7 días', () => {
  const pts = [{ date: '2026-11-01', value: 90 }, { date: '2026-11-03', value: 88 }, { date: '2026-11-07', value: 89 }, { date: '2026-11-09', value: 87 }];
  const m = movingAverage(pts, 7);
  assert.equal(m[0].value, 90);
  assert.equal(m[1].value, 89);                    // (90+88)/2
  assert.equal(m[2].value, 89);                    // 1-7 nov: (90+88+89)/3
  assert.equal(m[3].value, 88);                    // 3-9 nov: (88+89+87)/3
});
test('progreso hacia el objetivo', () => {
  assert.deepEqual(goalProgress(87, 88.5, 90), { pct: 50, remaining: 1.5 });
  assert.deepEqual(goalProgress(100, 96, 90), { pct: 40, remaining: -6 });   // cintura bajando hacia 90
  assert.equal(goalProgress(87, 86, 90).pct, -33);                            // en dirección contraria
  assert.equal(goalProgress(87, 91, 90).pct, 133);
  assert.deepEqual(goalProgress(90, 90, 90), { pct: 100, remaining: 0 });
  assert.equal(goalProgress(null, 88, 90), null);
});
test('línea temporal del plan', () => {
  assert.deepEqual(timeline('2026-11-14', '2027-05-14', '2026-12-14'), { total: 181, elapsed: 30, left: 151, pct: 17 });
  assert.equal(timeline('2026-11-14', '2027-05-14', '2026-11-01').elapsed, 0);
  assert.equal(timeline('2026-11-14', '2027-05-14', '2027-09-01').left, 0);
  assert.equal(timeline(null, '2027-05-14', '2026-11-14'), null);
});
test('coordenadas dentro del rectángulo', () => {
  const p = scalePoints([{ date: '2026-11-01', value: 90 }, { date: '2026-11-11', value: 80 }], { width: 320, height: 130 });
  assert.equal(p[0].x, 8); assert.equal(p[1].x, 312);
  assert.ok(p[0].y < p[1].y, 'el valor más alto va más arriba');
  assert.ok(p.every((q) => q.y >= 8 && q.y <= 122));
  assert.deepEqual(scalePoints([], { width: 100, height: 100 }), []);
  assert.equal(scalePoints([{ date: '2026-11-01', value: 5 }], { width: 100, height: 100 })[0].x, 50);
});

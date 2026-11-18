import { test } from 'node:test';
import assert from 'node:assert/strict';
import { epley, bestE1rm, exerciseList, e1rmSeries, lastWeeks, weeklyTables, cellClass } from '../js/lib/progress.js';

const L = (kg) => ({ implement: 'barbell', totalKg: kg });
test('1RM estimado (Epley)', () => {
  assert.equal(epley(60, 10), 80); assert.equal(epley(100, 1), 100); assert.equal(epley(60, 3), 66);
  assert.equal(epley(60, 13), null); assert.equal(epley(0, 5), null); assert.equal(epley(60, 0), null);
});
test('mejor 1RM de una lista de series', () => {
  const sets = [{ type: 'warmup', reps: 5, load: L(100) }, { type: 'working', reps: 10, load: L(60) }, { type: 'working', reps: 6, load: L(70) }, { type: 'working', reps: 8, load: { implement: 'bodyweight', totalKg: 10 } }];
  assert.equal(bestE1rm(sets), 84); // 70 × (1 + 6/30); el calentamiento y el peso corporal no cuentan
  assert.equal(bestE1rm([]), null); assert.equal(bestE1rm(undefined), null);
});
test('lista y serie de un ejercicio', () => {
  const sessions = [
    { status: 'done', date: '2026-11-10', exercises: [{ exerciseId: 'press_banca', name: 'Press banca', sets: [{ type: 'working', reps: 10, load: L(60) }] }, { exerciseId: 'dominadas', name: 'Dominadas', sets: [{ type: 'working', reps: 8, load: { implement: 'bodyweight', totalKg: 0 } }] }] },
    { status: 'done', date: '2026-11-03', exercises: [{ exerciseId: 'press_banca', name: 'Press banca', sets: [{ type: 'working', reps: 10, load: L(55) }] }] },
    { status: 'discarded', date: '2026-11-12', exercises: [{ exerciseId: 'press_banca', name: 'Press banca', sets: [{ type: 'working', reps: 10, load: L(99) }] }] }
  ];
  assert.deepEqual(exerciseList(sessions).map((e) => e.id), ['press_banca']);
  assert.deepEqual(e1rmSeries(sessions, 'press_banca'), [{ date: '2026-11-03', value: 73.3 }, { date: '2026-11-10', value: 80 }]);
  assert.deepEqual(e1rmSeries(sessions, 'sentadilla'), []);
});
test('semanas y tablas', () => {
  assert.deepEqual(lastWeeks('2026-11-19', 3), ['2026-11-02', '2026-11-09', '2026-11-16']);
  const t = weeklyTables([
    { status: 'done', date: '2026-11-17', metrics: { setsByGroup: { chest: 10, triceps: 4.5 }, totalVolumeKg: 3000 } },
    { status: 'done', date: '2026-11-19', metrics: { setsByGroup: { chest: 2 }, totalVolumeKg: 500.4 } },
    { status: 'done', date: '2026-11-03', metrics: { setsByGroup: { back: 9 }, totalVolumeKg: 2000 } },
    { status: 'discarded', date: '2026-11-18', metrics: { setsByGroup: { chest: 99 }, totalVolumeKg: 99999 } },
    { status: 'done', date: '2026-01-05', metrics: { setsByGroup: { chest: 5 }, totalVolumeKg: 1 } }
  ], '2026-11-19', 3);
  assert.deepEqual(t.groups['2026-11-16'], { chest: 12, triceps: 4.5 }); assert.equal(t.volume['2026-11-16'], 3500);
  assert.deepEqual(t.groups['2026-11-02'], { back: 9 }); assert.deepEqual(t.groups['2026-11-09'], {});
  assert.equal(Object.keys(t.groups).length, 3);
});
test('color de celda', () => { assert.equal(cellClass(0), 'c0'); assert.equal(cellClass(5), 'c1'); assert.equal(cellClass(8), 'c2'); assert.equal(cellClass(16), 'c2'); assert.equal(cellClass(20), 'c3'); });

test('Progreso funciona igual con el resumen ligero del servidor (e1rm ya calculado, sin series)', async () => {
  const { exerciseList, e1rmSeries, bestOf } = await import('../js/lib/progress.js');
  const resumen = [
    { id: 'a', date: '2026-11-03', status: 'done', exercises: [{ exerciseId: 'pb', name: 'Press banca', sets: 4, e1rm: 76 }, { exerciseId: 'dom', name: 'Dominadas', sets: 3, e1rm: null }] },
    { id: 'b', date: '2026-11-10', status: 'done', exercises: [{ exerciseId: 'pb', name: 'Press banca', sets: 4, e1rm: 80 }] }];
  assert.deepEqual(exerciseList(resumen).map((e) => e.id), ['pb']);
  assert.deepEqual(e1rmSeries(resumen, 'pb'), [{ date: '2026-11-03', value: 76 }, { date: '2026-11-10', value: 80 }]);
  assert.equal(bestOf({ sets: [{ type: 'working', reps: 1, load: { implement: 'barbell', totalKg: 100 } }] }), 100, 'formato completo sigue valiendo');
});

test('matriz semanal, récords y comparativa de 4 semanas', async () => {
  const { matrizSemanal, records, comparativa, isoWeek } = await import('../js/lib/progress.js');
  assert.equal(isoWeek('2026-11-16'), 47); assert.equal(isoWeek('2026-01-01'), 1); assert.equal(isoWeek('2027-01-01'), 53);
  const S = (date, vol, e1rm) => ({ date, status: 'done', metrics: { totalVolumeKg: vol }, exercises: [{ exerciseId: 'pb', name: 'Press banca', e1rm }] });
  const ses = [S('2026-11-09', 1000, 70), S('2026-11-11', 3000, 75), S('2026-11-16', 2000, 72), S('2026-11-18', 4000, 78), S('2026-10-01', 500, 60), S('2026-10-20', 1500, 74)];
  const m = matrizSemanal(ses, '2026-11-18', 3);
  assert.deepEqual(m.filas.map((f) => f.week), ['2026-11-02', '2026-11-09', '2026-11-16']);
  assert.deepEqual(m.filas[2].days, [2000, 0, 4000, 0, 0, 0, 0]);
  assert.equal(m.filas[2].cambio, null, 'la semana en curso no se compara'); assert.equal(m.filas[2].enCurso, true);
  assert.equal(matrizSemanal(ses, '2026-11-22', 3).filas[2].total, 6000);
  assert.equal(matrizSemanal(ses, '2026-11-25', 3).filas[1].cambio, 50, 'semana cerrada frente a la anterior'); assert.equal(m.filas[1].cambio, null, 'sin semana anterior con volumen');
  assert.equal(m.max, 4000);
  assert.deepEqual(records(ses, 'pb').map((r) => r.value), [78, 75, 74]);
  const c = comparativa(ses, '2026-11-18');
  assert.deepEqual([c.volumen, c.sesiones, c.volumenAntes, c.sesionesAntes, c.cambio], [10000, 4, 2000, 2, 400]);
});

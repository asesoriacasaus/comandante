import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horaSerie, ultimaSerie, descanso, objetivo, seriesHechas } from '../js/lib/sesion-viva.js';

const T = Date.parse('2026-11-16T18:00:00Z');
const ses = (sets, extra = {}) => Object.assign({ plannedExercises: [{ exerciseId: 'pb', name: 'Press banca', sets: 4, repsMin: 8, repsMax: 10, targetRir: 2, restSec: 120,
  targetLoad: { implement: 'barbell', perSideKg: 15, totalKg: 50 } }], clips: [{ id: 'c1', ts: '2026-11-16T17:50:00Z' }],
  exercises: [{ exerciseId: 'pb', name: 'Press banca', sets }] }, extra);

test('la hora de la serie: la suya, o la de su clip en series antiguas', () => {
  const s = ses([{ at: '2026-11-16T17:59:00Z' }, { clipId: 'c1' }, {}]);
  assert.equal(horaSerie(s.exercises[0].sets[0], s), Date.parse('2026-11-16T17:59:00Z'));
  assert.equal(horaSerie(s.exercises[0].sets[1], s), Date.parse('2026-11-16T17:50:00Z'));
  assert.equal(horaSerie(s.exercises[0].sets[2], s), null);
  assert.equal(ultimaSerie(s).ts, Date.parse('2026-11-16T17:59:00Z'));
});

test('las series a mano (sin clip) también cuentan para el descanso', () => {
  const s = ses([{ clipId: 'c1' }, { at: '2026-11-16T17:59:30Z', clipId: null }]);
  assert.equal(descanso(s, T).texto, 'Descanso 0:30 de 2 min');
  assert.equal(descanso(s, T).listo, false);
});

test('al llegar al objetivo avisa de que ya se puede; pasado un rato largo deja de contar', () => {
  const s = ses([{ at: '2026-11-16T17:57:30Z' }]);
  assert.deepEqual(descanso(s, T), { texto: 'Listo: 2:30 de descanso (objetivo 2 min)', listo: true });
  assert.equal(descanso(ses([{ at: '2026-11-16T17:00:00Z' }]), T).texto, 'Descanso: más de 15 min desde la última serie');
  assert.equal(descanso(ses([]), T).texto, 'Descanso: registra tu primera serie');
});

test('objetivo de la siguiente serie según el plan', () => {
  const s = ses([]);
  assert.equal(objetivo(s, 'pb', 2), 'Serie 3 de 4 · objetivo 8-10 rep · RIR 2 · 15 kg por lado · 50 kg en total');
  assert.equal(objetivo(s, 'pb', 4), 'Series del plan completadas (4 de 4)');
  assert.equal(objetivo(s, 'otro', 0), null);
  assert.equal(seriesHechas({ sets: [{ type: 'warmup' }, { type: 'working' }, { type: 'drop' }] }), 2);
});

test('ejercicio activo = el de la serie más reciente, no el último de la lista', async () => {
  const { ejercicioActivo, totalSeries, descansoMedio, relojDescanso } = await import('../js/lib/sesion-viva.js');
  const s = { clips: [], exercises: [
    { exerciseId: 'a', sets: [{ at: '2026-11-23T18:00:00Z' }, { at: '2026-11-23T18:10:00Z' }] },   // volvió a este ejercicio al final
    { exerciseId: 'b', sets: [{ at: '2026-11-23T18:05:00Z' }] }] };
  assert.equal(ejercicioActivo(s), 'a');
  assert.equal(ejercicioActivo({ exercises: [{ exerciseId: 'x', sets: [{}] }, { exerciseId: 'y', sets: [{}] }] }), 'y', 'sin horas: el último');
  assert.equal(ejercicioActivo({ exercises: [] }), null);
  assert.equal(totalSeries(s), 3);
  assert.equal(descansoMedio([{ restSec: 100 }, { restSec: 125 }, { restSec: null }, {}]), 113);
  assert.equal(descansoMedio([{}]), null);
  assert.equal(relojDescanso(112), '1:52'); assert.equal(relojDescanso(null), '');
});

import { otraSesionConTrabajo } from '../js/lib/sesion-viva.js';

test('otraSesionConTrabajo: no deja cambiar a una sesión vacía si el móvil graba otra de hoy con series', () => {
  const nueva = { id: 's_b', date: '2026-06-20', status: 'planned' };
  const viva = { id: 's_a', date: '2026-06-20', status: 'in_progress', exercises: [{ sets: [{ reps: 10 }] }] };
  assert.equal(otraSesionConTrabajo(nueva, 's_a', viva), viva);
  assert.equal(otraSesionConTrabajo(nueva, 's_a', Object.assign({}, viva, { status: 'review' })).id, 's_a');
  assert.equal(otraSesionConTrabajo(nueva, 's_a', Object.assign({}, viva, { exercises: [] })), null, 'sin series, nada que proteger');
  assert.equal(otraSesionConTrabajo(nueva, 's_a', Object.assign({}, viva, { date: '2026-06-19' })), null, 'la de ayer no cuenta');
  assert.equal(otraSesionConTrabajo(nueva, 's_a', Object.assign({}, viva, { status: 'done' })), null, 'ya guardada');
  assert.equal(otraSesionConTrabajo(viva, 's_a', viva), null, 'es la misma');
  assert.equal(otraSesionConTrabajo(nueva, '', viva), null);
  assert.equal(otraSesionConTrabajo(nueva, 's_c', viva), null, 'la copia local es de otra sesión');
});

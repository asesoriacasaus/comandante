import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarOpLocal, vistaLocal, crearColaEdiciones, totalAproximado, esFalloDeRed } from '../js/lib/ediciones.js';

const memoria = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const base = () => ({ id: 's1', pending: [{ reason: 'invalid_load' }, { reason: 'unknown_exercise' }],
  exercises: [{ exerciseId: 'pb', name: 'Press banca', sets: [{ order: 1, type: 'working', reps: 8, rir: 2, load: { implement: 'barbell', barKg: 20, perSideKg: 20, totalKg: 60 }, flags: [] }] }] });

test('una serie añadida sin conexión se ve al momento, con total aproximado y marcada', () => {
  const s0 = base();
  const s = aplicarOpLocal(s0, { op: 'add', opId: 'o_1', exerciseId: 'ext', at: 'T', set: { reps: 12, rir: null, load: { implement: 'cable', stackKg: 35 } }, dismissPending: 1 }, { ext: 'Extensión en polea' });
  assert.equal(s.exercises[1].name, 'Extensión en polea');
  assert.deepEqual(s.exercises[1].sets[0].load, { implement: 'cable', stackKg: 35, totalKg: 35 });
  assert.equal(s.exercises[1].sets[0].local, true);
  assert.equal(s.pending.length, 1);
  assert.equal(s0.exercises.length, 1, 'no toca el original');
});

test('editar, borrar y descartar pendientes en local', () => {
  let s = aplicarOpLocal(base(), { op: 'update', exerciseId: 'pb', order: 1, patch: { reps: 10, load: { perSideKg: 22.5 } } });
  assert.equal(s.exercises[0].sets[0].reps, 10); assert.equal(s.exercises[0].sets[0].load.totalKg, 65);
  s = vistaLocal(base(), [{ op: 'add', exerciseId: 'pb', set: { reps: 8, load: { implement: 'barbell', perSideKg: 20 } } }, { op: 'delete', exerciseId: 'pb', order: 1 }]);
  assert.equal(s.exercises[0].sets.length, 1); assert.equal(s.exercises[0].sets[0].order, 1);
  s = aplicarOpLocal(base(), { op: 'delete', exerciseId: 'pb', order: 1 });
  assert.equal(s.exercises.length, 0, 'sin series, fuera el ejercicio');
  assert.equal(aplicarOpLocal(base(), { op: 'dismiss_pending', index: 0 }).pending.length, 1);
});

test('totales aproximados por implemento', () => {
  assert.equal(totalAproximado({ implement: 'dumbbell', perHandKg: 15 }), 30);
  assert.equal(totalAproximado({ implement: 'kettlebell', perHandKg: 16, count: 1 }), 16);
  assert.equal(totalAproximado({ implement: 'bodyweight' }), 0);
  assert.equal(totalAproximado({ implement: 'ezbar', barKg: 10, perSideKg: 5 }), 20);
});

test('la cola envía en orden, se para sin red y quita las rechazadas', async () => {
  const c = crearColaEdiciones(memoria());
  c.poner('s1', { opId: 'o_a' }); c.poner('s1', { opId: 'o_b' }); c.poner('s1', { opId: 'o_c' }); c.poner('s2', { opId: 'o_z' });
  const vistos = []; const rechazos = [];
  let r = await c.enviar('s1', async (op) => { vistos.push(op.opId); if (op.opId === 'o_b') { const e = new Error('sin red'); e.code = 'NETWORK'; throw e; } return { id: op.opId }; });
  assert.deepEqual(vistos, ['o_a', 'o_b']); assert.equal(r.parado, true);
  assert.deepEqual(c.pendientes('s1').map((o) => o.opId), ['o_b', 'o_c'], 'lo no enviado sigue, en orden');
  r = await c.enviar('s1', async (op) => { if (op.opId === 'o_b') { const e = new Error('Las repeticiones deben ser un número entero.'); e.code = 'VALIDATION'; throw e; } return { id: op.opId }; }, (op, e) => rechazos.push(op.opId + ': ' + e.message));
  assert.deepEqual(rechazos, ['o_b: Las repeticiones deben ser un número entero.']);
  assert.deepEqual(r, { sesion: { id: 'o_c' }, parado: false });
  assert.deepEqual(c.pendientes('s1'), []); assert.equal(c.pendientes('s2').length, 1, 'otras sesiones intactas');
  assert.ok(esFalloDeRed({ code: 'TIMEOUT' }) && !esFalloDeRed({ code: 'VALIDATION' }));
});

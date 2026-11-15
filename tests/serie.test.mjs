import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valoresDeHeard, construirSerie, valorDeCarga, IMPLEMENT_ES } from '../js/lib/serie.js';

test('lo que la IA entendió → qué precargar', () => {
  assert.deepEqual(valoresDeHeard({ perSideKg: 20, reps: 8 }, ['barbell', 'dumbbell']), { implement: 'barbell', valor: 20, reps: 8, rir: '' });
  assert.deepEqual(valoresDeHeard({ perSideKg: 12 }, ['dumbbell']), { implement: 'dumbbell', valor: 12, reps: '', rir: '' }, '"a cada lado" con mancuernas = por mano');
  assert.equal(valoresDeHeard({ perHandKg: 15 }, ['dumbbell', 'cable']).implement, 'dumbbell');
  assert.deepEqual(valoresDeHeard({ stackKg: 45, reps: 12, rir: 2 }, ['cable', 'machine']), { implement: 'cable', valor: 45, reps: 12, rir: 2 });
  assert.deepEqual(valoresDeHeard({ totalKg: 30 }, ['machine']), { implement: 'machine', valor: 30, reps: '', rir: '' }, 'un total en máquina es la pila');
  assert.equal(valoresDeHeard({ totalKg: 60 }, ['barbell']).valor, '', 'un total con barra no se precarga como kilos por lado');
  assert.equal(valoresDeHeard({ addedKg: 10 }, ['bodyweight']).implement, 'bodyweight');
  assert.deepEqual(valoresDeHeard(null, ['barbell']), { implement: 'barbell', valor: '', reps: '', rir: '' });
  assert.equal(valoresDeHeard({ stackKg: 40 }, ['barbell']).implement, 'barbell', 'si el ejercicio no admite ese implemento, se queda el habitual');
});
test('construir la serie', () => {
  assert.deepEqual(construirSerie({ tipo: 'working', reps: '8', rir: '2', valor: '20', implement: 'barbell' }), { set: { type: 'working', reps: 8, rir: 2, load: { implement: 'barbell', perSideKg: 20 } } });
  assert.deepEqual(construirSerie({ tipo: 'warmup', reps: '12', rir: '', valor: '12,5', implement: 'dumbbell' }).set, { type: 'warmup', reps: 12, rir: null, load: { implement: 'dumbbell', perHandKg: 12.5 } });
  assert.deepEqual(construirSerie({ tipo: 'working', reps: '10', rir: '', valor: '45', implement: 'cable' }).set.load, { implement: 'cable', stackKg: 45 });
  assert.deepEqual(construirSerie({ tipo: 'working', reps: '6', rir: '', valor: '', implement: 'bodyweight' }).set.load, { implement: 'bodyweight', addedKg: 0 }, 'sin lastre: 0');
  assert.equal(construirSerie({ tipo: 'inventado', reps: '5', rir: '', valor: '10', implement: 'machine' }).set.type, 'working');
});
test('errores claros y en español', () => {
  const e = (o) => construirSerie({ tipo: 'working', reps: '8', rir: '', valor: '20', implement: 'barbell', ...o }).error;
  assert.match(e({ reps: '' }), /repeticiones/); assert.match(e({ reps: '2,5' }), /repeticiones/); assert.match(e({ reps: '0' }), /repeticiones/); assert.match(e({ reps: '101' }), /repeticiones/);
  assert.match(e({ rir: '11' }), /RIR/); assert.match(e({ rir: 'abc' }), /RIR/);
  assert.match(e({ valor: '' }), /kilos \(kg por lado\)/); assert.match(e({ valor: '-3' }), /entre 0 y 800/); assert.match(e({ valor: '900' }), /entre 0 y 800/);
  assert.equal(e({}), undefined);
});
test('valor de una carga', () => {
  assert.equal(valorDeCarga({ implement: 'barbell', perSideKg: 20, totalKg: 60 }), 20); assert.equal(valorDeCarga({ implement: 'cable', stackKg: 45 }), 45);
  assert.equal(valorDeCarga(null), ''); assert.equal(valorDeCarga({ implement: 'dumbbell' }), '');
});
test('nombres de implementos', () => { assert.equal(IMPLEMENT_ES.barbell, 'Barra'); assert.equal(Object.keys(IMPLEMENT_ES).length, 8); });

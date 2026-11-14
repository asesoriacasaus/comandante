import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupsEs, formatLoad, formatReps, formatRest, parseNum } from '../js/lib/format.js';

test('grupos en español', () => {
  assert.equal(groupsEs(['chest', 'triceps']), 'pecho y tríceps');
  assert.equal(groupsEs(['quads', 'glutes']), 'cuádriceps y glúteos');
});
test('cargas', () => {
  assert.equal(formatLoad({ implement: 'barbell', perSideKg: 20, totalKg: 60 }), '20 kg por lado · 60 kg en total');
  assert.equal(formatLoad({ implement: 'barbell', perSideKg: 21.25, totalKg: 62.5 }), '21,25 kg por lado · 62,5 kg en total');
  assert.equal(formatLoad({ implement: 'barbell', perSideKg: 0, totalKg: 20 }), 'Barra sola · 20 kg');
  assert.equal(formatLoad({ implement: 'dumbbell', perHandKg: 15, count: 2 }), '15 kg por mano');
  assert.equal(formatLoad({ implement: 'dumbbell', perHandKg: 24, count: 1 }), '24 kg por mancuerna');
  assert.equal(formatLoad({ implement: 'machine', stackKg: 70 }), 'Pila 70 kg');
  assert.equal(formatLoad({ implement: 'bodyweight', addedKg: 10 }), '+10 kg de lastre');
  assert.equal(formatLoad({ implement: 'bodyweight', addedKg: 0 }), 'Peso corporal');
  assert.equal(formatLoad(null), 'Carga por definir');
});
test('repeticiones y descanso', () => {
  assert.equal(formatReps({ repsMin: 8, repsMax: 10 }), '8-10');
  assert.equal(formatReps({ repsMin: 10, repsMax: 10 }), '10');
  assert.equal(formatRest(120), '2 min');
  assert.equal(formatRest(90), '1:30 min');
  assert.equal(formatRest(0), '');
});
test('números con coma', () => {
  assert.equal(parseNum('87,5'), 87.5);
  assert.equal(parseNum(' 174 '), 174);
  assert.equal(parseNum(''), null);
  assert.equal(parseNum('abc'), null);
});

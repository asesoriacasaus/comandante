import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alternativas, costeEjercicio } from '../js/lib/alternativas.js';
import { aplicarOpLocal } from '../js/lib/ediciones.js';

const LISTA = [
  { id: 'cruce_poleas', name: 'Cruce en poleas', implements: ['cable'], primary: ['chest'], secondary: ['shoulders'], kind: 'isolation' },
  { id: 'aperturas', name: 'Aperturas', implements: ['dumbbell', 'cable', 'machine'], primary: ['chest'], secondary: ['shoulders'], kind: 'isolation' },
  { id: 'pec_deck', name: 'Pec deck', implements: ['machine'], primary: ['chest'], secondary: ['shoulders'], kind: 'isolation' },
  { id: 'flexiones', name: 'Flexiones', implements: ['bodyweight'], primary: ['chest'], secondary: ['triceps', 'shoulders'], kind: 'compound' },
  { id: 'press_banca', name: 'Press banca', implements: ['barbell', 'dumbbell'], primary: ['chest'], secondary: ['shoulders', 'triceps'], kind: 'compound' },
  { id: 'curl_barra', name: 'Curl con barra', implements: ['barbell'], primary: ['biceps'], secondary: [], kind: 'isolation' }];

test('alternativas: mismos músculos, de más a menos material, sin el propio ejercicio', () => {
  const a = alternativas('cruce_poleas', LISTA).map((x) => x.ejercicio.id);
  assert.deepEqual(a, ['pec_deck', 'press_banca', 'aperturas', 'flexiones']);
  assert.ok(!a.includes('curl_barra') && !a.includes('cruce_poleas'));
  const costes = alternativas('cruce_poleas', LISTA).map((x) => x.coste);
  assert.deepEqual(costes, [...costes].sort((x, y) => y - x), 'orden de coste descendente');
  assert.equal(costeEjercicio(LISTA[3]), 1);
  assert.match(alternativas('cruce_poleas', LISTA).find((x) => x.ejercicio.id === 'aperturas').motivo, /como el original · menos material/);
  assert.deepEqual(alternativas('no_existe', LISTA), []);
});

test('aplicarOpLocal swap: igual que el servidor (plan heredado; series movidas solo si se pide)', () => {
  const s = { plannedExercises: [{ exerciseId: 'cruce_poleas', name: 'Cruce en poleas', sets: 3, repsMin: 12, repsMax: 15, targetRir: 2, restSec: 75, targetLoad: { implement: 'cable', totalKg: 20 } }],
    exercises: [{ exerciseId: 'cruce_poleas', name: 'Cruce en poleas', sets: [{ order: 1, reps: 12, at: '2026-06-20T10:00:00Z' }] }] };
  const r = aplicarOpLocal(s, { op: 'swap', from: 'cruce_poleas', to: 'flexiones' }, { flexiones: 'Flexiones' });
  assert.equal(r.plannedExercises[0].exerciseId, 'flexiones');
  assert.equal(r.plannedExercises[0].sets, 3);
  assert.equal(r.plannedExercises[0].targetLoad, null);
  assert.equal(r.exercises[0].exerciseId, 'cruce_poleas');
  const m = aplicarOpLocal(s, { op: 'swap', from: 'cruce_poleas', to: 'flexiones', moveSets: true }, { flexiones: 'Flexiones' });
  assert.equal(m.exercises.length, 1); assert.equal(m.exercises[0].exerciseId, 'flexiones'); assert.equal(m.exercises[0].sets[0].order, 1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadHistory, saveHistory, turnsFor, turnsForAudio, MAX_HISTORY, KEY, QUICK_PROMPTS } from '../js/lib/chat.js';

const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
const u = (t) => ({ role: 'user', text: t }); const c = (t) => ({ role: 'coach', text: t });

test('guardar y cargar el historial', () => {
  const st = mem();
  saveHistory(st, [u('hola'), c('¡Compatriota!')]);
  assert.deepEqual(loadHistory(st), [u('hola'), c('¡Compatriota!')]);
  const many = Array.from({ length: 50 }, (_, i) => u('m' + i));
  saveHistory(st, many); assert.equal(loadHistory(st).length, MAX_HISTORY);
});
test('historial corrupto o vacío', () => {
  const st = mem();
  assert.deepEqual(loadHistory(st), []);
  st.setItem(KEY, 'no es json'); assert.deepEqual(loadHistory(st), []);
  st.setItem(KEY, '{"a":1}'); assert.deepEqual(loadHistory(st), []);
  st.setItem(KEY, JSON.stringify([u('ok'), { role: 'robot', text: 'x' }, { role: 'user', text: '' }, null, c('vale')]));
  assert.deepEqual(loadHistory(st), [u('ok'), c('vale')]);
  assert.deepEqual(loadHistory({ getItem() { throw new Error('bloqueado'); } }), []);
  assert.doesNotThrow(() => saveHistory({ setItem() { throw new Error('lleno'); } }, [u('x')]));
});
test('turnos para el servidor', () => {
  assert.deepEqual(turnsFor([], 'hola'), [u('hola')]);
  assert.deepEqual(turnsFor([u('a'), c('b')], 'c'), [u('a'), c('b'), u('c')]);
  assert.deepEqual(turnsFor([c('bienvenido'), u('a'), c('b')], 'c'), [u('a'), c('b'), u('c')], 'empieza por el usuario');
  assert.deepEqual(turnsFor([u('a'), c('b'), u('sin respuesta')], 'c'), [u('a'), c('b'), u('c')], 'una pregunta sin respuesta no rompe la alternancia');
  const long = Array.from({ length: 30 }, (_, i) => (i % 2 ? c('c' + i) : u('u' + i)));
  const t = turnsFor(long, 'fin');
  assert.ok(t.length <= 11 && t[0].role === 'user' && t[t.length - 1].text === 'fin');
  for (let i = 1; i < t.length; i++) assert.notEqual(t[i].role, t[i - 1].role);
});
test('turnos con audio', () => {
  assert.deepEqual(turnsForAudio([u('a'), c('b')]), [u('a'), c('b')]);
  assert.deepEqual(turnsForAudio([u('a'), c('b'), u('colgada')]), [u('a'), c('b')]);
  assert.deepEqual(turnsForAudio([]), []);
});
test('preguntas rápidas', () => { assert.ok(QUICK_PROMPTS.length >= 4 && QUICK_PROMPTS.every((q) => q.length < 100)); });

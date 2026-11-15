// hoyLoad junta el estado y la sesión de hoy en una sola llamada y aísla los fallos de la sesión.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

function ctxWith(stubs) {
  const ctx = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Planning.gs'), 'utf8'), ctx, { filename: 'Planning.gs' });
  Object.assign(ctx, stubs);
  return ctx;
}
const run = (ctx) => vm.runInContext('hoyLoad()', ctx);

test('todo bien: estado y sesión en una sola respuesta', () => {
  let llamadas = 0;
  const r = run(ctxWith({ planState: () => ({ onboarded: true, cycle: { sessions: [] }, settings: { secreto: 1 } }), planToday: () => { llamadas++; return { session: { id: 's' }, source: 'existing' }; } }));
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { onboarded: true, hasCycle: true, today: { session: { id: 's' }, source: 'existing' }, todayError: null });
  assert.equal(llamadas, 1);
});
test('sin bienvenida o sin ciclo no se genera ninguna sesión', () => {
  let llamadas = 0;
  const stub = { planToday: () => { llamadas++; return {}; } };
  assert.equal(run(ctxWith(Object.assign({ planState: () => ({ onboarded: false, cycle: null }) }, stub))).onboarded, false);
  const r = run(ctxWith(Object.assign({ planState: () => ({ onboarded: true, cycle: null }) }, stub)));
  assert.equal(r.hasCycle, false); assert.equal(r.today, null);
  assert.equal(llamadas, 0);
});
test('si falla la sesión, el estado se conserva y el error es controlado', () => {
  const r = run(ctxWith({ planState: () => ({ onboarded: true, cycle: {} }), planToday: () => { throw { code: 'AI_HTTP', message: 'La IA ha devuelto el error HTTP 503' }; } }));
  assert.equal(r.onboarded, true); assert.equal(r.today, null);
  assert.deepEqual(JSON.parse(JSON.stringify(r.todayError)), { code: 'AI_HTTP', message: 'La IA ha devuelto el error HTTP 503' });
});
test('un error inesperado no filtra detalles internos', () => {
  const r = run(ctxWith({ planState: () => ({ onboarded: true, cycle: {} }), planToday: () => { throw new Error('ReferenceError interno con ruta /Drive/secreto'); } }));
  assert.equal(r.todayError.code, 'INTERNAL'); assert.equal(r.todayError.message, 'Error interno');
});
test('no se devuelve el contenido completo de los ajustes', () => {
  const r = run(ctxWith({ planState: () => ({ onboarded: true, cycle: {}, settings: { profile: { heightCm: 1 } } }), planToday: () => ({}) }));
  assert.equal(JSON.stringify(r).includes('heightCm'), false);
});

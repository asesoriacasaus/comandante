// Recuperar una sesión descartada juntando las series elegidas de la guardada ese día. Datos sintéticos.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const dir = path.join(__dirname, '..', 'apps-script');
const ARCHIVOS = ['Validators.gs', 'Exercises.gs', 'Sets.gs', 'Planner.gs', 'PlanGen.gs', 'ClipProcess.gs', 'Review.gs', 'Body.gs', 'Nutrition.gs', 'Runs.gs', 'Weekly.gs', 'WeeklyRun.gs',
  'Export.gs', 'Recipes.gs', 'Supplements.gs', 'AiSaver.gs', 'Foods.gs', 'ClipRules.gs', 'Rest.gs', 'Extras.gs', 'Store.gs', 'Planning.gs', 'Sessions.gs', 'Auth.gs', 'Limits.gs', 'Gemini.gs', 'Code.gs'];
const HOY = '2026-06-20';
const RUTA = 'sessions/2026-06.json';

function mundo(inicial) {
  const ctx = vm.createContext({ console, Utilities: { formatDate: (d) => d.toISOString().slice(0, 10), computeDigest: () => [1, 2, 3], DigestAlgorithm: { SHA_256: 'SHA_256' } } });
  ARCHIVOS.forEach((f) => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
  ctx.__drive = { [RUTA]: JSON.parse(JSON.stringify(inicial)) };
  vm.runInContext(`
    getSettings = () => { const s = defaultSettings_(); s.profile = { sex: 'male', birthYear: 1990, heightCm: 180, timezone: 'Europe/Madrid' }; return s; };
    todayIso_ = () => '${HOY}';
    latestBodyweight_ = () => 80;
    readJson_ = (p, f) => (p in __drive ? JSON.parse(JSON.stringify(__drive[p])) : f);
    writeFile_ = (p, o) => { __drive[p] = JSON.parse(JSON.stringify(o)); };
    withLock_ = (fn) => fn();
    bumpRevision_ = () => 1;
  `, ctx);
  return { run: (code) => JSON.parse(JSON.stringify(vm.runInContext(code, ctx))), drive: () => ctx.__drive[RUTA] };
}

const L = (kg) => ({ implement: 'dumbbell', perHandKg: kg / 2, totalKg: kg });
const serie = (hm, reps, kg) => ({ order: 0, type: 'working', reps: reps, rir: 2, load: L(kg), at: HOY + 'T' + hm + ':00.000Z', flags: [] });
const ej = (id, sets) => ({ exerciseId: id, name: id, sets: sets.map((s, i) => Object.assign(s, { order: i + 1 })) });
// La real (descartada): 4 de inclinado y 3 de francés. La metida a mano (guardada): las mismas de golpe + 1 de inclinado,
// 1 de francés más y un ejercicio nuevo.
const real = { id: 's_20260620_1028_real', date: HOY, status: 'discarded', startedAt: HOY + 'T09:28:00.000Z', endedAt: HOY + 'T10:54:00.000Z', groups: ['chest'],
  plannedExercises: [], clips: [], pending: [{ x: 1 }], exercises: [
    ej('press_inclinado', [serie('09:54', 12, 28), serie('09:57', 11, 28), serie('10:00', 10, 28), serie('10:04', 9, 28)]),
    ej('press_frances', [serie('10:29', 10, 20), serie('10:37', 12, 20), serie('10:38', 12, 20)])] };
const mano = { id: 's_20260620_1028_mano', date: HOY, status: 'done', startedAt: HOY + 'T10:39:00.000Z', endedAt: HOY + 'T10:52:00.000Z', savedAt: HOY + 'T10:53:00.000Z', groups: ['chest'],
  plannedExercises: [], clips: [], exercises: [
    ej('press_inclinado', [serie('10:41', 12, 28), serie('10:41', 12, 28), serie('10:41', 12, 28), serie('10:41', 12, 28), serie('10:42', 12, 28)]),
    ej('press_frances', [serie('10:43', 12, 20), serie('10:43', 12, 20), serie('10:43', 12, 20), serie('10:44', 12, 20)]),
    ej('extension_polea', [serie('10:46', 20, 11), serie('10:48', 20, 16), serie('10:51', 12, 18), serie('10:52', 10, 18)])] };

test('la propuesta coge lo que sobra por ejercicio: la 5.ª de inclinado, la 4.ª de francés y la extensión entera', () => {
  const m = mundo([real, mano]);
  const keys = m.run('suggestRecovery_(' + JSON.stringify(real) + ', ' + JSON.stringify(mano) + ')');
  assert.deepEqual(keys, ['press_inclinado|' + HOY + 'T10:42:00.000Z|5', 'press_frances|' + HOY + 'T10:44:00.000Z|4',
    'extension_polea|' + HOY + 'T10:46:00.000Z|1', 'extension_polea|' + HOY + 'T10:48:00.000Z|2', 'extension_polea|' + HOY + 'T10:51:00.000Z|3', 'extension_polea|' + HOY + 'T10:52:00.000Z|4']);
});

test('recuperar: la real vuelve a hecha con sus series y las elegidas; la de a mano pasa a descartada', () => {
  const m = mundo([real, mano]);
  const keys = m.run('suggestRecovery_(' + JSON.stringify(real) + ', ' + JSON.stringify(mano) + ')');
  const r = m.run('sessionRecover(' + JSON.stringify({ id: real.id, fromId: mano.id, keep: keys }) + ')').session;
  const n = (id) => r.exercises.find((x) => x.exerciseId === id).sets;
  assert.equal(r.status, 'done');
  assert.equal(n('press_inclinado').length, 5);
  assert.deepEqual(n('press_inclinado').map((s) => s.reps), [12, 11, 10, 9, 12], 'las reales intactas y la 5.ª al final');
  assert.equal(n('press_frances').length, 4);
  assert.equal(n('extension_polea').length, 4);
  assert.deepEqual(n('press_frances').map((s) => s.order), [1, 2, 3, 4]);
  assert.ok(n('extension_polea').every((s) => s.recovered), 'marcadas como recuperadas');
  assert.deepEqual(r.pending, [], 'lo pendiente no bloquea');
  assert.equal(r.recoveredFrom, mano.id);
  assert.ok(r.metrics, 'métricas recalculadas');
  const guardadas = m.drive();
  assert.equal(guardadas.find((s) => s.id === mano.id).status, 'discarded');
  assert.equal(guardadas.find((s) => s.id === real.id).status, 'done');
  assert.equal(guardadas.length, 2, 'no se borra nada');
});

test('lista de recuperables: la descartada con series y la guardada de ese día', () => {
  const m = mundo([real, mano]);
  const r = m.run('sessionsRecoverable()');
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].discarded.id, real.id);
  assert.equal(r.items[0].saved.id, mano.id);
  assert.equal(r.items[0].suggested.length, 6);
});

test('no se recupera una sesión que no está descartada, ni de otro día', () => {
  const m = mundo([real, mano]);
  assert.throws(() => m.run('sessionRecover(' + JSON.stringify({ id: mano.id, keep: [] }) + ')'));
  assert.throws(() => m.run('sessionRecover(' + JSON.stringify({ id: real.id, fromId: 's_20260619_1000_otro', keep: [] }) + ')'));
});

test('sin sesión guardada ese día se recupera tal cual', () => {
  const m = mundo([real]);
  const r = m.run('sessionRecover(' + JSON.stringify({ id: real.id, keep: [] }) + ')').session;
  assert.equal(r.status, 'done');
  assert.equal(r.exercises.length, 2);
});

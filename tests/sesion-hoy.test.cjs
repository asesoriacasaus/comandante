// La sesión de hoy: nunca dos del mismo día y, si ya las hay, nunca una vacía tapando a la que tiene el trabajo hecho.
// Con los .gs reales; solo se sustituye el acceso a Drive y el lock.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const dir = path.join(__dirname, '..', 'apps-script');
const ARCHIVOS = ['Validators.gs', 'Exercises.gs', 'Sets.gs', 'Planner.gs', 'PlanGen.gs', 'ClipProcess.gs', 'Review.gs', 'Body.gs', 'Nutrition.gs', 'Runs.gs', 'Weekly.gs', 'WeeklyRun.gs',
  'Export.gs', 'Recipes.gs', 'Supplements.gs', 'AiSaver.gs', 'Foods.gs', 'ClipRules.gs', 'Rest.gs', 'Extras.gs', 'Store.gs', 'Planning.gs', 'Sessions.gs', 'Auth.gs', 'Limits.gs', 'Gemini.gs', 'Code.gs'];
const HOY = '2026-06-20';

function mundo(inicial) {
  const ctx = vm.createContext({ console, Utilities: { formatDate: (d) => d.toISOString().slice(0, 10), computeDigest: () => [1, 2, 3], DigestAlgorithm: { SHA_256: 'SHA_256' } } });
  ARCHIVOS.forEach((f) => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
  ctx.__drive = { ['sessions/' + HOY.slice(0, 7) + '.json']: JSON.parse(JSON.stringify(inicial || [])) };
  ctx.__locks = 0;
  vm.runInContext(`
    getSettings = () => { const s = defaultSettings_(); s.profile = { sex: 'male', birthYear: 1990, heightCm: 180, timezone: 'Europe/Madrid' }; return s; };
    latestBodyweight_ = () => 80;
    readJson_ = (p, f) => (p in __drive ? JSON.parse(JSON.stringify(__drive[p])) : f);
    writeFile_ = (p, o) => { __drive[p] = JSON.parse(JSON.stringify(o)); };
    withLock_ = (fn) => { __locks++; return fn(); };
    bumpRevision_ = () => 1; maybeBackup_ = () => null;
  `, ctx);
  return {
    run: (code) => JSON.parse(JSON.stringify(vm.runInContext(code, ctx))),
    sesiones: () => ctx.__drive['sessions/' + HOY.slice(0, 7) + '.json'],
    ctx
  };
}

const ses = (id, status, o = {}) => Object.assign({ id: id, date: HOY, status: status, cycleKey: 'A', groups: ['chest'],
  plannedExercises: [], clips: [], exercises: [], notes: [] }, o);
const conSeries = { startedAt: HOY + 'T09:28:00.000Z',
  exercises: [{ exerciseId: 'press_banca', name: 'Press banca', sets: [{ type: 'working', reps: 10, rir: 2, at: HOY + 'T09:32:00.000Z', load: { implement: 'barbell', barKg: 20, perSideKg: 15, totalKg: 50 } }] }] };

test('un duplicado vacío y planificado no tapa a la sesión en curso con series, en ningún orden', () => {
  const m = mundo();
  const real = ses('s_20260620_1028_real', 'in_progress', conSeries);
  const vacia = ses('s_20260620_1028_vaci', 'planned');
  for (const lista of [[vacia, real], [real, vacia]]) {
    assert.equal(m.run('pickTodaySession_(' + JSON.stringify(lista) + ', "' + HOY + '")').id, real.id);
  }
});

test('prioridad: en curso, revisión, planificada, hecha; descartadas y de otro día no cuentan', () => {
  const m = mundo();
  const pick = (l) => (m.run('pickTodaySession_(' + JSON.stringify(l) + ', "' + HOY + '")') || {}).id || null;
  assert.equal(pick([ses('s_20260620_1000_hech', 'done', conSeries), ses('s_20260620_1000_revi', 'review', conSeries)]), 's_20260620_1000_revi');
  assert.equal(pick([ses('s_20260620_1000_hech', 'done', conSeries), ses('s_20260620_1000_plan', 'planned')]), 's_20260620_1000_plan');
  assert.equal(pick([ses('s_20260620_1000_desc', 'discarded', conSeries)]), null);
  assert.equal(pick([ses('s_20260619_1000_ayer', 'in_progress', Object.assign({}, conSeries, { date: '2026-06-19' }))]), null);
  assert.equal(pick([ses('s_20260620_1000_plan', 'planned'), ses('s_20260620_1000_conc', 'planned', { clips: [{ id: 'c_123456' }] })]), 's_20260620_1000_conc',
    'a igualdad de estado, la que tiene trabajo');
});

test('si otra carga ya creó la sesión de hoy, no se crea una segunda: se devuelve la existente', () => {
  const primera = ses('s_20260620_1028_prim', 'planned');
  const m = mundo([primera]);
  const r = m.run('commitTodaySession_(' + JSON.stringify(ses('s_20260620_1028_segu', 'planned')) + ', "Europe/Madrid", "' + HOY + '")');
  assert.equal(r.id, primera.id);
  assert.deepEqual(m.sesiones().map((s) => s.id), [primera.id], 'no se escribe la segunda');
});

test('dos generaciones seguidas el mismo día dejan una sola sesión', () => {
  const m = mundo([]);
  const a = m.run('commitTodaySession_(' + JSON.stringify(ses('s_20260620_1028_aaaa', 'planned')) + ', "Europe/Madrid", "' + HOY + '")');
  const b = m.run('commitTodaySession_(' + JSON.stringify(ses('s_20260620_1028_bbbb', 'planned')) + ', "Europe/Madrid", "' + HOY + '")');
  assert.equal(a.id, 's_20260620_1028_aaaa');
  assert.equal(b.id, 's_20260620_1028_aaaa');
  assert.equal(m.sesiones().length, 1);
});

test('una sesión descartada hoy no impide crear otra', () => {
  const m = mundo([ses('s_20260620_0900_desc', 'discarded')]);
  const r = m.run('commitTodaySession_(' + JSON.stringify(ses('s_20260620_1028_nuev', 'planned')) + ', "Europe/Madrid", "' + HOY + '")');
  assert.equal(r.id, 's_20260620_1028_nuev');
  assert.equal(m.sesiones().length, 2);
});

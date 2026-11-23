// nutritionState es el ÚNICO sitio donde se suman a las comidas los aportes que no vienen de ellas (niacina fabricada, sol, agua).
// Se prueba con los .gs reales y solo el acceso a Drive sustituido, para asegurar que nada se cuenta dos veces.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const dir = path.join(__dirname, '..', 'apps-script');
const ARCHIVOS = ['Validators.gs', 'Exercises.gs', 'Sets.gs', 'Planner.gs', 'PlanGen.gs', 'ClipProcess.gs', 'Review.gs', 'Body.gs', 'Nutrition.gs', 'Runs.gs', 'Weekly.gs', 'WeeklyRun.gs',
  'Export.gs', 'Recipes.gs', 'Supplements.gs', 'AiSaver.gs', 'Foods.gs', 'ClipRules.gs', 'Rest.gs', 'Extras.gs', 'Store.gs', 'Planning.gs', 'Sessions.gs', 'Auth.gs', 'Limits.gs', 'Gemini.gs', 'Code.gs'];

function mundo({ nutrition, meals, hoy = '2026-06-20' }) {
  const ctx = vm.createContext({ console, Utilities: { formatDate: (d) => d.toISOString().slice(0, 10), computeDigest: () => [1, 2, 3], DigestAlgorithm: { SHA_256: 'SHA_256' } } });
  ARCHIVOS.forEach((f) => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
  // Solo se sustituye lo que toca Drive o el reloj.
  ctx.__nutrition = nutrition; ctx.__meals = meals; ctx.__hoy = hoy;
  vm.runInContext(`
    getSettings = () => { const s = defaultSettings_(); s.profile = { sex: 'male', birthYear: 1990, heightCm: 180, timezone: 'Europe/Madrid' }; s.nutrition = Object.assign(s.nutrition, __nutrition); return s; };
    todayIso_ = () => __hoy;
    latestBodyweight_ = () => 80;
    loadMeals_ = (desde, hasta) => __meals.filter((m) => m.date >= desde && m.date <= hasta);
  `, ctx);
  return (fecha) => JSON.parse(JSON.stringify(vm.runInContext('nutritionState({ date: ' + JSON.stringify(fecha) + ' })', ctx)));
}
const comida = (date, o = {}) => ({ id: 'm_' + date, date: date, mealType: o.type || 'lunch', time: '14:00',
  items: [Object.assign({ name: 'Pollo con arroz', quantity: 400, unit: 'g', kcal: 600, proteinG: 50, carbsG: 60, fatG: 12, b3Mg: 10, calciumMg: 100, magnesiumMg: 60, vitDUg: 1 }, o.item || {})] });

const SOL = { minutes: 30, skin: 'arms', midday: true, spf: false, lat: 40 };
const AGUA = { calciumMgL: 80, magnesiumMgL: 20, litersPerDay: 1.5 };

test('sin perfil de sol ni agua: solo la niacina fabricada desde la proteína, nada más', () => {
  const r = mundo({ nutrition: {}, meals: [comida('2026-06-20')] })('2026-06-20');
  assert.equal(r.extras.b3Mg, 10, '50 g de proteína × 12 / 60');
  assert.equal(r.extras.vitDUg, undefined); assert.equal(r.extras.calciumMg, undefined);
  assert.equal(r.totals.b3Mg, 20, 'comida (10) + fabricada (10)');
  assert.equal(r.totals.vitDUg, 1, 'sin perfil de sol, la vitamina D es solo la de la comida');
  assert.deepEqual(r.habits, { sun: null, water: null });
});

test('con sol y agua se suman UNA vez al total del día y a la media de 7 días', () => {
  const r = mundo({ nutrition: { sun: SOL, water: AGUA }, meals: [comida('2026-06-19'), comida('2026-06-20')] })('2026-06-20');
  assert.ok(r.extras.vitDUg > 10, 'sol de junio: ' + r.extras.vitDUg);
  assert.equal(r.extras.calciumMg, 120); assert.equal(r.extras.magnesiumMg, 30);
  assert.equal(r.totals.calciumMg, 220, '100 de la comida + 120 del agua, no 340');
  assert.equal(r.totals.magnesiumMg, 90);
  assert.equal(r.totals.vitDUg, Math.round((1 + r.extras.vitDUg) * 100) / 100);
  assert.equal(r.week.days, 2);
  assert.equal(r.week.avg.calciumMg, 220, 'la media es de los totales ya combinados');
  assert.equal(r.week.extras.calciumMg, 120, 'el desglose de la media lleva solo lo extra');
  assert.equal(r.totals.proteinG, 50, 'los macros no se tocan');
  assert.equal(r.totals.kcal, 600);
});

test('en noviembre el sol no aporta y se dice con un cero (no con un aviso falso de vitamina D baja por falta de sol)', () => {
  const nov = ['2026-11-21', '2026-11-22', '2026-11-23'].map((d) => comida(d));
  const r = mundo({ nutrition: { sun: SOL }, meals: nov, hoy: '2026-11-23' })('2026-11-23');
  assert.equal(r.extras.vitDUg, undefined, 'el sol de noviembre en España es prácticamente nulo');
  assert.equal(r.totals.vitDUg, 1);
  assert.ok(r.week.alerts.some((a) => a.key === 'vitDUg'), 'la vitamina D sigue saliendo baja: ahora es real');
  assert.deepEqual(r.habits.sun, SOL, 'el perfil vuelve para que la pantalla diga que el sol no ayuda esta época');
});

test('con el sol de verano la vitamina D deja de avisar como baja', () => {
  const dias = ['2026-06-18', '2026-06-19', '2026-06-20'].map((d) => comida(d));
  const sin = mundo({ nutrition: {}, meals: dias })('2026-06-20');
  const con = mundo({ nutrition: { sun: SOL }, meals: dias })('2026-06-20');
  assert.ok(sin.week.alerts.some((a) => a.key === 'vitDUg'));
  assert.ok(!con.week.alerts.some((a) => a.key === 'vitDUg'));
});

test('un día solo con suplementos no cuenta para la media ni recibe aportes extra en ella', () => {
  const sup = comida('2026-06-19', { type: 'supplement', item: { name: 'Creatina', proteinG: 0, b3Mg: 0 } });
  const r = mundo({ nutrition: { water: AGUA }, meals: [sup, comida('2026-06-20')] })('2026-06-20');
  assert.equal(r.week.days, 1);
  assert.equal(r.week.avg.calciumMg, 220);
});

test('una comida de suplemento (vitamina D) y el sol se suman, sin duplicarse', () => {
  const d = comida('2026-06-20');
  const sup = { id: 'p_x', date: '2026-06-20', mealType: 'supplement', items: [{ name: 'Vitamina D3', quantity: 1, unit: 'cápsula', kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, vitDUg: 25 }] };
  const r = mundo({ nutrition: { sun: SOL }, meals: [d, sup] })('2026-06-20');
  assert.equal(r.totals.vitDUg, Math.round((1 + 25 + r.extras.vitDUg) * 100) / 100, 'comida 1 + suplemento 25 + sol');
});

test('un día sin comidas no recibe sol, agua ni niacina: no aparece un "calcio: a reforzar" falso', () => {
  const r = mundo({ nutrition: { sun: SOL, water: AGUA }, meals: [comida('2026-06-19')] })('2026-06-20');   // el 20 no tiene nada
  assert.deepEqual(r.extras, {});
  assert.deepEqual(r.totals, {}, 'ni calcio ni vitamina D: el cliente no enseña el bloque de nutrientes');
  assert.equal(Object.keys(r.totals).length, 0);
  assert.equal(r.week.days, 1, 'la media sigue contando el día con comida');
});

test('un día solo con suplementos tampoco recibe aportes extra (coincide con la media de 7 días)', () => {
  const sup = comida('2026-06-20', { type: 'supplement', item: { name: 'Creatina', proteinG: 0, b3Mg: 0, calciumMg: 0, magnesiumMg: 0, vitDUg: 0 } });
  const r = mundo({ nutrition: { sun: SOL, water: AGUA }, meals: [sup, comida('2026-06-19')] })('2026-06-20');
  assert.deepEqual(r.extras, {});
  assert.equal(r.totals.calciumMg, 0, 'solo lo del suplemento, nada del agua');
  assert.equal(r.week.days, 1);
});

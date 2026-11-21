// Carga los .gs en un contexto aislado y ejecuta los test_pure_* de Tests.gs.
// Drive, propiedades y caché no existen aquí: los tests puros no los tocan.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test } = require('node:test');

const dir = path.join(__dirname, '..', 'apps-script');
const ctx = vm.createContext({
  console,
  Utilities: {
    formatDate: (d) => d.toISOString().slice(0, 10),
    computeDigest: () => [1, 2, 3],
    base64EncodeWebSafe: () => 'x',
    DigestAlgorithm: { SHA_256: 'SHA_256' }
  }
});
['Validators.gs', 'Exercises.gs', 'Sets.gs', 'Planner.gs', 'PlanGen.gs', 'ClipProcess.gs', 'Review.gs', 'Body.gs', 'Nutrition.gs', 'Runs.gs', 'Weekly.gs', 'WeeklyRun.gs', 'Export.gs', 'Recipes.gs', 'Supplements.gs', 'AiSaver.gs', 'Foods.gs', 'ClipRules.gs', 'Store.gs', 'Planning.gs', 'Sessions.gs', 'Auth.gs', 'Limits.gs', 'Gemini.gs', 'Code.gs', 'Tests.gs'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
});

Object.keys(ctx)
  .filter((k) => k.startsWith('test_pure_'))
  .forEach((k) => test(k, () => { ctx[k](); }));

test('Tests.gs ejecuta todos los test_pure_*', () => {
  const src = fs.readFileSync(path.join(dir, 'Tests.gs'), 'utf8');
  Object.keys(ctx).filter((k) => k.startsWith('test_pure_')).forEach((k) => {
    if (!src.includes(k + ',') && !src.includes(k + ']')) throw new Error(k + ' no está en test_all');
  });
});

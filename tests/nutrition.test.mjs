import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { scaleItem, pct, warningText, sumItems, fmtInt, fmtDec, MEAL_TYPES_ES, UNITS } from '../js/lib/nutrition.js';

test('reescalar un alimento al cambiar la cantidad', () => {
  const it = { name: 'Arroz', quantity: 200, unit: 'g', kcal: 260, proteinG: 5.4, carbsG: 56, fatG: 0.6, ironMg: 1.2, confidence: 0.8 };
  const d = scaleItem(it, 100);
  assert.deepEqual([d.quantity, d.kcal, d.proteinG, d.carbsG, d.fatG, d.ironMg], [100, 130, 2.7, 28, 0.3, 0.6]);
  assert.equal(d.confidence, 0.8); assert.equal(d.name, 'Arroz');
  assert.equal(it.kcal, 260, 'no muta el original');
  assert.equal(scaleItem(it, 0), it); assert.equal(scaleItem({ quantity: 0 }, 5).quantity, 0);
  assert.equal(scaleItem({ quantity: 100, kcal: 100 }, 150).fiberG, undefined);
});
test('porcentajes y sumas', () => {
  assert.equal(pct(1850, 2470), 75); assert.equal(pct(5, 0), 0); assert.equal(pct(null, 10), 0);
  assert.deepEqual(sumItems([{ kcal: 100, proteinG: 10 }, { kcal: 50, carbsG: 5, fatG: 2 }]), { kcal: 150, proteinG: 10, carbsG: 5, fatG: 2 });
});
test('textos y formatos', () => {
  assert.match(warningText('kcal_fixed'), /recalculado/); assert.equal(warningText('x'), '');
  assert.equal(fmtInt(2471.6), '2.472'); assert.equal(fmtDec(12.34), '12,3');
});
test('constantes coinciden con el servidor', () => {
  const ctx = vm.createContext({});
  for (const f of ['Sets.gs', 'Validators.gs', 'Nutrition.gs']) vm.runInContext(fs.readFileSync('apps-script/' + f, 'utf8'), ctx);
  assert.deepEqual([...vm.runInContext('UNITS_', ctx)].sort(), [...UNITS].sort());
  assert.deepEqual([...vm.runInContext('MEAL_TYPES_', ctx)].sort(), Object.keys(MEAL_TYPES_ES).sort());
});

test('reparto del plato de la foto: personas o porcentaje', async () => {
  const { fraccionReparto, textoReparto, repartir } = await import('../js/lib/nutrition.js');
  assert.equal(fraccionReparto({ modo: 'todo' }), 1);
  assert.equal(fraccionReparto({ modo: 'personas', n: 4 }), 0.25);
  assert.equal(fraccionReparto({ modo: 'porcentaje', pct: 40 }), 0.4);
  assert.equal(fraccionReparto({ modo: 'personas', n: 0 }), 1, 'valor absurdo: todo');
  assert.equal(fraccionReparto({ modo: 'porcentaje', pct: 150 }), 1);
  assert.equal(textoReparto({ modo: 'personas', n: 3 }), '1/3 del plato (compartido entre 3)');
  assert.equal(textoReparto({ modo: 'porcentaje', pct: 37.5 }), '37,5 % del plato');
  assert.equal(textoReparto({ modo: 'personas', n: 1 }), 'Todo el plato');
  const plato = [{ name: 'Paella', quantity: 1200, unit: 'g', kcal: 1800, proteinG: 90, carbsG: 210, fatG: 60, ironMg: 9 }];
  const mio = repartir(plato, { modo: 'personas', n: 3 });
  assert.deepEqual([mio[0].quantity, mio[0].kcal, mio[0].proteinG, mio[0].ironMg], [400, 600, 30, 3]);
  assert.equal(plato[0].quantity, 1200, 'no toca el plato entero');
  assert.equal(repartir(plato, { modo: 'porcentaje', pct: 25 })[0].kcal, 450);
});

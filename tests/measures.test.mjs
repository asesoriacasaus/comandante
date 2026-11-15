import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MEASURES, GUIDE, TAPE, PART_ORDER, measureLabel, summarize, latestWeight } from '../js/lib/measures.js';
import { todayIsoLocal, formatCm } from '../js/lib/format.js';

test('las claves del cliente coinciden con las del servidor', () => {
  const ctx = vm.createContext({});
  for (const f of ['Sets.gs', 'Body.gs']) vm.runInContext(fs.readFileSync('apps-script/' + f, 'utf8'), ctx);
  const server = vm.runInContext('MEASURE_KEYS_.slice().sort()', ctx);
  assert.deepEqual(MEASURES.map((m) => m.key).sort(), [...server]);
  const serverParts = vm.runInContext('MEASURE_PARTS_.slice().sort()', ctx);
  assert.deepEqual([...PART_ORDER].sort(), [...serverParts]);
});

test('cada parte tiene guía, cinta y pasos', () => {
  for (const p of PART_ORDER) {
    assert.ok(GUIDE[p], 'guía de ' + p); assert.ok(TAPE[p], 'cinta de ' + p);
    assert.ok(GUIDE[p].title && GUIDE[p].where && GUIDE[p].steps.length >= 2, p);
  }
  for (const m of MEASURES) assert.ok(PART_ORDER.includes(m.part));
  assert.equal(measureLabel('armR'), 'Bíceps derecho');
});

test('resumen por clave con la medida anterior', () => {
  const recs = [
    { date: '2026-11-17', measurementsCm: { waist: 98.5 } },
    { date: '2026-11-03', measurementsCm: { waist: 101, neck: 40 } },
    { date: '2026-11-10', measurementsCm: { waist: 100 }, weightKg: 88 },
    { date: '2026-11-17', weightKg: 87.5 }
  ];
  const s = summarize(recs);
  assert.deepEqual(s.waist, { value: 98.5, date: '2026-11-17', prev: 100, prevDate: '2026-11-10' });
  assert.deepEqual(s.neck, { value: 40, date: '2026-11-03', prev: null, prevDate: null });
  assert.deepEqual(latestWeight(recs), { value: 87.5, date: '2026-11-17', prev: 88 });
  assert.equal(latestWeight([]), null);
});

test('fecha local y centímetros', () => {
  assert.equal(todayIsoLocal(new Date(2026, 10, 5, 0, 30)), '2026-11-05');
  assert.equal(formatCm(99.5), '99,5 cm');
});

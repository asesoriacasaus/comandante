import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumenUso } from '../js/lib/uso-ia.js';

test('resumen del uso de la IA del mes, con lo ahorrado en el servidor y en el móvil', () => {
  const r = resumenUso({ mes: '2026-11', llamadas: { FAST: 12, CLIP: 6, SMART: 2 }, ahorros: { cache: 3, frases: 8 } }, { mes: '2026-11', vias: { comidas: 5, frases: 1 } }, '2026-11');
  assert.equal(r.llamadas, 20); assert.equal(r.ahorradas, 17); assert.equal(r.pct, 46);
  assert.deepEqual(r.vias[0], ['Mensajes del Comandante (banco de frases)', 9]);
  assert.deepEqual(r.modelos[0], ['Modelo rápido', 12]);
  const vacio = resumenUso({ mes: '2026-10', llamadas: { FAST: 3 }, ahorros: {} }, null, '2026-11');
  assert.deepEqual([vacio.llamadas, vacio.ahorradas, vacio.pct], [0, 0, 0], 'otro mes no cuenta');
});

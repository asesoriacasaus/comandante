import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alturasBarras, barrasSinteticas } from '../js/lib/ondas.js';

test('alturasBarras: silencio da barras a cero y voz fuerte barras altas, siempre entre 0 y 1', () => {
  assert.deepEqual(alturasBarras(new Uint8Array(128), 8), new Array(8).fill(0));
  const fuerte = alturasBarras(new Uint8Array(128).fill(255), 8);
  assert.ok(fuerte.every((v) => v === 1));
  const medio = alturasBarras(new Uint8Array(128).fill(100), 8);
  assert.ok(medio.every((v) => v > 0.2 && v < 1));
  assert.equal(alturasBarras(null, 5).length, 5);
});

test('barrasSinteticas: se mueven con el tiempo y no se salen de rango', () => {
  const a = barrasSinteticas(0, 10); const b = barrasSinteticas(500, 10);
  assert.notDeepEqual(a, b);
  assert.ok(a.concat(b).every((v) => v > 0 && v < 1));
});

test('alturasBarras: en espejo, los graves en el centro', () => {
  const d = new Uint8Array(128); d.fill(255, 0, 10);   // solo graves
  const b = alturasBarras(d, 10);
  assert.equal(b.length, 10);
  assert.ok(b[4] > b[0] && b[5] > b[9], 'más alto en medio: ' + b.map((x) => x.toFixed(2)));
  assert.deepEqual(b.slice(0, 5), b.slice(5).reverse(), 'simétrico');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, leerTrozo, estimarLocal, contarAhorroLocal, leerAhorroLocal } from '../js/lib/alimentos.js';

const foods = [
  { name: 'huevo', unit: 'unidad', base: 1, n: { kcal: 72, proteinG: 6.3, carbsG: 0.4, fatG: 5, vitDUg: 1 }, tipica: 2 },
  { name: 'Arroz blanco cocido', unit: 'g', base: 100, n: { kcal: 130, proteinG: 2.5, carbsG: 28, fatG: 0.3 }, tipica: 150 },
  { name: 'Pan integral', unit: 'g', base: 100, n: { kcal: 250, proteinG: 9, carbsG: 45, fatG: 3 }, tipica: 60 },
  { name: 'Café con leche', unit: 'taza', base: 1, n: { kcal: 60, proteinG: 3, carbsG: 5, fatG: 3, calciumMg: 120 }, tipica: 1 },
  { name: 'Melón', unit: 'g', base: 100, n: { kcal: 34, proteinG: 0.8, carbsG: 8, fatG: 0.2 }, tipica: 300 }
];

test('normalizar: tildes, artículos y plurales', () => {
  assert.equal(normalizar('Huevos'), 'huevo');
  assert.equal(normalizar('Arroz blanco cocido'), normalizar('arroz blancos cocidos'));
  assert.equal(normalizar('melones'), normalizar('Melón'));
  assert.equal(normalizar('panes'), normalizar('pan'));
  assert.equal(normalizar('Café con leche'), 'cafe con leche');
});

test('leer un trozo: número, palabra, unidad', () => {
  assert.deepEqual(leerTrozo('2 huevos'), { cantidad: 2, unidad: null, nombre: 'huevos' });
  assert.deepEqual(leerTrozo('200 g de arroz blanco cocido'), { cantidad: 200, unidad: 'g', nombre: 'arroz blanco cocido' });
  assert.deepEqual(leerTrozo('medio kilo de melón'), { cantidad: 500, unidad: 'g', nombre: 'melon' });
  assert.deepEqual(leerTrozo('una taza de café con leche'), { cantidad: 1, unidad: 'taza', nombre: 'cafe con leche' });
  assert.deepEqual(leerTrozo('arroz blanco cocido'), { cantidad: null, unidad: null, nombre: 'arroz blanco cocido' });
});

test('estima sin IA una comida con alimentos conocidos', () => {
  const r = estimarLocal('2 huevos, 200 g de arroz blanco cocido y una taza de café con leche', foods);
  assert.equal(r.local, true);
  assert.deepEqual(r.items.map((i) => [i.name, i.quantity, i.unit, i.kcal]), [['huevo', 2, 'unidad', 144], ['Arroz blanco cocido', 200, 'g', 260], ['Café con leche', 1, 'taza', 60]]);
  assert.equal(r.items[0].vitDUg, 2); assert.equal(r.items[2].calciumMg, 120);
  assert.deepEqual(estimarLocal('pan integral', foods).items.map((i) => [i.quantity, i.kcal]), [[60, 150]], 'sin cantidad: lo de siempre');
});

test('si algo no se conoce o es ambiguo, pregunta a la IA', () => {
  assert.equal(estimarLocal('2 huevos y una tortilla de patatas', foods), null, 'alimento desconocido');
  assert.equal(estimarLocal('3 arroz blanco cocido', foods), null, 'número sin unidad en algo que se pesa');
  assert.equal(estimarLocal('2 g de huevo', foods), null, 'unidad que no se tiene');
  assert.equal(estimarLocal('', foods), null);
  assert.equal(estimarLocal('huevo', []), null, 'sin base de alimentos');
});

test('cuenta de lo ahorrado en el móvil, por mes', () => {
  const m = {}; const st = { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } };
  contarAhorroLocal(st, 'comidas', new Date('2026-11-20T10:00:00Z')); contarAhorroLocal(st, 'comidas', new Date('2026-11-21T10:00:00Z'));
  assert.equal(leerAhorroLocal(st, new Date('2026-11-21T10:00:00Z')).vias.comidas, 2);
  assert.equal(leerAhorroLocal(st, new Date('2026-12-01T10:00:00Z')), null, 'mes nuevo');
});

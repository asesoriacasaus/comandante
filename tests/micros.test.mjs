import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoMicros, agruparMicros, listaEnTexto, claveCompra, FUENTES } from '../js/lib/nutrition.js';

const MICROS = [{ key: 'fiberG', label: 'Fibra', unit: 'g', ref: 25, kind: 'min' }, { key: 'sodiumMg', label: 'Sodio', unit: 'mg', ref: 2400, kind: 'max' },
  { key: 'ironMg', label: 'Hierro', unit: 'mg', ref: 14, kind: 'min' }, { key: 'vitDUg', label: 'Vitamina D', unit: 'µg', ref: 5, kind: 'min' },
  { key: 'vitCMg', label: 'Vitamina C', unit: 'mg', ref: 80, kind: 'min' }];

test('clasifica y agrupa los micronutrientes', () => {
  const l = estadoMicros(MICROS, { fiberG: 19, sodiumMg: 3000, ironMg: 7, vitCMg: 120 });
  assert.deepEqual(l.map((m) => m.estado), ['bajo', 'alto', 'bajo', 'sin_dato', 'ok']);
  const g = agruparMicros(l);
  assert.deepEqual(g.bajos.map((m) => m.key), ['ironMg', 'fiberG'], 'el más bajo primero');
  assert.equal(g.altos[0].pct, 125);
  assert.equal(g.ok.length, 1); assert.equal(g.sinDato.length, 1);
  assert.ok(FUENTES.ironMg && FUENTES.vitDUg, 'cada nutriente "a llegar" tiene fuentes');
});

test('lista de la compra en texto, sin lo ya marcado', () => {
  const lista = [{ name: 'Espinacas', quantity: 150, unit: 'g', section: 'fruta_verdura' }, { name: 'Kiwi', quantity: 4, unit: 'unidad', section: 'fruta_verdura' },
    { name: 'Lentejas', quantity: 200, unit: 'g', section: 'despensa' }];
  assert.equal(listaEnTexto(lista), 'Fruta y verdura:\n- Espinacas (150 g)\n- Kiwi (4 unidad)\n\nDespensa:\n- Lentejas (200 g)');
  assert.equal(listaEnTexto(lista, new Set([claveCompra(lista[0]), claveCompra(lista[1])])), 'Despensa:\n- Lentejas (200 g)');
});

test('escala de un micronutriente con tramos y marca', async () => {
  const { escalaMicro, anillo } = await import('../js/lib/nutrition.js');
  const e = escalaMicro({ kind: 'min', pct: 60 });
  assert.deepEqual(e.zonas.map((z) => z.ancho), [33.3, 20, 46.7]);
  assert.equal(e.marca, 40);
  assert.deepEqual(e.extremos, ['Bajo', 'Bien']);
  assert.equal(escalaMicro({ kind: 'max', pct: 300 }).marca, 100, 'se corta al final de la escala');
  assert.deepEqual(escalaMicro({ kind: 'max', pct: 120 }).zonas.map((z) => z.clase), ['bien', 'alto', 'muy-alto']);
  const a = anillo(600, 2400, 50);
  assert.equal(a.circunferencia, 314.16); assert.equal(a.lleno, 78.54);
  assert.equal(anillo(3000, 2400, 50).lleno, 314.16, 'pasado el objetivo, anillo completo');
  assert.equal(anillo(10, 0, 50).lleno, 0);
});

test('semana con días apuntados y huecos recientes', async () => {
  const { diasSemana, huecosRecientes, TIPOS_ELEGIBLES } = await import('../js/lib/nutrition.js');
  const d = diasSemana('2026-11-16', '2026-11-21', ['2026-11-16', '2026-11-19', '2026-11-21']);
  assert.deepEqual(d.map((x) => x.letra + x.num + (x.apuntado ? '*' : '') + (x.futuro ? '!' : '')), ['L16*', 'M17', 'X18', 'J19*', 'V20', 'S21*', 'D22!']);
  assert.deepEqual(huecosRecientes('2026-11-16', '2026-11-21', ['2026-11-16', '2026-11-19', '2026-11-21']), ['2026-11-18', '2026-11-20']);
  assert.deepEqual(huecosRecientes('2026-11-16', '2026-11-17', []), ['2026-11-16'], 'no mira fuera de la semana conocida');
  assert.ok(!TIPOS_ELEGIBLES.includes('supplement') && TIPOS_ELEGIBLES.includes('lunch'));
});

test('desglose de un nutriente con aportes que no vienen de las comidas', async () => {
  const { desgloseMicro, avisoSol, perfilSolPorDefecto, NOTAS_MICRO } = await import('../js/lib/nutrition.js');
  assert.deepEqual(desgloseMicro('vitDUg', 7, { vitDUg: 6 }), [{ origen: 'comida y suplementos', valor: 1 }, { origen: 'sol (estimado)', valor: 6 }]);
  assert.deepEqual(desgloseMicro('b3Mg', 35, { b3Mg: 30 }).map((p) => p.origen), ['alimentos', 'fabricada con la proteína (estimada)']);
  assert.equal(desgloseMicro('ironMg', 7, { vitDUg: 6 }), null, 'sin aporte extra, sin desglose');
  assert.equal(desgloseMicro('vitDUg', 7, undefined), null, 'cachés antiguas sin extras');
  assert.equal(avisoSol(null, {}).tipo, 'sin-perfil');
  assert.equal(avisoSol({ sun: { minutes: 30 } }, {}).tipo, 'sin-aporte', 'perfil sí, pero el sol de esta época no aporta');
  assert.equal(avisoSol({ sun: { minutes: 30 } }, { vitDUg: 8 }), null);
  assert.deepEqual(perfilSolPorDefecto({ minutes: 45 }), { minutes: 45, skin: 'arms', midday: true, spf: false, lat: 40 });
  assert.ok(/análisis de sangre/.test(NOTAS_MICRO.vitDUg) && /sal/.test(NOTAS_MICRO.sodiumMg));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeActividad } from '../js/lib/actividad.js';

test('las respuestas rápidas no parpadean', () => { assert.equal(mensajeActividad(0), null); assert.equal(mensajeActividad(399), null); });
test('después de 0,4 s sale la barra sin texto', () => { assert.equal(mensajeActividad(400), ''); assert.equal(mensajeActividad(2999), ''); });
test('a los 3 s se avisa de que se puede seguir navegando', () => { assert.match(mensajeActividad(3000), /seguir moviéndote/); });
test('a los 12 s se reconoce que tarda más de lo normal', () => { assert.match(mensajeActividad(12000), /más de lo normal/); assert.match(mensajeActividad(12000), /cambiar de sección/); });
test('a los 60 s se sugiere revisar la conexión', () => { assert.match(mensajeActividad(60000), /conexión/); });
test('los mensajes son progresivos y nunca vacíos tras el umbral', () => {
  let anterior = null;
  for (const ms of [500, 3500, 13000, 61000]) { const m = mensajeActividad(ms); assert.notEqual(m, anterior); anterior = m; }
});

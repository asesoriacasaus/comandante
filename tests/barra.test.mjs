import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debeIrAlActivo, esCampoDeTexto, desplazando, tecladoAbierto } from '../js/lib/barra.js';

test('solo se lleva la vista al ejercicio activo si suben las series y el usuario no está escribiendo ni tocando', () => {
  assert.equal(debeIrAlActivo({ antes: 3, ahora: 4, escribiendo: false, desplazando: false }), true);
  assert.equal(debeIrAlActivo({ antes: undefined, ahora: 4, escribiendo: false, desplazando: false }), false, 'primer pintado: no se mueve');
  assert.equal(debeIrAlActivo({ antes: 4, ahora: 4, escribiendo: false, desplazando: false }), false, 'sin series nuevas');
  assert.equal(debeIrAlActivo({ antes: 4, ahora: 3, escribiendo: false, desplazando: false }), false, 'al borrar no se mueve');
  assert.equal(debeIrAlActivo({ antes: 3, ahora: 4, escribiendo: true, desplazando: false }), false, 'escribiendo');
  assert.equal(debeIrAlActivo({ antes: 3, ahora: 4, escribiendo: false, desplazando: true }), false, 'desplazando');
});

test('qué campos reciben el cursor al final', () => {
  const i = (type) => ({ tagName: 'INPUT', type });
  assert.ok(esCampoDeTexto(i('text')) && esCampoDeTexto(i('search')) && esCampoDeTexto({ tagName: 'TEXTAREA' }));
  for (const t of ['number', 'date', 'time', 'file', 'checkbox', 'radio']) assert.ok(!esCampoDeTexto(i(t)), t);
  assert.ok(!esCampoDeTexto({ tagName: 'SELECT' }) && !esCampoDeTexto(null));
  assert.equal(desplazando(Date.now() + 5000), false);
});

test('teclado abierto: el área visible se encoge', () => {
  assert.equal(tecladoAbierto(844, 844), false);
  assert.equal(tecladoAbierto(800, 844), false, 'barra de direcciones: no es teclado');
  assert.equal(tecladoAbierto(480, 844), true);
  assert.equal(tecladoAbierto(undefined, 844), false);
});

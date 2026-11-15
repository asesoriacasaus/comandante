import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vozYChatActivos, fijarVozYChat } from '../js/lib/prefs.js';

const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
test('por defecto la voz y el chat están activos', () => { assert.equal(vozYChatActivos(mem()), true); });
test('se pueden ocultar y volver a mostrar', () => {
  const st = mem(); fijarVozYChat(false, st); assert.equal(vozYChatActivos(st), false); fijarVozYChat(true, st); assert.equal(vozYChatActivos(st), true);
});
test('sin almacenamiento no falla y deja todo activo', () => {
  const roto = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(vozYChatActivos(roto), true); assert.doesNotThrow(() => fijarVozYChat(false, roto));
});

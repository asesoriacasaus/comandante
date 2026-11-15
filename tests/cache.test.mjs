import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearCache } from '../js/lib/cache.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, m }; };

test('primera vez: sin caché, se espera al dato fresco', async () => {
  const c = crearCache(mem()); const pintados = [];
  await c.swr('a', async () => ({ v: 1 }), (d, cache) => pintados.push([d.v, cache]));
  assert.deepEqual(pintados, [[1, false]]);
});
test('con caché: se pinta al instante y luego el dato nuevo', async () => {
  const st = mem(); const c = crearCache(st); const pintados = [];
  c.guardar('a', { v: 1 });
  await c.swr('a', async () => ({ v: 2 }), (d, cache) => pintados.push([d.v, cache]));
  assert.deepEqual(pintados, [[1, true], [2, false]]);
  assert.equal(c.leer('a').data.v, 2, 'la caché queda actualizada');
});
test('si el dato nuevo es igual, no se repinta (no se pisa lo que el usuario esté haciendo)', async () => {
  const c = crearCache(mem()); const pintados = [];
  c.guardar('a', { v: 1 });
  await c.swr('a', async () => ({ v: 1 }), (d, cache) => pintados.push(cache));
  assert.deepEqual(pintados, [true]);
});
test('con caché y sin red: se queda lo mostrado y se avisa', async () => {
  const c = crearCache(mem()); const pintados = []; let aviso = null;
  c.guardar('a', { v: 1 });
  await c.swr('a', async () => { throw new Error('sin red'); }, (d) => pintados.push(d.v), { onSinRed: (e) => { aviso = e.message; } });
  assert.deepEqual(pintados, [1]); assert.equal(aviso, 'sin red');
});
test('sin caché y sin red: el error sube', async () => {
  const c = crearCache(mem());
  await assert.rejects(c.swr('a', async () => { throw new Error('sin red'); }, () => {}), /sin red/);
});
test('una caché que ya no vale (la sesión de ayer) se ignora', async () => {
  const c = crearCache(mem()); const pintados = [];
  c.guardar('hoy', { dia: '2026-11-15', v: 'vieja' });
  await c.swr('hoy', async () => ({ dia: '2026-11-16', v: 'nueva' }), (d, cache) => pintados.push([d.v, cache]), { valido: (d) => d.dia === '2026-11-16' });
  assert.deepEqual(pintados, [['nueva', false]], 'no se enseña la de ayer ni un instante');
});
test('almacenamiento roto o lleno: nunca lanza', async () => {
  const roto = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('lleno'); }, removeItem() { throw new Error('x'); }, key() { throw new Error('x'); }, length: 3 };
  const c = crearCache(roto);
  assert.equal(c.leer('a'), null); assert.doesNotThrow(() => c.guardar('a', 1)); assert.doesNotThrow(() => c.borrar('a')); assert.doesNotThrow(() => c.limpiar());
  const pintados = []; await c.swr('a', async () => ({ v: 1 }), (d) => pintados.push(d.v)); assert.deepEqual(pintados, [1]);
});
test('datos enormes no se guardan', () => {
  const st = mem(); const c = crearCache(st);
  c.guardar('grande', { x: 'a'.repeat(400000) }); assert.equal(c.leer('grande'), null);
});
test('limpiar borra solo lo suyo', () => {
  const st = mem(); const c = crearCache(st);
  st.setItem('comandante.token', 'secreto'); c.guardar('a', 1); c.guardar('b', 2);
  c.limpiar();
  assert.equal(c.leer('a'), null); assert.equal(c.leer('b'), null); assert.equal(st.getItem('comandante.token'), 'secreto');
});
test('caché corrupta', () => { const st = mem(); st.setItem('comandante.cache.a', '{roto'); assert.equal(crearCache(st).leer('a'), null); st.setItem('comandante.cache.b', '"texto"'); assert.equal(crearCache(st).leer('b'), null); });

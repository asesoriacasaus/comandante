import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQueue, backoffMs } from '../js/lib/queue.js';
import { newId } from '../js/lib/ids.js';

function memStore() {
  const m = new Map();
  return {
    m,
    put: async (c) => { m.set(c.id, structuredClone(c)); },
    all: async () => [...m.values()].map((c) => structuredClone(c)),
    remove: async (id) => { m.delete(id); },
    update: async (id, p) => { m.set(id, Object.assign(m.get(id), p)); }
  };
}
const clip = (id, ts) => ({ id, ts, sessionId: 's_1', mime: 'audio/mp4' });
const err = (code) => Object.assign(new Error(code), { code });

test('procesa en orden y borra al confirmar', async () => {
  const store = memStore(); const order = [];
  const q = createQueue({ store, send: async (c) => { order.push(c.id); return { ok: true }; } });
  await store.put(clip('c_b', '2026-01-01T10:00:02')); await store.put(clip('c_a', '2026-01-01T10:00:01'));
  await q.flush();
  assert.deepEqual(order, ['c_a', 'c_b']);
  assert.equal(store.m.size, 0);
});

test('sin red: el clip se conserva y se bloquea el resto para respetar el orden', async () => {
  const store = memStore(); const sent = [];
  const q = createQueue({ store, send: async (c) => { sent.push(c.id); throw err('NETWORK'); }, now: () => 1000 });
  await store.put(clip('c_a', '1')); await store.put(clip('c_b', '2'));
  await q.flush();
  assert.deepEqual(sent, ['c_a']);
  assert.equal(store.m.size, 2);
  assert.equal(store.m.get('c_a').status, 'retry');
  assert.equal(store.m.get('c_a').attempts, 1);
  assert.equal(store.m.get('c_a').nextTry, 1000 + backoffMs(1));
});

test('espera el backoff, salvo con force (vuelve la red)', async () => {
  const store = memStore(); let fail = true; let t = 0; const sent = [];
  const q = createQueue({ store, send: async (c) => { sent.push(c.id); if (fail) throw err('TIMEOUT'); return {}; }, now: () => t });
  await store.put(clip('c_a', '1'));
  await q.flush(); assert.equal(sent.length, 1);
  await q.flush(); assert.equal(sent.length, 1, 'antes de nextTry no reintenta');
  fail = false;
  await q.flush({ force: true }); assert.equal(sent.length, 2);
  assert.equal(store.m.size, 0);
});

test('error permanente: se marca, se conserva y sigue con el siguiente', async () => {
  const store = memStore(); const events = [];
  const q = createQueue({ store, onChange: (e) => events.push(e.type), send: async (c) => { if (c.id === 'c_a') throw err('VALIDATION'); return {}; } });
  await store.put(clip('c_a', '1')); await store.put(clip('c_b', '2'));
  await q.flush();
  assert.equal(store.m.get('c_a').status, 'error');
  assert.equal(store.m.has('c_b'), false);
  assert.deepEqual(events, ['error', 'sent']);
  await q.flush(); // el clip con error no se reintenta solo
  assert.equal(store.m.get('c_a').status, 'error');
});

test('token inválido: se conserva todo y no se marca como error', async () => {
  const store = memStore(); const events = [];
  const q = createQueue({ store, onChange: (e) => events.push(e.type), send: async () => { throw err('AUTH'); } });
  await store.put(clip('c_a', '1'));
  await q.flush();
  assert.notEqual(store.m.get('c_a').status, 'error');
  assert.equal(store.m.size, 1);
  assert.deepEqual(events, ['blocked']);
});

test('retry manual, descartar y recuento', async () => {
  const store = memStore(); let fail = true;
  const q = createQueue({ store, send: async () => { if (fail) throw err('TOO_LARGE'); return {}; } });
  await q.enqueue(clip('c_a', '1'));
  assert.deepEqual(await q.counts('s_1'), { total: 1, errors: 1, waiting: 0 });
  fail = false; await q.retry('c_a');
  assert.equal(store.m.size, 0);
  await q.enqueue({ ...clip('c_b', '2'), sessionId: 's_9' });
  assert.equal(store.m.size, 0);
  fail = true; await q.enqueue(clip('c_c', '3'));
  await q.discard('c_c'); assert.equal(store.m.size, 0);
});

test('no se solapan dos flush', async () => {
  const store = memStore(); let calls = 0;
  const q = createQueue({ store, send: async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return {}; } });
  await store.put(clip('c_a', '1'));
  await Promise.all([q.flush(), q.flush(), q.flush()]);
  assert.equal(calls, 1);
});

test('backoff y ids', () => {
  assert.equal(backoffMs(1), 2000); assert.equal(backoffMs(3), 8000); assert.equal(backoffMs(20), 60000);
  assert.equal(newId('c', new Date(2026, 10, 16, 18, 32), () => 0.5), 'c_20261116_1832_i000');
  assert.match(newId('c'), /^c_\d{8}_\d{4}_[a-z0-9]{4}$/);
});

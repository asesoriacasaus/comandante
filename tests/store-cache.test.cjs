// La capa de Drive con caché, contra un Drive simulado que cuenta cada operación.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');

function makeWorld() {
  const w = { ops: 0, nextId: 1, folders: {}, files: {}, cache: {} };
  const id = () => 'id' + w.nextId++;
  const op = () => { w.ops++; };
  const iter = (list) => { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; };
  const mkFile = (parent, name, content) => {
    const f = { id: id(), name, content, parent, trashed: false };
    w.files[f.id] = f;
    return { getId: () => f.id, getName: () => f.name, setContent: (c) => { op(); f.content = c; }, getBlob: () => { op(); return { getDataAsString: () => f.content }; }, setTrashed: () => { f.trashed = true; } };
  };
  const mkFolder = (parent, name) => {
    const f = { id: id(), name, parent };
    w.folders[f.id] = f;
    return folderApi(f);
  };
  const folderApi = (f) => ({
    getId: () => f.id, setName: (n) => { f.name = n; },
    getFoldersByName: (n) => { op(); return iter(Object.values(w.folders).filter((x) => x.parent === f.id && x.name === n).map(folderApi)); },
    createFolder: (n) => { op(); return mkFolder(f.id, n); },
    getFilesByName: (n) => { op(); return iter(Object.values(w.files).filter((x) => x.parent === f.id && x.name === n && !x.trashed).map((x) => fileApi(x))); },
    createFile: (n, c) => { op(); return mkFile(f.id, n, c); }
  });
  const fileApi = (f) => ({ getId: () => f.id, getName: () => f.name, setContent: (c) => { op(); f.content = c; }, getBlob: () => { op(); return { getDataAsString: () => f.content }; }, setTrashed: () => { f.trashed = true; } });
  w.DriveApp = {
    getFoldersByName: (n) => { op(); return iter(Object.values(w.folders).filter((x) => x.parent === null && x.name === n).map(folderApi)); },
    createFolder: (n) => { op(); return mkFolder(null, n); },
    getFolderById: (i) => { op(); if (!w.folders[i]) throw new Error('no existe'); return folderApi(w.folders[i]); },
    getFileById: (i) => { op(); if (!w.files[i] || w.files[i].trashed) throw new Error('no existe'); return fileApi(w.files[i]); }
  };
  w.CacheService = { getScriptCache: () => ({
    get: (k) => (k in w.cache ? w.cache[k] : null), put: (k, v) => { w.cache[k] = String(v); }, remove: (k) => { delete w.cache[k]; },
    putAll: (o) => { Object.entries(o).forEach(([k, v]) => { w.cache[k] = String(v); }); },
    getAll: (ks) => Object.fromEntries(ks.filter((k) => k in w.cache).map((k) => [k, w.cache[k]])),
    removeAll: (ks) => ks.forEach((k) => delete w.cache[k]) }) };
  w.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  // Utilities de Apps Script (solo lo que usa la caché comprimida), con zlib de verdad.
  const blob = (bytes) => ({ getBytes: () => [...bytes], getDataAsString: () => Buffer.from(bytes).toString('utf8') });
  w.Utilities = {
    newBlob: (data) => blob(typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data.map((b) => b & 255))),
    gzip: (b) => blob(zlib.gzipSync(Buffer.from(b.getBytes()))),
    ungzip: (b) => blob(zlib.gunzipSync(Buffer.from(b.getBytes()))),
    base64Encode: (bytes) => Buffer.from(bytes.map((x) => x & 255)).toString('base64'),
    base64Decode: (s) => [...Buffer.from(s, 'base64')]
  };
  return w;
}

// Cada "ejecución" de Apps Script carga el código de cero, pero comparte Drive y caché.
function execution(world) {
  const ctx = vm.createContext({ console, DriveApp: world.DriveApp, CacheService: world.CacheService, LockService: world.LockService, Utilities: world.Utilities, Logger: { log() {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Store.gs'), 'utf8'), ctx, { filename: 'Store.gs' });
  return ctx;
}
const call = (ctx, code) => vm.runInContext(code, ctx);

test('un archivo que no existe: la segunda búsqueda no toca Drive', () => {
  const w = makeWorld(); const a = execution(w);
  assert.equal(call(a, "readJson_('settings.json', 'vacío')"), 'vacío');
  const costeFrio = w.ops; assert.ok(costeFrio > 0);
  w.ops = 0;
  assert.equal(call(execution(w), "readJson_('settings.json', 'vacío')"), 'vacío');
  assert.equal(w.ops, 0, 'ausencia cacheada, en una ejecución nueva');
});

test('escribir y leer: la lectura posterior cuesta cero operaciones, incluso en otra ejecución', () => {
  const w = makeWorld(); const a = execution(w);
  call(a, "writeFile_('sessions/2026-11.json', [{ id: 's1', nota: 'canción — ñandú' }])");
  w.ops = 0;
  const b = execution(w);
  assert.deepEqual(JSON.parse(call(b, "JSON.stringify(readJson_('sessions/2026-11.json', []))")), [{ id: 's1', nota: 'canción — ñandú' }]);
  assert.equal(w.ops, 0);
});

test('sobrescribir actualiza la caché: nunca se lee algo más viejo que lo último guardado', () => {
  const w = makeWorld(); const a = execution(w);
  call(a, "writeFile_('body.json', [{ date: '2026-11-01', weightKg: 80 }])");
  call(a, "writeFile_('body.json', [{ date: '2026-11-01', weightKg: 80 }, { date: '2026-11-02', weightKg: 79.5 }])");
  w.ops = 0;
  assert.equal(call(execution(w), "readJson_('body.json', []).length"), 2);
  assert.equal(w.ops, 0);
  const f = Object.values(w.files).find((x) => x.name === 'body.json');
  assert.equal(JSON.parse(f.content).length, 2, 'y Drive tiene lo mismo');
});

test('sin caché de contenido, los identificadores ahorran las búsquedas por nombre', () => {
  const w = makeWorld(); const a = execution(w);
  call(a, "writeFile_('sessions/2026-11.json', [1, 2, 3])");
  Object.keys(w.cache).filter((k) => k.startsWith('c:')).forEach((k) => delete w.cache[k]);   // caduca solo el contenido
  w.ops = 0;
  assert.equal(call(execution(w), "readJson_('sessions/2026-11.json', []).length"), 3);
  assert.ok(w.ops <= 2, 'getFileById + lectura, no 4 o 5 operaciones: ' + w.ops);
});

test('caché totalmente fría: coste acotado y la siguiente lectura gratis', () => {
  const w = makeWorld(); const a = execution(w);
  call(a, "writeFile_('plan/current.json', { cycle: 1 })");
  w.cache = {}; w.ops = 0;
  assert.equal(call(execution(w), "readJson_('plan/current.json', null).cycle"), 1);
  assert.ok(w.ops <= 6, 'lectura fría: ' + w.ops);
  w.ops = 0;
  assert.equal(call(execution(w), "readJson_('plan/current.json', null).cycle"), 1);
  assert.equal(w.ops, 0);
});

// Un mes real de sesiones (~226 KB) supera los 100 KB de CacheService: se guarda comprimido y en trozos.
function mesDeSesiones() {
  const ses = [];
  for (let i = 0; i < 16; i++) ses.push({ id: 's_202611' + String(i + 10) + '_1800_ab12', date: '2026-11-' + String(i + 10), status: 'done',
    exercises: Array.from({ length: 6 }, (_, e) => ({ exerciseId: 'ej' + e, name: 'Ejercicio número ' + e, sets: Array.from({ length: 4 }, (_, k) => ({ order: k + 1, type: 'working', reps: 8 + (k % 3), rir: 2, load: { implement: 'barbell', barKg: 20, perSideKg: 15 + k, totalKg: 50 + 2 * k }, clipId: 'c_' + i + '_' + e, flags: [] })) })),
    clips: Array.from({ length: 10 }, (_, c) => ({ id: 'c_' + i + '_' + c, ts: '2026-11-16T18:00:00Z', transcript: 'Press banca con barra, quince kilos a cada lado, diez repeticiones, me quedaban dos. Otra igual. Ahora mancuernas de dieciséis. ' + c, events: [{ type: 'set', exerciseName: 'press banca', reps: 10, rir: 2, perSideKg: 15, perHandKg: null, totalKg: null, stackKg: null }] })) });
  return ses;
}

test('un mes real de sesiones (más de 100 KB) se cachea comprimido y se lee sin tocar Drive', () => {
  const w = makeWorld(); const a = execution(w);
  const datos = mesDeSesiones();
  a.__datos = datos;
  call(a, "writeFile_('sessions/2026-11.json', __datos)");
  const tam = JSON.stringify(datos).length;
  assert.ok(tam > 100000, 'el mes ocupa ' + Math.round(tam / 1024) + ' KB');
  assert.ok(w.cache['c:sessions/2026-11.json'].startsWith('\u0001z:'), 'cabecera de contenido comprimido');
  const trozos = Object.keys(w.cache).filter((k) => k.startsWith('c:sessions/2026-11.json#'));
  assert.ok(trozos.length >= 1 && trozos.every((k) => w.cache[k].length <= 90000), 'trozos por debajo del límite: ' + trozos.length);
  w.ops = 0;
  const leido = JSON.parse(call(execution(w), "JSON.stringify(readJson_('sessions/2026-11.json', []))"));
  assert.deepEqual(leido, datos);
  assert.equal(w.ops, 0, 'cero operaciones de Drive');
});

test('si se pierde un trozo o llega corrupto, se lee de Drive y se recompone la caché', () => {
  const w = makeWorld(); const a = execution(w);
  a.__datos = mesDeSesiones();
  call(a, "writeFile_('sessions/2026-11.json', __datos)");
  delete w.cache['c:sessions/2026-11.json#0'];
  w.ops = 0;
  assert.equal(call(execution(w), "readJson_('sessions/2026-11.json', []).length"), 16);
  assert.ok(w.ops > 0, 'ha ido a Drive');
  w.ops = 0; assert.equal(call(execution(w), "readJson_('sessions/2026-11.json', []).length"), 16); assert.equal(w.ops, 0, 'y vuelve a estar en caché');
  w.cache['c:sessions/2026-11.json#0'] = 'esto no es base64 válido de un gzip';
  assert.equal(call(execution(w), "readJson_('sessions/2026-11.json', []).length"), 16, 'un trozo corrupto no rompe la lectura');
  w.cache['c:sessions/2026-11.json'] = '\u0001z:99';
  assert.equal(call(execution(w), "readJson_('sessions/2026-11.json', []).length"), 16, 'una cabecera absurda tampoco');
});

test('lo que ni comprimido cabe no se cachea, pero se lee bien', () => {
  const w = makeWorld(); const a = execution(w);
  const ruido = require('crypto').randomBytes(1050000).toString('base64');   // incomprimible: ~1,4 MB
  a.__ruido = ruido;
  call(a, "writeFile_('media/ruido.json', { r: __ruido })");
  assert.ok(!('c:media/ruido.json' in w.cache), 'demasiado grande incluso comprimido');
  assert.equal(call(execution(w), "readJson_('media/ruido.json', null).r.length"), ruido.length);
});

test('al pasar de grande a pequeño se deja de usar la versión comprimida', () => {
  const w = makeWorld(); const a = execution(w);
  a.__datos = mesDeSesiones();
  call(a, "writeFile_('sessions/2026-12.json', __datos)");
  call(a, "writeFile_('sessions/2026-12.json', [1])");
  assert.deepEqual(JSON.parse(call(execution(w), "JSON.stringify(readJson_('sessions/2026-12.json', null))")), [1]);
});

test('el tamaño se mide en bytes, no en caracteres', () => {
  const a = execution(makeWorld());
  assert.equal(call(a, "utf8Len_('añ')"), 3);
  assert.equal(call(a, "cacheable_('x'.repeat(90000))"), true);
  assert.equal(call(a, "cacheable_('ñ'.repeat(50000))"), false, '50.000 caracteres de 2 bytes = 100 KB');
  assert.equal(call(a, "cacheable_(5)"), false);
});

test('carpeta borrada a mano: se recupera sin romperse', () => {
  const w = makeWorld(); const a = execution(w);
  call(a, "writeFile_('runs/2026-11.json', [1])");
  const runs = Object.values(w.folders).find((f) => f.name === 'runs');
  delete w.folders[runs.id];
  Object.values(w.files).forEach((f) => { if (f.parent === runs.id) f.trashed = true; });
  w.cache = Object.fromEntries(Object.entries(w.cache).filter(([k]) => !k.startsWith('c:')));   // caduca el contenido; quedan los ids
  assert.deepEqual(JSON.parse(call(execution(w), "JSON.stringify(readJson_('runs/2026-11.json', 'sin datos'))")), 'sin datos');
  call(execution(w), "writeFile_('runs/2026-11.json', [2])");
  assert.deepEqual(JSON.parse(call(execution(w), "JSON.stringify(readJson_('runs/2026-11.json', []))")), [2]);
});

test('invalidatePath_ obliga a releer de Drive (edición manual)', () => {
  const w = makeWorld(); const a = execution(w);
  call(a, "writeFile_('settings.json', { v: 1 })");
  Object.values(w.files).find((f) => f.name === 'settings.json').content = JSON.stringify({ v: 2 });   // alguien edita en Drive
  assert.equal(call(execution(w), "readJson_('settings.json', {}).v"), 1, 'hasta que caduque, la caché manda');
  call(execution(w), "invalidatePath_('settings.json')");
  assert.equal(call(execution(w), "readJson_('settings.json', {}).v"), 2);
});

test('fileExists_ y archivo corrupto', () => {
  const w = makeWorld(); const a = execution(w);
  assert.equal(call(a, "fileExists_('backups/2026-11-01.json')"), false);
  call(a, "writeFile_('backups/2026-11-01.json', {})");
  w.ops = 0; assert.equal(call(execution(w), "fileExists_('backups/2026-11-01.json')"), true); assert.equal(w.ops, 0);
  const w2 = makeWorld(); const b = execution(w2);
  call(b, "writeFile_('meta.json', {})");
  Object.values(w2.files).find((f) => f.name === 'meta.json').content = '{roto';
  w2.cache = {};
  assert.throws(() => call(execution(w2), "readJson_('meta.json', {})"), (e) => e.code === 'STORAGE');
  assert.ok(!('c:meta.json' in w2.cache), 'un archivo corrupto no se cachea');
});

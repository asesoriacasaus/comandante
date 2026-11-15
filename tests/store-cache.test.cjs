// La capa de Drive con caché, contra un Drive simulado que cuenta cada operación.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

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
    removeAll: (ks) => ks.forEach((k) => delete w.cache[k]) }) };
  w.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  return w;
}

// Cada "ejecución" de Apps Script carga el código de cero, pero comparte Drive y caché.
function execution(world) {
  const ctx = vm.createContext({ console, DriveApp: world.DriveApp, CacheService: world.CacheService, LockService: world.LockService, Logger: { log() {} } });
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

test('un archivo grande no se cachea (límite de CacheService) pero sigue funcionando', () => {
  const w = makeWorld(); const a = execution(w);
  const grande = 'x'.repeat(95000);
  call(a, "writeFile_('sessions/2026-12.json', { texto: '" + grande + "' })");
  assert.ok(!('c:sessions/2026-12.json' in w.cache), 'no se cachea el contenido');
  assert.equal(call(execution(w), "readJson_('sessions/2026-12.json', null).texto.length"), 95000);
  // y al pasar de pequeño a grande se olvida la versión pequeña
  call(a, "writeFile_('sessions/2027-01.json', [1])");
  call(a, "writeFile_('sessions/2027-01.json', { texto: '" + grande + "' })");
  assert.equal(call(execution(w), "readJson_('sessions/2027-01.json', null).texto.length"), 95000, 'no devuelve la versión pequeña vieja');
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

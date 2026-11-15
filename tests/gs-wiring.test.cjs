// Comprueba el "cableado" del servidor: toda función privada (nombre_) que se llama en algún .gs está definida,
// y cada acción del router apunta a una función que existe. Cubre las rutas que solo tocan Drive o Gemini.
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const dir = path.join(__dirname, '..', 'apps-script');
const files = fs.readdirSync(dir).filter((n) => n.endsWith('.gs'));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/`(?:[^`\\]|\\.)*`/g, '``');
const sources = Object.fromEntries(files.map((f) => [f, strip(fs.readFileSync(path.join(dir, f), 'utf8'))]));
const all = Object.values(sources).join('\n');

const defined = new Set();
for (const m of all.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(m[1]);
for (const m of all.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);

test('toda función privada llamada está definida', () => {
  const missing = new Set();
  for (const [f, src] of Object.entries(sources)) {
    for (const m of src.matchAll(/(^|[^.\w$])([A-Za-z][\w$]*_)\s*\(/g)) {
      if (!defined.has(m[2])) missing.add(f + ': ' + m[2]);
    }
  }
  assert.deepEqual([...missing], []);
});

test('toda acción del router apunta a una función definida', () => {
  const code = sources['Code.gs'];
  const block = code.slice(code.indexOf('const handlers'), code.indexOf('const action'));
  const names = [...block.matchAll(/=>\s*([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
  assert.ok(names.length >= 25, 'se esperaban al menos 25 acciones, hay ' + names.length);
  const missing = names.filter((n) => !defined.has(n));
  assert.deepEqual(missing, []);
});

test('los disparadores de tiempo apuntan a funciones públicas definidas', () => {
  const src = sources['WeeklyRun.gs'];
  for (const h of [...fs.readFileSync(path.join(dir, 'WeeklyRun.gs'), 'utf8').matchAll(/newTrigger\('(\w+)'\)/g)].map((m) => m[1])) {
    assert.ok(new RegExp('function\\s+' + h + '\\s*\\(').test(src), 'disparador sin función: ' + h);
  }
});

test('ninguna función se define dos veces', () => {
  const seen = {}; const dups = [];
  for (const [f, src] of Object.entries(sources)) for (const m of src.matchAll(/(?:^|\n)\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g)) { if (seen[m[1]]) dups.push(m[1] + ' (' + seen[m[1]] + ' y ' + f + ')'); seen[m[1]] = f; }
  assert.deepEqual(dups, []);
});

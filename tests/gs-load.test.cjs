// Apps Script carga todos los .gs en un orden que no controlamos. Cada archivo debe poder cargarse SOLO:
// nada de código de arranque que llame a funciones de otros archivos.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const dir = path.join(__dirname, '..', 'apps-script');
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.gs'))) {
  test('se carga aislado: ' + f, () => {
    const ctx = vm.createContext({ console });
    assert.doesNotThrow(() => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
  });
}

test('sin sintaxis que Apps Script no admita (?. y ??)', () => {
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.gs'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/'(?:[^'\\]|\\.)*'/g, "''");
    assert.ok(!/\?\.[A-Za-z_(\[]/.test(src) && !/[^?]\?\?[^?]/.test(src), f + ' usa ?. o ??');
  }
});

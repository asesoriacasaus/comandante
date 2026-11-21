import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearDictado, modoDictado, fijarModoDictado } from '../js/lib/dictado.js';

// Reconocedor falso que imita al de Safari: emite resultados y corta tras cada frase (como iOS con los silencios).
function falso(guion) {
  const instancias = [];
  class R {
    constructor() { instancias.push(this); this.n = instancias.length - 1; }
    start() { const paso = guion[this.n]; setTimeout(() => {
      if (!paso) return this.onend && this.onend();
      if (paso.error) { this.onerror({ error: paso.error }); return this.onend(); }
      this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: paso.parcial }], { isFinal: false })] });
      this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: paso.final }], { isFinal: true })] });
      if (paso.corta) this.onend();
    }, 1); }
    stop() { setTimeout(() => this.onend(), 1); }
  }
  return { win: { webkitSpeechRecognition: R }, instancias };
}

test('junta las frases aunque el iPhone corte la escucha en los silencios', async () => {
  const f = falso([{ parcial: 'press', final: 'Press banca 15 a cada lado', corta: true }, { parcial: '10', final: '10 repeticiones me quedaban 2' }]);
  const vistos = [];
  const d = crearDictado({ win: f.win, onParcial: (t) => vistos.push(t) });
  d.start(); await new Promise((r) => setTimeout(r, 20));
  const r = await d.stop();
  assert.equal(r.texto, 'Press banca 15 a cada lado 10 repeticiones me quedaban 2');
  assert.equal(r.error, null);
  assert.equal(f.instancias.length, 2, 'se reanudó tras el corte');
  assert.ok(vistos.includes('press'), 'enseña lo que va oyendo');
});

test('un error grave se devuelve para pasar a grabar audio', async () => {
  const f = falso([{ error: 'not-allowed' }]);
  const d = crearDictado({ win: f.win });
  d.start(); await new Promise((r) => setTimeout(r, 10));
  const r = await d.stop();
  assert.equal(r.error, 'not-allowed'); assert.equal(r.texto, '');
});

test('modo por defecto: iPhone si hay reconocedor; si no, audio', () => {
  const m = {}; const st = { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; } };
  assert.equal(modoDictado(st, { webkitSpeechRecognition: function () {} }), 'iphone');
  assert.equal(modoDictado(st, {}), 'audio');
  fijarModoDictado('audio', st);
  assert.equal(modoDictado(st, { webkitSpeechRecognition: function () {} }), 'audio', 'elegido por el usuario');
  assert.equal(crearDictado({ win: {} }), null);
});

test('si iOS no deja reanudar tras un silencio, Parar devuelve lo oído y no se queda colgado', async () => {
  let n = 0;
  class R { constructor() { n++; this.n = n; } start() {
    if (this.n > 1) throw new Error('not allowed');
    setTimeout(() => { this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'press banca 10 repeticiones' }], { isFinal: true })] }); this.onend(); }, 1);
  } stop() { /* no avisa */ } }
  const d = crearDictado({ win: { webkitSpeechRecognition: R } });
  d.start(); await new Promise((r) => setTimeout(r, 10));
  const r = await d.stop();
  assert.equal(r.texto, 'press banca 10 repeticiones');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRate, wavHeader, base64ToBytes, wavBlobFromBase64, silentWavBlob } from '../js/lib/audio.js';

test('frecuencia del PCM', () => {
  assert.equal(parseRate('audio/L16;codec=pcm;rate=24000'), 24000);
  assert.equal(parseRate('audio/L16;codec=pcm;rate=16000'), 16000);
  assert.equal(parseRate('audio/L16'), 24000); assert.equal(parseRate(null), 24000);
});
test('cabecera WAV correcta', () => {
  const h = wavHeader(48000, 24000, 1);
  const s = (o, n) => String.fromCharCode(...h.slice(o, o + n));
  const v = new DataView(h.buffer);
  assert.equal(h.length, 44);
  assert.equal(s(0, 4), 'RIFF'); assert.equal(s(8, 4), 'WAVE'); assert.equal(s(12, 4), 'fmt '); assert.equal(s(36, 4), 'data');
  assert.equal(v.getUint32(4, true), 36 + 48000); assert.equal(v.getUint16(20, true), 1); assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 24000); assert.equal(v.getUint32(28, true), 48000); assert.equal(v.getUint16(34, true), 16); assert.equal(v.getUint32(40, true), 48000);
});
test('de base64 a WAV', async () => {
  assert.deepEqual([...base64ToBytes('AQID')], [1, 2, 3]);
  const blob = wavBlobFromBase64('AQIDBA==', 'audio/L16;codec=pcm;rate=16000');
  assert.equal(blob.type, 'audio/wav'); assert.equal(blob.size, 44 + 4);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(44)], [1, 2, 3, 4]);
  assert.equal(new DataView(bytes.buffer).getUint32(24, true), 16000);
});
test('silencio', async () => { const b = silentWavBlob(); assert.equal(b.size, 44 + 24000); assert.equal(b.type, 'audio/wav'); });

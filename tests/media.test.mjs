import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickAudioMime } from '../js/lib/media.js';

test('iPhone: elige audio/mp4', () => {
  assert.equal(pickAudioMime({ isTypeSupported: (t) => t === 'audio/mp4' }), 'audio/mp4');
});
test('Chrome: cae a webm', () => {
  assert.equal(pickAudioMime({ isTypeSupported: (t) => t.startsWith('audio/webm') }), 'audio/webm;codecs=opus');
});
test('Sin MediaRecorder: cadena vacía', () => {
  assert.equal(pickAudioMime(null), '');
});

// Audio de la voz del Comandante: Gemini devuelve PCM de 16 bits sin cabecera; el navegador necesita un WAV.

/** "audio/L16;codec=pcm;rate=24000" → 24000 (24000 si no se indica). */
export function parseRate(mime) {
  const m = /rate=(\d{4,6})/.exec(String(mime || ''));
  return m ? Number(m[1]) : 24000;
}

/** Cabecera WAV (PCM, 16 bits) para `dataLength` bytes de audio. */
export function wavHeader(dataLength, sampleRate = 24000, channels = 1) {
  const b = new ArrayBuffer(44);
  const v = new DataView(b);
  const txt = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  txt(0, 'RIFF'); v.setUint32(4, 36 + dataLength, true); txt(8, 'WAVE');
  txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * channels * 2, true); v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  txt(36, 'data'); v.setUint32(40, dataLength, true);
  return new Uint8Array(b);
}

export function base64ToBytes(b64) {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Blob WAV a partir del PCM en base64 que devuelve el servidor. */
export function wavBlobFromBase64(b64, mime) {
  const pcm = base64ToBytes(b64);
  return new Blob([wavHeader(pcm.length, parseRate(mime)), pcm], { type: 'audio/wav' });
}

/** Medio segundo de silencio: sirve para "desbloquear" la reproducción dentro del gesto del usuario (iOS). */
export function silentWavBlob() {
  const pcm = new Uint8Array(24000);
  return new Blob([wavHeader(pcm.length, 24000), pcm], { type: 'audio/wav' });
}

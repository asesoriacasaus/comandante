// Grabación de clips (MediaRecorder) y almacén local (IndexedDB). El micrófono se pide una sola vez
// por sesión y el mismo flujo de audio se reutiliza para todos los clips (iOS lo pide al abrir la app).
import { pickAudioMime } from './lib/media.js';

export const MAX_CLIP_MS = 75000; // 75 s: por debajo del límite de 2 MB con holgura

// ---------- IndexedDB ----------
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('comandante', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('clips', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction('clips', mode);
    const store = t.objectStore('clips');
    let out;
    Promise.resolve(fn(store)).then((v) => { out = v; });
    t.oncomplete = () => { db.close(); resolve(out); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  }));
}

const wrap = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

export function createIdbStore() {
  return {
    put: (clip) => tx('readwrite', (s) => wrap(s.put(clip))),
    all: () => tx('readonly', (s) => wrap(s.getAll())),
    remove: (id) => tx('readwrite', (s) => wrap(s.delete(id))),
    update: (id, patch) => tx('readwrite', async (s) => {
      const cur = await wrap(s.get(id));
      if (cur) await wrap(s.put(Object.assign(cur, patch)));
    })
  };
}

// ---------- Grabadora ----------
export function createRecorder({ onTick = () => {}, onAutoStop = () => {} } = {}) {
  let stream = null; let rec = null; let chunks = []; let t0 = 0; let timer = null; let auto = null;
  // Para dibujar las ondas: un analizador sobre el mismo micrófono. Es opcional: si falla, se graba igual.
  let actx = null; let fuente = null; let analizador = null; let datos = null;

  function prepararAudio() {   // se llama dentro del toque del usuario (iOS solo deja arrancar el audio así)
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      actx = actx || new AC();
      if (actx.state === 'suspended') actx.resume().catch(() => {});
    } catch (_) { actx = null; }
  }
  function conectarAnalizador() {
    try {
      if (!actx || !stream) return;
      if (fuente && fuente.mediaStream === stream) return;
      if (fuente) fuente.disconnect();
      fuente = actx.createMediaStreamSource(stream);
      analizador = actx.createAnalyser();
      analizador.fftSize = 256; analizador.smoothingTimeConstant = 0.75;
      fuente.connect(analizador);
      datos = new Uint8Array(analizador.frequencyBinCount);
    } catch (_) { analizador = null; }
  }
  /** Espectro actual (0-255 por banda) o null si no hay analizador o no se está grabando. */
  function niveles() {
    if (!analizador || !rec || rec.state !== 'recording') return null;
    analizador.getByteFrequencyData(datos);
    return datos;
  }

  async function acquireMic() {
    if (stream && stream.getTracks().every((t) => t.readyState === 'live')) return;
    if (!navigator.mediaDevices || !globalThis.MediaRecorder) throw Object.assign(new Error('Este navegador no puede grabar'), { code: 'UNSUPPORTED' });
    // Filtros del propio móvil contra el ruido del gimnasio (música, eco): se piden; si no los hay, se ignoran.
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true, autoGainControl: true } });
  }

  function releaseMic() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    try { if (fuente) fuente.disconnect(); } catch (_) { /* nada */ }
    fuente = null; analizador = null;
  }

  async function start() {
    prepararAudio();
    await acquireMic();
    conectarAnalizador();
    const mime = pickAudioMime();
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    t0 = Date.now();
    rec.start();
    timer = setInterval(() => onTick(Date.now() - t0), 250);
    auto = setTimeout(() => { onAutoStop(); }, MAX_CLIP_MS);
  }

  function stop() {
    return new Promise((resolve, reject) => {
      if (!rec || rec.state !== 'recording') { reject(new Error('No se está grabando')); return; }
      clearInterval(timer); clearTimeout(auto);
      rec.onstop = () => {
        const mime = rec.mimeType || pickAudioMime() || 'audio/mp4';
        resolve({ blob: new Blob(chunks, { type: mime }), mime: mime, ms: Date.now() - t0 });
        chunks = []; rec = null;
      };
      rec.stop();
    });
  }

  return { start, stop, releaseMic, niveles, isRecording: () => !!rec && rec.state === 'recording' };
}

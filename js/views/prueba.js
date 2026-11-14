// Prueba de riesgo de la Fase 0 (PLAN 11 y 12): clip de voz y pantallazos de verdad, con tiempos.
import { call } from '../api.js';
import { pickAudioMime, blobToBase64, shrinkImage } from '../lib/media.js';

export function render(el) {
  el.innerHTML = `
    <section>
      <p class="etiqueta">Fase 0</p>
      <h2>Prueba de voz y pantallazo</h2>
      <div class="card">
        <h3>Clip de voz</h3>
        <p class="nota">Pulsa, dicta una serie ("press banca, 20 a cada lado, 8 repeticiones, me quedaban dos") y vuelve a pulsar.</p>
        <button type="button" id="grabar" class="btn btn-grabar">Grabar</button>
        <p id="estado-audio" class="estado" role="status" aria-live="polite"></p>
        <pre id="salida-audio" class="salida" hidden></pre>
      </div>
      <div class="card">
        <h3>Pantallazo</h3>
        <p class="nota">Elige una captura del reloj o de la báscula.</p>
        <label>Captura <input id="imagen" type="file" accept="image/*"></label>
        <p id="estado-img" class="estado" role="status" aria-live="polite"></p>
        <pre id="salida-img" class="salida" hidden></pre>
      </div>
      <div class="card">
        <h3>Modelos disponibles</h3>
        <button type="button" id="modelos" class="btn btn-sec">Listar modelos de la clave</button>
        <p id="estado-mod" class="estado" role="status" aria-live="polite"></p>
        <pre id="salida-mod" class="salida" hidden></pre>
      </div>
    </section>`;

  const q = (s) => el.querySelector(s);
  const pinta = (id, msg, tipo = '') => { const n = q('#estado-' + id); n.textContent = msg; n.className = 'estado ' + tipo; };
  const salida = (id, obj) => { const n = q('#salida-' + id); n.hidden = false; n.textContent = JSON.stringify(obj, null, 2); };

  async function enviar(id, kind, mime, blob, extra = {}) {
    pinta(id, 'Subiendo ' + Math.round(blob.size / 1024) + ' KB…');
    const t0 = performance.now();
    try {
      const data = await blobToBase64(blob);
      const r = await call('ai.probe', { kind, mime, data }, { timeoutMs: 120000 });
      pinta(id, 'Listo en ' + Math.round(performance.now() - t0) + ' ms totales (IA: ' + r.ms + ' ms)', 'ok');
      salida(id, Object.assign({}, extra, r));
    } catch (err) {
      console.error(err);
      pinta(id, err.code + ': ' + err.message, 'error');
    }
  }

  // --- Audio ---
  let rec = null; let chunks = []; let t0 = 0;
  q('#grabar').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    if (!navigator.mediaDevices || !globalThis.MediaRecorder) { pinta('audio', 'Este navegador no puede grabar', 'error'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      const mime = pickAudioMime();
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        btn.textContent = 'Grabar'; btn.classList.remove('activo');
        const blob = new Blob(chunks, { type: rec.mimeType || mime });
        enviar('audio', 'audio', blob.type, blob, { grabadoMs: Math.round(performance.now() - t0), mimeGrabado: blob.type });
      };
      t0 = performance.now();
      rec.start();
      btn.textContent = 'Parar'; btn.classList.add('activo');
      pinta('audio', 'Grabando…');
    } catch (err) {
      console.error(err);
      pinta('audio', 'Sin acceso al micrófono: ' + err.name, 'error');
    }
  });

  // --- Imagen ---
  q('#imagen').addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    try {
      const blob = await shrinkImage(f);
      await enviar('img', 'image', 'image/jpeg', blob, { original: f.type, originalKB: Math.round(f.size / 1024) });
    } catch (err) { pinta('img', err.message, 'error'); }
  });

  // --- Modelos ---
  q('#modelos').addEventListener('click', async () => {
    pinta('mod', 'Consultando…');
    try { const r = await call('ai.models', {}, { timeoutMs: 60000 }); pinta('mod', r.models.length + ' modelos', 'ok'); salida('mod', r.models); }
    catch (err) { pinta('mod', err.code + ': ' + err.message, 'error'); }
  });
}

// Botón "Escuchar": lee en voz alta un mensaje del Comandante con la voz de orador del servidor.
import { call } from '../api.js';
import { h } from './dom.js';
import { wavBlobFromBase64, silentWavBlob } from './audio.js';

export const MAX_CHARS = 600;
const cache = new Map();   // texto → URL del audio (para no pagar dos veces por lo mismo)
let current = null;        // { audio, reset }
let silentUrl = null;

export function detenerVoz() {
  if (!current) return;
  try { current.audio.pause(); } catch (_) { /* ya parado */ }
  current.reset();
  current = null;
}

function desbloquear(audio) {
  silentUrl = silentUrl || URL.createObjectURL(silentWavBlob());
  audio.src = silentUrl;
  return audio.play().catch(() => { /* si falla, el play posterior lo dirá */ });
}

export function botonEscuchar(texto, etiqueta = 'Escuchar') {
  const t = String(texto || '').trim();
  if (!t || t.length > MAX_CHARS) return null;
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const btn = h('button', { type: 'button', class: 'btn btn-sec' }, etiqueta);
  const reset = () => { btn.disabled = false; btn.textContent = etiqueta; };

  btn.addEventListener('click', async () => {
    if (current && current.btn === btn) { detenerVoz(); return; }
    detenerVoz();
    const audio = new Audio();
    current = { audio, btn, reset };
    btn.disabled = true; btn.textContent = 'Preparando voz…'; estado.textContent = ''; estado.className = 'estado';
    try {
      await desbloquear(audio);
      let url = cache.get(t);
      if (!url) {
        const r = await call('tts.speak', { text: t }, { timeoutMs: 120000 });
        url = URL.createObjectURL(wavBlobFromBase64(r.data, r.mime));
        cache.set(t, url);
      }
      if (!current || current.audio !== audio) return;   // el usuario cambió de pantalla o pulsó otra voz
      audio.src = url;
      audio.onended = () => { if (current && current.audio === audio) current = null; reset(); };
      btn.disabled = false; btn.textContent = 'Parar';
      await audio.play();
    } catch (err) {
      console.error(err);
      if (current && current.audio === audio) current = null;
      reset();
      estado.className = 'estado error'; estado.textContent = err.message || 'No se pudo reproducir la voz';
    }
  });
  return h('div', { class: 'voz' }, btn, estado);
}

// Chat con el Comandante: preguntas sobre tus datos, escritas o dictadas. Las respuestas salen del servidor.
import { call } from '../api.js';
import { h } from '../lib/dom.js';
import { blobToBase64 } from '../lib/media.js';
import { createRecorder } from '../recorder.js';
import { botonEscuchar } from '../lib/voz.js';
import { loadHistory, saveHistory, turnsFor, turnsForAudio, QUICK_PROMPTS, MAX_USER_CHARS } from '../lib/chat.js';

const vigente = (el) => el.dataset.route === 'chat';
const almacen = () => { try { return sessionStorage; } catch (_) { return { getItem: () => null, setItem: () => {} }; } };
let msgs = null;          // se carga una vez por apertura de la app y sobrevive al cambio de pantalla
let recorder = null;

export function render(el) {
  if (msgs === null) msgs = loadHistory(almacen());
  const st = { busy: false, grabando: false, error: '', pendiente: null };

  const lista = h('div', { class: 'chat-lista', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversación' });
  const area = h('textarea', { rows: 2, maxlength: MAX_USER_CHARS, 'aria-label': 'Tu mensaje al Comandante', placeholder: 'Pregúntale al Comandante…' });
  const enviar = h('button', { type: 'button', class: 'btn' }, 'Enviar');
  const dictar = h('button', { type: 'button', class: 'btn btn-sec' }, 'Dictar');
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });

  const pintar = () => {
    if (!vigente(el)) return;
    const nodos = msgs.map((m) => (m.role === 'user'
      ? h('div', { class: 'burbuja usuario' }, m.text)
      : h('div', { class: 'burbuja comandante' }, h('p', { class: 'etiqueta' }, 'El Comandante'),
          ...m.text.split(/\n{1,}/).filter(Boolean).map((p) => h('p', {}, p)), botonEscuchar(m.text))));
    if (st.pendiente) nodos.push(h('div', { class: 'burbuja usuario' }, st.pendiente));
    if (st.busy) nodos.push(h('div', { class: 'burbuja comandante pensando' }, 'El Comandante está pensando…'));
    if (!msgs.length && !st.busy) {
      nodos.push(h('p', { class: 'nota' }, 'Pregúntale por tu plan de hoy, tu semana, tu peso o tu comida. Responde con tus datos y no es un médico: ante un dolor, para y consulta a un profesional.'),
        h('div', { class: 'chips' }, QUICK_PROMPTS.map((q) => h('button', { type: 'button', class: 'btn btn-sec', onClick: () => mandar(q) }, q))));
    }
    lista.replaceChildren(...nodos);
    enviar.disabled = st.busy || st.grabando; dictar.disabled = st.busy;
    dictar.textContent = st.grabando ? 'Parar' : 'Dictar';
    estado.textContent = st.error; estado.className = 'estado' + (st.error ? ' error' : '');
    const ultimo = lista.lastElementChild; if (ultimo && ultimo.scrollIntoView) ultimo.scrollIntoView({ block: 'nearest' });
  };

  const terminar = (r, textoUsuario) => {
    if (textoUsuario) msgs.push({ role: 'user', text: textoUsuario });
    msgs.push({ role: 'coach', text: r.reply });
    saveHistory(almacen(), msgs);
    st.busy = false; st.pendiente = null; st.error = '';
    pintar();
  };
  const fallar = (err) => {
    console.error(err);
    st.busy = false; st.pendiente = null; st.error = err.message || 'No se pudo conseguir la respuesta.';
    pintar();
  };

  async function mandar(texto) {
    const t = String(texto || '').trim();
    if (!t || st.busy) return;
    st.busy = true; st.error = ''; st.pendiente = t; area.value = ''; pintar();
    try {
      const r = await call('coach.chat', { turns: turnsFor(msgs, t) }, { timeoutMs: 150000 });
      terminar(r, t);
    } catch (err) { area.value = t; fallar(err); }
  }

  enviar.addEventListener('click', () => mandar(area.value));
  area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); mandar(area.value); } });

  dictar.addEventListener('click', async () => {
    recorder = recorder || createRecorder({ onAutoStop: () => dictar.click() });
    if (!st.grabando) {
      try { await recorder.start(); st.grabando = true; st.error = ''; pintar(); }
      catch (err) { console.error(err); st.error = 'Sin acceso al micrófono. Actívalo en Ajustes de iOS para este sitio.'; pintar(); }
      return;
    }
    st.grabando = false; st.busy = true; st.pendiente = '🎙 Mensaje de voz…'; pintar();
    let clip;
    try { clip = await recorder.stop(); } catch (err) { st.busy = false; st.pendiente = null; pintar(); return; }
    recorder.releaseMic();
    try {
      const data = await blobToBase64(clip.blob);
      const r = await call('coach.chat', { turns: turnsForAudio(msgs), audio: { mime: clip.mime, data } }, { timeoutMs: 150000 });
      terminar(r, r.transcript || '🎙 (mensaje de voz)');
    } catch (err) { fallar(err); }
  });

  const nueva = h('button', { type: 'button', class: 'btn btn-sec', onClick: () => {
    if (!msgs.length || confirm('¿Empezar una conversación nueva?')) { msgs = []; saveHistory(almacen(), msgs); st.error = ''; pintar(); }
  } }, 'Nueva conversación');

  el.replaceChildren(h('section', {},
    h('p', { class: 'etiqueta' }, 'Comandante'), h('h2', {}, 'Habla con el Comandante'),
    lista, estado,
    h('label', {}, 'Tu mensaje', area),
    h('div', { class: 'acciones' }, enviar, dictar, nueva)));
  pintar();
}

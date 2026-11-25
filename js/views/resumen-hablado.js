// Resumen hablado del entreno: al terminar, el usuario cuenta cómo ha ido y queda guardado en la sesión.
// Se usa en la Revisión y en el detalle del Diario.
import { call } from '../api.js';
import { h } from '../lib/dom.js';
import { blobToBase64 } from '../lib/media.js';
import { createRecorder } from '../recorder.js';
import { crearOndas } from '../lib/ondas.js';

let recorder = null;

const ENERGIA = ['', 'Muy cansado', 'Cansado', 'Normal', 'Con energía', 'A tope'];

/** Lo ya guardado: resumen, energía, sensaciones, molestias y lo que hay que recordar. */
export function vistaResumen(d) {
  if (!d) return null;
  const datos = [];
  if (d.energy) datos.push(h('span', { class: 'chip' }, 'Energía ' + d.energy + '/5 · ' + ENERGIA[d.energy]));
  if (d.feeling) datos.push(h('span', { class: 'chip' }, d.feeling));
  return h('div', { class: 'resumen-hablado' },
    h('p', {}, d.summary),
    datos.length ? h('div', { class: 'chips-datos' }, ...datos) : null,
    ...(d.pains || []).map((p) => h('p', { class: 'aviso peligro' }, 'Molestia: ' + p)),
    d.nextTime ? h('p', { class: 'nota' }, 'Para la próxima: ' + d.nextTime) : null,
    d.transcript ? h('details', {}, h('summary', {}, 'Lo que dijiste'), h('p', { class: 'nota' }, '«' + d.transcript + '»')) : null);
}

/**
 * Bloque completo con el botón de grabar. `onGuardado(session)` recibe la sesión actualizada.
 * La grabación se conserva si el envío falla, para reintentar sin volver a hablar.
 */
export function bloqueResumen(session, onGuardado) {
  const caja = h('div', {});
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const boton = h('button', { type: 'button', class: 'btn' + (session.debrief ? ' btn-sec' : '') }, session.debrief ? 'Volver a grabar' : 'Grabar resumen');
  let grabando = false;
  let clip = null;

  const enviar = async () => {
    boton.disabled = true; boton.textContent = 'Procesando…'; estado.className = 'estado'; estado.textContent = 'Escuchando tu resumen…';
    try {
      const data = await blobToBase64(clip.blob);
      const r = await call('session.debrief', { id: session.id, mime: clip.mime, data }, { timeoutMs: 150000 });
      clip = null;
      onGuardado(r.session);
    } catch (err) {
      console.error(err);
      estado.className = 'estado error'; estado.textContent = err.message + ' La grabación sigue aquí: puedes reintentar.';
      boton.disabled = false; boton.textContent = 'Reintentar envío';
    }
  };

  recorder = recorder || createRecorder({ onTick: (ms) => { if (grabando) estado.textContent = 'Grabando ' + Math.floor(ms / 1000) + ' s'; }, onAutoStop: () => { if (grabando) boton.click(); } });
  const ondas = crearOndas(() => recorder.niveles(), { clase: 'ondas-resumen' });
  ondas.nodo.hidden = true;
  boton.addEventListener('click', async () => {
    if (clip) { enviar(); return; }
    if (!grabando) {
      try { await recorder.start(); grabando = true; boton.textContent = 'Parar'; boton.classList.add('activo'); estado.className = 'estado'; estado.textContent = 'Grabando 0 s'; ondas.nodo.hidden = false; ondas.iniciar(); }
      catch (err) { console.error(err); estado.className = 'estado error'; estado.textContent = 'Sin acceso al micrófono. Actívalo en Ajustes de iOS para este sitio.'; }
      return;
    }
    grabando = false; boton.classList.remove('activo'); ondas.parar(); ondas.nodo.hidden = true;
    try { clip = await recorder.stop(); } catch (err) { console.error(err); boton.textContent = 'Grabar resumen'; return; }
    recorder.releaseMic();
    enviar();
  });

  caja.append(h('div', { class: 'bloque' },
    h('p', { class: 'etiqueta' }, 'Resumen hablado del entreno'),
    session.debrief ? vistaResumen(session.debrief)
      : h('p', { class: 'nota' }, 'Cuenta en voz alta cómo ha ido: energía, sensaciones, molestias y qué quieres cambiar la próxima vez. Hasta 75 segundos.'),
    h('div', { class: 'acciones' }, boton), ondas.nodo, estado));
  return caja;
}

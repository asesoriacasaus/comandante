// Cámara dentro de la app: la imagen en vivo en una hoja, con disparador, sin salir a la cámara del sistema.
// Si el navegador no deja usar la cámara (permiso denegado, versión antigua), se ofrece elegir de la galería.
import { h } from './dom.js';
import { abrirHoja } from './hoja.js';

/**
 * @param {object} o
 * @param {(blob: Blob) => Promise<void>|void} o.onFoto  recibe cada foto (JPEG)
 * @param {() => void} o.onGaleria   abre el selector de archivos (debe llamarse en el mismo toque)
 * @param {number} [o.max]  fotos que aún caben
 */
export function abrirCamara({ onFoto, onGaleria, max = 3 }) {
  let stream = null; let hechas = 0;
  const video = h('video', { class: 'camara-video', playsinline: true, muted: true, autoplay: true });
  video.muted = true; video.setAttribute('playsinline', ''); video.setAttribute('webkit-playsinline', '');
  const flash = h('div', { class: 'camara-flash', 'aria-hidden': 'true' });
  const marco = h('div', { class: 'camara-marco' }, video, flash, h('div', { class: 'camara-guia', 'aria-hidden': 'true' }));
  const estado = h('p', { class: 'camara-estado', role: 'status', 'aria-live': 'polite' }, 'Abriendo la cámara…');
  const disparar = h('button', { type: 'button', class: 'camara-disparar', 'aria-label': 'Hacer la foto', disabled: true });
  const galeria = h('button', { type: 'button', class: 'camara-lateral' }, 'Galería');
  const listo = h('button', { type: 'button', class: 'camara-lateral camara-listo' }, 'Listo');
  const parar = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
  const hj = abrirHoja({ titulo: 'Foto de la comida', subtitulo: 'El plato entero, con los cubiertos o la mano a la vista', alta: true, clase: 'hoja-camara', onCerrar: parar });
  hj.poner([marco, estado, h('div', { class: 'camara-controles' }, galeria, disparar, listo)]);

  galeria.addEventListener('click', () => { onGaleria(); hj.cerrar(); });
  listo.addEventListener('click', () => hj.cerrar());
  disparar.addEventListener('click', async () => {
    if (!stream || !video.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    flash.classList.remove('activo'); void flash.offsetWidth; flash.classList.add('activo');
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.9));
    if (!blob) { estado.textContent = 'No se pudo hacer la foto. Prueba otra vez.'; return; }
    hechas++;
    try { await onFoto(blob); } catch (err) { console.error(err); }
    if (hechas >= max) { estado.textContent = 'Foto lista.'; setTimeout(() => hj.cerrar(), 350); return; }
    estado.textContent = hechas + (hechas === 1 ? ' foto lista' : ' fotos listas') + '. Haz otra (por ejemplo, la etiqueta) o pulsa Listo.';
    listo.classList.add('destacado');
  });

  (async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('sin cámara');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      if (!hj.hoja.isConnected) { parar(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      disparar.disabled = false;
      estado.textContent = 'Encuadra el plato y pulsa el botón.';
      marco.classList.add('lista');
    } catch (err) {
      console.error(err);
      estado.textContent = 'No puedo usar la cámara aquí (permiso o navegador). Elige la foto de la galería o hazla con la cámara del móvil.';
      galeria.classList.add('destacado');
    }
  })();
  return hj;
}

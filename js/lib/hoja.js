// Hoja inferior al estilo de iOS: sube desde abajo con efecto muelle sobre un fondo difuminado; se cierra con la X, tocando
// el fondo, con Escape o arrastrándola hacia abajo. El contenido lo pone quien la abre. Sin estilos en línea en el HTML:
// los desplazamientos del arrastre se aplican por JavaScript (lo permite la política de seguridad).
import { h } from './dom.js';

let abierta = null;

/**
 * @returns {{ hoja: HTMLElement, cuerpo: HTMLElement, cerrar: () => Promise<void>, poner: (nodos) => void }}
 */
export function abrirHoja({ titulo = '', subtitulo = '', contenido = null, clase = '', onCerrar = null, alta = false } = {}) {
  if (abierta) abierta.cerrar(true);
  const anterior = document.activeElement;
  const cuerpo = h('div', { class: 'hoja-cuerpo' });
  const cerrarBtn = h('button', { type: 'button', class: 'hoja-cerrar', 'aria-label': 'Cerrar' }, '×');
  const asa = h('div', { class: 'hoja-asa', 'aria-hidden': 'true' });
  const cab = h('div', { class: 'hoja-cab' }, asa, h('div', { class: 'hoja-titulos' }, titulo ? h('h2', {}, titulo) : null, subtitulo ? h('p', {}, subtitulo) : null), cerrarBtn);
  const hoja = h('div', { class: 'hoja ' + clase + (alta ? ' alta' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo || 'Ventana' }, cab, cuerpo);
  const fondo = h('div', { class: 'hoja-fondo' });
  const capa = h('div', { class: 'hoja-capa' }, fondo, hoja);
  const poner = (nodos) => cuerpo.replaceChildren(...[].concat(nodos).filter(Boolean));
  if (contenido) poner(contenido);
  document.body.append(capa);
  document.body.classList.add('hoja-abierta');
  requestAnimationFrame(() => requestAnimationFrame(() => capa.classList.add('visible')));
  setTimeout(() => { try { cerrarBtn.focus({ preventScroll: true }); } catch (_) { /* nada */ } }, 60);

  let cerrada = false;
  function cerrar(inmediata = false) {
    if (cerrada) return Promise.resolve();
    cerrada = true; abierta = null;
    document.removeEventListener('keydown', tecla);
    capa.classList.remove('visible');
    hoja.style.transform = '';
    document.body.classList.remove('hoja-abierta');
    if (onCerrar) { try { onCerrar(); } catch (e) { console.error(e); } }
    try { if (anterior && anterior.focus) anterior.focus({ preventScroll: true }); } catch (_) { /* nada */ }
    return new Promise((ok) => setTimeout(() => { capa.remove(); ok(); }, inmediata ? 0 : 380));
  }
  const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', tecla);
  cerrarBtn.addEventListener('click', () => cerrar());
  fondo.addEventListener('click', () => cerrar());

  // Arrastrar hacia abajo desde la cabecera (o desde el cuerpo si está arriba del todo) para cerrar.
  let y0 = null; let t0 = 0; let dy = 0;
  const empezar = (e) => {
    if (e.target.closest('button, input, select, textarea, video') && !e.target.closest('.hoja-asa')) return;
    if (!cab.contains(e.target) && cuerpo.scrollTop > 0) return;
    y0 = e.clientY; t0 = performance.now(); dy = 0; hoja.classList.add('arrastrando');
  };
  const mover = (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    hoja.style.transform = 'translateY(' + dy + 'px)';
  };
  const soltar = () => {
    if (y0 === null) return;
    const v = dy / Math.max(1, performance.now() - t0);
    y0 = null; hoja.classList.remove('arrastrando');
    if (dy > 120 || (v > 0.6 && dy > 30)) cerrar(); else hoja.style.transform = '';
  };
  hoja.addEventListener('pointerdown', empezar);
  window.addEventListener('pointermove', mover);
  window.addEventListener('pointerup', soltar, { once: false });
  window.addEventListener('pointercancel', soltar);
  const limpiar = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar); window.removeEventListener('pointercancel', soltar); };
  const cerrarYLimpiar = (i) => { limpiar(); return cerrar(i); };

  abierta = { cerrar: cerrarYLimpiar };
  return { hoja, cuerpo, poner, cerrar: cerrarYLimpiar };
}

/** Hoja de acciones (como el menú de iOS): botones grandes y "Cancelar". `acciones` = [{ texto, peligro, accion }]. */
export function hojaAcciones({ titulo = '', acciones = [] }) {
  const hj = abrirHoja({ titulo, clase: 'hoja-acciones' });
  hj.poner([h('div', { class: 'acciones-lista' }, ...acciones.map((a) => h('button', { type: 'button', class: 'accion-item' + (a.peligro ? ' peligro' : ''),
    onClick: async () => { await hj.cerrar(); a.accion(); } }, a.texto))),
  h('button', { type: 'button', class: 'accion-item accion-cancelar', onClick: () => hj.cerrar() }, 'Cancelar')]);
  return hj;
}

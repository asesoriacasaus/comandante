// Tarjeta que se despliega con una animación suave. El estado (abierta o cerrada) lo guarda quien la usa, para que
// sobreviva a los repintados. Cerrada, su contenido queda inerte: ni se enfoca ni lo lee el lector de pantalla.
import { h } from './dom.js';

/**
 * @param {object} o
 * @param {boolean} o.abierto
 * @param {(abierto: boolean) => void} o.onCambio
 * @param {Node|Node[]} o.cabecera  lo que se ve siempre (va dentro del botón)
 * @param {Node|Node[]} o.cuerpo    lo que se despliega
 * @param {string} [o.clase]
 * @param {string} [o.etiqueta]     texto accesible del botón
 * @param {Node|null} [o.pie]       algo que se ve siempre, debajo de la cabecera y fuera del botón
 */
export function plegable({ abierto, onCambio, cabecera, cuerpo, clase = '', etiqueta = null, pie = null }) {
  const interior = h('div', { class: 'plegable-interior' }, cuerpo);
  const zona = h('div', { class: 'plegable-cuerpo' }, interior);
  const btn = h('button', { type: 'button', class: 'plegable-cab', 'aria-expanded': String(!!abierto), 'aria-label': etiqueta },
    h('span', { class: 'plegable-titulo' }, cabecera), h('span', { class: 'plegable-flecha', 'aria-hidden': 'true' }));
  const caja = h('div', { class: 'plegable ' + clase + (abierto ? ' abierto' : '') }, btn, pie, zona);
  const fijar = (a) => {
    caja.classList.toggle('abierto', a);
    btn.setAttribute('aria-expanded', String(a));
    if (a) interior.removeAttribute('inert'); else interior.setAttribute('inert', '');
  };
  fijar(!!abierto);
  btn.addEventListener('click', () => { const a = !caja.classList.contains('abierto'); fijar(a); if (onCambio) onCambio(a); });
  return caja;
}

/** Estado recordado en este móvil (con tolerancia a que no haya almacenamiento). */
export function recordado(clave, porDefecto) {
  try { const v = localStorage.getItem(clave); return v === null ? porDefecto : v === '1'; } catch (_) { return porDefecto; }
}
export function recordar(clave, valor) {
  try { localStorage.setItem(clave, valor ? '1' : '0'); } catch (_) { /* sin almacenamiento */ }
}

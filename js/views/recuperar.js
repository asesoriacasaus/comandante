// Recuperar una sesión descartada que tenía series (por ejemplo, si Hoy ofreció una sesión vacía y la real acabó descartada).
// La descartada vuelve a "hecha" con todas sus series, más las que marques de la guardada ese día, que pasa a descartada.
import { call } from '../api.js';
import { h } from '../lib/dom.js';
import { formatLoad, formatDateEs } from '../lib/format.js';
import { borrar } from '../lib/cache.js';
import { avisar } from '../lib/barra.js';
import { CLAVE_RESUMEN } from '../lib/sesiones-datos.js';

const OCULTAS = 'comandante.recuperar.ocultas';
const ocultas = () => { try { return new Set(JSON.parse(localStorage.getItem(OCULTAS) || '[]')); } catch (_) { return new Set(); } };
function ocultar(id) { try { const s = ocultas(); s.add(id); localStorage.setItem(OCULTAS, JSON.stringify([...s])); } catch (_) { /* sin almacenamiento */ } }

/** Clave de una serie: igual que setKey_ del servidor. */
export const claveSerie = (exerciseId, set) => exerciseId + '|' + (set.at || '') + '|' + (set.order || 0);
const nSeries = (s) => (s && s.exercises || []).reduce((n, x) => n + (x.sets || []).length, 0);
const hora = (at) => { const d = new Date(at); return isNaN(d) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); };

/** Pide las recuperables y pinta los avisos dentro de `caja`. `abrir(item)` muestra la pantalla de recuperar. */
export async function avisosRecuperables(caja, abrir) {
  let items = [];
  try { items = (await call('sessions.recoverable', {}, { timeoutMs: 60000, silent: true })).items || []; } catch (_) { return; }
  const fuera = ocultas();
  const visibles = items.filter((it) => !fuera.has(it.discarded.id));
  caja.replaceChildren(...visibles.map((it) => {
    const nodo = h('div', { class: 'aviso aviso-recuperar' },
      h('p', {}, 'Tienes una sesión descartada del ' + formatDateEs(it.discarded.date) + ' con ' + nSeries(it.discarded) + ' series. Si era la buena, puedes recuperarla.'),
      h('div', { class: 'acciones compactas' },
        h('button', { type: 'button', class: 'btn btn-mini', onClick: () => abrir(it) }, 'Revisar y recuperar'),
        h('button', { type: 'button', class: 'btn btn-sec btn-mini', onClick: () => { ocultar(it.discarded.id); nodo.remove(); } }, 'Ocultar')));
    return nodo;
  }));
}

/** Pantalla para elegir qué series de la guardada se añaden y recuperar. */
export function pantallaRecuperar(el, it, volver) {
  const d = it.discarded; const g = it.saved;
  const marcadas = new Set(it.suggested || []);
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const enDescartada = (id) => { const x = (d.exercises || []).find((e) => e.exerciseId === id); return x ? x.sets.length : 0; };

  const resumenReal = h('ul', { class: 'lista' }, (d.exercises || []).map((x) =>
    h('li', { class: 'fila' }, h('span', {}, x.name), h('span', { class: 'detalle' }, x.sets.length + (x.sets.length === 1 ? ' serie' : ' series')))));

  const grupos = [];
  (g && g.exercises || []).forEach((x) => {
    const ul = h('ul', { class: 'compra elegir' });
    (x.sets || []).forEach((set) => {
      const k = claveSerie(x.exerciseId, set);
      const caja = h('input', { type: 'checkbox', checked: marcadas.has(k) });
      caja.addEventListener('change', () => { if (caja.checked) marcadas.add(k); else marcadas.delete(k); });
      ul.append(h('li', {}, h('label', { class: 'casilla' }, caja,
        h('span', {}, set.reps + ' × ' + formatLoad(set.load)), h('span', { class: 'detalle' }, hora(set.at)))));
    });
    const ya = enDescartada(x.exerciseId);
    grupos.push(h('h3', { class: 'micro-grupo' }, x.name), h('p', { class: 'nota' }, ya ? 'En la sesión real ya hay ' + ya + (ya === 1 ? ' serie.' : ' series.') : 'No está en la sesión real.'), ul);
  });

  const recuperar = h('button', { type: 'button', class: 'btn' }, 'Recuperar sesión');
  recuperar.addEventListener('click', async () => {
    recuperar.disabled = true; estado.className = 'estado'; estado.textContent = 'Recuperando…';
    try {
      await call('session.recover', { id: d.id, fromId: g ? g.id : null, keep: [...marcadas] }, { timeoutMs: 60000 });
      [CLAVE_RESUMEN, 'sesion-' + d.id, g ? 'sesion-' + g.id : '', 'hoy'].filter(Boolean).forEach(borrar);
      avisar('Sesión recuperada ✓', 4000);
      volver();
    } catch (err) { recuperar.disabled = false; estado.className = 'estado error'; estado.textContent = err.message; }
  });

  el.replaceChildren(h('section', {},
    h('p', { class: 'etiqueta' }, 'Diario'), h('h2', {}, 'Recuperar la sesión del ' + formatDateEs(d.date)),
    h('p', {}, 'Se recuperan las ' + nSeries(d) + ' series de la sesión descartada, con sus horas y descansos reales:'), resumenReal,
    g ? h('p', {}, 'Ese día también guardaste otra sesión. Marca las series de esa sesión que quieres añadir; las demás se descartan con ella. Vienen marcadas las que sobran respecto a la sesión real.') : null,
    ...grupos,
    h('div', { class: 'acciones' }, recuperar, h('button', { type: 'button', class: 'btn btn-sec', onClick: volver }, 'Cancelar')), estado));
  window.scrollTo(0, 0);
}

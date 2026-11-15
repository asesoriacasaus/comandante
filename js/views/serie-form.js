// Formulario para añadir una serie a mano (durante la sesión o en la revisión).
import { h } from '../lib/dom.js';
import { loadField } from '../lib/format.js';
import { IMPLEMENT_ES, TIPOS_ES, construirSerie } from '../lib/serie.js';
import { cargarEjercicios } from '../lib/ejercicios.js';

/**
 * ejercicios: [{ id, name, implements }]. Si `exerciseId` viene, el ejercicio es fijo; si no, se elige.
 * `valores` es un objeto mutable donde se guarda lo tecleado: si la pantalla se repinta, no se pierde.
 */
export function formularioSerie({ titulo, ejercicios, exerciseId = null, implement = null, valor = '', reps = '', rir = '', tipo = 'working', valores = {}, onGuardar, onCancelar }) {
  const v = (k, def) => (valores[k] !== undefined ? valores[k] : def);
  const guarda = (k) => (e) => { valores[k] = e.target.value; };
  const def = (id) => ejercicios.find((x) => x.id === id) || null;

  const selEj = exerciseId ? null : h('select', { 'aria-label': 'Ejercicio' }, h('option', { value: '' }, 'Elige el ejercicio…'),
    ...ejercicios.map((x) => h('option', Object.assign({ value: x.id }, v('ejercicio', '') === x.id ? { selected: true } : {}), x.name)));
  const selImp = h('select', { 'aria-label': 'Implemento' });
  const etiquetaCarga = h('span', {});
  const inCarga = h('input', { inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Kilos', value: String(v('valor', valor)).replace('.', ',') });
  const inReps = h('input', { inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'Repeticiones', value: String(v('reps', reps)) });
  const inRir = h('input', { inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'RIR', value: String(v('rir', rir)) });
  const selTipo = h('select', { 'aria-label': 'Tipo de serie' }, ...Object.entries(TIPOS_ES).map(([k, l]) => h('option', Object.assign({ value: k }, v('tipo', tipo) === k ? { selected: true } : {}), l)));
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });

  const ejercicioActual = () => def(exerciseId || (selEj && selEj.value));
  const pintaImplementos = () => {
    const e = ejercicioActual();
    const lista = e ? e.implements : Object.keys(IMPLEMENT_ES);
    const elegido = v('implement', implement);
    const actual = lista.includes(elegido) ? elegido : lista[0];
    selImp.replaceChildren(...lista.map((i) => h('option', Object.assign({ value: i }, i === actual ? { selected: true } : {}), IMPLEMENT_ES[i] || i)));
    pintaEtiqueta();
  };
  const pintaEtiqueta = () => { etiquetaCarga.textContent = 'Kilos (' + loadField(selImp.value)[1] + ')'; };

  if (selEj) selEj.addEventListener('change', (e) => { valores.ejercicio = e.target.value; delete valores.implement; pintaImplementos(); });
  selImp.addEventListener('change', (e) => { valores.implement = e.target.value; pintaEtiqueta(); });
  inCarga.addEventListener('input', guarda('valor')); inReps.addEventListener('input', guarda('reps')); inRir.addEventListener('input', guarda('rir'));
  selTipo.addEventListener('change', guarda('tipo'));
  pintaImplementos();

  const guardar = h('button', { type: 'button', class: 'btn' }, 'Guardar serie');
  guardar.addEventListener('click', async () => {
    const id = exerciseId || (selEj && selEj.value);
    if (!id) { estado.className = 'estado error'; estado.textContent = 'Elige el ejercicio.'; return; }
    const r = construirSerie({ tipo: selTipo.value, reps: inReps.value, rir: inRir.value, valor: inCarga.value, implement: selImp.value });
    if (r.error) { estado.className = 'estado error'; estado.textContent = r.error; return; }
    guardar.disabled = true; estado.className = 'estado'; estado.textContent = 'Guardando…';
    try { await onGuardar({ exerciseId: id, set: r.set }); }
    catch (err) { console.error(err); guardar.disabled = false; estado.className = 'estado error'; estado.textContent = err.message || 'No se pudo guardar la serie.'; }
  });

  return h('form', { class: 'card form-serie', novalidate: true, onSubmit: (e) => e.preventDefault() },
    h('h3', {}, titulo || 'Añadir serie a mano'),
    selEj ? h('label', {}, 'Ejercicio', selEj) : null,
    h('label', {}, 'Implemento', selImp),
    h('label', {}, etiquetaCarga, inCarga),
    h('div', { class: 'rejilla' }, h('label', {}, 'Repeticiones', inReps), h('label', {}, 'RIR (vacío si no lo sabes)', inRir)),
    h('label', {}, 'Tipo', selTipo),
    estado,
    h('div', { class: 'acciones' }, guardar, h('button', { type: 'button', class: 'btn btn-sec', onClick: onCancelar }, 'Cancelar')));
}

/** Abre el formulario; carga la lista de ejercicios si hace falta (suele estar ya en el móvil). */
export async function abrirFormulario(st, cfg, paint, alFallar) {
  st.formulario = Object.assign({ valores: {} }, cfg);
  st.scrollForm = true;
  paint();
  if (!st.ejercicios) {
    try { st.ejercicios = await cargarEjercicios(); paint(); }
    catch (err) { st.formulario = null; paint(); if (alFallar) alFallar(err); }
  }
}

/** Nodo del formulario si hay uno abierto (o un aviso de carga). `guardar(payload, pendiente)` debe lanzar si falla. */
export function nodoFormulario(st, { paint, guardar }) {
  if (!st.formulario) return null;
  if (!st.ejercicios) return h('p', { class: 'nota form-serie' }, 'Cargando la lista de ejercicios…');
  const cfg = st.formulario;
  return formularioSerie(Object.assign({}, cfg, { ejercicios: st.ejercicios,
    onGuardar: (payload) => guardar(payload, cfg.pendiente),
    onCancelar: () => { st.formulario = null; paint(); } }));
}

// Pantalla Revisión: lo hecho frente al plan y a la última vez, avisos, edición y guardado.
import { call } from '../api.js';
import { h } from '../lib/dom.js';
import { groupsEs, formatLoad, formatDateEs, formatDelta, describeIssue } from '../lib/format.js';
import { ACTIVE_KEY, serieNodo } from './sesion.js';

const vigente = (el) => el.dataset.route === 'revision';
const MOTIVOS = { unknown_exercise: 'Ejercicio que no conozco', missing_reps: 'Faltan las repeticiones', missing_load: 'Falta la carga',
  invalid_load: 'Carga imposible', no_exercise: 'No sé de qué ejercicio hablas', nothing_to_repeat: 'No había serie anterior que repetir' };

export function render(el) {
  let id = '';
  try { id = localStorage.getItem(ACTIVE_KEY) || ''; } catch (_) { /* sin almacenamiento */ }
  if (!id) {
    el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Revisión'), h('h2', {}, 'Nada que revisar'), h('a', { class: 'btn', href: '#hoy' }, 'Ir a Hoy')));
    return;
  }
  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Revisión'), h('h2', {}, 'Preparando la revisión…'), h('p', { class: 'vacio' }, 'Puede tardar unos segundos.')));
  const st = { id, session: null, review: null, editing: null, msg: '', msgType: '', busy: false };

  const load = async () => {
    const r = await call('session.review', { id }, { timeoutMs: 150000 });
    st.session = r.session; st.review = r.review;
  };
  const paint = () => { if (vigente(el)) el.replaceChildren(vista(st, { el, paint, load, id })); };

  load().then(paint).catch((err) => {
    console.error(err);
    if (!vigente(el)) return;
    el.replaceChildren(h('section', {}, h('h2', {}, 'Revisión'), h('p', { class: 'estado error' }, err.message),
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => render(el) }, 'Reintentar'), h('a', { class: 'btn btn-sec', href: '#hoy' }, 'Volver a Hoy'))));
  });
}

function vista(st, ctx) {
  const { session: s, review: r } = st;
  const setMsg = (m, t = '') => { st.msg = m; st.msgType = t; ctx.paint(); };
  const run = async (fn) => {
    if (st.busy) return;
    st.busy = true;
    try { await fn(); } catch (err) { console.error(err); st.busy = false; setMsg(err.message, 'error'); return; }
    st.busy = false;
    ctx.paint();   // reactiva los botones (no hace nada si ya hemos cambiado de pantalla)
  };

  // Editar una serie: se aplica en el servidor y se recalcula la revisión.
  const edit = (op) => run(async () => {
    const e = await call('session.edit', { id: ctx.id, op }, { timeoutMs: 60000 });
    st.session = e.session; st.editing = null;
    await ctx.load();
    ctx.paint();
  });

  const nodes = [
    h('p', { class: 'etiqueta' }, 'Revisión · ' + formatDateEs(s.date)),
    h('h2', {}, groupsEs(s.groups).replace(/^./, (c) => c.toUpperCase()))
  ];
  if (s.reviewMessage) nodes.push(h('blockquote', { class: 'mensaje' }, s.reviewMessage));

  const m = r.summary;
  nodes.push(h('div', { class: 'resumen' },
    dato(String(m.workingSets), 'series'), dato(String(Math.round(m.totalVolumeKg)), 'kg de volumen'),
    dato(m.durationMin === null ? '–' : String(m.durationMin), 'minutos')));

  // Pendientes: lo único que impide guardar.
  (s.pending || []).forEach((p, i) => nodes.push(h('div', { class: 'aviso peligro' },
    (MOTIVOS[p.reason] || 'Pendiente') + (p.text ? ': ' + p.text : '') + '. Añade la serie en el ejercicio correspondiente o descártala.',
    h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => edit({ op: 'dismiss_pending', index: i }) }, 'Descartar')))));

  const avisos = r.issues.map(describeIssue).filter(Boolean);
  if (avisos.length) nodes.push(h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Lo que no cuadra'),
    h('ul', { class: 'avisos' }, avisos.map((t) => h('li', {}, t)))));
  else nodes.push(h('p', { class: 'nota' }, 'Todo cuadra con el plan.'));

  r.exercises.forEach((ex) => {
    const full = (s.exercises || []).find((q) => q.exerciseId === ex.exerciseId);
    const cmp = [];
    if (ex.topLoad) cmp.push('Carga más alta: ' + formatLoad(ex.topLoad) + (ex.vsPlanKg !== null && ex.vsPlanKg !== 0 ? ' (' + formatDelta(ex.vsPlanKg) + ' frente al plan)' : ''));
    if (ex.vsLast) cmp.push('Última vez: ' + (ex.vsLast.topKg === null ? 'sin carga' : ex.vsLast.topKg + ' kg') +
      (ex.vsLast.deltaKg !== null ? ' → ' + formatDelta(ex.vsLast.deltaKg) : '') + (ex.vsLast.volumePct !== null ? ' · volumen ' + (ex.vsLast.volumePct > 0 ? '+' : '') + ex.vsLast.volumePct + ' %' : ''));
    else if (r.hasPrevious) cmp.push('Primera vez que haces este ejercicio en esta sesión.');
    nodes.push(h('div', { class: 'bloque' },
      h('h3', {}, ex.name),
      h('p', { class: 'detalle' }, ex.doneSets + (ex.plannedSets ? ' de ' + ex.plannedSets : '') + ' series · ' + (ex.repsMin === ex.repsMax ? ex.repsMin : ex.repsMin + '-' + ex.repsMax) + ' rep' +
        (ex.avgRir !== null ? ' · RIR medio ' + String(ex.avgRir).replace('.', ',') : '')),
      ...cmp.map((t) => h('p', { class: 'detalle' }, t)),
      full ? h('ul', { class: 'series' }, full.sets.map((set) => serieNodo(st, full, set, edit, ctx.paint))) : null));
  });

  nodes.push(h('p', { class: 'estado ' + st.msgType, role: 'status', 'aria-live': 'polite' }, st.msg));
  nodes.push(h('div', { class: 'acciones fin' },
    h('button', { type: 'button', class: 'btn', disabled: st.busy, onClick: () => run(async () => {
      await call('session.save', { id: ctx.id }, { timeoutMs: 60000 });
      try { localStorage.removeItem(ACTIVE_KEY); } catch (_) { /* sin almacenamiento */ }
      location.hash = '#hoy';
    }) }, 'Guardar sesión'),
    h('button', { type: 'button', class: 'btn btn-sec', onClick: () => run(async () => {
      await call('session.resume', { id: ctx.id }, { timeoutMs: 60000 }); location.hash = '#sesion';
    }) }, 'Seguir grabando'),
    h('button', { type: 'button', class: 'btn btn-sec', onClick: () => run(async () => {
      if (!confirm('¿Descartar esta sesión? No se podrá recuperar.')) return;
      await call('session.discard', { id: ctx.id }, { timeoutMs: 60000 });
      try { localStorage.removeItem(ACTIVE_KEY); } catch (_) { /* sin almacenamiento */ }
      location.hash = '#hoy';
    }) }, 'Descartar sesión')));
  return h('section', {}, nodes);
}

function dato(valor, etiqueta) { return h('div', { class: 'dato' }, h('span', { class: 'valor' }, valor), h('span', { class: 'etiqueta' }, etiqueta)); }

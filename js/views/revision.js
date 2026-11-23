// Pantalla Revisión: lo hecho frente al plan y a la última vez, avisos, edición y guardado.
import { call } from '../api.js';
import { h, cargando } from '../lib/dom.js';
import { groupsEs, formatLoad, formatDateEs, formatDelta, describeIssue, quoteTranscript } from '../lib/format.js';
import { ACTIVE_KEY, serieNodo, pendienteDetalle, cfgPendiente } from './sesion.js';
import { abrirFormulario, nodoFormulario } from './serie-form.js';
import { valorDeCarga } from '../lib/serie.js';
import { borrar, swr, guardar, leer } from '../lib/cache.js';
import { bloqueResumen } from './resumen-hablado.js';
import { ponerBarra, avisar } from '../lib/barra.js';
import { descansoMedio, relojDescanso } from '../lib/sesion-viva.js';
import { figuraMusculos } from '../lib/musculos.js';

const vigente = (el) => el.dataset.route === 'revision';
const MOTIVOS = { unclear: 'No lo oí claro (ruido o pronunciación)', unknown_exercise: 'Ejercicio que no conozco', missing_reps: 'Faltan las repeticiones', missing_load: 'Falta la carga',
  invalid_load: 'Carga imposible', no_exercise: 'No sé de qué ejercicio hablas', nothing_to_repeat: 'No había serie anterior que repetir' };

export function render(el) {
  let id = '';
  try { id = localStorage.getItem(ACTIVE_KEY) || ''; } catch (_) { /* sin almacenamiento */ }
  if (!id) {
    el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Revisión'), h('h2', {}, 'Nada que revisar'), h('a', { class: 'btn', href: '#hoy' }, 'Ir a Hoy')));
    return;
  }
  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Revisión'), h('h2', {}, 'Preparando la revisión…'), h('p', { class: 'vacio' }, 'Puede tardar unos segundos.'), cargando()));
  const st = { id, session: null, review: null, editing: null, msg: '', msgType: '', busy: false, formulario: null, ejercicios: null, scrollForm: false };

  const clave = 'revision-' + id;
  const load = async () => {
    const r = await call('session.review', { id }, { timeoutMs: 150000 });
    st.session = r.session; st.review = r.review;
    guardar(clave, { session: r.session, review: r.review });
  };
  const paint = () => {
    if (!vigente(el)) return;
    const y = window.scrollY;   // al repintar, la página se queda donde estaba
    el.replaceChildren(vista(st, { el, paint, load, id }));
    window.scrollTo(0, y);
    if (st.scrollForm) { st.scrollForm = false; const f = el.querySelector('.form-serie'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'center' }); }
  };

  // Lo último visto se enseña al instante; el servidor lo confirma en segundo plano. Luego, el mensaje con la personalidad.
  swr(clave, async () => { const r = await call('session.review', { id }, { timeoutMs: 150000 }); return { session: r.session, review: r.review }; },
    (d) => { if (st.busy) return; st.session = d.session; st.review = d.review; paint(); },
    { valido: (d) => d && d.session && d.session.id === id && d.session.status === 'review' })
    .then(() => pedirMensajeCierre(el, st, clave))
    .catch((err) => {
      console.error(err);
      if (!vigente(el)) return;
      el.replaceChildren(h('section', {}, h('h2', {}, 'Revisión'), h('p', { class: 'estado error' }, err.message),
        h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => render(el) }, 'Reintentar'), h('a', { class: 'btn btn-sec', href: '#hoy' }, 'Volver a Hoy'))));
    });
}

function pedirMensajeCierre(el, st, clave) {
  if (!st.session || st.session.reviewMessageSource === 'ai') return;
  call('session.reviewMessage', { id: st.session.id }, { silent: true, timeoutMs: 120000 }).then((r) => {
    const m = r && r.session && r.session.reviewMessage;
    if (!m || !st.session || r.session.id !== st.session.id) return;
    st.session.reviewMessage = m; st.session.reviewMessageSource = 'ai';
    const hit = leer(clave);
    if (hit && hit.data && hit.data.session) { hit.data.session.reviewMessage = m; hit.data.session.reviewMessageSource = 'ai'; guardar(clave, hit.data); }
    if (!vigente(el)) return;
    const q = el.querySelector('.mensaje');
    if (q) q.textContent = m;
  }).catch((err) => console.error(err));   // se queda el mensaje neutro
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

  const m = r.summary;
  const grupos = s.groups || [];
  const cifra = (num, unidad, que) => h('div', { class: 'cifra' }, h('span', { class: 'num' }, num, unidad ? h('small', {}, unidad) : null), h('span', { class: 'que' }, que));
  const volumen = Math.round(m.totalVolumeKg);
  const nodes = [
    // Cabecera de victoria: lo hecho, en grande, y los músculos trabajados.
    h('div', { class: 'victoria' },
      h('p', { class: 'etiqueta' }, 'Revisión · ' + formatDateEs(s.date)),
      h('h2', { class: 'grito' }, '¡Misión cumplida!'),
      h('p', { class: 'sub' }, 'Sesión de ' + groupsEs(grupos) + ' terminada. Revisa y guarda.'),
      h('div', { class: 'cifras' },
        cifra(m.durationMin === null ? '–' : String(m.durationMin), m.durationMin === null ? '' : 'min', 'duración'),
        cifra(String(m.workingSets), '', 'series'),
        cifra(volumen >= 10000 ? (Math.round(volumen / 100) / 10).toString().replace('.', ',') : String(volumen), volumen >= 10000 ? 't' : 'kg', 'de volumen')),
      grupos.length ? h('div', { class: 'chips-datos' }, ...grupos.map((g) => h('span', { class: 'chip' }, groupsEs([g])))) : null,
      grupos.length ? figuraMusculos(grupos, { ancho: 96, etiqueta: 'Músculos trabajados: ' + groupsEs(grupos) }) : null)
  ];
  if (s.reviewMessage) nodes.push(h('blockquote', { class: 'mensaje' }, s.reviewMessage));

  // Resumen hablado: al guardarlo, las molestias que cuente pasan a la revisión.
  nodes.push(bloqueResumen(s, async (nueva) => {
    st.session = nueva;
    try { await ctx.load(); } catch (err) { console.error(err); }
    ctx.paint();
  }));

  const abrir = (cfg) => abrirFormulario(st, cfg, ctx.paint, (err) => setMsg('No se pudo cargar la lista de ejercicios: ' + err.message, 'error'));
  const guardarSerie = async (payload, pendiente) => {
    const op = Object.assign({ op: 'add' }, payload);
    if (Number.isInteger(pendiente)) op.dismissPending = pendiente;
    const e = await call('session.edit', { id: ctx.id, op }, { timeoutMs: 60000 });   // si falla, el formulario muestra el error y conserva lo escrito
    st.session = e.session; st.formulario = null;
    try { await ctx.load(); } catch (err) { console.error(err); st.msg = err.message; st.msgType = 'error'; }
    ctx.paint();
  };
  nodes.push(nodoFormulario(st, { paint: ctx.paint, guardar: guardarSerie }));

  // Pendientes: lo único que impide guardar.
  (s.pending || []).forEach((p, i) => nodes.push(h('div', { class: 'aviso peligro' },
    (MOTIVOS[p.reason] || 'Pendiente') + (p.text ? ': ' + p.text : '') + '. Añade la serie en el ejercicio correspondiente o descártala.',
    ...pendienteDetalle(p, s),
    h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'btn', onClick: () => abrir(cfgPendiente(p, i)) }, 'Completar a mano'),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => edit({ op: 'dismiss_pending', index: i }) }, 'Descartar')))));

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
      full && descansoMedio(full.sets) !== null ? h('p', { class: 'detalle' }, 'Descanso medio: ' + relojDescanso(descansoMedio(full.sets))) : null,
      full ? h('ul', { class: 'series' }, full.sets.map((set) => serieNodo(st, full, set, edit, ctx.paint))) : null,
      full ? h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => {
        const l = full.sets[full.sets.length - 1];
        abrir({ titulo: 'Serie a mano: ' + full.name, exerciseId: full.exerciseId, implement: l.load.implement, valor: valorDeCarga(l.load), reps: l.reps, rir: l.rir === null ? '' : l.rir });
      } }, 'Añadir serie a mano')) : null));
  });

  const clips = (s.clips || []).filter((c) => c.transcript);
  if (clips.length) nodes.push(h('details', { class: 'bloque' }, h('summary', {}, 'Lo que oí en cada clip (' + clips.length + ')'),
    ...clips.map((c, i) => h('p', { class: 'nota' }, (i + 1) + '. ' + quoteTranscript(c.transcript, 400)))));

  nodes.push(h('p', { class: 'estado ' + st.msgType, role: 'status', 'aria-live': 'polite' }, st.msg));

  const guardarSesion = () => run(async () => {
    await call('session.save', { id: ctx.id }, { timeoutMs: 60000 });
    ['hoy', 'resumen-sesiones', 'sesion-' + ctx.id, 'revision-' + ctx.id, 'sesion-viva'].forEach(borrar);
    try { localStorage.removeItem(ACTIVE_KEY); } catch (_) { /* sin almacenamiento */ }
    avisar('Sesión guardada ✓');
    location.hash = '#hoy';
  });
  const seguir = () => run(async () => {
    await call('session.resume', { id: ctx.id }, { timeoutMs: 60000 }); ['hoy', 'revision-' + ctx.id, 'sesion-viva'].forEach(borrar); location.hash = '#sesion';
  });
  const descartar = () => run(async () => {
    if (!confirm('¿Descartar esta sesión? No se podrá recuperar.')) return;
    await call('session.discard', { id: ctx.id }, { timeoutMs: 60000 });
    ['hoy', 'revision-' + ctx.id, 'sesion-viva'].forEach(borrar);
    try { localStorage.removeItem(ACTIVE_KEY); } catch (_) { /* sin almacenamiento */ }
    avisar('Sesión descartada');
    location.hash = '#hoy';
  });
  // Barra flotante: guardar siempre a mano y el estado a la vista. "Seguir grabando" y "Descartar" van en un menú aparte para no pulsarlos sin querer.
  const menu = h('div', { class: 'barra-menu', hidden: true, role: 'menu' },
    h('button', { type: 'button', role: 'menuitem', onClick: seguir }, 'Seguir grabando'),
    h('button', { type: 'button', role: 'menuitem', class: 'peligro', onClick: descartar }, 'Descartar sesión'));
  const mas = h('button', { type: 'button', class: 'barra-mas', 'aria-label': 'Más opciones', 'aria-expanded': 'false', onClick: () => {
    menu.hidden = !menu.hidden; mas.setAttribute('aria-expanded', String(!menu.hidden));
  } }, '⋯');
  const pend = (s.pending || []).length;
  ponerBarra(h('div', { class: 'barra-contenido' },
    h('div', { class: 'barra-estado' }, h('b', { class: 'sin-guardar' }, 'Sin guardar'), h('span', {}, pend ? pend + (pend === 1 ? ' pendiente por resolver' : ' pendientes por resolver') : 'Revisa y guarda')),
    h('div', { class: 'barra-acciones' }, h('button', { type: 'button', class: 'btn', disabled: st.busy, onClick: guardarSesion }, 'Guardar sesión'), mas),
    menu));
  return h('section', {}, nodes);
}


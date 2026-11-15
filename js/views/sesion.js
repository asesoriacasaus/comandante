// Pantalla Sesión: grabar clips, lista viva de series editable, descanso y cierre.
import { call } from '../api.js';
import { h } from '../lib/dom.js';
import { newId } from '../lib/ids.js';
import { createQueue } from '../lib/queue.js';
import { borrar, leer, guardar } from '../lib/cache.js';
import { descanso, objetivo, seriesHechas } from '../lib/sesion-viva.js';
import { ediciones, vistaLocal, esFalloDeRed } from '../lib/ediciones.js';
import { createIdbStore, createRecorder } from '../recorder.js';
import { abrirFormulario, nodoFormulario } from './serie-form.js';
import { cargarEjercicios } from '../lib/ejercicios.js';
import { valoresDeHeard, valorDeCarga } from '../lib/serie.js';
import { groupsEs, formatLoad, formatClock, formatDateEs, loadField, parseNum, describeHeard, quoteTranscript } from '../lib/format.js';

/** Lo que la IA entendió y oyó en un pendiente: así se ve por qué no cuadra. */
export function pendienteDetalle(p, session) {
  const clip = (session.clips || []).find((c) => c.id === p.clipId);
  const heard = describeHeard(p.heard);
  const quote = clip ? quoteTranscript(clip.transcript) : '';
  return [heard ? h('p', { class: 'nota' }, heard) : null, quote ? h('p', { class: 'nota' }, 'Oí: ' + quote) : null];
}

export const ACTIVE_KEY = 'comandante.sessionId';
export const CLAVE_VIVA = 'sesion-viva';   // copia local de la sesión en curso: se abre al instante y sin red
const getActive = () => { try { return localStorage.getItem(ACTIVE_KEY) || ''; } catch (_) { return ''; } };
const MOTIVOS = { unknown_exercise: 'Ejercicio que no conozco', missing_reps: 'Faltan las repeticiones', missing_load: 'Falta la carga',
  invalid_load: 'Carga imposible', no_exercise: 'No sé de qué ejercicio hablas', nothing_to_repeat: 'No hay serie anterior que repetir' };
const FLAGS = { inherited_load: 'Carga heredada de la serie anterior', load_from_plan: 'Carga tomada del plan' };

const store = createIdbStore();
let wakeLock = null;
let cur = null;   // { st, toggle, queue }: la pantalla activa, para el reloj, el corte automático y la vuelta de la red

const recorder = createRecorder({
  onTick: (ms) => {
    const n = document.querySelector('#view .estado');
    if (cur && cur.st.recording && n) n.textContent = 'Grabando ' + formatClock(ms / 1000);
  },
  onAutoStop: () => { if (cur && cur.st.recording) cur.toggle(); }
});
window.addEventListener('online', () => { if (cur) { cur.queue.flush({ force: true }); if (cur.enviar) cur.enviar(); } });

const vigente = (el) => el.dataset.route === 'sesion';

export function render(el) {
  const id = getActive();
  if (!id) {
    el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Sesión'), h('h2', {}, 'Sin sesión en curso'),
      h('p', { class: 'vacio' }, 'Empieza la sesión desde Hoy.'), h('a', { class: 'btn', href: '#hoy' }, 'Ir a Hoy')));
    return;
  }
  const st = { id, session: null, recording: false, processing: 0, msg: '', msgType: '', ms: 0, queueInfo: { waiting: 0, errors: 0 },
    editing: null, timer: null, formulario: null, ejercicios: null, scrollForm: false };

  const queue = createQueue({
    store,
    send: (clip) => blobToPayload(clip).then((p) => call('clip.process', p, { timeoutMs: 150000 })),
    onChange: async (e) => {
      if (!vigente(el)) return;
      if (e.type === 'sent' && e.result && e.result.session && e.clip.sessionId === id) { st.session = e.result.session; st.msg = ''; }
      if (e.type === 'retry') { st.msg = 'Sin conexión o servidor ocupado. Los clips se guardan y se reintentan solos.'; st.msgType = 'error'; }
      if (e.type === 'error') { st.msg = 'Un clip no se pudo procesar: ' + e.error; st.msgType = 'error'; }
      if (e.type === 'blocked') { st.msg = 'No se puede acceder al servidor (' + e.error + '). Revisa Ajustes: los clips están a salvo.'; st.msgType = 'error'; }
      st.queueInfo = await queue.counts(id);
      paint();
    }
  });

  let guardada = '';
  function paint() {
    if (!vigente(el)) { stopTimer(); return; }
    if (st.session) { const j = JSON.stringify(st.session); if (j !== guardada) { guardada = j; guardar(CLAVE_VIVA, st.session); } }
    const nombres = Object.fromEntries((st.ejercicios || []).map((e) => [e.id, e.name]));
    st.sinEnviar = ediciones.pendientes(id).length;
    st.vista = st.session ? vistaLocal(st.session, ediciones.pendientes(id), nombres) : null;
    el.replaceChildren(view(st, { queue, el, paint, id, editar, enviar }));
    if (st.scrollForm) { st.scrollForm = false; const f = el.querySelector('.form-serie'); if (f && f.scrollIntoView) f.scrollIntoView({ block: 'center' }); }
  }
  // Envía las ediciones hechas sin conexión, en orden. Una que el servidor rechace se quita y se explica.
  let enviando = false;
  async function enviar() {
    if (enviando || !ediciones.pendientes(id).length) return;
    enviando = true;
    try {
      const r = await ediciones.enviar(id, async (op) => (await call('session.edit', { id, op }, { timeoutMs: 60000, silent: true })).session,
        (op, err) => { st.msg = 'Un cambio hecho sin conexión no se pudo guardar: ' + err.message; st.msgType = 'error'; });
      if (r.sesion) st.session = r.sesion;
      if (!r.parado && st.msgType !== 'error') st.msg = '';
    } finally { enviando = false; }
    paint();
  }

  /** Una edición: al servidor si hay red; si no (o si ya hay otras esperando, para no desordenarlas), a la cola local. */
  async function editar(op) {
    op.opId = newId('o');
    if (!ediciones.pendientes(id).length) {
      try { st.session = (await call('session.edit', { id, op }, { timeoutMs: 60000 })).session; return 'enviado'; }
      catch (err) { if (!esFalloDeRed(err)) throw err; }
    }
    ediciones.poner(id, op);
    st.msg = 'Sin conexión: el cambio se ve aquí y se enviará solo al volver la red.'; st.msgType = '';
    enviar();
    return 'en cola';
  }

  function stopTimer() { if (st.timer) { clearInterval(st.timer); st.timer = null; } }

  const local = leer(CLAVE_VIVA);
  if (local && local.data && local.data.id === id) { st.session = local.data; paint(); }
  else el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Sesión'), h('h2', {}, 'Cargando…')));
  (async () => {
    try {
      st.queueInfo = await queue.counts(id);
      const fresca = (await call('session.get', { id }, { timeoutMs: 60000, silent: !!st.session })).session;
      if (!st.session || JSON.stringify(fresca) !== JSON.stringify(st.session)) { st.session = fresca; }
    } catch (err) {
      console.error(err);
      if (!vigente(el)) return;
      if (st.session) { st.msg = 'Sin conexión con el servidor: trabajas con la copia de este móvil. Graba igual; los clips se envían al volver la red.'; st.msgType = 'error'; }
      else {
        el.replaceChildren(h('section', {}, h('h2', {}, 'Sesión'), h('p', { class: 'estado error' }, err.message),
          h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn', onClick: () => render(el) }, 'Reintentar'), h('a', { class: 'btn btn-sec', href: '#hoy' }, 'Volver a Hoy'))));
        return;
      }
    }
    paint();
    enviar();
    cargarEjercicios().then((l) => { st.ejercicios = l; }).catch(() => { /* se pedirá al abrir el formulario */ });
    requestWake();
    queue.flush({ force: true });
    let n = 0;
    st.timer = setInterval(() => {
      if (!vigente(el)) { stopTimer(); recorder.releaseMic(); releaseWake(); cur = null; return; }
      tick(el);
      if (++n % 15 === 0) { queue.flush(); enviar(); }   // reintentos con backoff
    }, 1000);
  })();

  el._sesion = st;
  cur = { st, queue, enviar, toggle: () => {} };
}

async function blobToPayload(clip) {
  const data = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('No se pudo leer el clip'));
    r.readAsDataURL(clip.blob);
  });
  return { sessionId: clip.sessionId, clipId: clip.id, ts: clip.ts, mime: clip.mime, data };
}

async function requestWake() {
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (_) { /* opcional */ }
}
function releaseWake() { try { if (wakeLock) wakeLock.release(); } catch (_) { /* opcional */ } wakeLock = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wakeLock === null && location.hash === '#sesion') requestWake(); });

// Actualiza solo el reloj de descanso sin repintar toda la pantalla.
function tick(el) {
  const rest = el.querySelector('#descanso');
  const st = el._sesion;
  if (!rest || !st || !st.session) return;
  const d = descanso(st.vista || st.session, Date.now());
  if (rest.textContent !== d.texto) rest.textContent = d.texto;
  rest.classList.toggle('listo', d.listo);
}

function view(st, ctx) {
  const s = st.vista || st.session;
  const { queue, el, paint } = ctx;
  const setMsg = (m, t = '') => { st.msg = m; st.msgType = t; paint(); };

  async function toggleRecord() {
    if (st.recording) {
      try {
        const r = await recorder.stop();
        st.recording = false; st.ms = 0;
        const clip = { id: newId('c'), sessionId: ctx.id, ts: new Date().toISOString(), mime: r.mime, blob: r.blob, ms: r.ms };
        setMsg('Clip guardado. Procesando…', '');
        st.processing++;
        await queue.enqueue(clip);
        st.processing--;
        st.queueInfo = await queue.counts(ctx.id);
        paint();
      } catch (err) { console.error(err); st.recording = false; setMsg(err.message, 'error'); }
      return;
    }
    try {
      await recorder.start();
      st.recording = true;
      setMsg('Grabando 0:00', '');
    } catch (err) {
      console.error(err);
      setMsg(err.code === 'UNSUPPORTED' ? err.message : 'Sin acceso al micrófono. Actívalo en Ajustes de iOS para este sitio.', 'error');
    }
  }

  if (cur) cur.toggle = toggleRecord;
  const abrir = (cfg) => abrirFormulario(st, cfg, paint, (err) => setMsg('No se pudo cargar la lista de ejercicios: ' + err.message, 'error'));
  const guardarSerie = async (payload, pendiente) => {
    const op = Object.assign({ op: 'add', at: new Date().toISOString() }, payload);
    if (Number.isInteger(pendiente)) op.dismissPending = pendiente;
    await ctx.editar(op);   // si el servidor la rechaza, el formulario muestra el error y conserva lo escrito
    st.formulario = null; paint();
  };
  const edit = async (op) => {
    try { await ctx.editar(op); st.editing = null; paint(); }
    catch (err) { setMsg(err.message, 'error'); }
  };

  const d = descanso(s, Date.now());
  const enCola = st.queueInfo.waiting;
  const nodes = [
    h('p', { class: 'etiqueta' }, 'Sesión ' + s.cycleKey + ' · ' + formatDateEs(s.date)),
    h('h2', {}, groupsEs(s.groups).replace(/^./, (c) => c.toUpperCase())),
    h('button', { type: 'button', class: 'btn btn-grabar' + (st.recording ? ' activo' : ''), onClick: toggleRecord },
      st.recording ? 'Parar' : 'Grabar'),
    h('p', { class: 'estado ' + st.msgType, role: 'status', 'aria-live': 'polite' }, st.msg),
    st.sinEnviar ? h('p', { class: 'aviso' }, st.sinEnviar === 1 ? '1 cambio sin enviar: se enviará solo al volver la conexión.'
      : st.sinEnviar + ' cambios sin enviar: se enviarán solos al volver la conexión.') : null,
    enCola ? h('p', { class: 'procesando', role: 'status' }, enCola === 1 ? 'Procesando 1 clip… sigue entrenando, la serie aparecerá sola.'
      : 'Procesando ' + enCola + ' clips… se guardan en este móvil hasta que el servidor los confirme.') : null,
    h('p', { class: 'descanso' + (d.listo ? ' listo' : ''), id: 'descanso' }, d.texto),
    nodoFormulario(st, { paint, guardar: guardarSerie })
  ];

  if (st.queueInfo.errors) nodes.push(h('div', { class: 'aviso' }, st.queueInfo.errors + ' clip(s) con error.',
    h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => queue.flush({ force: true }) }, 'Reintentar'),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: async () => { for (const c of await store.all()) if (c.status === 'error' && c.sessionId === ctx.id) await queue.discard(c.id); } }, 'Descartar'))));

  (s.painFlags || []).forEach((p) => nodes.push(h('p', { class: 'aviso peligro' },
    'Molestia: ' + (p.text || 'sin detalle') + '. Si es dolor, para o ajusta la carga.')));

  (s.pending || []).forEach((p, i) => nodes.push(h('div', { class: 'aviso' },
    (MOTIVOS[p.reason] || 'Pendiente') + (p.text ? ': ' + p.text : '') + '. Añade la serie a mano.',
    ...pendienteDetalle(p, s),
    h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'btn', onClick: () => abrir(cfgPendiente(p, i)) }, 'Completar a mano'),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => edit({ op: 'dismiss_pending', index: i }) }, 'Descartar')))));

  const done = new Set((s.exercises || []).map((x) => x.exerciseId));
  (s.exercises || []).forEach((x, idx) => {
    const current = idx === s.exercises.length - 1;
    const meta = objetivo(s, x.exerciseId, seriesHechas(x));
    nodes.push(h('div', { class: 'bloque' + (current ? ' actual' : '') },
      h('h3', {}, x.name + (current ? ' · en curso' : '')),
      meta ? h('p', { class: 'objetivo' }, meta) : null,
      h('ul', { class: 'series' }, x.sets.map((set) => serieNodo(st, x, set, edit, paint))),
      h('div', { class: 'acciones compactas' },
        h('button', { type: 'button', class: 'btn btn-sec btn-mini', onClick: () => {
          const l = x.sets[x.sets.length - 1];
          const load = Object.assign({}, l.load);
          if (l.local) delete load.totalKg;   // el total de una serie sin enviar es aproximado: que lo calcule el servidor
          edit({ op: 'add', at: new Date().toISOString(), exerciseId: x.exerciseId, set: { type: l.type, reps: l.reps, rir: l.rir, load } });
        } }, 'Otra serie igual'),
        h('button', { type: 'button', class: 'btn btn-sec btn-mini', onClick: () => {
          const l = x.sets[x.sets.length - 1];
          abrir({ titulo: 'Serie a mano: ' + x.name, exerciseId: x.exerciseId, implement: l.load.implement, valor: valorDeCarga(l.load), reps: l.reps, rir: l.rir === null ? '' : l.rir });
        } }, 'Añadir serie a mano'))));
  });

  const resto = (s.plannedExercises || []).filter((p) => !done.has(p.exerciseId));
  if (resto.length) nodes.push(h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Pendiente del plan'),
    h('ul', { class: 'lista' }, resto.map((p) => h('li', {}, h('button', { type: 'button', class: 'fila fila-boton', 'aria-label': 'Añadir series de ' + p.name, onClick: () => abrir({
      titulo: 'Serie a mano: ' + p.name, exerciseId: p.exerciseId, implement: p.targetLoad ? p.targetLoad.implement : null,
      valor: p.targetLoad ? valorDeCarga(p.targetLoad) : '', reps: p.repsMax }) }, h('span', {}, p.name),
      h('span', { class: 'detalle' }, p.sets + ' × ' + p.repsMin + '-' + p.repsMax + (p.targetLoad ? ' · ' + formatLoad(p.targetLoad) : ''))))))));

  nodes.push(h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => abrir({ titulo: 'Añadir un ejercicio a mano' }) }, 'Añadir otro ejercicio a mano')));
  nodes.push(h('div', { class: 'acciones fin' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: async () => {
    if (!confirm('¿Terminar la sesión?')) return;
    if (st.recording) { setMsg('Para la grabación antes de terminar.', 'error'); return; }
    if (st.queueInfo.waiting) { setMsg('Aún hay clips sin procesar. Espera a que terminen.', 'error'); return; }
    if (st.sinEnviar) { await ctx.enviar(); if (ediciones.pendientes(ctx.id).length) { setMsg('Hay cambios sin enviar. Cuando vuelva la conexión se enviarán y podrás terminar.', 'error'); return; } }
    try { await call('session.finish', { id: ctx.id }, { timeoutMs: 60000 }); borrar('hoy'); borrar(CLAVE_VIVA); borrar('revision-' + ctx.id); recorder.releaseMic(); releaseWake(); location.hash = '#revision'; }
    catch (err) { setMsg(err.message, 'error'); }
  } }, 'Terminar sesión')));
  return h('section', {}, nodes);
}

/** Formulario precargado con lo que la IA entendió de un pendiente. Necesita la lista de ejercicios para elegir implemento. */
export function cfgPendiente(p, indice) {
  const v = valoresDeHeard(p.heard, ['barbell', 'dumbbell', 'cable', 'machine', 'ezbar', 'smith', 'kettlebell', 'bodyweight']);
  return { titulo: 'Completar: ' + (p.text || 'serie pendiente'), exerciseId: p.exerciseId || null, implement: p.heard ? v.implement : null,
    valor: v.valor, reps: v.reps, rir: v.rir, pendiente: indice };
}

export function serieNodo(st, x, set, edit, paint) {
  const editing = st.editing && st.editing.exerciseId === x.exerciseId && st.editing.order === set.order;
  const resumen = set.reps + ' rep · ' + (set.rir === null || set.rir === undefined ? 'RIR sin dato' : 'RIR ' + set.rir) +
    (set.type !== 'working' ? ' · ' + ({ warmup: 'calentamiento', drop: 'dropset', failure: 'al fallo' }[set.type] || set.type) : '');
  const fila = h('li', { class: 'serie' },
    h('button', { type: 'button', class: 'serie-btn', onClick: () => { st.editing = editing ? null : { exerciseId: x.exerciseId, order: set.order }; paint(); } },
      h('span', { class: 'n' }, set.order), h('span', {}, resumen), h('span', { class: 'carga' }, formatLoad(set.load))),
    set.local ? h('p', { class: 'nota' }, 'Sin enviar todavía: se guardará al volver la conexión.') : null,
    ...(set.flags || []).filter((f) => FLAGS[f]).map((f) => h('p', { class: 'nota' }, FLAGS[f] + ': revísala.')));
  if (!editing) return fila;
  const [key, label] = loadField(set.load.implement);
  const iReps = h('input', { inputmode: 'numeric', value: set.reps, 'aria-label': 'Repeticiones' });
  const iRir = h('input', { inputmode: 'numeric', value: set.rir === null || set.rir === undefined ? '' : set.rir, 'aria-label': 'RIR' });
  const iLoad = h('input', { inputmode: 'decimal', value: set.load[key] === undefined ? '' : String(set.load[key]).replace('.', ','), 'aria-label': label });
  fila.append(h('div', { class: 'editor' },
    h('label', {}, 'Repeticiones', iReps), h('label', {}, 'RIR (vacío si no lo sabes)', iRir), h('label', {}, label, iLoad),
    h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'btn', onClick: () => edit({ op: 'update', exerciseId: x.exerciseId, order: set.order,
        patch: { reps: parseNum(iReps.value), rir: parseNum(iRir.value), load: { [key]: parseNum(iLoad.value) } } }) }, 'Guardar'),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => edit({ op: 'delete', exerciseId: x.exerciseId, order: set.order }) }, 'Borrar'),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => { st.editing = null; paint(); } }, 'Cancelar'))));
  return fila;
}

// Pantalla Hoy: bienvenida, primer ciclo y sesión del día.
import { call } from '../api.js';
import { h, cargando } from '../lib/dom.js';
import { groupsEs, formatLoad, formatReps, formatRest, formatDateEs, todayIsoLocal } from '../lib/format.js';
import { ACTIVE_KEY, CLAVE_VIVA } from './sesion.js';
import { swr, borrar, leer, guardar } from '../lib/cache.js';
import { renderOnboarding } from './bienvenida.js';
import { figuraMusculos } from '../lib/musculos.js';

const SLOW = { timeoutMs: 150000 };
const AVISOS = {
  first_session: 'Primera sesión de este bloque: las cargas son conservadoras. Registra lo que realmente levantes y el plan se ajusta.',
  layoff: 'Vuelves tras más de una semana parado: menos carga y una serie menos por ejercicio.',
  deload: 'Semana de descarga: menos volumen y menos carga para recuperar.',
  priority: 'Hay una serie extra en algunos ejercicios porque la semana pasada te quedaste corto de volumen en esos grupos.',
  long_run: 'Hoy se ha adelantado una sesión sin pierna por tu tirada larga reciente.',
  legs_after_long_run: 'Toca pierna con una tirada larga reciente. Ve con cuidado y baja la intensidad si hace falta.'
};

const vigente = (el) => el.dataset.route === 'hoy';
const cabecera = (et, titulo) => [h('p', { class: 'etiqueta' }, et), h('h2', {}, titulo)];

export function render(el) {
  el.replaceChildren(h('section', {}, ...cabecera('Hoy', 'Tu sesión'),
    h('p', { class: 'vacio' }, 'Preparando tu sesión de hoy…'),
    h('p', { class: 'nota' }, 'Si es la primera vez que toca este tipo de sesión, el Comandante la diseña y puede tardar hasta un minuto. Puedes cambiar de sección: seguirá preparándose.'), cargando('Preparando tu sesión de hoy…')));
  cargar(el);
}

function errorVista(el, err) {
  console.error(err);
  const enlace = ['CONFIG', 'AUTH'].includes(err.code) ? h('p', {}, h('a', { href: '#ajustes' }, 'Ir a Ajustes')) : null;
  el.replaceChildren(h('section', {}, ...cabecera('Hoy', 'Tu sesión'), h('p', { class: 'estado error' }, err.message), enlace,
    h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => render(el) }, 'Reintentar'))));
}

async function cargar(el) {
  const dia = todayIsoLocal();
  try {
    await swr('hoy', async () => Object.assign(await call('hoy.load', {}, SLOW), { _dia: dia }),
      (d, deCache) => { if (vigente(el)) pintar(el, d, deCache); },
      { valido: (d) => d._dia === dia, onSinRed: () => { if (vigente(el)) avisoSinRed(el); } });
  } catch (err) {
    if (vigente(el)) errorVista(el, err);
  }
}

function pintar(el, d, deCache) {
  if (!d.onboarded) return renderOnboarding(el, () => { borrar('hoy'); render(el); });
  if (!d.hasCycle) return renderCiclo(el);
  if (d.todayError) return errorVista(el, Object.assign(new Error(d.todayError.message), { code: d.todayError.code }));
  renderSesion(el, d.today.session, deCache);
}

function avisoSinRed(el) {
  const s = el.querySelector('section');
  if (s && !s.querySelector('.sin-red')) s.prepend(h('p', { class: 'aviso sin-red' }, 'Sin conexión con el servidor: esto es lo último que había guardado.'));
}

const pidiendoMensaje = new Set();
/** El mensaje con la personalidad llega después de pintar la pantalla: la IA nunca bloquea Hoy. */
function pedirMensaje(el, s) {
  if (s.coachMessageSource !== 'neutral' || pidiendoMensaje.has(s.id) || s.status === 'done') return;
  pidiendoMensaje.add(s.id);
  call('session.message', { id: s.id }, { silent: true, timeoutMs: 120000 }).then((r) => {
    const m = r && r.session && r.session.coachMessage;
    const hit = leer('hoy');
    if (hit && hit.data.today && hit.data.today.session.id === s.id && m) {
      hit.data.today.session.coachMessage = m; hit.data.today.session.coachMessageSource = 'ai'; guardar('hoy', hit.data);
    }
    if (!vigente(el) || !m) return;
    const q = el.querySelector('.mensaje');
    if (q) q.textContent = m;
  }).catch(() => { /* se queda el mensaje neutro */ }).finally(() => pidiendoMensaje.delete(s.id));
}

function renderCiclo(el, propuesta = null) {
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const proponer = async (btn) => {
    btn.disabled = true; estado.className = 'estado'; estado.textContent = 'Diseñando tu ciclo… puede tardar un minuto.';
    try {
      const p = await call('plan.cycle.propose', {}, SLOW);
      if (vigente(el)) renderCiclo(el, p);
    } catch (err) { btn.disabled = false; estado.className = 'estado error'; estado.textContent = err.message; }
  };
  const aceptar = async (btn) => {
    btn.disabled = true; estado.className = 'estado'; estado.textContent = 'Guardando…';
    try {
      await call('plan.cycle.accept', { cycle: { sessions: propuesta.sessions } }, { timeoutMs: 60000 });
      if (vigente(el)) render(el);
    } catch (err) { btn.disabled = false; estado.className = 'estado error'; estado.textContent = err.message; }
  };
  const nodos = [...cabecera('Primer ciclo', 'Tu rotación')];
  if (!propuesta) {
    nodos.push(h('p', { class: 'nota' }, 'El Comandante propone un ciclo de sesiones que rotas según los días que pasan, sin días fijos de la semana.'),
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn', onClick: (e) => proponer(e.currentTarget) }, 'Proponer ciclo')), estado);
  } else {
    nodos.push(h('ul', { class: 'lista' }, propuesta.sessions.map((s) =>
        h('li', { class: 'fila' }, h('span', { class: 'clave' }, s.key), h('span', {}, groupsEs(s.groups))))),
      h('p', { class: 'nota' }, propuesta.rationale),
      h('div', { class: 'acciones' },
        h('button', { type: 'button', class: 'btn', onClick: (e) => aceptar(e.currentTarget) }, 'Aceptar este ciclo'),
        h('button', { type: 'button', class: 'btn btn-sec', onClick: (e) => proponer(e.currentTarget) }, 'Pedir otro')), estado);
  }
  el.replaceChildren(h('section', {}, nodos));
}

function renderSesion(el, s, deCache = false) {
  const ejercicios = s.status === 'done' ? (s.exercises || []) : (s.plannedExercises || []);
  const avisos = (s.notes || []).filter((n) => AVISOS[n]).map((n) => h('p', { class: 'aviso' }, AVISOS[n]));
  const lista = s.status === 'done'
    ? h('p', { class: 'vacio' }, 'Ya has entrenado hoy. Descansa: la próxima sesión se calcula mañana.')
    : h('ul', { class: 'lista' }, ejercicios.map((x) => h('li', { class: 'ejercicio' },
        h('h3', {}, x.name || x.exerciseId),
        h('p', { class: 'detalle' }, x.sets + ' × ' + formatReps(x) + ' · RIR ' + x.targetRir + (x.restSec ? ' · descanso ' + formatRest(x.restSec) : '')),
        h('p', { class: 'carga' }, formatLoad(x.targetLoad)),
        x.suggestVariant ? h('p', { class: 'nota' }, 'Lo has fallado dos veces seguidas: considera una variante.') : null)));
  el.replaceChildren(h('section', {},
    ...cabecera('Sesión ' + s.cycleKey + ' · ' + formatDateEs(s.date), groupsEs(s.groups).replace(/^./, (c) => c.toUpperCase())),
    (s.groups || []).length ? figuraMusculos(s.groups, { ancho: 58, etiqueta: 'Hoy trabajas: ' + groupsEs(s.groups) }) : null,
    s.coachMessage ? h('blockquote', { class: 'mensaje' }, s.coachMessage) : null,
    ...avisos, lista,
    accion(el, s)));
  pedirMensaje(el, s);
}

// Se entra en la sesión al instante con la copia que ya hay en pantalla; el servidor la marca como empezada
// en segundo plano (y, si esa llamada fallara, el primer clip o serie la empieza igualmente).
function empezar(el, s, btn, destino = '#sesion') {
  btn.disabled = true;
  try { localStorage.setItem(ACTIVE_KEY, s.id); } catch (_) { /* sin almacenamiento */ }
  if (destino === '#sesion') guardar(CLAVE_VIVA, s.status === 'planned' ? Object.assign({}, s, { status: 'in_progress' }) : s);
  if (s.status === 'planned') call('session.start', { id: s.id }, { timeoutMs: 60000, silent: true }).catch((err) => console.error(err));
  borrar('hoy');
  location.hash = destino;
}

function accion(el, s) {
  if (s.status === 'done') return null;
  if (s.status === 'review') return h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn', onClick: (e) => empezar(el, s, e.currentTarget, '#revision') }, 'Revisar y guardar'));
  return h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn', onClick: (e) => empezar(el, s, e.currentTarget) },
    s.status === 'in_progress' ? 'Continuar sesión' : 'Empezar sesión'));
}

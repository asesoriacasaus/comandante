// Pantalla Hoy: bienvenida, primer ciclo y sesión del día.
import { call } from '../api.js';
import { h } from '../lib/dom.js';
import { groupsEs, formatLoad, formatReps, formatRest } from '../lib/format.js';
import { renderOnboarding } from './bienvenida.js';

const SLOW = { timeoutMs: 150000 };
const AVISOS = {
  first_session: 'Primera sesión de este bloque: las cargas son conservadoras. Corrígelas si no encajan.',
  layoff: 'Vuelves tras más de una semana parado: menos carga y una serie menos por ejercicio.',
  deload: 'Semana de descarga: menos volumen y menos carga para recuperar.',
  long_run: 'Hoy se ha adelantado una sesión sin pierna por tu tirada larga reciente.',
  legs_after_long_run: 'Toca pierna con una tirada larga reciente. Ve con cuidado y baja la intensidad si hace falta.'
};

const vigente = (el) => el.dataset.route === 'hoy';
const cabecera = (et, titulo) => [h('p', { class: 'etiqueta' }, et), h('h2', {}, titulo)];

export function render(el) {
  el.replaceChildren(h('section', {}, ...cabecera('Hoy', 'Tu sesión'), h('p', { class: 'vacio' }, 'Cargando…')));
  cargar(el);
}

function errorVista(el, err) {
  console.error(err);
  const enlace = ['CONFIG', 'AUTH'].includes(err.code) ? h('p', {}, h('a', { href: '#ajustes' }, 'Ir a Ajustes')) : null;
  el.replaceChildren(h('section', {}, ...cabecera('Hoy', 'Tu sesión'), h('p', { class: 'estado error' }, err.message), enlace,
    h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => render(el) }, 'Reintentar'))));
}

async function cargar(el) {
  try {
    const st = await call('plan.state', {}, { timeoutMs: 60000 });
    if (!vigente(el)) return;
    if (!st.onboarded) return renderOnboarding(el, () => render(el));
    if (!st.cycle) return renderCiclo(el);
    const r = await call('plan.today', {}, SLOW);
    if (!vigente(el)) return;
    renderSesion(el, r.session);
  } catch (err) {
    if (vigente(el)) errorVista(el, err);
  }
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

function renderSesion(el, s) {
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
    ...cabecera('Sesión ' + s.cycleKey + ' · ' + s.date, groupsEs(s.groups).replace(/^./, (c) => c.toUpperCase())),
    s.coachMessage ? h('blockquote', { class: 'mensaje' }, s.coachMessage) : null,
    ...avisos, lista,
    s.status === 'done' ? null : h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'btn', disabled: true }, 'Empezar sesión')),
    s.status === 'done' ? null : h('p', { class: 'nota' }, 'El registro por voz llega en la próxima entrega.')));
}

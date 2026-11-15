// Diario: historial de sesiones guardadas, con el detalle de cada una.
import { call } from '../api.js';
import { h } from '../lib/dom.js';
import { groupsEs, formatLoad, formatDateEs, todayIsoLocal } from '../lib/format.js';
import { sortSessions, summarizeSession, weekStart, weekTotals, thousands } from '../lib/diary.js';

const vigente = (el) => el.dataset.route === 'diario';
const TIPOS = { warmup: 'calentamiento', drop: 'dropset', failure: 'al fallo' };

export function render(el) {
  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Diario'), h('h2', {}, 'Diario'), h('p', { class: 'vacio' }, 'Cargando…')));
  cargar(el);
}

async function cargar(el) {
  try {
    const hoy = todayIsoLocal();
    const from = (Number(hoy.slice(0, 4)) - 1) + hoy.slice(4);
    const r = await call('query', { entity: 'session', from, to: hoy, filters: { status: 'done' } }, { timeoutMs: 60000 });
    if (vigente(el)) pintar(el, sortSessions(r.items || []), hoy);
  } catch (err) {
    console.error(err);
    if (!vigente(el)) return;
    el.replaceChildren(h('section', {}, h('h2', {}, 'Diario'), h('p', { class: 'estado error' }, err.message),
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => render(el) }, 'Reintentar'))));
  }
}

function pintar(el, sesiones, hoy) {
  const abiertas = new Set();
  const semana = weekTotals(sesiones, weekStart(hoy));
  const lista = h('ul', { class: 'lista' });

  const fila = (s) => {
    const t = summarizeSession(s);
    const cuerpo = h('div', { class: 'detalle-sesion', hidden: true });
    const btn = h('button', { type: 'button', class: 'diario-fila', 'aria-expanded': 'false' },
      h('span', { class: 'diario-fecha' }, formatDateEs(s.date)),
      h('span', { class: 'diario-titulo' }, groupsEs(s.groups).replace(/^./, (c) => c.toUpperCase())),
      h('span', { class: 'detalle' }, t.sets + ' series · ' + thousands(t.volumeKg) + ' kg' + (t.durationMin ? ' · ' + t.durationMin + ' min' : '')));
    btn.addEventListener('click', () => {
      const abierta = abiertas.has(s.id);
      if (abierta) abiertas.delete(s.id); else abiertas.add(s.id);
      if (!abierta && !cuerpo.firstChild) cuerpo.append(...detalle(s));
      cuerpo.hidden = abierta;
      btn.setAttribute('aria-expanded', String(!abierta));
    });
    return h('li', { class: 'diario-item' }, btn, cuerpo);
  };
  sesiones.forEach((s) => lista.append(fila(s)));

  el.replaceChildren(h('section', {},
    h('p', { class: 'etiqueta' }, 'Diario'),
    h('h2', {}, 'Diario'),
    h('div', { class: 'resumen' },
      dato(String(semana.sessions), 'sesiones esta semana'), dato(String(semana.sets), 'series'), dato(thousands(semana.volumeKg), 'kg de volumen')),
    sesiones.length ? lista : h('p', { class: 'vacio' }, 'Aún no has guardado ninguna sesión. Cuando termines y guardes una, aparecerá aquí.')));
}

function dato(valor, etiqueta) { return h('div', { class: 'dato' }, h('span', { class: 'valor' }, valor), h('span', { class: 'etiqueta' }, etiqueta)); }

function detalle(s) {
  const nodos = [];
  if (s.reviewMessage) nodos.push(h('blockquote', { class: 'mensaje' }, s.reviewMessage));
  (s.painFlags || []).forEach((p) => nodos.push(h('p', { class: 'aviso peligro' }, 'Molestia anotada: ' + (p.text || 'sin detalle'))));
  (s.exercises || []).forEach((x) => {
    nodos.push(h('div', { class: 'bloque' }, h('h3', {}, x.name),
      h('ul', { class: 'series' }, x.sets.map((set) => h('li', { class: 'serie-solo' },
        h('span', { class: 'n' }, set.order),
        h('span', {}, set.reps + ' rep · ' + (set.rir === null || set.rir === undefined ? 'RIR sin dato' : 'RIR ' + set.rir) + (TIPOS[set.type] ? ' · ' + TIPOS[set.type] : '')),
        h('span', { class: 'carga' }, formatLoad(set.load)))))));
  });
  if (!nodos.length) nodos.push(h('p', { class: 'vacio' }, 'Sin detalle.'));
  return nodos;
}

// Diario: historial de sesiones guardadas, con el detalle de cada una.
import { h, cargando } from '../lib/dom.js';
import { groupsEs, formatLoad, formatDateEs, todayIsoLocal } from '../lib/format.js';
import { resumenSesiones, detalleSesion } from '../lib/sesiones-datos.js';
import { guardar } from '../lib/cache.js';
import { relojDescanso } from '../lib/sesion-viva.js';
import { bloqueResumen } from './resumen-hablado.js';
import { sortSessions, summarizeSession, weekStart, weekTotals, thousands } from '../lib/diary.js';

const vigente = (el) => el.dataset.route === 'diario';
const TIPOS = { warmup: 'calentamiento', drop: 'dropset', failure: 'al fallo' };

export function render(el) {
  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Diario'), h('h2', {}, 'Diario'), cargando()));
  cargar(el);
}

async function cargar(el) {
  try {
    const hoy = todayIsoLocal();
    await resumenSesiones((items) => { if (vigente(el)) pintar(el, sortSessions(items), hoy); });
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
      h('span', { class: 'detalle' }, t.sets + ' series · ' + thousands(t.volumeKg) + ' kg' + (t.durationMin ? ' · ' + t.durationMin + ' min' : '') + (t.avgRestSec !== null ? ' · descanso medio ' + relojDescanso(t.avgRestSec) : '')));
    btn.addEventListener('click', () => {
      const abierta = abiertas.has(s.id);
      if (abierta) abiertas.delete(s.id); else abiertas.add(s.id);
      if (!abierta && !cuerpo.firstChild) abrir(s, cuerpo);
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

async function abrir(s, cuerpo) {
  cuerpo.replaceChildren(cargando('Cargando el detalle…'));
  try {
    const pintar = (ses) => cuerpo.replaceChildren(...detalle(ses), bloqueResumen(ses, (nueva) => { guardar('sesion-' + nueva.id, nueva); pintar(nueva); }));
    pintar(await detalleSesion(s.id));
  } catch (err) {
    cuerpo.replaceChildren(h('p', { class: 'estado error' }, err.message),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => abrir(s, cuerpo) }, 'Reintentar'));
  }
}

function dato(valor, etiqueta) { return h('div', { class: 'dato' }, h('span', { class: 'valor' }, valor), h('span', { class: 'etiqueta' }, etiqueta)); }

function detalle(s) {
  const nodos = [];
  if (s.reviewMessage) nodos.push(h('blockquote', { class: 'mensaje' }, s.reviewMessage));
  (s.painFlags || []).filter((p) => p.source !== 'debrief').forEach((p) => nodos.push(h('p', { class: 'aviso peligro' }, 'Molestia anotada: ' + (p.text || 'sin detalle'))));
  (s.exercises || []).forEach((x) => {
    nodos.push(h('div', { class: 'bloque' }, h('h3', {}, x.name),
      h('ul', { class: 'series' }, x.sets.map((set) => h('li', { class: 'serie-solo' },
        h('span', { class: 'n' }, set.order),
        h('span', {}, set.reps + ' rep · ' + (set.rir === null || set.rir === undefined ? 'RIR sin dato' : 'RIR ' + set.rir) + (TIPOS[set.type] ? ' · ' + TIPOS[set.type] : '') + (typeof set.restSec === 'number' ? ' · descanso ' + relojDescanso(set.restSec) : '')),
        h('span', { class: 'carga' }, formatLoad(set.load)))))));
  });
  if (!nodos.length) nodos.push(h('p', { class: 'vacio' }, 'Sin detalle.'));
  return nodos.filter(Boolean);
}

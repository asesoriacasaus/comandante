// Progreso: 1RM estimado por ejercicio, volumen semanal y series por grupo y semana.
import { call } from '../api.js';
import { h } from '../lib/dom.js';
import { todayIsoLocal } from '../lib/format.js';
import { movingAverage, lineChart } from '../lib/charts.js';
import { exerciseList, e1rmSeries, weeklyTables, cellClass } from '../lib/progress.js';

const vigente = (el) => el.dataset.route === 'progreso';
const GRUPOS = [['chest', 'Pecho'], ['back', 'Espalda'], ['shoulders', 'Hombros'], ['biceps', 'Bíceps'], ['triceps', 'Tríceps'],
  ['quads', 'Cuádriceps'], ['hamstrings', 'Femorales'], ['glutes', 'Glúteos'], ['calves', 'Gemelos'], ['core', 'Core']];
const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const corta = (iso) => iso.slice(8) + '/' + iso.slice(5, 7);

export function render(el) {
  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Progreso'), h('h2', {}, 'Progreso'), h('p', { class: 'vacio' }, 'Cargando…')));
  cargar(el);
}

async function cargar(el) {
  try {
    const hoy = todayIsoLocal();
    const from = (Number(hoy.slice(0, 4)) - 1) + hoy.slice(4);
    const r = await call('query', { entity: 'session', from, to: hoy, filters: { status: 'done' } }, { timeoutMs: 60000 });
    if (vigente(el)) pintar(el, r.items || [], hoy);
  } catch (err) {
    console.error(err);
    if (!vigente(el)) return;
    el.replaceChildren(h('section', {}, h('h2', {}, 'Progreso'), h('p', { class: 'estado error' }, err.message),
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => render(el) }, 'Reintentar'))));
  }
}

function pintar(el, sesiones, hoy) {
  if (!sesiones.length) {
    el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Progreso'), h('h2', {}, 'Progreso'), h('p', { class: 'vacio' }, 'Cuando guardes tus primeras sesiones verás aquí cómo evolucionan tus cargas y tu volumen.')));
    return;
  }
  const ejercicios = exerciseList(sesiones);
  const caja = h('div', {});
  const selector = h('select', { 'aria-label': 'Ejercicio' }, ...ejercicios.map((e) => h('option', { value: e.id }, e.name + ' (' + e.count + ')')));
  const pintarEj = () => {
    const serie = e1rmSeries(sesiones, selector.value);
    caja.replaceChildren(
      serie.length ? h('p', { class: 'nota' }, 'Último: ' + fmt(serie[serie.length - 1].value) + ' kg · mejor: ' + fmt(Math.max(...serie.map((p) => p.value))) + ' kg (estimado)') : null,
      lineChart(serie, movingAverage(serie, 28), { label: '1RM estimado' }));
  };
  selector.addEventListener('change', pintarEj);
  if (ejercicios.length) pintarEj();

  const t = weeklyTables(sesiones, hoy, 6);
  const tabla = h('table', { class: 'tabla-grupos' },
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Grupo'), ...t.weeks.map((w) => h('th', { scope: 'col' }, corta(w))))),
    h('tbody', {}, GRUPOS.map(([k, nombre]) => h('tr', {}, h('th', { scope: 'row' }, nombre),
      ...t.weeks.map((w) => h('td', { class: cellClass(t.groups[w][k]) }, t.groups[w][k] ? fmt(t.groups[w][k]) : '·'))))));
  const volumen = t.weeks.map((w) => ({ date: w, value: t.volume[w] })).filter((p) => p.value > 0);

  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Progreso'), h('h2', {}, 'Progreso'),
    ejercicios.length ? h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, '1RM estimado por ejercicio'),
      h('label', {}, 'Ejercicio', selector), caja,
      h('p', { class: 'nota' }, 'Estimación con la fórmula de Epley a partir de tus mejores series de hasta 12 repeticiones. La línea es la media de 28 días.')) : null,
    h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Series por grupo y semana (lunes de cada semana)'), h('div', { class: 'scroll-x' }, tabla),
      h('p', { class: 'nota' }, 'El objetivo de partida son 10 a 16 series efectivas por grupo y semana. Rojizo: por debajo de 8. Verde: en rango. Oscuro: por encima de 16. Un grupo principal cuenta 1 por serie; uno secundario, 0,5.')),
    volumen.length > 1 ? h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Volumen semanal (kg)'), lineChart(volumen, null, { label: 'Volumen semanal' })) : null));
}

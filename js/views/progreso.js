// Progreso: 1RM estimado por ejercicio, volumen semanal y series por grupo y semana.
import { resumenSesiones } from '../lib/sesiones-datos.js';
import { h, cargando } from '../lib/dom.js';
import { todayIsoLocal } from '../lib/format.js';
import { movingAverage, lineChart } from '../lib/charts.js';
import { exerciseList, e1rmSeries, weeklyTables, cellClass, matrizSemanal, records, comparativa } from '../lib/progress.js';

const vigente = (el) => el.dataset.route === 'progreso';
const GRUPOS = [['chest', 'Pecho'], ['back', 'Espalda'], ['shoulders', 'Hombros'], ['biceps', 'Bíceps'], ['triceps', 'Tríceps'],
  ['quads', 'Cuádriceps'], ['hamstrings', 'Femorales'], ['glutes', 'Glúteos'], ['calves', 'Gemelos'], ['core', 'Core']];
const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (iso) => Number(iso.slice(8)) + ' ' + MESES[Number(iso.slice(5, 7)) - 1];
const corta = (iso) => iso.slice(8) + '/' + iso.slice(5, 7);

export function render(el) {
  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Progreso'), h('h2', {}, 'Progreso'), cargando()));
  cargar(el);
}

async function cargar(el) {
  try {
    const hoy = todayIsoLocal();
    await resumenSesiones((items) => { if (vigente(el)) pintar(el, items, hoy); });
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
    const top = records(sesiones, selector.value);
    caja.replaceChildren(
      top.length ? h('ol', { class: 'medallas', 'aria-label': 'Mejores marcas' }, top.map((r, i) => h('li', { class: 'medalla m' + (i + 1) },
        h('span', { class: 'medalla-icono', 'aria-hidden': 'true' }, i === 0 ? '★' : String(i + 1)),
        h('span', { class: 'medalla-valor' }, fmt(r.value), h('small', {}, ' kg')),
        h('span', { class: 'medalla-fecha' }, (i === 0 ? 'Récord · ' : '') + fechaCorta(r.date))))) : null,
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

  // De un vistazo: últimas 4 semanas frente a las 4 anteriores.
  const c = comparativa(sesiones, hoy);
  const kg = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const vistazo = h('div', { class: 'vistazo' },
    h('p', { class: 'etiqueta' }, 'Tu progreso de un vistazo'),
    h('div', { class: 'vistazo-cifras' },
      h('div', {}, h('span', { class: 'vistazo-num' }, kg(c.volumen), h('small', {}, ' kg')),
        c.cambio !== null ? h('span', { class: 'delta ' + (c.cambio >= 0 ? 'sube' : 'baja') }, (c.cambio >= 0 ? '▲ ' : '▼ ') + Math.abs(c.cambio) + ' %') : null,
        h('span', { class: 'vistazo-que' }, 'volumen, últimos 28 días')),
      h('div', { class: 'vistazo-antes' }, h('span', { class: 'vistazo-num' }, kg(c.volumenAntes), h('small', {}, ' kg')), h('span', { class: 'vistazo-que' }, '28 días anteriores'))),
    h('p', { class: 'vistazo-frase' }, c.cambio === null ? 'Sigue registrando: en cuatro semanas podrás comparar.'
      : (c.cambio >= 0 ? 'Has movido un ' + c.cambio + ' % más de volumen' : 'Has movido un ' + Math.abs(c.cambio) + ' % menos de volumen') + ' que en las cuatro semanas anteriores, en ' + c.sesiones + (c.sesiones === 1 ? ' sesión.' : ' sesiones.')));

  // Semanas: un punto por día, más grande cuanto más volumen.
  const m = matrizSemanal(sesiones, hoy, 6);
  const matriz = h('div', { class: 'matriz', role: 'table', 'aria-label': 'Volumen por día de las últimas 6 semanas' },
    h('div', { class: 'matriz-fila cab', role: 'row' }, h('span', { role: 'columnheader' }, ''), ...['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => h('span', { role: 'columnheader' }, d)),
      h('span', { role: 'columnheader', class: 'num' }, 'kg'), h('span', { role: 'columnheader', class: 'num' }, 'cambio')),
    ...m.filas.map((f) => h('div', { class: 'matriz-fila', role: 'row' },
      h('span', { role: 'rowheader', class: 'sem' }, 'S' + f.num),
      ...f.days.map((v) => h('span', { role: 'cell', class: 'celda', 'aria-label': v ? kg(v) + ' kg' : 'descanso' },
        h('i', { class: 'punto' + (v ? ' lleno' : ''), 'data-t': String(v ? Math.round(10 + 18 * Math.sqrt(v / m.max)) : 5) }))),
      h('span', { role: 'cell', class: 'num' }, f.total ? kg(f.total) : '·'),
      h('span', { role: 'cell', class: 'num ' + (f.cambio === null ? '' : f.cambio >= 0 ? 'sube' : 'baja') }, f.enCurso ? 'en curso' : f.cambio === null ? '·' : (f.cambio > 0 ? '+' : '') + f.cambio + ' %'))));
  matriz.querySelectorAll('.punto').forEach((n) => { n.style.width = n.style.height = n.dataset.t + 'px'; });

  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Progreso'), h('h2', {}, 'Progreso'),
    vistazo,
    h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Semanas'), h('div', { class: 'scroll-x' }, matriz)),
    ejercicios.length ? h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, '1RM estimado por ejercicio'),
      h('label', {}, 'Ejercicio', selector), caja,
      h('p', { class: 'nota' }, 'Estimación con la fórmula de Epley a partir de tus mejores series de hasta 12 repeticiones. La línea es la media de 28 días.')) : null,
    h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Series por grupo y semana (lunes de cada semana)'), h('div', { class: 'scroll-x' }, tabla),
      h('p', { class: 'nota' }, 'El objetivo de partida son 10 a 16 series efectivas por grupo y semana. Rojizo: por debajo de 8. Verde: en rango. Oscuro: por encima de 16. Un grupo principal cuenta 1 por serie; uno secundario, 0,5.')),
    volumen.length > 1 ? h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Volumen semanal (kg)'), lineChart(volumen, null, { label: 'Volumen semanal' })) : null));
}

// Pantalla Carreras: pantallazo del reloj, lista de salidas y total semanal.
import { call } from '../api.js';
import { h } from '../lib/dom.js';
import { formatDateEs, todayIsoLocal, parseNum } from '../lib/format.js';
import { swr, borrar } from '../lib/cache.js';
import { blobToBase64, shrinkImage } from '../lib/media.js';
import { formatDuration, formatPace, parseDuration, parsePace, paceFrom, isoWithOffset, weekKm, isLongRun, warningText } from '../lib/runs.js';

const vigente = (el) => el.dataset.route === 'carreras';
let pantalla = 'inicio';   // si el usuario está revisando una carrera, un dato nuevo no la pisa
const dec = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

export function render(el) {
  pantalla = 'inicio';
  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Carreras'), h('h2', {}, 'Carreras'), h('p', { class: 'vacio' }, 'Cargando…')));
  cargar(el);
}

async function cargar(el) {
  try {
    const hoy = todayIsoLocal();
    const from = (Number(hoy.slice(0, 4)) - 1) + hoy.slice(4);
    await swr('carreras', async () => (await call('query', { entity: 'run', from, to: hoy }, { timeoutMs: 60000 })).items || [],
      (items) => { if (vigente(el) && pantalla === 'inicio') inicio(el, [...items].sort((a, b) => (a.date < b.date ? 1 : -1))); });
  } catch (err) {
    console.error(err);
    if (!vigente(el)) return;
    el.replaceChildren(h('section', {}, h('h2', {}, 'Carreras'), h('p', { class: 'estado error' }, err.message),
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => render(el) }, 'Reintentar'))));
  }
}

function inicio(el, runs) {
  pantalla = 'inicio';
  const hoy = todayIsoLocal();
  const fila = (r) => {
    const detalle = h('div', { class: 'detalle-sesion', hidden: true },
      h('p', { class: 'detalle' }, [r.avgHr ? 'FC media ' + r.avgHr + ' ppm' : '', r.maxHr ? 'máx. ' + r.maxHr : '', r.cadence ? 'cadencia ' + r.cadence + ' ppm' : '',
        r.kcal ? r.kcal + ' kcal' : '', r.elevationM !== undefined ? 'ascenso ' + r.elevationM + ' m' : ''].filter(Boolean).join(' · ')),
      isLongRun(r) ? h('p', { class: 'nota' }, 'Tirada larga: si te toca pierna en las 36 horas siguientes, el Comandante adelanta otra sesión.') : null,
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: async (e) => {
        if (!confirm('¿Borrar esta carrera?')) return;
        e.currentTarget.disabled = true;
        try { await call('run.delete', { id: r.id, date: r.date }, { timeoutMs: 60000 }); borrar('carreras'); render(el); }
        catch (err) { console.error(err); e.currentTarget.disabled = false; e.currentTarget.after(h('p', { class: 'estado error' }, err.message)); }
      } }, 'Borrar')));
    const btn = h('button', { type: 'button', class: 'diario-fila', 'aria-expanded': 'false' },
      h('span', { class: 'diario-fecha' }, formatDateEs(r.date)),
      h('span', { class: 'diario-titulo' }, dec(r.distanceKm) + ' km · ' + formatDuration(r.durationSec)),
      h('span', { class: 'detalle' }, formatPace(r.avgPaceSecPerKm)));
    btn.addEventListener('click', () => { detalle.hidden = !detalle.hidden; btn.setAttribute('aria-expanded', String(!detalle.hidden)); });
    return h('li', { class: 'diario-item' }, btn, detalle);
  };
  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Carreras'), h('h2', {}, 'Carreras'),
    h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'btn', onClick: () => pantallaPantallazo(el, runs) }, 'Subir pantallazo del reloj'),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => pantallaRevision(el, runs, { fields: {}, warnings: [], rejected: [] }, 'manual') }, 'Anotar a mano')),
    h('p', { class: 'nota' }, 'Esta semana: ' + dec(weekKm(runs, hoy)) + ' km'),
    runs.length ? h('ul', { class: 'lista' }, runs.map(fila)) : h('p', { class: 'vacio' }, 'Aún no hay carreras. Haz una captura del resumen de tu reloj y súbela: el Comandante la tendrá en cuenta para no ponerte pierna justo después de una tirada larga.')));
}

function pantallaPantallazo(el, runs) {
  pantalla = 'otra';
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const input = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Captura del reloj' });
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    estado.className = 'estado'; estado.textContent = 'Leyendo el pantallazo…';
    try {
      const blob = await shrinkImage(f);
      const data = await blobToBase64(blob);
      const r = await call('run.extract', { mime: 'image/jpeg', data }, { timeoutMs: 150000 });
      if (vigente(el)) pantallaRevision(el, runs, r, 'screenshot');
    } catch (err) { console.error(err); estado.className = 'estado error'; estado.textContent = err.message; }
  });
  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Carreras'), h('h2', {}, 'Pantallazo del reloj'),
    h('p', { class: 'nota' }, 'Haz una captura de la pantalla de resumen de la carrera y elígela aquí. Podrás revisar los datos antes de guardarlos.'),
    h('label', {}, 'Captura', input), estado,
    h('div', { class: 'acciones fin' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => inicio(el, runs) }, 'Cancelar'))));
}

function pantallaRevision(el, runs, r, source) {
  pantalla = 'otra';
  const f = r.fields;
  const inp = (id, etiqueta, valor, extra = {}) => h('label', {}, etiqueta, h('input', Object.assign({ id, autocomplete: 'off', inputmode: 'decimal', value: valor === undefined || valor === null ? '' : String(valor) }, extra)));
  const hora = r.startedAt ? r.startedAt.slice(11, 16) : '';
  const form = h('form', { class: 'card', novalidate: true, onSubmit: (e) => e.preventDefault() },
    inp('c-fecha', 'Fecha', r.date || todayIsoLocal(), { type: 'date', inputmode: null }),
    inp('c-hora', 'Hora de inicio (para la regla de pierna)', hora, { type: 'time', inputmode: null }),
    inp('c-dist', 'Distancia (km)', f.distanceKm === undefined ? '' : dec(f.distanceKm)),
    inp('c-dur', 'Duración (h:mm:ss)', f.durationSec === undefined ? '' : formatDuration(f.durationSec), { inputmode: 'numeric' }),
    inp('c-fc', 'Frecuencia cardíaca media (ppm)', f.avgHr, { inputmode: 'numeric' }),
    inp('c-fcmax', 'Frecuencia máxima (ppm)', f.maxHr, { inputmode: 'numeric' }),
    inp('c-cad', 'Cadencia media (pasos/min)', f.cadence, { inputmode: 'numeric' }),
    inp('c-kcal', 'Calorías', f.kcal, { inputmode: 'numeric' }),
    inp('c-asc', 'Ascenso total (m)', f.elevationM, { inputmode: 'decimal' }));
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const avisos = (r.warnings || []).filter((w) => warningText(w)).map((w) => h('p', { class: 'aviso' }, 'Aviso: ' + warningText(w) + '.'));
  const q = (id) => form.querySelector('#' + id).value;

  const guardar = async (btn) => {
    const distanceKm = parseNum(q('c-dist'));
    const durationSec = parseDuration(q('c-dur'));
    if (distanceKm === null || durationSec === null) { estado.className = 'estado error'; estado.textContent = 'La distancia y la duración (con formato 14:51 o 1:05:03) son obligatorias.'; return; }
    const date = q('c-fecha');
    const rec = { date, source, distanceKm, durationSec, avgPaceSecPerKm: paceFrom(distanceKm, durationSec) };
    const horaIni = q('c-hora');
    if (horaIni) rec.startedAt = isoWithOffset(date, horaIni, -new Date(date + 'T' + horaIni + ':00').getTimezoneOffset());
    [['avgHr', 'c-fc'], ['maxHr', 'c-fcmax'], ['cadence', 'c-cad'], ['kcal', 'c-kcal'], ['elevationM', 'c-asc']].forEach(([k, id]) => { const n = parseNum(q(id)); if (n !== null) rec[k] = n; });
    if (f.trainingLoad !== undefined) rec.trainingLoad = f.trainingLoad;
    if (f.trainingEffect !== undefined) rec.trainingEffect = f.trainingEffect;
    btn.disabled = true; estado.className = 'estado'; estado.textContent = 'Guardando…';
    try { await call('commit', { entity: 'run', record: rec }, { timeoutMs: 60000 }); borrar('carreras'); if (vigente(el)) render(el); }
    catch (err) { console.error(err); btn.disabled = false; estado.className = 'estado error'; estado.textContent = err.message; }
  };

  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Carreras'), h('h2', {}, 'Revisa la carrera'),
    ...(r.rejected || []).map((x) => h('p', { class: 'aviso peligro' }, 'No he podido leer bien un dato (' + x.part + '). Completa el campo a mano.')),
    ...avisos, form,
    h('p', { class: 'nota' }, 'El ritmo se calcula con la distancia y la duración. Pon la hora de inicio: sirve para saber cuánto ha pasado hasta tu próxima sesión de pierna.'),
    estado,
    h('div', { class: 'acciones fin' }, h('button', { type: 'button', class: 'btn', onClick: (e) => guardar(e.currentTarget) }, 'Guardar carrera'),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => inicio(el, runs) }, 'Cancelar'))));
}

// Pantalla Cuerpo: última medición, medir por voz o a mano, y acceso a la guía.
import { call } from '../api.js';
import { h } from '../lib/dom.js';
import { formatCm, formatDateEs, todayIsoLocal, parseNum, formatDelta } from '../lib/format.js';
import { MEASURES, measureLabel, summarize, latestWeight, SCALE_FIELDS, latestScale } from '../lib/measures.js';
import { blobToBase64, shrinkImage } from '../lib/media.js';
import { createRecorder } from '../recorder.js';
import { swr, borrar } from '../lib/cache.js';
import { seriesOf, movingAverage, goalProgress, timeline, lineChart } from '../lib/charts.js';

const vigente = (el) => el.dataset.route === 'cuerpo';
const num = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const num2 = (n) => String(Math.round(n * 100) / 100).replace('.', ',');   // báscula: conserva dos decimales
const PARTE_ES = { neck: 'cuello', shoulders: 'hombros', chest: 'pecho', waist: 'cintura', hip: 'cadera', arm: 'bíceps', forearm: 'antebrazo', thigh: 'muslo', calf: 'gemelo', weightKg: 'peso' };
const nombre = (k) => (PARTE_ES[k] || (SCALE_FIELDS.find((f) => f.key === k) || {}).label || measureLabel(k)).toLowerCase();
const MOTIVOS = {
  missing_side: (r) => 'Dijiste «' + nombre(r.part) + ' ' + num(r.valueCm) + '» sin lado: indica derecho o izquierdo.',
  out_of_range: (r) => num(r.valueCm) + ' no es posible para ' + nombre(r.part) + (SCALE_FIELDS.some((f) => f.key === r.part) ? ': ¿se ha leído mal la coma decimal?' : ': ¿centímetros o milímetros?')
};

let recorder = null;
let ajustes = null;   // settings.json (objetivo), para el progreso
let pantalla = 'inicio';   // si el usuario está en una subpantalla, un dato nuevo no la pisa

export function render(el) {
  pantalla = 'inicio';
  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Cuerpo'), h('h2', {}, 'Cuerpo'), h('p', { class: 'vacio' }, 'Cargando…')));
  cargar(el);
}

async function cargar(el) {
  try {
    const hoy = todayIsoLocal();
    const from = (Number(hoy.slice(0, 4)) - 1) + hoy.slice(4);
    await swr('cuerpo', async () => {
      const [r, s] = await Promise.all([call('query', { entity: 'body', from, to: hoy }, { timeoutMs: 60000 }),
        call('settings.get', {}, { timeoutMs: 60000 }).catch(() => null)]);
      return { items: r.items || [], ajustes: s };
    }, (d) => { ajustes = d.ajustes; if (vigente(el) && pantalla === 'inicio') inicio(el, d.items); });
  } catch (err) {
    console.error(err);
    if (!vigente(el)) return;
    el.replaceChildren(h('section', {}, h('h2', {}, 'Cuerpo'), h('p', { class: 'estado error' }, err.message),
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => render(el) }, 'Reintentar'),
        h('a', { class: 'btn btn-sec', href: '#guia' }, 'Guía para medirte'))));
  }
}

function inicio(el, records) {
  pantalla = 'inicio';
  const sum = summarize(records);
  const peso = latestWeight(records);
  const filas = MEASURES.filter((m) => sum[m.key]).map((m) => {
    const s = sum[m.key];
    const delta = s.prev !== null ? Math.round((s.value - s.prev) * 10) / 10 : null;
    return h('li', { class: 'fila medida' }, h('span', {}, m.label),
      h('span', { class: 'valor-medida' }, formatCm(s.value), delta !== null ? h('small', {}, ' ' + formatDelta(delta).replace(' kg', ' cm')) : null));
  });
  el.replaceChildren(h('section', {},
    h('p', { class: 'etiqueta' }, 'Cuerpo'),
    h('h2', {}, 'Cuerpo'),
    h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'btn', onClick: () => pantallaVoz(el, records) }, 'Medir por voz'),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => pantallaRevision(el, records, { measurements: {}, source: 'manual' }) }, 'Anotar a mano'),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => pantallaPantallazo(el, records) }, 'Subir pantallazo de la báscula'),
      h('a', { class: 'btn btn-sec', href: '#guia' }, 'Guía para medirte')),
    peso ? h('p', { class: 'nota' }, 'Peso: ' + num(peso.value) + ' kg · ' + formatDateEs(peso.date)) : null,
    progreso(records),
    bascula(records),
    filas.length ? h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Última medida de cada parte'), h('ul', { class: 'lista' }, filas))
      : h('p', { class: 'vacio' }, 'Aún no hay medidas. Mídete con la cinta y dicta los números; la guía te enseña dónde colocarla.')));
}

function progreso(records) {
  const g = ajustes && ajustes.goal;
  if (!g || g.startWeightKg == null || g.targetWeightKg == null) return null;
  const hoy = todayIsoLocal();
  const nodos = [h('p', { class: 'etiqueta' }, 'Progreso hacia tu objetivo')];
  const t = timeline(g.startDate, g.targetDate, hoy);
  if (t) nodos.push(h('div', { class: 'progreso' }, h('p', {}, 'Día ' + t.elapsed + ' de ' + t.total + ' · faltan ' + t.left + ' días'), h('progress', { max: 100, value: Math.min(100, t.pct), 'aria-label': 'Tiempo transcurrido' })));

  const peso = seriesOf(records, (r) => r.weightKg);
  const media = movingAverage(peso, 7);
  if (media.length) {
    const actual = media[media.length - 1].value;
    const gp = goalProgress(g.startWeightKg, actual, g.targetWeightKg);
    nodos.push(h('div', { class: 'progreso' },
      h('p', {}, 'Peso medio de 7 días: ' + num(actual) + ' kg · objetivo ' + num(g.targetWeightKg) + ' kg' + (gp ? ' · ' + gp.pct + ' %' : '')),
      gp ? h('progress', { max: 100, value: Math.max(0, Math.min(100, gp.pct)), 'aria-label': 'Avance hacia el peso objetivo' }) : null));
  }
  const cintura = seriesOf(records, (r) => (r.measurementsCm || {}).waist);
  if (cintura.length && g.startWaistCm != null) {
    const d = Math.round((cintura[cintura.length - 1].value - g.startWaistCm) * 10) / 10;
    nodos.push(h('p', { class: 'nota' }, 'Cintura: de ' + num(g.startWaistCm) + ' cm a ' + num(cintura[cintura.length - 1].value) + ' cm (' + (d === 0 ? 'sin cambio' : (d > 0 ? '+' : '−') + num(Math.abs(d)) + ' cm') + ')'));
  }
  if (peso.length) nodos.push(h('p', { class: 'etiqueta' }, 'Peso (puntos) y media de 7 días (línea)'), lineChart(peso, media, { label: 'Gráfica de peso' }));
  if (cintura.length) nodos.push(h('p', { class: 'etiqueta' }, 'Cintura (cm)'), lineChart(cintura, null, { label: 'Gráfica de cintura' }));
  return nodos.length > 1 ? h('div', { class: 'bloque' }, nodos) : null;
}

function bascula(records) {
  const sc = latestScale(records);
  const filas = SCALE_FIELDS.filter((f) => f.key !== 'weightKg' && sc[f.key]).map((f) => {
    const s = sc[f.key];
    const d = s.prev !== null ? Math.round((s.value - s.prev) * 100) / 100 : null;
    return h('li', { class: 'fila medida' }, h('span', {}, f.label),
      h('span', { class: 'valor-medida' }, num2(s.value) + (f.unit ? ' ' + f.unit : ''), d !== null && d !== 0 ? h('small', {}, ' ' + (d > 0 ? '+' : '−') + num2(Math.abs(d))) : null));
  });
  return filas.length ? h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Última lectura de la báscula'), h('ul', { class: 'lista' }, filas)) : null;
}

function pantallaPantallazo(el, records) {
  pantalla = 'otra';
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const input = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Captura de la báscula' });
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    estado.className = 'estado'; estado.textContent = 'Leyendo el pantallazo…';
    try {
      const blob = await shrinkImage(f);
      const data = await blobToBase64(blob);
      const r = await call('body.extract', { kind: 'image', mime: 'image/jpeg', data }, { timeoutMs: 150000 });
      if (vigente(el)) pantallaRevision(el, records, { source: 'scale', measurements: {}, scale: r.fields, rejected: r.rejected, date: r.date });
    } catch (err) { console.error(err); estado.className = 'estado error'; estado.textContent = err.message; }
  });
  el.replaceChildren(h('section', {},
    h('p', { class: 'etiqueta' }, 'Cuerpo'), h('h2', {}, 'Pantallazo de la báscula'),
    h('p', { class: 'nota' }, 'Haz una captura de la pantalla de resultados de tu báscula y elígela aquí. Podrás revisar los números antes de guardarlos.'),
    h('label', {}, 'Captura', input), estado,
    h('div', { class: 'acciones fin' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => inicio(el, records) }, 'Cancelar'))));
}

function pantallaVoz(el, records) {
  pantalla = 'otra';
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const boton = h('button', { type: 'button', class: 'btn btn-grabar' }, 'Grabar');
  let grabando = false;
  recorder = recorder || createRecorder({ onTick: (ms) => { if (grabando) estado.textContent = 'Grabando ' + Math.floor(ms / 1000) + ' s'; }, onAutoStop: () => boton.click() });

  boton.addEventListener('click', async () => {
    if (!grabando) {
      try { await recorder.start(); grabando = true; boton.textContent = 'Parar'; boton.classList.add('activo'); estado.className = 'estado'; estado.textContent = 'Grabando 0 s'; }
      catch (err) { console.error(err); estado.className = 'estado error'; estado.textContent = 'Sin acceso al micrófono. Actívalo en Ajustes de iOS para este sitio.'; }
      return;
    }
    grabando = false; boton.disabled = true; boton.classList.remove('activo'); boton.textContent = 'Procesando…';
    let clip;
    try { clip = await recorder.stop(); } catch (err) { console.error(err); boton.disabled = false; boton.textContent = 'Grabar'; return; }
    recorder.releaseMic();
    const enviar = async () => {
      estado.className = 'estado'; estado.textContent = 'Interpretando lo que dijiste…';
      try {
        const data = await blobToBase64(clip.blob);
        const r = await call('body.extract', { mime: clip.mime, data }, { timeoutMs: 150000 });
        if (vigente(el)) pantallaRevision(el, records, Object.assign({ source: 'voice' }, r));
      } catch (err) {
        console.error(err);
        estado.className = 'estado error'; estado.textContent = err.message + ' La grabación sigue aquí: puedes reintentar.';
        boton.disabled = false; boton.textContent = 'Reintentar'; boton.onclick = (e) => { e.stopImmediatePropagation(); boton.disabled = true; enviar(); };
      }
    };
    enviar();
  });

  el.replaceChildren(h('section', {},
    h('p', { class: 'etiqueta' }, 'Cuerpo'), h('h2', {}, 'Medir por voz'),
    h('p', { class: 'nota' }, 'Mídete con la cinta y di cada medida en voz alta: la parte, el lado si lo tiene y los centímetros. Si no sabes dónde colocarla, mira primero la guía.'),
    h('blockquote', { class: 'mensaje' }, 'Cintura noventa y nueve coma cinco, bíceps derecho treinta y ocho, muslo izquierdo sesenta y dos.'),
    boton, estado,
    h('div', { class: 'acciones fin' }, h('a', { class: 'btn btn-sec', href: '#guia' }, 'Ver la guía'),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => { recorder && recorder.releaseMic(); inicio(el, records); } }, 'Cancelar'))));
}

function pantallaRevision(el, records, ext) {
  pantalla = 'otra';
  const prev = summarize(records);
  const sospechosas = Object.fromEntries((ext.suspicious || []).map((s) => [s.key, s]));
  const inputs = {};
  const filas = MEASURES.map((m) => {
    const v = ext.measurements[m.key];
    const input = h('input', { inputmode: 'decimal', autocomplete: 'off', 'aria-label': m.label + ' en centímetros', value: v === undefined ? '' : num(v) });
    inputs[m.key] = input;
    const s = sospechosas[m.key];
    return h('label', { class: s ? 'sospechosa' : '' }, m.label + (prev[m.key] ? ' · antes ' + num(prev[m.key].value) : ''), input,
      s ? h('small', { class: 'aviso-medida' }, 'Cambio de ' + (s.pct > 0 ? '+' : '−') + String(Math.abs(s.pct)).replace('.', ',') + ' % respecto a la última vez: revisa que sea correcto.') : null);
  });
  const scale = Object.assign({}, ext.scale || {});
  if (ext.weightKg) scale.weightKg = ext.weightKg;
  const camposBascula = (ext.source === 'scale' ? SCALE_FIELDS : SCALE_FIELDS.filter((f) => f.key === 'weightKg'));
  const scaleInputs = {};
  const filasBascula = camposBascula.map((f) => {
    const input = h('input', { inputmode: 'decimal', autocomplete: 'off', 'aria-label': f.label, value: scale[f.key] === undefined ? '' : num2(scale[f.key]) });
    scaleInputs[f.key] = input;
    return h('label', {}, f.label + (f.unit ? ' (' + f.unit + ')' : ''), input);
  });
  const fecha = h('input', { type: 'date', value: ext.date || todayIsoLocal(), 'aria-label': 'Fecha' });
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const rechazadas = (ext.rejected || []).map((r) => MOTIVOS[r.reason] ? h('p', { class: 'aviso peligro' }, MOTIVOS[r.reason](r)) : null);

  const guardar = async (btn) => {
    const measurementsCm = {};
    for (const m of MEASURES) { const n = parseNum(inputs[m.key].value); if (n !== null) measurementsCm[m.key] = n; }
    const record = { date: fecha.value, source: ext.source };
    let hayBascula = false;
    for (const f of camposBascula) { const n = parseNum(scaleInputs[f.key].value); if (n !== null) { record[f.key] = n; hayBascula = true; } }
    if (!Object.keys(measurementsCm).length && !hayBascula) { estado.className = 'estado error'; estado.textContent = 'Anota al menos una medida o un dato de la báscula.'; return; }
    if (Object.keys(measurementsCm).length) record.measurementsCm = measurementsCm;
    btn.disabled = true; estado.className = 'estado'; estado.textContent = 'Guardando…';
    try { await call('commit', { entity: 'body', record }, { timeoutMs: 60000 }); borrar('cuerpo'); if (vigente(el)) cargar(el); }
    catch (err) { console.error(err); btn.disabled = false; estado.className = 'estado error'; estado.textContent = err.message; }
  };

  el.replaceChildren(h('section', {},
    h('p', { class: 'etiqueta' }, 'Cuerpo'), h('h2', {}, 'Revisa las medidas'),
    ext.source === 'scale' ? null : null,
    ext.transcript ? h('p', { class: 'nota' }, 'Oí: «' + ext.transcript + '»') : null,
    ...rechazadas,
    h('form', { class: 'card', novalidate: true, onSubmit: (e) => e.preventDefault() },
      h('label', {}, 'Fecha', fecha), ...filasBascula, ...(ext.source === 'scale' ? [] : filas),
      h('p', { class: 'nota' }, ext.source === 'scale' ? 'Corrige lo que la IA haya leído mal. Deja en blanco lo que no quieras guardar.' : 'Deja en blanco lo que no hayas medido. Las medidas son en centímetros.')),
    estado,
    h('div', { class: 'acciones fin' },
      h('button', { type: 'button', class: 'btn', onClick: (e) => guardar(e.currentTarget) }, 'Guardar medidas'),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => inicio(el, records) }, 'Cancelar'))));
}

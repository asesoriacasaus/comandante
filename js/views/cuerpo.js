// Pantalla Cuerpo: última medición, medir por voz o a mano, y acceso a la guía.
import { call } from '../api.js';
import { h } from '../lib/dom.js';
import { formatCm, formatDateEs, todayIsoLocal, parseNum, formatDelta } from '../lib/format.js';
import { MEASURES, measureLabel, summarize, latestWeight } from '../lib/measures.js';
import { blobToBase64 } from '../lib/media.js';
import { createRecorder } from '../recorder.js';

const vigente = (el) => el.dataset.route === 'cuerpo';
const num = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const PARTE_ES = { neck: 'cuello', shoulders: 'hombros', chest: 'pecho', waist: 'cintura', hip: 'cadera', arm: 'bíceps', forearm: 'antebrazo', thigh: 'muslo', calf: 'gemelo', weightKg: 'peso' };
const nombre = (k) => (PARTE_ES[k] || measureLabel(k)).toLowerCase();
const MOTIVOS = {
  missing_side: (r) => 'Dijiste «' + nombre(r.part) + ' ' + num(r.valueCm) + '» sin lado: indica derecho o izquierdo.',
  out_of_range: (r) => num(r.valueCm) + ' no es posible para ' + nombre(r.part) + ': ¿centímetros o milímetros?'
};

let recorder = null;

export function render(el) {
  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Cuerpo'), h('h2', {}, 'Cuerpo'), h('p', { class: 'vacio' }, 'Cargando…')));
  cargar(el);
}

async function cargar(el) {
  try {
    const hoy = todayIsoLocal();
    const from = (Number(hoy.slice(0, 4)) - 1) + hoy.slice(4);
    const r = await call('query', { entity: 'body', from, to: hoy }, { timeoutMs: 60000 });
    if (vigente(el)) inicio(el, r.items || []);
  } catch (err) {
    console.error(err);
    if (!vigente(el)) return;
    el.replaceChildren(h('section', {}, h('h2', {}, 'Cuerpo'), h('p', { class: 'estado error' }, err.message),
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => render(el) }, 'Reintentar'),
        h('a', { class: 'btn btn-sec', href: '#guia' }, 'Guía para medirte'))));
  }
}

function inicio(el, records) {
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
      h('a', { class: 'btn btn-sec', href: '#guia' }, 'Guía para medirte')),
    peso ? h('p', { class: 'nota' }, 'Peso: ' + num(peso.value) + ' kg · ' + formatDateEs(peso.date)) : null,
    filas.length ? h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Última medida de cada parte'), h('ul', { class: 'lista' }, filas))
      : h('p', { class: 'vacio' }, 'Aún no hay medidas. Mídete con la cinta y dicta los números; la guía te enseña dónde colocarla.')));
}

function pantallaVoz(el, records) {
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
  const peso = h('input', { inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Peso en kilos', value: ext.weightKg ? num(ext.weightKg) : '' });
  const fecha = h('input', { type: 'date', value: todayIsoLocal(), 'aria-label': 'Fecha' });
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const rechazadas = (ext.rejected || []).map((r) => MOTIVOS[r.reason] ? h('p', { class: 'aviso peligro' }, MOTIVOS[r.reason](r)) : null);

  const guardar = async (btn) => {
    const measurementsCm = {};
    for (const m of MEASURES) { const n = parseNum(inputs[m.key].value); if (n !== null) measurementsCm[m.key] = n; }
    const w = parseNum(peso.value);
    if (!Object.keys(measurementsCm).length && w === null) { estado.className = 'estado error'; estado.textContent = 'Anota al menos una medida o el peso.'; return; }
    const record = { date: fecha.value, source: ext.source };
    if (Object.keys(measurementsCm).length) record.measurementsCm = measurementsCm;
    if (w !== null) record.weightKg = w;
    btn.disabled = true; estado.className = 'estado'; estado.textContent = 'Guardando…';
    try { await call('commit', { entity: 'body', record }, { timeoutMs: 60000 }); if (vigente(el)) cargar(el); }
    catch (err) { console.error(err); btn.disabled = false; estado.className = 'estado error'; estado.textContent = err.message; }
  };

  el.replaceChildren(h('section', {},
    h('p', { class: 'etiqueta' }, 'Cuerpo'), h('h2', {}, 'Revisa las medidas'),
    ext.transcript ? h('p', { class: 'nota' }, 'Oí: «' + ext.transcript + '»') : null,
    ...rechazadas,
    h('form', { class: 'card', novalidate: true, onSubmit: (e) => e.preventDefault() },
      h('label', {}, 'Fecha', fecha), h('label', {}, 'Peso (kg), opcional', peso), ...filas,
      h('p', { class: 'nota' }, 'Deja en blanco lo que no hayas medido. Las medidas son en centímetros.')),
    estado,
    h('div', { class: 'acciones fin' },
      h('button', { type: 'button', class: 'btn', onClick: (e) => guardar(e.currentTarget) }, 'Guardar medidas'),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => inicio(el, records) }, 'Cancelar'))));
}

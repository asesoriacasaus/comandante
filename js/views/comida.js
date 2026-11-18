// Pantalla Comida: totales del día frente a objetivos, dictar o escribir comidas, revisarlas y micronutrientes aproximados.
import { call } from '../api.js';
import { h, cargando } from '../lib/dom.js';
import { formatDateEs, todayIsoLocal, parseNum } from '../lib/format.js';
import { blobToBase64 } from '../lib/media.js';
import { createRecorder } from '../recorder.js';
import { swr, borrar } from '../lib/cache.js';
import { MEAL_TYPES_ES, UNITS, scaleItem, pct, warningText, sumItems, fmtInt, fmtDec, estadoMicros, agruparMicros, FUENTES, escalaMicro, anillo } from '../lib/nutrition.js';

const vigente = (el) => el.dataset.route === 'comida';
let recorder = null;
let fecha = null;
let pantalla = 'inicio';   // si el usuario está capturando una comida, un dato nuevo no la pisa

function sumarDias(iso, n) {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n));
  return d.toISOString().slice(0, 10);
}

export function render(el) {
  pantalla = 'inicio';
  fecha = fecha || todayIsoLocal();
  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Comida'), h('h2', {}, 'Comida'), cargando()));
  cargar(el);
}

async function cargar(el) {
  const dia = fecha;
  try {
    await swr('comida:' + dia, () => call('nutrition.state', { date: dia }, { timeoutMs: 60000 }),
      (st) => { if (vigente(el) && pantalla === 'inicio' && fecha === dia) inicio(el, st); });
  } catch (err) {
    console.error(err);
    if (!vigente(el)) return;
    el.replaceChildren(h('section', {}, h('h2', {}, 'Comida'), h('p', { class: 'estado error' }, err.message),
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => render(el) }, 'Reintentar'))));
  }
}

function barra(etiqueta, valor, objetivo, unidad) {
  const p = pct(valor, objetivo);
  return h('div', { class: 'progreso' },
    h('p', {}, h('span', { class: 'macro-nombre' }, etiqueta), h('span', { class: 'macro-cifra' }, fmtInt(valor || 0) + '/' + fmtInt(objetivo), h('small', {}, ' ' + unidad))),
    h('progress', { max: 100, value: Math.min(100, p), 'aria-label': etiqueta + ': ' + p + ' %' }));
}

// Anillos de calorías (fuera) y proteína (dentro), con las cifras grandes al lado.
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; }
function anillos(tot, t) {
  const svg = svgEl('svg', { viewBox: '0 0 120 120', width: 124, height: 124, 'aria-hidden': 'true', class: 'anillos' });
  [[50, tot.kcal, t.kcal, 'kcal'], [34, tot.proteinG, t.proteinG, 'prot']].forEach(([r, v, obj, clase]) => {
    const a = anillo(v || 0, obj, r);
    svg.append(svgEl('circle', { cx: 60, cy: 60, r, class: 'anillo-fondo ' + clase }));
    if (a.lleno > 0) svg.append(svgEl('circle', { cx: 60, cy: 60, r, class: 'anillo ' + clase, 'stroke-dasharray': a.lleno + ' ' + a.circunferencia, transform: 'rotate(-90 60 60)' }));
  });
  const linea = (nombre, v, obj, unidad, clase) => h('div', { class: 'anillo-dato ' + clase },
    h('span', { class: 'anillo-nombre' }, nombre),
    h('span', { class: 'anillo-cifra' }, fmtInt(v || 0) + '/' + fmtInt(obj), h('small', {}, unidad)),
    h('span', { class: 'anillo-resta' }, (obj - (v || 0)) > 0 ? 'Faltan ' + fmtInt(obj - (v || 0)) + ' ' + unidad.toLowerCase() : 'Objetivo cumplido'));
  return h('div', { class: 'anillos-caja', role: 'img', 'aria-label': 'Calorías ' + fmtInt(tot.kcal || 0) + ' de ' + fmtInt(t.kcal) + '; proteína ' + fmtInt(tot.proteinG || 0) + ' de ' + fmtInt(t.proteinG) + ' gramos' },
    svg, h('div', { class: 'anillos-datos' }, linea('Calorías', tot.kcal, t.kcal, 'KCAL', 'kcal'), linea('Proteína', tot.proteinG, t.proteinG, 'G', 'prot')));
}

function inicio(el, st) {
  pantalla = 'inicio';
  const esHoy = st.date === st.today;
  const t = st.targets;
  const nav = h('div', { class: 'dia-nav' },
    h('button', { type: 'button', class: 'btn btn-sec', 'aria-label': 'Día anterior', onClick: () => { fecha = sumarDias(st.date, -1); render(el); } }, '‹'),
    h('span', { class: 'dia-titulo' }, esHoy ? 'Hoy' : formatDateEs(st.date)),
    h('button', { type: 'button', class: 'btn btn-sec', 'aria-label': 'Día siguiente', disabled: esHoy, onClick: () => { fecha = sumarDias(st.date, 1); render(el); } }, '›'));

  const objetivos = t
    ? h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Objetivo del día'),
        anillos(st.totals, t),
        h('div', { class: 'rejilla' }, barra('Hidratos', st.totals.carbsG, t.carbsG, 'g'), barra('Grasa', st.totals.fatG, t.fatG, 'g')),
        h('p', { class: 'nota' }, 'Calculado con tu peso actual: mantenimiento estimado menos un 10 % y 2 g de proteína por kg. Se revisa cada semana.'))
    : h('p', { class: 'aviso' }, 'Para calcular tus objetivos faltan tus datos: completa la bienvenida desde Hoy.');

  const comidas = st.meals.length
    ? h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Comidas'), ...st.meals.map((m) => comidaNodo(el, st, m)))
    : h('p', { class: 'vacio' }, 'Aún no has apuntado nada ' + (esHoy ? 'hoy' : 'ese día') + '.');

  const micros = bloqueMicros(el, st);

  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Comida'), h('h2', {}, 'Comida'), nav,
    h('div', { class: 'acciones' },
      h('button', { type: 'button', class: 'btn', onClick: () => pantallaVoz(el, st) }, 'Dictar comida'),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => pantallaTexto(el, st) }, 'Escribir comida')),
    objetivos, micros, comidas,
    h('div', { class: 'acciones fin' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => abrirRecetas(el, st) }, 'Recetas y lista de la compra'))));
}

// ---------- Micronutrientes ----------

let vistaMicros = null;   // 'semana' | 'hoy': se recuerda mientras la app está abierta

/** Una fila con barra: la marca vertical es la referencia (100 %); la barra llega hasta el 150 %. */
function filaMicro(m) {
  const e = escalaMicro(m);
  const valor = (m.value >= 100 ? fmtInt(m.value) : fmtDec(m.value)) + ' ' + m.unit;
  return h('li', { class: 'micro ' + m.estado },
    h('div', { class: 'micro-cab' }, h('span', { class: 'micro-nombre' }, m.label),
      h('span', { class: 'micro-pct' }, m.pct + ' %'), h('span', { class: 'micro-valor' }, '≈ ' + valor)),
    h('div', { class: 'escala', role: 'img', 'aria-label': m.label + ': ' + m.pct + ' % de la referencia' },
      h('div', { class: 'escala-tramos' }, ...e.zonas.map((z) => h('span', { class: 'tramo ' + z.clase, 'data-ancho': String(z.ancho) }))),
      h('span', { class: 'escala-marca', 'data-pos': String(e.marca) })),
    h('div', { class: 'escala-extremos', 'aria-hidden': 'true' }, h('span', {}, e.extremos[0]), h('span', {}, e.extremos[1])),
    m.estado === 'bajo' && FUENTES[m.key] ? h('p', { class: 'micro-fuentes' }, 'Lo tienes en: ' + FUENTES[m.key]) : null,
    m.estado === 'alto' ? h('p', { class: 'micro-fuentes' }, 'Conviene no pasar de ' + fmtInt(m.ref) + ' ' + m.unit + ' al día') : null);
}

function bloqueMicros(el, st) {
  const hayHoy = Object.keys(st.totals || {}).length > 0;
  const haySemana = st.week && st.week.days > 0;
  if (!hayHoy && !haySemana) return null;
  const modo = vistaMicros || (haySemana ? 'semana' : 'hoy');
  const valores = modo === 'semana' ? st.week.avg : st.totals;
  const g = agruparMicros(estadoMicros(st.micros, valores));
  const pestaña = (m, texto) => h('button', { type: 'button', class: 'segmento' + (modo === m ? ' activo' : ''), 'aria-pressed': String(modo === m),
    onClick: () => { vistaMicros = m; inicio(el, st); } }, texto);
  const contador = (n, texto, clase) => h('div', { class: 'dato ' + clase }, h('span', { class: 'valor' }, String(n)), h('span', { class: 'dato-que' }, texto));

  const caja = h('div', { class: 'bloque micros' },
    h('p', { class: 'etiqueta' }, 'Vitaminas y minerales'),
    h('div', { class: 'segmentos', role: 'group', 'aria-label': 'Periodo' }, pestaña('semana', 'Media 7 días'), pestaña('hoy', 'Hoy')),
    h('div', { class: 'resumen' }, contador(g.bajos.length, 'a reforzar', 'bajo'), contador(g.altos.length, 'a vigilar', 'alto'), contador(g.ok.length, 'bien', 'ok')),
    g.bajos.length ? h('div', {}, h('h3', { class: 'micro-grupo' }, 'A reforzar'), h('ul', { class: 'micro-lista' }, g.bajos.map(filaMicro))) : null,
    g.altos.length ? h('div', {}, h('h3', { class: 'micro-grupo' }, 'A vigilar'), h('ul', { class: 'micro-lista' }, g.altos.map(filaMicro))) : null,
    g.ok.length ? h('details', {}, h('summary', {}, 'Bien cubiertos (' + g.ok.length + ')'), h('ul', { class: 'micro-lista' }, g.ok.map(filaMicro))) : null,
    g.bajos.length ? h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn', onClick: () => abrirRecetas(el, st) }, 'Recetas para cubrirlo')) : null,
    h('p', { class: 'nota' }, (modo === 'semana' ? 'Media de los ' + st.week.days + ' días con comidas de la última semana' + (st.week.days < 3 ? ' (con tan pocos días es orientativa)' : '') + '. '
      : 'Solo lo apuntado hoy. ') + 'Son estimaciones de la IA a partir de lo que dictas: sirven para ver tendencias. Referencia: valores de la UE para un adulto.' +
      (g.sinDato.length ? ' Sin dato: ' + g.sinDato.map((m) => m.label.toLowerCase()).join(', ') + '.' : '')));
  // El ancho de las barras se pone por JavaScript: la política de seguridad no permite estilos en línea en el HTML.
  caja.querySelectorAll('.tramo').forEach((n) => { n.style.width = n.dataset.ancho + '%'; });
  caja.querySelectorAll('.escala-marca').forEach((n) => { n.style.left = n.dataset.pos + '%'; });
  return caja;
}

function abrirRecetas(el, st) {
  pantalla = 'otra';
  import('./recetas.js').then((m) => m.pantallaRecetas(el, { volver: () => inicio(el, st) }))
    .catch((err) => { console.error(err); pantalla = 'inicio'; });
}

function comidaNodo(el, st, m) {
  const total = sumItems(m.items);
  return h('div', { class: 'comida' },
    h('div', { class: 'comida-cab' }, h('h3', {}, (m.time ? m.time + ' · ' : '') + (MEAL_TYPES_ES[m.mealType] || 'Comida')),
      h('button', { type: 'button', class: 'btn btn-sec', 'aria-label': 'Borrar esta comida', onClick: async (e) => {
        if (!confirm('¿Borrar esta comida?')) return;
        e.currentTarget.disabled = true;
        try { await call('meal.delete', { id: m.id, date: m.date }, { timeoutMs: 60000 }); borrar('comida:' + m.date); render(el); }
        catch (err) { console.error(err); e.currentTarget.disabled = false; e.currentTarget.after(h('p', { class: 'estado error' }, err.message)); }
      } }, 'Borrar')),
    h('ul', { class: 'lista' }, m.items.map((it) => h('li', { class: 'fila medida' }, h('span', {}, it.name + ' · ' + fmtDec(it.quantity) + ' ' + it.unit), h('span', { class: 'valor-medida' }, fmtInt(it.kcal) + ' kcal')))),
    h('p', { class: 'detalle' }, fmtInt(total.kcal) + ' kcal · P ' + fmtInt(total.proteinG) + ' g · H ' + fmtInt(total.carbsG) + ' g · G ' + fmtInt(total.fatG) + ' g'));
}

// ---------- Capturar ----------

function pantallaTexto(el, st) {
  pantalla = 'otra';
  const area = h('textarea', { rows: 4, maxlength: 2000, 'aria-label': 'Qué has comido', placeholder: 'Ej.: dos huevos revueltos con una tostada de pan integral y un café con leche' });
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const enviar = h('button', { type: 'button', class: 'btn' }, 'Calcular');
  enviar.addEventListener('click', async () => {
    if (!area.value.trim()) { estado.className = 'estado error'; estado.textContent = 'Escribe lo que has comido.'; return; }
    enviar.disabled = true; estado.className = 'estado'; estado.textContent = 'Calculando…';
    try {
      const r = await call('meal.process', { kind: 'text', text: area.value }, { timeoutMs: 150000 });
      if (vigente(el)) pantallaRevision(el, st, r, 'text');
    } catch (err) { console.error(err); enviar.disabled = false; estado.className = 'estado error'; estado.textContent = err.message; }
  });
  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Comida'), h('h2', {}, 'Escribir comida'),
    h('label', {}, 'Qué has comido', area), h('div', { class: 'acciones' }, enviar,
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => inicio(el, st) }, 'Cancelar')), estado));
}

function pantallaVoz(el, st) {
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
      estado.className = 'estado'; estado.textContent = 'Calculando lo que has comido…';
      try {
        const data = await blobToBase64(clip.blob);
        const r = await call('meal.process', { kind: 'audio', mime: clip.mime, data }, { timeoutMs: 150000 });
        if (vigente(el)) pantallaRevision(el, st, r, 'voice');
      } catch (err) {
        console.error(err);
        estado.className = 'estado error'; estado.textContent = err.message + ' La grabación sigue aquí: puedes reintentar.';
        boton.disabled = false; boton.textContent = 'Reintentar'; boton.onclick = (e) => { e.stopImmediatePropagation(); boton.disabled = true; enviar(); };
      }
    };
    enviar();
  });
  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Comida'), h('h2', {}, 'Dictar comida'),
    h('p', { class: 'nota' }, 'Cuenta lo que has comido y cuánto, aunque sea aproximado.'),
    h('blockquote', { class: 'mensaje' }, 'Un plato de arroz con pollo, unos doscientos gramos de arroz cocido, una manzana y un yogur natural.'),
    boton, estado,
    h('div', { class: 'acciones fin' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => { recorder && recorder.releaseMic(); inicio(el, st); } }, 'Cancelar'))));
}

// ---------- Revisar y guardar ----------

function pantallaRevision(el, st, r, source) {
  pantalla = 'otra';
  let items = r.items.map((i) => Object.assign({}, i));
  const filas = h('div', {});
  const totalNodo = h('p', { class: 'detalle' });
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const tipo = h('select', { 'aria-label': 'Tipo de comida' }, h('option', { value: '' }, 'Sin especificar'),
    ...Object.entries(MEAL_TYPES_ES).map(([v, l]) => h('option', Object.assign({ value: v }, r.mealType === v ? { selected: true } : {}), l)));
  const hora = h('input', { type: 'time', value: r.time || '', 'aria-label': 'Hora' });

  const pintarTotal = () => {
    const t = sumItems(items);
    totalNodo.textContent = 'Total: ' + fmtInt(t.kcal) + ' kcal · P ' + fmtInt(t.proteinG) + ' g · H ' + fmtInt(t.carbsG) + ' g · G ' + fmtInt(t.fatG) + ' g';
  };

  const pintarFilas = () => {
    filas.replaceChildren(...items.map((it, i) => {
      const campo = (k, etiqueta, entero) => {
        const inp = h('input', { inputmode: 'decimal', autocomplete: 'off', 'aria-label': etiqueta + ' de ' + it.name, value: it[k] === undefined ? '' : (entero ? fmtInt(it[k]) : fmtDec(it[k])) });
        inp.addEventListener('change', () => { const n = parseNum(inp.value); if (n !== null && n >= 0) { it[k] = n; if (k === 'kcal') it.kcal = Math.round(n); } pintarTotal(); });
        return h('label', {}, etiqueta, inp);
      };
      const qty = h('input', { inputmode: 'decimal', autocomplete: 'off', 'aria-label': 'Cantidad de ' + it.name, value: fmtDec(it.quantity) });
      qty.addEventListener('change', () => {
        const n = parseNum(qty.value);
        if (n !== null && n > 0) { items[i] = scaleItem(it, n); pintarFilas(); pintarTotal(); }
      });
      const unidad = h('select', { 'aria-label': 'Unidad' }, ...UNITS.map((u) => h('option', Object.assign({ value: u }, it.unit === u ? { selected: true } : {}), u)));
      unidad.addEventListener('change', () => { it.unit = unidad.value; });
      const avisos = r.warnings.filter((w) => w.name === it.name && warningText(w.flag)).map((w) => h('p', { class: 'nota' }, 'Aviso: ' + warningText(w.flag) + '.'));
      return h('div', { class: 'item-comida' },
        h('div', { class: 'comida-cab' }, h('h3', {}, it.name),
          h('button', { type: 'button', class: 'btn btn-sec', 'aria-label': 'Quitar ' + it.name, onClick: () => { items = items.filter((_, j) => j !== i); pintarFilas(); pintarTotal(); } }, 'Quitar')),
        h('div', { class: 'rejilla' }, h('label', {}, 'Cantidad', qty), h('label', {}, 'Unidad', unidad),
          campo('kcal', 'kcal', true), campo('proteinG', 'Proteína (g)'), campo('carbsG', 'Hidratos (g)'), campo('fatG', 'Grasa (g)')),
        ...avisos);
    }));
  };
  pintarFilas(); pintarTotal();

  const guardar = async (btn) => {
    if (!items.length) { estado.className = 'estado error'; estado.textContent = 'No queda ningún alimento.'; return; }
    const record = { date: st.date, mealType: tipo.value || null, time: hora.value || null, source, items: items.map(limpiar) };
    btn.disabled = true; estado.className = 'estado'; estado.textContent = 'Guardando…';
    try { await call('commit', { entity: 'meal', record }, { timeoutMs: 60000 }); borrar('comida:' + st.date); if (vigente(el)) render(el); }
    catch (err) { console.error(err); btn.disabled = false; estado.className = 'estado error'; estado.textContent = err.message; }
  };

  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Comida'), h('h2', {}, 'Revisa la comida'),
    r.transcript ? h('p', { class: 'nota' }, 'Oí: «' + r.transcript + '»') : null,
    h('p', { class: 'nota' }, 'Los valores son una estimación de la IA. Corrige lo que no cuadre: al cambiar la cantidad, los nutrientes se reajustan solos.'),
    h('div', { class: 'rejilla' }, h('label', {}, 'Tipo', tipo), h('label', {}, 'Hora', hora)),
    filas, totalNodo, estado,
    h('div', { class: 'acciones fin' }, h('button', { type: 'button', class: 'btn', onClick: (e) => guardar(e.currentTarget) }, 'Guardar comida'),
      h('button', { type: 'button', class: 'btn btn-sec', onClick: () => inicio(el, st) }, 'Descartar'))));
}

/** Elimina campos que no pertenecen al modelo (por ejemplo, avisos) antes de guardar. */
function limpiar(it) {
  const out = {};
  for (const [k, v] of Object.entries(it)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

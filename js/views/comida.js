// Pantalla Comida: totales del día frente a objetivos, dictar o escribir comidas, revisarlas y micronutrientes aproximados.
import { call } from '../api.js';
import { h, cargando } from '../lib/dom.js';
import { formatDateEs, todayIsoLocal, parseNum, horaLocal, horaComida } from '../lib/format.js';
import { blobToBase64, shrinkImage } from '../lib/media.js';
import { createRecorder } from '../recorder.js';
import { swr, borrar, leer } from '../lib/cache.js';
import { estimarLocal, contarAhorroLocal } from '../lib/alimentos.js';
import { ponerBarra, avisar } from '../lib/barra.js';
import { MEAL_TYPES_ES, UNITS, scaleItem, pct, warningText, sumItems, fmtInt, fmtDec, estadoMicros, agruparMicros, FUENTES, escalaMicro, anillo, diasSemana, huecosRecientes, TIPOS_ELEGIBLES, fraccionReparto, textoReparto, repartir, desgloseMicro, avisoSol, NOTAS_MICRO } from '../lib/nutrition.js';

const vigente = (el) => el.dataset.route === 'comida';
let recorder = null;
let fecha = null;
let pantalla = 'inicio';   // si el usuario está capturando una comida, un dato nuevo no la pisa

function sumarDias(iso, n) {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n));
  return d.toISOString().slice(0, 10);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
/** "jueves 19": corto, para botones. */
function diaCorto(iso) { const [y, m, d] = iso.split('-').map(Number); return DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] + ' ' + d; }

let ultimaVista = 0;
export function render(el) {
  ponerBarra(null);
  pantalla = 'inicio';
  // El día elegido se recuerda mientras usas Comida; si vuelves al rato, se abre en hoy.
  if (!fecha || Date.now() - ultimaVista > 10 * 60 * 1000) fecha = todayIsoLocal();
  ultimaVista = Date.now();
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
  ponerBarra(null);
  pantalla = 'inicio';
  const esHoy = st.date === st.today;
  const t = st.targets;
  const nombreDia = esHoy ? 'hoy' : formatDateEs(st.date);

  // Semana de lunes a domingo: un punto en los días con comidas. Tocar un día lo abre (también los pasados, para rellenar huecos).
  const w = st.week7 || { start: st.date, logged: [] };
  const irA = (d) => { fecha = d; render(el); };
  const finSemana = sumarDias(w.start, 6);
  const semana = h('div', { class: 'semana', role: 'group', 'aria-label': 'Días de la semana' },
    h('div', { class: 'semana-cab' },
      h('button', { type: 'button', class: 'semana-flecha', 'aria-label': 'Semana anterior', onClick: () => irA(sumarDias(st.date, -7)) }, '‹'),
      h('span', { class: 'semana-titulo' }, finSemana >= st.today && w.start <= st.today ? 'Esta semana' : 'Semana del ' + diaCorto(w.start).replace(/^\S+ /, '') + ' de ' + MESES[Number(w.start.slice(5, 7)) - 1]),
      h('button', { type: 'button', class: 'semana-flecha', 'aria-label': 'Semana siguiente', disabled: sumarDias(w.start, 7) > st.today,
        onClick: () => irA(sumarDias(st.date, 7) > st.today ? st.today : sumarDias(st.date, 7)) }, '›')),
    h('div', { class: 'semana-dias' }, ...diasSemana(w.start, st.today, w.logged).map((d) => h('button', {
      type: 'button', class: 'dia' + (d.date === st.date ? ' activo' : '') + (d.apuntado ? ' apuntado' : ''), disabled: d.futuro,
      'aria-label': formatDateEs(d.date) + (d.apuntado ? ', con comidas' : ', sin comidas'), 'aria-pressed': String(d.date === st.date),
      onClick: () => irA(d.date) }, h('span', { class: 'dia-letra' }, d.letra), h('span', { class: 'dia-num' }, String(d.num)), h('i', { class: 'dia-punto' })))));
  const huecos = esHoy ? huecosRecientes(w.start, st.today, w.logged) : [];
  const aviso = huecos.length ? h('button', { type: 'button', class: 'aviso aviso-boton', onClick: () => irA(huecos[0]) },
    'No apuntaste nada ' + huecos.map((d) => 'el ' + diaCorto(d)).join(', ').replace(/, ([^,]*)$/, ' ni $1') + '. Toca aquí para añadirlo ahora: nunca es tarde.') : null;

  const objetivos = t
    ? h('div', {}, anillos(st.totals, t),
        h('div', { class: 'bloque' },
          h('div', { class: 'rejilla' }, barra('Hidratos', st.totals.carbsG, t.carbsG, 'g'), barra('Grasa', st.totals.fatG, t.fatG, 'g')),
          h('p', { class: 'nota' }, 'Calculado con tu peso actual: mantenimiento estimado menos un 10 % y 2 g de proteína por kg. Se revisa cada semana.')))
    : h('p', { class: 'aviso' }, 'Para calcular tus objetivos faltan tus datos: completa la bienvenida desde Hoy.');

  const reales = st.meals.filter((m) => m.mealType !== 'supplement');
  const comidas = reales.length
    ? h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Comidas'), ...reales.map((m) => comidaNodo(el, st, m)))
    : h('p', { class: 'vacio' }, 'Aún no has apuntado nada ' + nombreDia + '.');

  const micros = bloqueMicros(el, st);

  el.replaceChildren(h('section', {}, h('h2', {}, 'Comida'), semana, aviso,
    h('button', { type: 'button', class: 'btn btn-ancho', onClick: () => pantallaAnadir(el, st) },
      esHoy ? 'Añadir comida' : 'Añadir comida del ' + diaCorto(st.date)),
    h('p', { class: 'pista' }, 'Con una foto, la voz o un texto, o todo a la vez.'),
    objetivos, bloqueSuplementos(el, st), comidas, micros,
    h('div', { class: 'acciones fin' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => abrirRecetas(el, st) }, 'Recetas y lista de la compra'))));
}

// ---------- Suplementos ----------

function bloqueSuplementos(el, st) {
  const lista = st.supplements || [];
  const tomados = new Set(st.supplementsTaken || []);
  const gestionar = h('button', { type: 'button', class: 'enlace', onClick: () => abrirSuplementos(el, st) }, lista.length ? 'Gestionar' : 'Añadir');
  if (!lista.length) {
    return h('div', { class: 'bloque' }, h('div', { class: 'bloque-cab' }, h('p', { class: 'etiqueta' }, 'Suplementos'), gestionar),
      h('p', { class: 'nota' }, '¿Tomas creatina, vitamina D, hierro u omega 3? Añádelos una vez y márcalos cada día: lo que aportan cuenta en tus vitaminas y minerales.'));
  }
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  return h('div', { class: 'bloque' }, h('div', { class: 'bloque-cab' }, h('p', { class: 'etiqueta' }, 'Suplementos'), gestionar),
    h('div', { class: 'suplementos' }, ...lista.map((s) => {
      const btn = h('button', { type: 'button', class: 'sup' + (tomados.has(s.id) ? ' tomado' : ''), 'aria-pressed': String(tomados.has(s.id)) },
        h('span', { class: 'sup-check', 'aria-hidden': 'true' }), h('span', { class: 'sup-texto' }, h('b', {}, s.name), h('small', {}, fmtDec(s.dose) + ' ' + s.unit)));
      btn.addEventListener('click', async () => {
        const tomar = !btn.classList.contains('tomado');
        btn.classList.toggle('tomado', tomar); btn.setAttribute('aria-pressed', String(tomar)); btn.disabled = true;   // al instante; el servidor confirma
        try {
          await call('supplement.take', { date: st.date, id: s.id, taken: tomar }, { timeoutMs: 60000 });
          borrar('comida:' + st.date); if (vigente(el) && pantalla === 'inicio') render(el);
        } catch (err) {
          console.error(err); btn.classList.toggle('tomado', !tomar); btn.setAttribute('aria-pressed', String(!tomar)); btn.disabled = false;
          estado.className = 'estado error'; estado.textContent = err.message;
        }
      });
      return btn;
    })), estado);
}

function abrirSuplementos(el, st) {
  ponerBarra(null);
  pantalla = 'otra';
  import('./suplementos.js').then((m) => m.pantallaSuplementos(el, { lista: st.supplements || [], micros: st.micros || [], volver: () => { borrar('comida:' + st.date); render(el); } }))
    .catch((err) => { console.error(err); pantalla = 'inicio'; });
}

// ---------- Micronutrientes ----------

let vistaMicros = null;   // 'semana' | 'hoy': se recuerda mientras la app está abierta

/** Una fila con barra: la marca vertical es la referencia (100 %); la barra llega hasta el 150 %. */
const fmtVal = (v, u) => (v >= 100 ? fmtInt(v) : fmtDec(v)) + ' ' + u;

/** `ctx` = { extras, habits, abrirHabitos }: lo que no viene de las comidas (sol, agua, niacina fabricada) y los avisos propios de cada nutriente. */
function filaMicro(m, ctx = {}) {
  const e = escalaMicro(m);
  const valor = fmtVal(m.value, m.unit);
  const partes = desgloseMicro(m.key, m.value, ctx.extras);
  const sol = m.key === 'vitDUg' ? avisoSol(ctx.habits, ctx.extras) : null;
  return h('li', { class: 'micro ' + m.estado },
    h('div', { class: 'micro-cab' }, h('span', { class: 'micro-nombre' }, m.label),
      h('span', { class: 'micro-pct' }, m.pct + ' %'), h('span', { class: 'micro-valor' }, '≈ ' + valor)),
    h('div', { class: 'escala', role: 'img', 'aria-label': m.label + ': ' + m.pct + ' % de la referencia' },
      h('div', { class: 'escala-tramos' }, ...e.zonas.map((z) => h('span', { class: 'tramo ' + z.clase, 'data-ancho': String(z.ancho) }))),
      h('span', { class: 'escala-marca', 'data-pos': String(e.marca) })),
    h('div', { class: 'escala-extremos', 'aria-hidden': 'true' }, h('span', {}, e.extremos[0]), h('span', {}, e.extremos[1])),
    m.estado === 'bajo' && FUENTES[m.key] ? h('p', { class: 'micro-fuentes' }, 'Lo tienes en: ' + FUENTES[m.key]) : null,
    m.estado === 'alto' ? h('p', { class: 'micro-fuentes' }, 'Conviene no pasar de ' + fmtInt(m.ref) + ' ' + m.unit + ' al día') : null,
    partes ? h('p', { class: 'micro-desglose' }, partes.map((p) => p.origen + ' ' + fmtVal(p.valor, m.unit)).join(' + ')) : null,
    sol ? h('p', { class: 'micro-fuentes' }, sol.texto, ' ', ctx.abrirHabitos ? h('button', { type: 'button', class: 'enlace enlace-linea', onClick: ctx.abrirHabitos }, sol.tipo === 'sin-perfil' ? 'Contar mi sol' : 'Ajustar mi sol') : null) : null,
    NOTAS_MICRO[m.key] ? h('p', { class: 'micro-fuentes micro-nota' }, NOTAS_MICRO[m.key]) : null);
}

function bloqueMicros(el, st) {
  const hayHoy = Object.keys(st.totals || {}).length > 0;
  const haySemana = st.week && st.week.days > 0;
  if (!hayHoy && !haySemana) return null;
  const modo = vistaMicros || (haySemana ? 'semana' : 'hoy');
  const valores = modo === 'semana' ? st.week.avg : st.totals;
  const g = agruparMicros(estadoMicros(st.micros, valores));
  // Lo que no viene de las comidas (sol, agua, niacina fabricada). Las cachés antiguas no lo traen: se toleran.
  const ctxMicro = { extras: (modo === 'semana' ? (st.week && st.week.extras) : st.extras) || {}, habits: st.habits || null, abrirHabitos: () => abrirHabitos(el, st) };
  const fila = (m) => filaMicro(m, ctxMicro);
  const pestaña = (m, texto) => h('button', { type: 'button', class: 'segmento' + (modo === m ? ' activo' : ''), 'aria-pressed': String(modo === m),
    onClick: () => { vistaMicros = m; inicio(el, st); } }, texto);
  const contador = (n, texto, clase) => h('div', { class: 'dato ' + clase }, h('span', { class: 'valor' }, String(n)), h('span', { class: 'dato-que' }, texto));

  const caja = h('div', { class: 'bloque micros' },
    h('p', { class: 'etiqueta' }, 'Vitaminas y minerales'),
    h('div', { class: 'segmentos', role: 'group', 'aria-label': 'Periodo' }, pestaña('semana', 'Media 7 días'), pestaña('hoy', 'Hoy')),
    h('div', { class: 'resumen' }, contador(g.bajos.length, 'a reforzar', 'bajo'), contador(g.altos.length, 'a vigilar', 'alto'), contador(g.ok.length, 'bien', 'ok')),
    g.bajos.length ? h('div', {}, h('h3', { class: 'micro-grupo' }, 'A reforzar'), h('ul', { class: 'micro-lista' }, g.bajos.map(fila))) : null,
    g.altos.length ? h('div', {}, h('h3', { class: 'micro-grupo' }, 'A vigilar'), h('ul', { class: 'micro-lista' }, g.altos.map(fila))) : null,
    g.ok.length ? h('details', {}, h('summary', {}, 'Bien cubiertos (' + g.ok.length + ')'), h('ul', { class: 'micro-lista' }, g.ok.map(fila))) : null,
    g.bajos.length ? h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn', onClick: () => abrirRecetas(el, st) }, 'Recetas para cubrirlo')) : null,
    h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => abrirHabitos(el, st) }, 'Sol y agua: lo que no viene de la comida')),
    h('p', { class: 'nota' }, (modo === 'semana' ? 'Media de los ' + st.week.days + ' días con comidas de la última semana' + (st.week.days < 3 ? ' (con tan pocos días es orientativa)' : '') + '. '
      : 'Solo lo apuntado hoy. ') + 'Son estimaciones de la IA a partir de lo que dictas, más el sol, el agua y la niacina que fabrica tu cuerpo si los has contado: sirven para ver tendencias. Referencia: valores de la UE para un adulto.' +
      (g.sinDato.length ? ' Sin dato: ' + g.sinDato.map((m) => m.label.toLowerCase()).join(', ') + '.' : '')));
  // El ancho de las barras se pone por JavaScript: la política de seguridad no permite estilos en línea en el HTML.
  caja.querySelectorAll('.tramo').forEach((n) => { n.style.width = n.dataset.ancho + '%'; });
  caja.querySelectorAll('.escala-marca').forEach((n) => { n.style.left = n.dataset.pos + '%'; });
  return caja;
}

function abrirHabitos(el, st) {
  ponerBarra(null);
  pantalla = 'otra';
  import('./habitos.js').then((m) => m.pantallaHabitos(el, { habits: st.habits || null, hoy: st.today, volver: () => { borrar('comida:' + st.date); render(el); } }))
    .catch((err) => { console.error(err); pantalla = 'inicio'; });
}

function abrirRecetas(el, st) {
  ponerBarra(null);
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

// ---------- Añadir: foto, voz y texto, para cualquier día ----------

const MAX_FOTOS = 3;

/**
 * ¿Cuánto del plato de la foto te has comido? Todo, compartido entre varias personas o un porcentaje.
 * `estado` es { modo, n, pct } y se modifica en el sitio; onChange() avisa de cada cambio.
 */
function controlReparto(estado, onChange) {
  const caja = h('div', { class: 'reparto' });
  const pintar = () => {
    const seg = (modo, texto) => h('button', { type: 'button', class: 'segmento' + (estado.modo === modo ? ' activo' : ''), 'aria-pressed': String(estado.modo === modo),
      onClick: () => { estado.modo = modo; pintar(); onChange(); } }, texto);
    let detalle = null;
    if (estado.modo === 'personas') {
      const cambiar = (d) => { estado.n = Math.min(20, Math.max(2, estado.n + d)); pintar(); onChange(); };
      detalle = h('div', { class: 'contador' },
        h('button', { type: 'button', class: 'contador-btn', 'aria-label': 'Una persona menos', disabled: estado.n <= 2, onClick: () => cambiar(-1) }, '−'),
        h('span', { class: 'contador-valor', 'aria-live': 'polite' }, 'Entre ' + estado.n + ' personas'),
        h('button', { type: 'button', class: 'contador-btn', 'aria-label': 'Una persona más', disabled: estado.n >= 20, onClick: () => cambiar(1) }, '+'));
    } else if (estado.modo === 'porcentaje') {
      const campo = h('input', { inputmode: 'decimal', value: fmtDec(estado.pct), 'aria-label': 'Porcentaje que te has comido' });
      campo.addEventListener('change', () => { const v = parseNum(campo.value); if (v !== null && v > 0 && v <= 100) { estado.pct = v; pintar(); onChange(); } else campo.value = fmtDec(estado.pct); });
      detalle = h('div', { class: 'porcentajes' },
        ...[25, 33, 50, 75].map((v) => h('button', { type: 'button', class: 'chip chip-boton' + (Number(estado.pct) === v ? ' activo' : ''), onClick: () => { estado.pct = v; pintar(); onChange(); } }, v + ' %')),
        h('label', { class: 'porcentaje-libre' }, campo, h('span', {}, '%')));
    }
    caja.replaceChildren(
      h('p', { class: 'etiqueta' }, '¿Cuánto te has comido tú?'),
      h('div', { class: 'segmentos', role: 'group', 'aria-label': 'Reparto del plato' }, seg('todo', 'Todo'), seg('personas', 'Compartido'), seg('porcentaje', 'Una parte')),
      detalle,
      h('p', { class: 'reparto-resumen' }, 'Tu parte: ' + textoReparto(estado).replace(/^Todo el plato$/, 'todo lo de la foto')));
  };
  pintar();
  return caja;
}

function pantallaAnadir(el, st) {
  ponerBarra(null);
  pantalla = 'otra';
  const fotos = [];   // { blob, url }
  let audio = null;   // { blob, mime, ms }
  const reparto = { modo: 'todo', n: 2, pct: 50 };
  const cajaReparto = controlReparto(reparto, () => {});
  // Base de alimentos propia: se trae en silencio y se guarda en el móvil. Sin ella todo va a la IA como siempre.
  let base = (leer('alimentos') || {}).data || null;
  const cajaSiempre = h('div', { class: 'bloque', hidden: true });
  const pintarSiempre = () => {
    const fr = (base && base.frecuentes) || [];
    cajaSiempre.hidden = !fr.length;
    if (!fr.length) return;
    cajaSiempre.replaceChildren(h('p', { class: 'etiqueta' }, 'Lo de siempre'),
      h('div', { class: 'siempre' }, ...fr.map((f) => {
        const kcal = sumItems(f.items).kcal;
        return h('button', { type: 'button', class: 'siempre-btn', onClick: () => {
          contarAhorroLocal(localStorage, 'repetir');
          pantallaRevision(el, st, { items: f.items.map((i) => Object.assign({}, i)), mealType: f.mealType, time: null, warnings: [], transcript: null, local: 'repetida' }, 'repeat', dia.value, [], null, hora());
        } }, h('b', {}, f.items.map((i) => i.name).join(', ')), h('small', {}, (MEAL_TYPES_ES[f.mealType] || 'Comida') + ' · ' + fmtInt(kcal) + ' kcal · ' + f.veces + ' veces'));
      })),
      h('p', { class: 'nota' }, 'Un toque y se apunta igual que la última vez, sin gastar IA. Podrás ajustar las cantidades.'));
  };
  swr('alimentos', async () => call('foods.list', {}, { timeoutMs: 60000, silent: true }), (d) => { base = d; pintarSiempre(); }).catch(() => { /* sin base: todo a la IA */ });
  let grabando = false;
  const dia = h('input', { type: 'date', value: st.date, max: st.today, 'aria-label': 'Día de la comida' });
  // La hora de la comida: por defecto, la de ahora; si la cambias, manda la tuya.
  const horaCampo = h('input', { type: 'time', value: horaLocal(), 'aria-label': 'Hora de la comida' });
  let horaEditada = false;
  horaCampo.addEventListener('change', () => { horaEditada = !!horaCampo.value; });
  const hora = () => ({ editada: horaEditada ? horaCampo.value : null, alApuntar: horaCampo.value || horaLocal() });
  const atajos = h('div', { class: 'chips-datos' },
    ...[['Hoy', st.today], ['Ayer', sumarDias(st.today, -1)], ['Anteayer', sumarDias(st.today, -2)]].map(([t, d]) =>
      h('button', { type: 'button', class: 'chip chip-boton', onClick: () => { dia.value = d; } }, t)));
  const miniaturas = h('div', { class: 'miniaturas' });
  const archivo = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const btnFoto = h('button', { type: 'button', class: 'btn btn-sec' }, 'Añadir foto');
  const area = h('textarea', { rows: 3, maxlength: 2000, 'aria-label': 'Descripción de la comida', placeholder: 'Opcional si hay foto o audio. Ej.: arroz con pollo, unos 200 g de arroz cocido; una manzana' });
  const btnAudio = h('button', { type: 'button', class: 'btn btn-sec' }, 'Grabar audio');
  const audioInfo = h('p', { class: 'nota', hidden: true });
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const calcular = h('button', { type: 'button', class: 'btn btn-ancho' }, 'Calcular');

  const pintarFotos = () => {
    miniaturas.replaceChildren(...fotos.map((f, i) => h('div', { class: 'miniatura' }, h('img', { src: f.url, alt: 'Foto ' + (i + 1) + ' de la comida' }),
      h('button', { type: 'button', class: 'quitar', 'aria-label': 'Quitar la foto ' + (i + 1), onClick: () => { URL.revokeObjectURL(f.url); fotos.splice(i, 1); pintarFotos(); } }, '×'))));
    cajaReparto.hidden = !fotos.length;
    btnFoto.disabled = fotos.length >= MAX_FOTOS;
    btnFoto.textContent = fotos.length ? 'Otra foto' : 'Añadir foto';
  };
  btnFoto.addEventListener('click', () => archivo.click());
  archivo.addEventListener('change', async () => {
    const elegidos = [...archivo.files].slice(0, MAX_FOTOS - fotos.length);
    archivo.value = '';
    estado.className = 'estado'; estado.textContent = elegidos.length ? 'Preparando la foto…' : '';
    for (const f of elegidos) {
      try { const blob = await shrinkImage(f, 1280, 0.82); fotos.push({ blob, url: URL.createObjectURL(blob) }); }
      catch (err) { console.error(err); estado.className = 'estado error'; estado.textContent = 'No se pudo leer una de las fotos.'; }
    }
    if (estado.textContent === 'Preparando la foto…') estado.textContent = '';
    pintarFotos();
  });
  cajaReparto.hidden = true;

  recorder = recorder || createRecorder({ onTick: (ms) => { if (grabando) btnAudio.textContent = 'Parar · ' + Math.floor(ms / 1000) + ' s'; }, onAutoStop: () => { if (grabando) btnAudio.click(); } });
  btnAudio.addEventListener('click', async () => {
    if (!grabando) {
      try { await recorder.start(); grabando = true; btnAudio.classList.add('grabando'); btnAudio.textContent = 'Parar · 0 s'; }
      catch (err) { console.error(err); estado.className = 'estado error'; estado.textContent = 'Sin acceso al micrófono. Actívalo en Ajustes de iOS para este sitio.'; }
      return;
    }
    grabando = false; btnAudio.classList.remove('grabando');
    try { const r = await recorder.stop(); audio = { blob: r.blob, mime: r.mime, ms: r.ms }; } catch (err) { console.error(err); }
    recorder.releaseMic();
    btnAudio.textContent = audio ? 'Volver a grabar' : 'Grabar audio';
    audioInfo.hidden = !audio;
    audioInfo.textContent = audio ? 'Audio de ' + Math.max(1, Math.round(audio.ms / 1000)) + ' s listo.' : '';
  });

  calcular.addEventListener('click', async () => {
    if (grabando) { estado.className = 'estado error'; estado.textContent = 'Para la grabación antes de calcular.'; return; }
    if (!fotos.length && !audio && !area.value.trim()) { estado.className = 'estado error'; estado.textContent = 'Añade una foto, un audio o un texto.'; return; }
    if (!dia.value || dia.value > st.today) { estado.className = 'estado error'; estado.textContent = 'Elige un día que no sea futuro.'; return; }
    // Solo texto y todo conocido: se calcula en el móvil con tus comidas anteriores, sin IA.
    if (!fotos.length && !audio && base) {
      const loc = estimarLocal(area.value, base.foods);
      if (loc) { contarAhorroLocal(localStorage, 'comidas'); loc.texto = area.value.trim(); pantallaRevision(el, st, loc, 'text', dia.value, [], null, hora()); return; }
    }
    calcular.disabled = true; estado.className = 'estado';
    estado.textContent = fotos.length ? 'Mirando la foto y calculando… puede tardar unos segundos.' : 'Calculando lo que has comido…';
    try {
      const payload = { text: area.value.trim() };
      if (fotos.length && fraccionReparto(reparto) < 1) payload.shared = true;   // la IA estima el plato entero; la app reparte
      if (audio) payload.audio = { mime: audio.mime, data: await blobToBase64(audio.blob) };
      if (fotos.length) payload.images = await Promise.all(fotos.map(async (f) => ({ mime: 'image/jpeg', data: await blobToBase64(f.blob) })));
      const r = await call('meal.process', payload, { timeoutMs: 150000 });
      if (vigente(el)) pantallaRevision(el, st, r, fotos.length ? 'photo' : audio ? 'voice' : 'text', dia.value, fotos.map((f) => f.url), fotos.length ? reparto : null, hora());
    } catch (err) { console.error(err); calcular.disabled = false; estado.className = 'estado error'; estado.textContent = err.message + ' Lo que has añadido sigue aquí.'; }
  });

  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Comida'), h('h2', {}, 'Añadir comida'),
    h('div', { class: 'bloque' }, h('div', { class: 'rejilla' }, h('label', {}, 'Día', dia), h('label', {}, 'Hora', horaCampo)), atajos),
    cajaSiempre,
    h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Foto'), miniaturas, archivo, cajaReparto,
      h('div', { class: 'acciones' }, btnFoto), h('p', { class: 'nota' }, 'Del plato entero, con los cubiertos o la mano a la vista para calcular la cantidad. Hasta 3 fotos; también vale la etiqueta del envase.')),
    h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Voz o texto'), h('div', { class: 'acciones' }, btnAudio), audioInfo, area),
    calcular, estado,
    h('div', { class: 'acciones fin' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => { if (recorder) recorder.releaseMic(); fotos.forEach((f) => URL.revokeObjectURL(f.url)); inicio(el, st); } }, 'Cancelar'))));
}

// ---------- Revisar y guardar ----------

function pantallaRevision(el, st, r, source, fechaComida = st.date, miniaturas = [], reparto = null, horaPropuesta = null) {
  const hp = horaPropuesta || { alApuntar: horaLocal() };
  pantalla = 'otra';
  // Con foto, la IA estimó el plato entero: aquí se aplica tu parte, y se puede cambiar sin volver a calcular.
  const entero = r.items.map((i) => Object.assign({}, i));
  let items = reparto ? repartir(entero, reparto) : entero.map((i) => Object.assign({}, i));
  const platoEntero = h('p', { class: 'nota' });
  const pintarEntero = () => {
    const t = sumItems(entero);
    platoEntero.textContent = reparto && fraccionReparto(reparto) < 1 ? 'El plato entero de la foto tenía unas ' + fmtInt(t.kcal) + ' kcal; abajo ya va solo tu parte.' : '';
  };
  const filas = h('div', {});
  const totalNodo = h('p', { class: 'detalle' });
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const tipo = h('select', { 'aria-label': 'Tipo de comida' }, h('option', { value: '' }, 'Sin especificar'),
    ...TIPOS_ELEGIBLES.map((v) => h('option', Object.assign({ value: v }, r.mealType === v ? { selected: true } : {}), MEAL_TYPES_ES[v])));
  const hora = h('input', { type: 'time', value: horaComida({ editada: hp.editada, dicha: r.time, alApuntar: hp.alApuntar }) || '', 'aria-label': 'Hora' });

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
  pintarFilas(); pintarTotal(); pintarEntero();
  const cajaReparto = reparto ? controlReparto(reparto, () => { items = repartir(entero, reparto); pintarFilas(); pintarTotal(); pintarEntero(); }) : null;

  const guardar = async (btn) => {
    if (btn.disabled) return;
    if (!items.length) { estado.className = 'estado error'; estado.textContent = 'No queda ningún alimento.'; return; }
    const record = { date: fechaComida, mealType: tipo.value || null, time: hora.value || null, source, items: items.map(limpiar) };
    if (reparto && fraccionReparto(reparto) < 1) record.portion = { share: Math.round(fraccionReparto(reparto) * 1000) / 1000, text: textoReparto(reparto) };
    btn.disabled = true; estado.className = 'estado'; estado.textContent = 'Guardando…';
    try { await call('commit', { entity: 'meal', record }, { timeoutMs: 60000 }); borrar('comida:' + fechaComida); fecha = fechaComida; avisar('Comida guardada ✓'); if (vigente(el)) render(el); }
    catch (err) { console.error(err); btn.disabled = false; estado.className = 'estado error'; estado.textContent = err.message; }
  };

  el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Comida · ' + (fechaComida === st.today ? 'hoy' : formatDateEs(fechaComida))), h('h2', {}, 'Revisa la comida'),
    miniaturas.length ? h('div', { class: 'miniaturas' }, ...miniaturas.map((u, i) => h('div', { class: 'miniatura' }, h('img', { src: u, alt: 'Foto ' + (i + 1) })))) : null,
    r.transcript ? h('p', { class: 'nota' }, 'Oí: «' + r.transcript + '»') : null,
    r.local === true ? h('div', { class: 'aviso' }, 'Calculado con tus comidas anteriores, sin gastar IA.',
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec btn-mini', onClick: async (e) => {
        e.currentTarget.disabled = true; estado.className = 'estado'; estado.textContent = 'Calculando con la IA…';
        try { const nuevo = await call('meal.process', { text: r.texto }, { timeoutMs: 150000 }); if (vigente(el)) pantallaRevision(el, st, nuevo, 'text', fechaComida, [], null, hp); }
        catch (err) { console.error(err); estado.className = 'estado error'; estado.textContent = err.message; }
      } }, 'Calcular con la IA'))) : null,
    r.local === 'repetida' ? h('p', { class: 'aviso' }, 'Repetida de la última vez. Ajusta las cantidades si hoy ha sido distinto.') : null,
    h('p', { class: 'nota' }, 'Los valores son una estimación de la IA. Corrige lo que no cuadre: al cambiar la cantidad, los nutrientes se reajustan solos.'),
    cajaReparto ? h('div', { class: 'bloque' }, cajaReparto, platoEntero) : null,
    h('div', { class: 'rejilla' }, h('label', {}, 'Tipo', tipo), h('label', {}, 'Hora', hora)),
    filas, totalNodo, estado,
    h('div', { class: 'acciones fin' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => inicio(el, st) }, 'Descartar'))));
  // "Guardar comida" siempre a mano, con el total a la vista.
  const botonGuardar = h('button', { type: 'button', class: 'btn', onClick: (e) => guardar(e.currentTarget) }, 'Guardar comida');
  ponerBarra(h('div', { class: 'barra-contenido' },
    h('div', { class: 'barra-estado' }, h('b', { class: 'sin-guardar' }, 'Sin guardar'), h('span', {}, 'Revisa y guarda')),
    h('div', { class: 'barra-acciones' }, botonGuardar)));
}

/** Elimina campos que no pertenecen al modelo (por ejemplo, avisos) antes de guardar. */
function limpiar(it) {
  const out = {};
  for (const [k, v] of Object.entries(it)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

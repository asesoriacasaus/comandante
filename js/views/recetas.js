// Recetas para cubrir lo que falta y lista de la compra (se abre desde Comida).
import { call } from '../api.js';
import { h, cargando } from '../lib/dom.js';
import { swr, guardar } from '../lib/cache.js';
import { todayIsoLocal, formatDateEs } from '../lib/format.js';
import { fmtInt, fmtDec, SECCIONES_ES, MOMENTOS_ES, listaEnTexto, claveCompra } from '../lib/nutrition.js';

const vigente = (el) => el.dataset.route === 'comida';
const NOMBRES = { proteinG: 'Proteína', fiberG: 'Fibra', potassiumMg: 'Potasio', calciumMg: 'Calcio', ironMg: 'Hierro', magnesiumMg: 'Magnesio',
  zincMg: 'Zinc', vitAUg: 'Vitamina A', vitCMg: 'Vitamina C', vitDUg: 'Vitamina D', vitEMg: 'Vitamina E', vitKUg: 'Vitamina K', b1Mg: 'B1',
  b2Mg: 'B2', b3Mg: 'B3', b6Mg: 'B6', folateUg: 'Folato', b12Ug: 'B12', omega3G: 'Omega 3' };
const CLAVE = 'recetas';

// Lo marcado en la lista de la compra: es una comodidad de este móvil, se guarda por lista.
function marcados(id) { try { return new Set(JSON.parse(localStorage.getItem('comandante.compra.' + id) || '[]')); } catch (_) { return new Set(); } }
function fijarMarcados(id, set) { try { localStorage.setItem('comandante.compra.' + id, JSON.stringify([...set])); } catch (_) { /* sin almacenamiento */ } }

export function pantallaRecetas(el, ctx) {
  const cab = (titulo) => [h('p', { class: 'etiqueta' }, 'Comida'), h('h2', {}, titulo)];
  const volver = h('button', { type: 'button', class: 'btn btn-sec', onClick: ctx.volver }, 'Volver a Comida');
  el.replaceChildren(h('section', {}, ...cab('Recetas'), cargando()));

  const generar = async (btn, estado) => {
    btn.disabled = true; estado.className = 'estado'; estado.textContent = 'Buscando recetas para lo que te falta… puede tardar hasta un minuto. Puedes seguir usando la app.';
    try {
      const r = await call('nutrition.suggest', {}, { timeoutMs: 170000 });
      guardar(CLAVE, r.suggestions);
      if (vigente(el)) pintar(r.suggestions);
    } catch (err) { console.error(err); btn.disabled = false; estado.className = 'estado error'; estado.textContent = err.message; }
  };

  function pintar(sug) {
    const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
    const btnGen = h('button', { type: 'button', class: sug ? 'btn btn-sec' : 'btn' }, sug ? 'Otras recetas con lo de hoy' : 'Proponer recetas');
    btnGen.addEventListener('click', () => generar(btnGen, estado));
    if (!sug) {
      el.replaceChildren(h('section', {}, ...cab('Recetas'),
        h('p', {}, 'Te propongo 3 recetas sencillas que cubran lo que te falta hoy y en la última semana (proteína y vitaminas o minerales bajos), con la lista de la compra ya sumada.'),
        h('p', { class: 'nota' }, 'Si hay algo que no comes o te sienta mal, escríbelo en Más > Ajustes > Comida.'),
        h('div', { class: 'acciones' }, btnGen), estado, h('div', { class: 'acciones fin' }, volver)));
      return;
    }
    const antigua = sug.date !== todayIsoLocal();
    el.replaceChildren(h('section', {}, ...cab('Recetas'),
      h('p', { class: 'nota' }, 'Propuestas el ' + formatDateEs(sug.date) + (antigua ? '. Pide otras para ajustarlas a lo de hoy.' : '.')),
      h('blockquote', { class: 'mensaje' }, sug.summary),
      h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn', onClick: () => pintarCompra(sug) }, 'Lista de la compra (' + sug.shopping.length + ')')),
      ...sug.recipes.map(tarjeta),
      h('div', { class: 'acciones fin' }, btnGen, volver), estado));
  }

  function tarjeta(r) {
    return h('article', { class: 'receta' },
      h('p', { class: 'receta-meta' }, (MOMENTOS_ES[r.moment] || r.moment) + ' · ' + r.minutes + ' min · ' + r.servings + (r.servings === 1 ? ' ración' : ' raciones')),
      h('h3', {}, r.name),
      h('p', {}, r.why),
      r.covers.length ? h('div', { class: 'chips-datos' }, ...r.covers.map((k) => h('span', { class: 'chip' }, NOMBRES[k] || k))) : null,
      h('p', { class: 'detalle' }, 'Por ración: ' + fmtInt(r.kcal) + ' kcal · P ' + fmtInt(r.proteinG) + ' g · H ' + fmtInt(r.carbsG) + ' g · G ' + fmtInt(r.fatG) + ' g'),
      h('details', {}, h('summary', {}, 'Ingredientes y pasos'),
        h('ul', { class: 'ingredientes' }, r.ingredients.map((g) => h('li', {}, g.name + ' · ' + fmtDec(g.quantity) + ' ' + g.unit))),
        h('ol', { class: 'pasos' }, r.steps.map((p) => h('li', {}, p)))));
  }

  function pintarCompra(sug) {
    const id = sug.createdAt;
    const hechos = marcados(id);
    const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
    const grupos = [];
    let seccion = null; let ul = null;
    sug.shopping.forEach((it) => {
      if (it.section !== seccion) { seccion = it.section; ul = h('ul', { class: 'compra' }); grupos.push(h('h3', { class: 'micro-grupo' }, SECCIONES_ES[seccion] || 'Otros'), ul); }
      const k = claveCompra(it);
      const caja = h('input', { type: 'checkbox', checked: hechos.has(k) });
      caja.addEventListener('change', () => { if (caja.checked) hechos.add(k); else hechos.delete(k); fijarMarcados(id, hechos); });
      ul.append(h('li', {}, h('label', { class: 'casilla' }, caja, h('span', {}, it.name), h('span', { class: 'detalle' }, fmtDec(it.quantity) + ' ' + it.unit))));
    });
    const compartir = h('button', { type: 'button', class: 'btn' }, 'Compartir o copiar');
    compartir.addEventListener('click', async () => {
      const texto = listaEnTexto(sug.shopping, hechos);
      try {
        if (navigator.share) { await navigator.share({ title: 'Lista de la compra', text: texto }); return; }
        await navigator.clipboard.writeText(texto); estado.className = 'estado'; estado.textContent = 'Lista copiada.';
      } catch (err) { if (err && err.name === 'AbortError') return; estado.className = 'estado error'; estado.textContent = 'No se pudo compartir: ' + err.message; }
    });
    el.replaceChildren(h('section', {}, ...cab('Lista de la compra'),
      h('p', { class: 'nota' }, 'Para las 3 recetas, ya sumado. Marca lo que ya tienes o vas cogiendo: al compartir solo sale lo que falta. Revisa la despensa: aceite, sal y especias suelen estar en casa.'),
      ...grupos,
      h('div', { class: 'acciones fin' }, compartir, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => pintar(sug) }, 'Volver a las recetas')), estado));
  }

  swr(CLAVE, async () => (await call('nutrition.suggestions', {}, { timeoutMs: 60000 })).suggestions, (sug) => { if (vigente(el)) pintar(sug); })
    .catch((err) => {
      console.error(err);
      if (!vigente(el)) return;
      el.replaceChildren(h('section', {}, ...cab('Recetas'), h('p', { class: 'estado error' }, err.message),
        h('div', { class: 'acciones' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => pantallaRecetas(el, ctx) }, 'Reintentar'), volver)));
    });
}

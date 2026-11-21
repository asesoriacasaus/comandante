// Suplementos: se añaden una vez (la IA estima lo que aporta cada toma a partir del nombre o la marca) y se marcan cada día en Comida.
import { call } from '../api.js';
import { h } from '../lib/dom.js';
import { fmtDec } from '../lib/nutrition.js';

const UNIDADES = ['cápsula', 'comprimido', 'g', 'ml', 'sobre', 'cacito', 'gota', 'unidad'];
const MACROS = { kcal: ['Energía', 'kcal'], proteinG: ['Proteína', 'g'], carbsG: ['Hidratos', 'g'], fatG: ['Grasa', 'g'] };

/** Lo que aporta una toma, en texto legible ("Hierro 30 mg · Vitamina C 70 mg"). */
export function aporteTexto(nutrients, micros) {
  const nombres = Object.assign({}, MACROS, Object.fromEntries((micros || []).map((m) => [m.key, [m.label, m.unit]])));
  const partes = Object.entries(nutrients || {}).filter(([k, v]) => v > 0 && nombres[k]).map(([k, v]) => nombres[k][0] + ' ' + fmtDec(v) + ' ' + nombres[k][1]);
  return partes.length ? partes.join(' · ') : 'Sin vitaminas ni minerales (por ejemplo, creatina o cafeína)';
}

export function pantallaSuplementos(el, ctx) {
  let lista = ctx.lista.slice();
  const vigente = () => el.dataset.route === 'comida';

  function pintarLista(msg) {
    const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' }, msg || '');
    const texto = h('input', { type: 'text', maxlength: 200, autocomplete: 'off', 'aria-label': 'Suplemento', placeholder: 'Ej.: Sideral Forte, 1 cápsula · creatina 5 g · vitamina D 2000 UI' });
    const analizar = h('button', { type: 'button', class: 'btn' }, 'Añadir');
    analizar.addEventListener('click', async () => {
      if (!texto.value.trim()) { estado.className = 'estado error'; estado.textContent = 'Escribe el nombre o la marca.'; return; }
      analizar.disabled = true; estado.className = 'estado'; estado.textContent = 'Buscando qué lleva…';
      try {
        const r = await call('supplement.analyze', { text: texto.value.trim() }, { timeoutMs: 90000 });
        if (vigente()) pintarRevision(r.supplement);
      } catch (err) { console.error(err); analizar.disabled = false; estado.className = 'estado error'; estado.textContent = err.message; }
    });
    texto.addEventListener('keydown', (e) => { if (e.key === 'Enter') analizar.click(); });

    el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Comida'), h('h2', {}, 'Suplementos'),
      h('div', { class: 'bloque' }, h('label', {}, 'Nuevo suplemento', texto), h('div', { class: 'acciones' }, analizar), estado),
      lista.length ? h('ul', { class: 'lista lista-doble' }, lista.map((s) => {
        const borrarBtn = h('button', { type: 'button', class: 'btn btn-sec btn-mini', 'aria-label': 'Quitar ' + s.name }, 'Quitar');
        borrarBtn.addEventListener('click', async () => {
          if (!confirm('¿Quitar ' + s.name + '? Las tomas ya marcadas se conservan.')) return;
          borrarBtn.disabled = true;
          try { lista = (await call('supplement.delete', { id: s.id }, { timeoutMs: 60000 })).supplements; if (vigente()) pintarLista(); }
          catch (err) { console.error(err); borrarBtn.disabled = false; estado.className = 'estado error'; estado.textContent = err.message; }
        });
        return h('li', { class: 'fila sup-fila' }, h('div', {}, h('b', {}, s.name + ' · ' + fmtDec(s.dose) + ' ' + s.unit), h('small', {}, aporteTexto(s.nutrients, ctx.micros)),
          s.notes ? h('small', { class: 'sup-nota' }, s.notes) : null), borrarBtn);
      })) : h('p', { class: 'vacio' }, 'Aún no has añadido ninguno.'),
      h('p', { class: 'nota' }, 'Lo que aporta cada toma es una estimación a partir de la composición habitual del producto: revísala con el envase. Esto no sustituye el consejo de tu médico o farmacéutico.'),
      h('div', { class: 'acciones fin' }, h('button', { type: 'button', class: 'btn btn-sec', onClick: ctx.volver }, 'Volver a Comida'))));
  }

  function pintarRevision(sup) {
    const nombre = h('input', { type: 'text', maxlength: 60, value: sup.name, 'aria-label': 'Nombre' });
    const dosis = h('input', { inputmode: 'decimal', value: fmtDec(sup.dose), 'aria-label': 'Cantidad por toma' });
    const unidad = h('select', { 'aria-label': 'Unidad' }, ...UNIDADES.map((u) => h('option', Object.assign({ value: u }, sup.unit === u ? { selected: true } : {}), u)));
    const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
    const guardar = h('button', { type: 'button', class: 'btn' }, 'Guardar suplemento');
    guardar.addEventListener('click', async () => {
      const n = Number(String(dosis.value).replace(',', '.'));
      if (!nombre.value.trim() || !(n > 0)) { estado.className = 'estado error'; estado.textContent = 'Revisa el nombre y la cantidad.'; return; }
      // Si cambia la cantidad por toma, lo que aporta se reescala en proporción.
      const f = n / sup.dose;
      const nutrients = Object.fromEntries(Object.entries(sup.nutrients).map(([k, v]) => [k, Math.round(v * f * 1000) / 1000]));
      guardar.disabled = true; estado.className = 'estado'; estado.textContent = 'Guardando…';
      try {
        lista = (await call('supplement.save', { supplement: Object.assign({}, sup, { name: nombre.value.trim(), dose: n, unit: unidad.value, nutrients }) }, { timeoutMs: 60000 })).supplements;
        if (vigente()) pintarLista('Guardado. Márcalo en Comida cada día que lo tomes.');
      } catch (err) { console.error(err); guardar.disabled = false; estado.className = 'estado error'; estado.textContent = err.message; }
    });
    el.replaceChildren(h('section', {}, h('p', { class: 'etiqueta' }, 'Suplementos'), h('h2', {}, 'Revisa el suplemento'),
      sup.known ? null : h('p', { class: 'aviso peligro' }, 'No conozco bien este producto: lo que aporta es una suposición. Compáralo con la etiqueta antes de guardarlo.'),
      h('div', { class: 'bloque' }, h('label', {}, 'Nombre', nombre), h('div', { class: 'rejilla' }, h('label', {}, 'Cantidad por toma', dosis), h('label', {}, 'Unidad', unidad)),
        h('p', { class: 'etiqueta' }, 'Cada toma aporta'), h('p', {}, aporteTexto(sup.nutrients, ctx.micros)),
        sup.notes ? h('p', { class: 'nota' }, sup.notes) : null),
      h('div', { class: 'acciones' }, guardar, h('button', { type: 'button', class: 'btn btn-sec', onClick: () => pintarLista() }, 'Cancelar')), estado));
  }

  pintarLista();
}

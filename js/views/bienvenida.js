// Pantalla de bienvenida: perfil, objetivo y referencia de fuerza. Se guarda en settings.json (Drive), nunca en el repo.
import { call } from '../api.js';
import { h } from '../lib/dom.js';
import { parseNum } from '../lib/format.js';

export function renderOnboarding(el, onDone) {
  const campo = (id, etiqueta, props = {}) => h('label', {}, etiqueta, h('input', Object.assign({ id, inputmode: 'decimal', autocomplete: 'off' }, props)));
  const estado = h('p', { class: 'estado', role: 'status', 'aria-live': 'polite' });
  const sexo = h('select', { id: 'sexo' }, h('option', { value: '' }, 'Elige…'), h('option', { value: 'male' }, 'Hombre'), h('option', { value: 'female' }, 'Mujer'));

  const form = h('form', { class: 'card', novalidate: true },
    h('label', {}, 'Sexo', sexo),
    campo('anio', 'Año de nacimiento', { inputmode: 'numeric' }),
    campo('altura', 'Altura (cm)'),
    campo('peso', 'Peso actual (kg)'),
    campo('objetivo', 'Peso objetivo (kg)'),
    campo('cintura', 'Cintura (cm)'),
    campo('banca', 'Press banca: peso total con barra incluida para 4 series de 10 (kg)'),
    h('div', { class: 'acciones' }, h('button', { type: 'submit', class: 'btn' }, 'Guardar y continuar')),
    estado);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = (id) => form.querySelector('#' + id).value;
    const patch = {
      profile: { sex: v('sexo') || null, birthYear: parseNum(v('anio')), heightCm: parseNum(v('altura')) },
      goal: { startWeightKg: parseNum(v('peso')), targetWeightKg: parseNum(v('objetivo')), startWaistCm: parseNum(v('cintura')) },
      strength: { referenceTotalKg: parseNum(v('banca')) }
    };
    const falta = [patch.profile.sex, patch.profile.birthYear, patch.profile.heightCm, patch.goal.startWeightKg,
      patch.goal.targetWeightKg, patch.goal.startWaistCm, patch.strength.referenceTotalKg].some((x) => x === null);
    if (falta) { estado.textContent = 'Rellena todos los campos.'; estado.className = 'estado error'; return; }
    estado.textContent = 'Guardando…'; estado.className = 'estado';
    try {
      await call('settings.update', { patch });
      onDone();
    } catch (err) {
      console.error(err);
      estado.textContent = err.message; estado.className = 'estado error';
    }
  });

  el.replaceChildren(
    h('section', {},
      h('p', { class: 'etiqueta' }, 'Bienvenida'),
      h('h2', {}, 'Cuéntame de ti'),
      h('p', { class: 'nota' }, 'Estos datos se guardan solo en tu Google Drive. Con ellos el Comandante calcula tus cargas iniciales y tu progreso.'),
      form));
}

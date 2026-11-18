
import { h } from '../lib/dom.js';

const FILAS = [
  ['#progreso', 'Progreso', 'Fuerza, volumen semanal y tus récords'],
  ['#carreras', 'Carreras', 'Tus salidas a correr y su ritmo'],
  ['#ajustes', 'Ajustes', 'Conexión, material, comida y correo semanal'],
  ['#prueba', 'Prueba de voz y pantallazo', 'Comprobar el micrófono y la lectura de imágenes']
];

export function render(el) {
  el.replaceChildren(h('section', {}, h('h2', {}, 'Más'),
    h('ul', { class: 'lista lista-doble' }, FILAS.map(([href, titulo, sub]) => h('li', {},
      h('a', { href }, h('div', {}, h('b', {}, titulo), h('small', {}, sub)), h('span', { 'aria-hidden': 'true' }, '›')))))));
}

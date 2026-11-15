// Guía visual para medirse con cinta de sastre.
import { h } from '../lib/dom.js';
import { figureSvg } from '../lib/figure.js';
import { GUIDE, PART_ORDER, GENERAL_TIPS, DICTATION_EXAMPLE } from '../lib/measures.js';

export function render(el) {
  const tarjeta = (part) => {
    const g = GUIDE[part];
    return h('article', { class: 'guia-tarjeta' },
      figureSvg(part, { size: 124 }),
      h('div', { class: 'guia-texto' },
        h('h3', {}, g.title),
        h('p', { class: 'donde' }, g.where),
        h('ol', {}, g.steps.map((s) => h('li', {}, s))),
        g.tip ? h('p', { class: 'nota' }, g.tip) : null));
  };
  el.replaceChildren(h('section', {},
    h('p', { class: 'etiqueta' }, 'Cuerpo'),
    h('h2', {}, 'Cómo medirte'),
    h('p', { class: 'nota' }, 'En la figura, la cinta aparece en verde oliva. La D y la I de abajo son derecha e izquierda de la persona, no de quien mira.'),
    h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Antes de empezar'), h('ul', { class: 'avisos' }, GENERAL_TIPS.map((t) => h('li', {}, t)))),
    h('div', { class: 'bloque' }, h('p', { class: 'etiqueta' }, 'Cómo dictarlo'),
      h('p', { class: 'nota' }, 'Di la parte, el lado si tiene (derecho o izquierdo, o "los dos") y la medida en centímetros:'),
      h('blockquote', { class: 'mensaje' }, DICTATION_EXAMPLE)),
    ...PART_ORDER.map(tarjeta),
    h('div', { class: 'acciones' }, h('a', { class: 'btn', href: '#cuerpo' }, 'Volver a Cuerpo'))));
}

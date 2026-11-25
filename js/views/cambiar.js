// Cambiar un ejercicio por otro equivalente desde su propio recuadro (máquina ocupada, poco espacio...).
// Se abre una hoja con tarjetas de alternativas, de más a menos material y espacio. Sin IA.
import { h } from '../lib/dom.js';
import { abrirHoja } from '../lib/hoja.js';
import { avisar } from '../lib/barra.js';
import { alternativas, materialEs, musculosEs, textoEspacio } from '../lib/alternativas.js';

/**
 * @param {object} o
 * @param {string} o.exerciseId  ejercicio a cambiar
 * @param {string} o.nombre
 * @param {number} o.nSeries     series ya hechas de ese ejercicio en la sesión
 * @param {object|null} o.plan   lo planificado (para saber si la carga sirve)
 * @param {() => Promise<object[]>} o.cargarLista  biblioteca de ejercicios
 * @param {(op: object) => Promise<void>} o.aplicar  envía la edición
 */
export async function abrirCambio({ exerciseId, nombre, nSeries = 0, plan = null, cargarLista, aplicar }) {
  const hj = abrirHoja({ titulo: 'Cambiar ' + nombre, subtitulo: 'Mismos músculos · de más a menos material y espacio', alta: true, clase: 'hoja-cambio' });
  hj.poner(h('p', { class: 'nota' }, 'Buscando alternativas…'));
  let lista;
  try { lista = await cargarLista(); } catch (err) { hj.poner(h('p', { class: 'estado error' }, 'No se pudo cargar la lista de ejercicios: ' + err.message)); return; }
  const alts = alternativas(exerciseId, lista);
  if (!alts.length) { hj.poner(h('p', { class: 'vacio' }, 'No tengo alternativas para este ejercicio.')); return; }

  const elegir = (alt, tarjeta) => {
    tarjeta.classList.add('elegida');
    if (!nSeries) return confirmar(alt, false);
    // Ya hay series hechas: ¿se quedan con el original o eran de este?
    hj.poner([
      h('p', {}, 'Llevas ' + nSeries + (nSeries === 1 ? ' serie' : ' series') + ' de ' + nombre + '. ¿Qué hago con ' + (nSeries === 1 ? 'ella' : 'ellas') + '?'),
      h('div', { class: 'acciones-lista' },
        h('button', { type: 'button', class: 'accion-item', onClick: () => confirmar(alt, false) }, (nSeries === 1 ? 'Se queda' : 'Se quedan') + ' en ' + nombre + '; lo que falta, con ' + alt.ejercicio.name),
        h('button', { type: 'button', class: 'accion-item', onClick: () => confirmar(alt, true) }, (nSeries === 1 ? 'Era de ' : 'Eran de ') + alt.ejercicio.name + ' (corregir el registro)')),
      h('button', { type: 'button', class: 'accion-item accion-cancelar', onClick: () => pintar() }, 'Elegir otra')]);
  };
  const confirmar = async (alt, mover) => {
    const e = alt.ejercicio;
    const keepLoad = !!(plan && plan.targetLoad && (e.implements || []).includes(plan.targetLoad.implement));
    try {
      await aplicar({ op: 'swap', from: exerciseId, to: e.id, toName: e.name, moveSets: mover, keepLoad });
      await hj.cerrar();
      avisar('Cambiado: ' + nombre + ' → ' + e.name, 4000);
    } catch (err) { hj.poner([h('p', { class: 'estado error' }, err.message), h('button', { type: 'button', class: 'btn btn-sec', onClick: () => pintar() }, 'Volver')]); }
  };

  const pintar = () => {
    let ultimoCoste = null;
    const nodos = [];
    alts.forEach((alt, i) => {
      if (alt.coste !== ultimoCoste) { ultimoCoste = alt.coste; nodos.push(h('p', { class: 'alt-separador' }, textoEspacio(alt.coste))); }
      const e = alt.ejercicio;
      const tarjeta = h('button', { type: 'button', class: 'alt', 'aria-label': e.name + ', ' + materialEs(e) + ', ' + alt.motivo },
        h('b', {}, e.name),
        h('span', { class: 'alt-nivel', 'aria-hidden': 'true' }, ...[1, 2, 3, 4, 5].map((n) => h('i', { class: n <= alt.coste ? 'on' : '' }))),
        h('span', { class: 'alt-material' }, ...(e.implements || []).slice(0, 3).map((im) => h('span', {}, materialEs({ implements: [im] })))),
        h('span', { class: 'alt-musculos' }, musculosEs(e)),
        h('span', { class: 'alt-motivo' }, alt.motivo));
      tarjeta.addEventListener('click', () => elegir(alt, tarjeta));
      // Entrada escalonada: cada tarjeta un poco después de la anterior (animation-delay por JS: sin estilos en el HTML).
      tarjeta.style.animationDelay = Math.min(i, 12) * 35 + 'ms';
      nodos.push(tarjeta);
    });
    hj.poner([h('div', { class: 'alternativas' }, ...nodos),
      h('p', { class: 'nota' }, 'Las barras indican cuánto material y espacio pide cada uno. Abajo del todo, lo que puedes hacer en cualquier rincón.')]);
    hj.cuerpo.scrollTop = 0;
  };
  pintar();
}

// Bootstrap y router de vistas por hash.
import * as hoy from './views/hoy.js';
import * as diario from './views/diario.js';
import * as cuerpo from './views/cuerpo.js';
import * as comida from './views/comida.js';
import * as mas from './views/mas.js';
import * as ajustes from './views/ajustes.js';
import * as prueba from './views/prueba.js';
import * as sesion from './views/sesion.js';
import * as revision from './views/revision.js';
import * as guia from './views/guia.js';

const ROUTES = { hoy, diario, cuerpo, comida, mas, ajustes, prueba, sesion, revision, guia };
// Ajustes y prueba cuelgan de "Más".
const TAB_OF = { ajustes: 'mas', prueba: 'mas', sesion: 'hoy', revision: 'hoy', guia: 'cuerpo' };
const view = document.getElementById('view');

function currentRoute() {
  const key = location.hash.replace('#', '') || 'hoy';
  return Object.prototype.hasOwnProperty.call(ROUTES, key) ? key : 'hoy';
}
function render() {
  const key = currentRoute();
  // Las vistas asíncronas comprueban este valor antes de dibujar, para no
  // pisar otra sección si el usuario ya ha navegado.
  view.dataset.route = key;

  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.getAttribute('href') === '#' + (TAB_OF[key] || key)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  try {
    ROUTES[key].render(view);
  } catch (err) {
    console.error(err);
    view.textContent = 'Error al mostrar la sección';
  }
  view.focus({ preventScroll: true });
}

window.addEventListener('hashchange', render);
render();

if ('serviceWorker' in navigator) {
  // Cuando una versión nueva toma el control, se recarga para mostrarla. Nunca a mitad de una sesión de entreno:
  // en ese caso se espera a que salgas de la pantalla Sesión.
  const hadController = !!navigator.serviceWorker.controller;
  let pendingReload = false;
  const reloadIfSafe = () => { if (pendingReload && location.hash !== '#sesion') location.reload(); };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // primera instalación: no hay nada que actualizar
    pendingReload = true;
    reloadIfSafe();
  });
  window.addEventListener('hashchange', reloadIfSafe);
  navigator.serviceWorker.register('sw.js').then((reg) => reg.update()).catch((err) => console.error('SW no registrado', err));
}

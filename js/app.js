// Bootstrap y router de vistas por hash.
import * as hoy from './views/hoy.js';
import * as diario from './views/diario.js';
import * as cuerpo from './views/cuerpo.js';
import * as comida from './views/comida.js';
import * as mas from './views/mas.js';
import * as ajustes from './views/ajustes.js';
import * as prueba from './views/prueba.js';
import * as sesion from './views/sesion.js';

const ROUTES = { hoy, diario, cuerpo, comida, mas, ajustes, prueba, sesion };
// Ajustes y prueba cuelgan de "Más".
const TAB_OF = { ajustes: 'mas', prueba: 'mas', sesion: 'hoy' };
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
  navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW no registrado', err));
}

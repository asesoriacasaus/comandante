// Bootstrap y router de vistas por hash.
import * as home from './views/home.js';
import * as log from './views/log.js';
import * as workouts from './views/workouts.js';
import * as nutrition from './views/nutrition.js';
import * as body from './views/body.js';
import * as plan from './views/plan.js';
import * as analysis from './views/analysis.js';
import * as calendar from './views/calendar.js';
import * as settings from './views/settings.js';

const ROUTES = { home, log, workouts, nutrition, body, plan, analysis, calendar, settings };
const view = document.getElementById('view');

function currentRoute() {
  const key = location.hash.replace('#', '') || 'home';
  return Object.prototype.hasOwnProperty.call(ROUTES, key) ? key : 'home';
}

function render() {
  const key = currentRoute();
  // Las vistas asíncronas comprueban este valor antes de dibujar, para no
  // pisar otra sección si el usuario ya ha navegado.
  view.dataset.route = key;

  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.getAttribute('href') === '#' + key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  try {
    ROUTES[key].render(view);
  } catch (err) {
    console.error(err);
    view.textContent = 'Error al mostrar la sección: ' + err.message;
  }
  view.focus({ preventScroll: true });
}

window.addEventListener('hashchange', render);
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW no registrado', err));
}

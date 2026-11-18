// Bootstrap y router de vistas por hash. Cada pantalla se carga solo cuando se abre (el Service Worker las tiene en caché).
import { onActividad, call } from './api.js';
import { getConfig } from './state.js';
import { mensajeActividad } from './lib/actividad.js';

const LOADERS = {
  hoy: () => import('./views/hoy.js'), diario: () => import('./views/diario.js'), cuerpo: () => import('./views/cuerpo.js'),
  comida: () => import('./views/comida.js'), mas: () => import('./views/mas.js'), ajustes: () => import('./views/ajustes.js'),
  prueba: () => import('./views/prueba.js'), sesion: () => import('./views/sesion.js'), revision: () => import('./views/revision.js'),
  guia: () => import('./views/guia.js'), carreras: () => import('./views/carreras.js'), progreso: () => import('./views/progreso.js')
};
const cargados = {};
// Ajustes y prueba cuelgan de "Más".
const TAB_OF = { ajustes: 'mas', prueba: 'mas', sesion: 'hoy', revision: 'hoy', guia: 'cuerpo', carreras: 'mas', progreso: 'mas' };
const view = document.getElementById('view');

function currentRoute() {
  const key = location.hash.replace('#', '') || 'hoy';
  return Object.prototype.hasOwnProperty.call(LOADERS, key) ? key : 'hoy';
}

// Cada sección recuerda dónde se quedó el desplazamiento: al volver a ella se recupera; al entrar en una nueva, arriba.
const scrolls = {};
let rutaAnterior = null;
const TABS = new Set(['hoy', 'diario', 'cuerpo', 'comida', 'mas', 'progreso', 'carreras', 'ajustes', 'guia']);

async function render() {
  const key = currentRoute();
  if (rutaAnterior) scrolls[rutaAnterior] = window.scrollY;
  const cambia = rutaAnterior !== key;
  rutaAnterior = key;
  // Las vistas asíncronas comprueban este valor antes de dibujar, para no
  // pisar otra sección si el usuario ya ha navegado.
  view.dataset.route = key;

  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.getAttribute('href') === '#' + (TAB_OF[key] || key)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  try {
    cargados[key] = cargados[key] || await LOADERS[key]();
    if (view.dataset.route !== key) return;   // el usuario ya se ha ido a otra pantalla
    cargados[key].render(view);
    if (cambia) {
      // Animación de entrada solo al cambiar de sección (los repintados de la misma pantalla no parpadean).
      view.classList.remove('entrando'); void view.offsetWidth; view.classList.add('entrando');
      const y = TABS.has(key) ? (scrolls[key] || 0) : 0;
      requestAnimationFrame(() => window.scrollTo(0, Math.min(y, document.documentElement.scrollHeight)));
    }
  } catch (err) {
    console.error(err);
    view.textContent = 'Error al mostrar la sección';
  }
  view.focus({ preventScroll: true });
}

// ---------- Indicador global de actividad ----------
const barra = document.getElementById('actividad');
if (barra) {
  const texto = barra.querySelector('.act-texto');
  let reloj = null;
  onActividad(({ count, since }) => {
    clearInterval(reloj);
    if (!count) { barra.hidden = true; return; }
    const pinta = () => {
      const m = mensajeActividad(Date.now() - since);
      barra.hidden = m === null;
      texto.textContent = m || '';
      texto.hidden = !m;
    };
    pinta();
    reloj = setInterval(pinta, 500);
  });
}

// Safari en iPhone solo aplica :active (el botón que se hunde al pulsarlo) si la página escucha los toques.
document.addEventListener('touchstart', () => {}, { passive: true });
window.addEventListener('hashchange', render);
view.addEventListener('animationend', (e) => { if (e.target.parentElement === view) view.classList.remove('entrando'); });
// Pulsar la pestaña en la que ya estás sube al principio, como en las apps nativas.
document.querySelectorAll('.tabs a').forEach((a) => a.addEventListener('click', () => {
  if (a.getAttribute('aria-current') === 'page' && location.hash === a.getAttribute('href')) window.scrollTo({ top: 0, behavior: 'smooth' });
}));
render();

// Despierta al servidor nada más abrir la app: la primera llamada de verdad no paga el arranque en frío.
if (getConfig().apiUrl) call('ping', {}, { silent: true, timeoutMs: 30000 }).catch(() => {});
// La lista de ejercicios se guarda en el móvil con tiempo, para que el formulario de series funcione sin red en el gimnasio.
if (getConfig().apiUrl) setTimeout(() => import('./lib/ejercicios.js').then((m) => m.cargarEjercicios()).catch(() => {}), 4000);

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

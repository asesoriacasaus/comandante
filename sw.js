// Service Worker: precache del shell y cache-first para estáticos del mismo origen.
// Las llamadas al Web App de Apps Script son POST y no pasan por caché.
// Para publicar cambios, subir CACHE_NAME (comandante-v3, comandante-v4...).
const CACHE_NAME = 'comandante-v3';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/180.png',
  './icons/192.png',
  './icons/512.png',
  './css/app.css',
  './js/app.js',
  './js/api.js',
  './js/state.js',
  './js/lib/media.js',
  './js/version.js',
  './js/lib/dom.js',
  './js/lib/ids.js',
  './js/lib/queue.js',
  './js/recorder.js',
  './js/views/sesion.js',
  './js/views/revision.js',
  './js/views/resumen-hablado.js',
  './js/views/recetas.js',
  './js/views/suplementos.js',
  './js/views/guia.js',
  './js/lib/measures.js',
  './js/lib/diary.js',
  './js/lib/charts.js',
  './js/lib/nutrition.js',
  './js/lib/runs.js',
  './js/lib/serie.js',
  './js/lib/ejercicios.js',
  './js/views/serie-form.js',
  './js/lib/actividad.js',
  './js/lib/cache.js',
  './js/lib/progress.js',
  './js/lib/sesiones-datos.js',
  './js/lib/sesion-viva.js',
  './js/lib/ediciones.js',
  './js/views/progreso.js',
  './js/views/carreras.js',
  './js/lib/figure.js',
  './js/lib/musculos.js',
  './js/lib/format.js',
  './js/views/bienvenida.js',
  './js/views/hoy.js',
  './js/views/diario.js',
  './js/views/cuerpo.js',
  './js/views/comida.js',
  './js/views/mas.js',
  './js/views/ajustes.js',
  './js/views/prueba.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});

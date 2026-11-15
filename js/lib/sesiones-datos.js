// Datos de sesiones guardadas para Diario y Progreso: un resumen ligero del último año (una sola petición
// compartida por las dos pantallas) y el detalle de cada sesión bajo demanda, con caché local.
import { call } from '../api.js';
import { swr, leer, guardar, borrar } from './cache.js';
import { todayIsoLocal } from './format.js';

export const CLAVE_RESUMEN = 'resumen-sesiones';

// Las versiones anteriores guardaban aquí el año entero de sesiones (hasta 300 KB cada una): se libera ese espacio.
['diario', 'progreso'].forEach((k) => { try { if (leer(k)) borrar(k); } catch (_) { /* nada */ } });

/** Pinta con lo guardado al instante y repinta si el servidor trae algo distinto. */
export function resumenSesiones(onData) {
  const hoy = todayIsoLocal();
  const from = (Number(hoy.slice(0, 4)) - 1) + hoy.slice(4);
  return swr(CLAVE_RESUMEN, async () => (await call('sessions.summary', { from, to: hoy }, { timeoutMs: 60000 })).items || [], onData);
}

/** Sesión completa. Una sesión guardada apenas cambia: si está en la caché local se usa sin preguntar. */
export async function detalleSesion(id) {
  const k = 'sesion-' + id;
  const hit = leer(k);
  if (hit && hit.data) return hit.data;
  const s = (await call('session.get', { id }, { timeoutMs: 60000 })).session;
  guardar(k, s);
  return s;
}

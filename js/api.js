// Cliente del Web App de Apps Script.
// Siempre POST con text/plain para evitar el preflight OPTIONS (Apps Script no lo responde).
import { getConfig } from './state.js';

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

// ---------- Actividad: cuántas llamadas hay en curso y desde cuándo (para el indicador global) ----------
let enCurso = 0;
let desde = 0;
let ultimoTiempo = null;       // { action, total, server } de la última llamada, para el diagnóstico de velocidad
const oyentes = new Set();
export function onActividad(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
const avisar = () => oyentes.forEach((fn) => fn({ count: enCurso, since: desde }));
export const getUltimoTiempo = () => ultimoTiempo;
let metaServidor = null;

/** `silent: true` no enseña el indicador (por ejemplo, el aviso para despertar al servidor). */
export async function call(action, payload = {}, opts = {}) {
  const t0 = performance.now();
  if (!opts.silent) { if (enCurso === 0) desde = Date.now(); enCurso++; avisar(); }
  try {
    metaServidor = null;
    const r = await llamar(action, payload, opts);
    ultimoTiempo = { action, total: Math.round(performance.now() - t0), server: metaServidor };
    return r;
  } finally {
    if (!opts.silent) { enCurso--; avisar(); }
  }
}

async function llamar(action, payload = {}, { timeoutMs } = {}) {
  const { apiUrl, token } = getConfig();
  if (!apiUrl) throw new ApiError('CONFIG', 'Falta la URL del Web App en Ajustes');

  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let res;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token, payload }),
      redirect: 'follow',
      signal: controller ? controller.signal : undefined
    });
  } catch (err) {
    console.error('Fallo de red o timeout', err);
    if (err.name === 'AbortError') throw new ApiError('TIMEOUT', 'El servidor tarda demasiado. Revisa el registro o reintenta');
    throw new ApiError('NETWORK', 'Sin conexión con el servidor');
  } finally {
    if (timer) clearTimeout(timer);
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error('Respuesta no JSON', err);
    throw new ApiError('INTERNAL', 'Respuesta no válida del servidor');
  }

  if (!data.ok) {
    const code = (data.error && data.error.code) || 'INTERNAL';
    const message = (data.error && data.error.message) || 'Error desconocido';
    throw new ApiError(code, message);
  }
  metaServidor = data.meta && typeof data.meta.ms === 'number' ? data.meta.ms : null;
  return data.data;
}

export function ping() {
  return call('ping');
}

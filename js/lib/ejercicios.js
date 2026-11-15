// Lista de ejercicios para el selector (es estática: se guarda en el móvil y casi nunca se vuelve a pedir).
import { call } from '../api.js';
import { leer, guardar } from './cache.js';

let enMemoria = null;

export async function cargarEjercicios() {
  if (enMemoria) return enMemoria;
  const hit = leer('ejercicios');
  if (hit && Array.isArray(hit.data) && hit.data.length) { enMemoria = hit.data; return enMemoria; }
  const r = await call('exercises.list', {}, { timeoutMs: 60000, silent: true });
  enMemoria = r.exercises;
  guardar('ejercicios', enMemoria);
  return enMemoria;
}

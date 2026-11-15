// Lógica del formulario de series a mano. Funciones puras.
import { parseNum, loadField } from './format.js';

export const IMPLEMENT_ES = { barbell: 'Barra', ezbar: 'Barra Z', dumbbell: 'Mancuernas', kettlebell: 'Pesa rusa', machine: 'Máquina',
  cable: 'Polea', bodyweight: 'Peso corporal', smith: 'Multipower' };
export const TIPOS_ES = { working: 'Serie de trabajo', warmup: 'Calentamiento', drop: 'Dropset', failure: 'Al fallo' };

/** Implemento y valor de carga a precargar según lo que la IA entendió ("heard") y los implementos del ejercicio. */
export function valoresDeHeard(heard, implementos) {
  const h = heard || {};
  const tiene = (i) => implementos.includes(i);
  const out = { implement: implementos[0], valor: '', reps: h.reps ?? '', rir: h.rir ?? '' };
  const elige = (cands) => implementos.find((i) => cands.includes(i));   // respeta el orden del ejercicio: el primero es el habitual
  if (h.perSideKg !== undefined) { const i = elige(['barbell', 'ezbar', 'smith', 'dumbbell']); if (i) { out.implement = i; out.valor = h.perSideKg; } }
  else if (h.perHandKg !== undefined) { const i = elige(['dumbbell', 'kettlebell']); if (i) { out.implement = i; out.valor = h.perHandKg; } }
  else if (h.stackKg !== undefined) { const i = elige(['machine', 'cable']); if (i) { out.implement = i; out.valor = h.stackKg; } }
  else if (h.addedKg !== undefined) { if (tiene('bodyweight')) { out.implement = 'bodyweight'; out.valor = h.addedKg; } }
  else if (h.totalKg !== undefined) { const i = implementos[0]; out.implement = i; out.valor = (i === 'barbell' || i === 'ezbar' || i === 'smith') ? '' : h.totalKg; }
  return out;
}

/** Valores del formulario → { set } listo para 'session.edit' o { error }. */
export function construirSerie({ tipo, reps, rir, valor, implement }) {
  const r = parseNum(reps);
  if (r === null || !Number.isInteger(r) || r < 1 || r > 100) return { error: 'Pon cuántas repeticiones hiciste (un número entre 1 y 100).' };
  let rr = null;
  if (String(rir ?? '').trim() !== '') {
    rr = parseNum(rir);
    if (rr === null || !Number.isInteger(rr) || rr < 0 || rr > 10) return { error: 'El RIR es un número entre 0 y 10. Déjalo en blanco si no lo sabes.' };
  }
  const [key] = loadField(implement);
  let v = parseNum(valor);
  if (v === null) { if (implement === 'bodyweight') v = 0; else return { error: 'Pon los kilos (' + loadField(implement)[1] + ').' }; }
  if (v < 0 || v > 800) return { error: 'Los kilos deben estar entre 0 y 800.' };
  return { set: { type: TIPOS_ES[tipo] ? tipo : 'working', reps: r, rir: rr, load: { implement, [key]: v } } };
}

/** Valor de carga de una carga ya construida, para precargar el campo. */
export function valorDeCarga(load) {
  if (!load) return '';
  const [key] = loadField(load.implement);
  return load[key] === undefined ? '' : load[key];
}

// Alternativas a un ejercicio (máquina ocupada, poco espacio...): mismos músculos, ordenadas de más a menos material y
// espacio. Se calculan en el móvil con la biblioteca de ejercicios, sin IA.
import { IMPLEMENT_ES } from './serie.js';

// Material y espacio que pide cada implemento (5 = máquina o polea fija; 1 = nada, en cualquier rincón).
export const COSTE_IMPLEMENTO = { machine: 5, cable: 5, smith: 4, barbell: 4, ezbar: 3, kettlebell: 2, dumbbell: 2, bodyweight: 1 };
const ESPACIO = { 5: 'máquina o polea', 4: 'banco o rack', 3: 'barra corta', 2: 'poco espacio', 1: 'sin material' };
const GRUPO_ES = { chest: 'pecho', back: 'espalda', shoulders: 'hombros', biceps: 'bíceps', triceps: 'tríceps', quads: 'cuádriceps',
  hamstrings: 'femorales', glutes: 'glúteos', calves: 'gemelos', core: 'abdomen' };

export const costeEjercicio = (e) => COSTE_IMPLEMENTO[(e.implements || [])[0]] || 3;
export const textoEspacio = (coste) => ESPACIO[coste] || '';
export const musculosEs = (e) => (e.primary || []).map((g) => GRUPO_ES[g] || g).join(' y ') +
  ((e.secondary || []).length ? ' · también ' + e.secondary.map((g) => GRUPO_ES[g] || g).join(', ') : '');
export const materialEs = (e) => (e.implements || []).map((i) => IMPLEMENT_ES[i] || i).join(' o ');

/**
 * Pura. Alternativas a `id`: comparten algún músculo principal. Orden: de más a menos material y espacio y, a igualdad,
 * las más parecidas (mismo tipo, mismos músculos). Cada una lleva { ejercicio, coste, parecido, motivo }.
 */
export function alternativas(id, lista) {
  const base = (lista || []).find((e) => e.id === id);
  if (!base || !(base.primary || []).length) return [];
  const prim = new Set(base.primary); const sec = new Set(base.secondary || []);
  return lista.filter((e) => e.id !== id && (e.primary || []).some((g) => prim.has(g)))
    .map((e) => {
      const mismos = e.primary.filter((g) => prim.has(g)).length;
      const parecido = mismos * 3 + (e.kind === base.kind ? 2 : 0) + (e.secondary || []).filter((g) => sec.has(g)).length
        - (e.primary.length - mismos);
      const coste = costeEjercicio(e);
      const motivo = (e.kind === base.kind ? (e.kind === 'isolation' ? 'Aislamiento' : 'Multiarticular') + ', como el original' : (e.kind === 'isolation' ? 'Más aislado' : 'Más global'))
        + (coste < costeEjercicio(base) ? ' · menos material' : coste > costeEjercicio(base) ? ' · más material' : '');
      return { ejercicio: e, coste, parecido, motivo };
    })
    .sort((a, b) => b.coste - a.coste || b.parecido - a.parecido || a.ejercicio.name.localeCompare(b.ejercicio.name, 'es'));
}

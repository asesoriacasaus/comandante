// Formato de textos para la interfaz. Funciones puras, sin DOM.
const GROUPS_ES = { chest: 'pecho', back: 'espalda', shoulders: 'hombros', biceps: 'bíceps', triceps: 'tríceps',
  quads: 'cuádriceps', hamstrings: 'femorales', glutes: 'glúteos', calves: 'gemelos', core: 'core' };

export function groupsEs(groups) {
  return (groups || []).map((g) => GROUPS_ES[g] || g).join(' y ');
}

const num = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

/** "20 por lado · 60 kg en total", "15 kg por mano", "pila 70 kg", "+10 kg de lastre". */
export function formatLoad(load) {
  if (!load) return 'Carga por definir';
  switch (load.implement) {
    case 'barbell': case 'ezbar': case 'smith':
      if (load.perSideKg === 0) return 'Barra sola · ' + num(load.totalKg) + ' kg';
      return num(load.perSideKg) + ' kg por lado · ' + num(load.totalKg) + ' kg en total';
    case 'dumbbell': case 'kettlebell':
      return num(load.perHandKg) + ' kg por ' + (load.count === 1 ? 'mancuerna' : 'mano');
    case 'machine': case 'cable':
      return 'Pila ' + num(load.stackKg) + ' kg';
    default:
      return load.addedKg > 0 ? '+' + num(load.addedKg) + ' kg de lastre' : 'Peso corporal';
  }
}

export function formatReps(ex) {
  return ex.repsMin === ex.repsMax ? String(ex.repsMax) : ex.repsMin + '-' + ex.repsMax;
}

export function formatRest(sec) {
  if (!sec) return '';
  return sec % 60 === 0 ? (sec / 60) + ' min' : Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') + ' min';
}

/** Número de un campo de texto, aceptando coma decimal. null si está vacío o no es número. */
export function parseNum(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

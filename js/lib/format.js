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

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-11-15" → "domingo 15 de noviembre". Independiente de la zona horaria del navegador. */
export function formatDateEs(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] + ' ' + d + ' de ' + MESES[m - 1];
}

/** 125 → "2:05". */
export function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** Campo editable de carga según el implemento: [clave, etiqueta]. */
export function loadField(implement) {
  switch (implement) {
    case 'barbell': case 'ezbar': case 'smith': return ['perSideKg', 'kg por lado'];
    case 'dumbbell': case 'kettlebell': return ['perHandKg', 'kg por mano'];
    case 'machine': case 'cable': return ['stackKg', 'kg de pila'];
    default: return ['addedKg', 'kg de lastre'];
  }
}

/** +5 → "+5 kg", -2.5 → "−2,5 kg", 0 → "igual". */
export function formatDelta(kg) {
  if (kg === null || kg === undefined) return '';
  if (kg === 0) return 'igual';
  return (kg > 0 ? '+' : '−') + num(Math.abs(kg)) + ' kg';
}

/** Textos de los avisos de la revisión. Cada uno dice qué pasa y qué hacer. */
export function describeIssue(i) {
  switch (i.type) {
    case 'missing': return 'No hiciste ' + i.name + ' (' + i.planned + ' series previstas).';
    case 'fewer_sets': return i.name + ': hiciste ' + i.done + ' de ' + i.planned + ' series previstas.';
    case 'unplanned': return i.name + ' no estaba en el plan de hoy.';
    case 'inherited_load': return 'Carga heredada de la serie anterior en ' + i.names.join(', ') + '. Revisa que sea la que usaste.';
    case 'load_from_plan': return 'Carga tomada del plan en ' + i.names.join(', ') + ', porque no la dijiste. Revísala.';
    case 'rir_unknown': return i.n + (i.n === 1 ? ' serie sin RIR' : ' series sin RIR') + ': sin él, la próxima subida de carga se decide solo por repeticiones.';
    case 'pain': return 'Molestia anotada: ' + (i.text || 'sin detalle') + '. Si persiste, baja la carga o consúltalo antes de seguir.';
    default: return '';
  }
}

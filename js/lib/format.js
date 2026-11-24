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
    case 'total_ignored': return 'En ' + i.names.join(', ') + ' dijiste un total que no cuadra con los kilos por lado. He usado los kilos por lado; revísalo.';
    case 'bar_inferred': return 'Por lo que dijiste en ' + i.name + ', he deducido que la barra pesa ' + num(i.barKg) + ' kg. Si no es así, corrige la serie.';
    case 'load_from_plan': return 'Carga tomada del plan en ' + i.names.join(', ') + ', porque no la dijiste. Revísala.';
    case 'rir_unknown': return i.n + (i.n === 1 ? ' serie sin RIR' : ' series sin RIR') + ': sin él, la próxima subida de carga se decide solo por repeticiones.';
    case 'pain': return 'Molestia anotada: ' + (i.text || 'sin detalle') + '. Si persiste, baja la carga o consúltalo antes de seguir.';
    default: return '';
  }
}

/** "Entendí: 20 kg por lado, 8 repeticiones, RIR 2". Vacío si la IA no entendió ningún número. */
export function describeHeard(h) {
  if (!h) return '';
  const p = [];
  if (h.perSideKg !== undefined) p.push(num(h.perSideKg) + ' kg por lado');
  if (h.perHandKg !== undefined) p.push(num(h.perHandKg) + ' kg por mano');
  if (h.totalKg !== undefined) p.push(num(h.totalKg) + ' kg en total');
  if (h.stackKg !== undefined) p.push('pila ' + num(h.stackKg) + ' kg');
  if (h.addedKg !== undefined) p.push(num(h.addedKg) + ' kg de lastre');
  if (h.reps !== undefined) p.push(h.reps + (h.reps === 1 ? ' repetición' : ' repeticiones'));
  if (h.rir !== undefined) p.push('RIR ' + h.rir);
  return p.length ? 'Entendí: ' + p.join(', ') + '.' : '';
}

/** Cita corta de lo que se dijo en un clip. */
export function quoteTranscript(text, max = 180) {
  const t = String(text || '').trim();
  if (!t) return '';
  return '«' + (t.length > max ? t.slice(0, max).trimEnd() + '…' : t) + '»';
}

/** Fecha local de hoy como YYYY-MM-DD (no la de UTC, que de madrugada sería la del día anterior). */
export function todayIsoLocal(now = new Date()) {
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

/** Hora local 'HH:MM' (la del reloj del móvil, no la UTC). */
export function horaLocal(now = new Date()) {
  return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}

/**
 * Hora con la que se guarda una comida. Manda la que el usuario cambió a mano; si no, la que dijo ("a las 14:00");
 * si no, la de cuando la apuntó.
 */
export function horaComida({ editada = null, dicha = null, alApuntar = null } = {}) {
  const ok = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  return ok(editada) ? editada : ok(dicha) ? dicha : ok(alApuntar) ? alApuntar : null;
}

/** 99.5 → "99,5 cm". */
export function formatCm(v) { return num(v) + ' cm'; }

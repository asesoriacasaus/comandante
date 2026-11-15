/**
 * Carreras (PLAN 6.4 y 8.1). Extracción del pantallazo del reloj, conversión de textos y validación.
 * El modelo solo transcribe ("00:14:51", "7'35\""); el código convierte y comprueba la coherencia.
 */

const RUN_FIELDS_ = [
  { key: 'distanceKm', min: 0.1, max: 250 }, { key: 'avgHr', min: 30, max: 250 }, { key: 'maxHr', min: 30, max: 250 },
  { key: 'cadence', min: 40, max: 260 }, { key: 'kcal', min: 5, max: 20000 }, { key: 'elevationM', min: 0, max: 9000 },
  { key: 'trainingEffect', min: 0, max: 10 }, { key: 'trainingLoad', min: 0, max: 2000 }
];

const RUN_SCHEMA_ = { type: 'OBJECT', properties: Object.assign({
  kind: { type: 'STRING' }, date: { type: 'STRING', nullable: true }, time: { type: 'STRING', nullable: true },
  durationText: { type: 'STRING', nullable: true }, paceText: { type: 'STRING', nullable: true }
}, RUN_FIELDS_.reduce((o, f) => { o[f.key] = { type: 'NUMBER', nullable: true }; return o; }, {})), required: ['kind'] };

const RUN_SYSTEM_ = 'Recibes un pantallazo del resumen de un entrenamiento de carrera de un reloj deportivo. Si es una carrera, "kind" es "run"; ' +
  'si no, "other" y el resto null. Transcribe solo lo que aparezca escrito: distanceKm (distancia en km, con punto decimal), ' +
  'durationText (duración tal cual, p. ej. "00:14:51"), paceText (ritmo medio tal cual, p. ej. 7\'35"), avgHr (frecuencia cardíaca media), ' +
  'maxHr (máxima, si aparece), cadence (cadencia media en pasos/min), kcal (calorías totales), elevationM (ascenso total en metros), ' +
  'trainingEffect (efecto del entrenamiento, si aparece) y trainingLoad (carga del ejercicio, el número). ' +
  '"date" en formato YYYY-MM-DD y "time" en HH:MM, solo si se ven completos. No extraigas zancada, pasos ni velocidad. ' +
  'Lo que no se vea va a null: nunca inventes ni calcules valores. Responde solo con el JSON pedido.';

/** "00:14:51" → 891; "1:05:03" → 3903; "14:51" → 891. null si no se entiende. */
function parseDuration_(text) {
  const m = /^\s*(?:(\d{1,2}):)?(\d{1,3}):(\d{2})\s*$/.exec(String(text || ''));
  if (!m) return null;
  const h = Number(m[1] || 0); const min = Number(m[2]); const s = Number(m[3]);
  if (s > 59 || (m[1] !== undefined && min > 59)) return null;
  return h * 3600 + min * 60 + s;
}

/** `7'35"` → 455; "7:35" → 455 (segundos por km). null si no se entiende. */
function parsePace_(text) {
  const m = /^\s*(\d{1,2})\s*(?:['’′:]|’)\s*(\d{1,2})\s*(?:["”″]|’’)?\s*(?:\/\s*km)?\s*$/.exec(String(text || ''));
  if (!m) return null;
  const sec = Number(m[2]);
  return sec > 59 ? null : Number(m[1]) * 60 + sec;
}

function validateRunExtraction_(o) {
  const e = [];
  if (!o || ['run', 'other'].indexOf(o.kind) < 0) return ['kind inválido'];
  RUN_FIELDS_.forEach((f) => { const v = o[f.key]; if (v !== null && v !== undefined && !isNum_(v)) e.push(f.key + ' debe ser un número o null'); });
  ['durationText', 'paceText', 'date', 'time'].forEach((k) => { if (o[k] !== null && o[k] !== undefined && typeof o[k] !== 'string') e.push(k + ' debe ser texto o null'); });
  return e;
}

/** Offset "+01:00" de una zona horaria en una fecha. Se inyecta para poder probar sin Utilities. */
function offsetFor_(date, tz) {
  return Utilities.formatDate(new Date(date + 'T12:00:00Z'), tz, 'XXX');
}

/**
 * Campos de la carrera listos para guardar. Lanza VALIDATION si no es una carrera.
 * `offsetFn(date)` devuelve el offset horario para componer `startedAt`.
 */
function sanitizeRun_(ai, today, offsetFn) {
  if (ai.kind !== 'run') throw { code: 'VALIDATION', message: 'La imagen no parece el resumen de una carrera' };
  const fields = {};
  const rejected = [];
  RUN_FIELDS_.forEach((f) => {
    const v = ai[f.key];
    if (v === null || v === undefined) return;
    if (v < f.min || v > f.max) rejected.push({ part: f.key, valueCm: v, reason: 'out_of_range' });
    else fields[f.key] = Math.round(v * 100) / 100;
  });
  const dur = parseDuration_(ai.durationText);
  if (dur !== null && dur >= 60 && dur <= 86400) fields.durationSec = dur;
  else if (ai.durationText) rejected.push({ part: 'durationSec', valueCm: 0, reason: 'unreadable' });
  let pace = parsePace_(ai.paceText);
  if (pace !== null && (pace < 150 || pace > 1200)) { rejected.push({ part: 'avgPaceSecPerKm', valueCm: pace, reason: 'out_of_range' }); pace = null; }
  const warnings = [];
  if (fields.distanceKm && fields.durationSec) {
    const calc = Math.round(fields.durationSec / fields.distanceKm);
    if (pace === null) { fields.avgPaceSecPerKm = calc; warnings.push('pace_from_data'); }
    else {
      fields.avgPaceSecPerKm = pace;
      if (Math.abs(pace - calc) > Math.max(0.1 * calc, 10)) warnings.push('pace_mismatch');
    }
  } else if (pace !== null) fields.avgPaceSecPerKm = pace;
  if (fields.avgHr && fields.maxHr && fields.maxHr < fields.avgHr) { delete fields.maxHr; warnings.push('maxhr_below_avg'); }

  let date = null; let startedAt = null;
  if (typeof ai.date === 'string' && isIsoDate_(ai.date) && validateDate_(ai.date, today).length === 0) date = ai.date;
  if (date && typeof ai.time === 'string' && HHMM_RE_.test(ai.time)) startedAt = date + 'T' + ai.time + ':00' + offsetFn(date);
  return { fields: fields, rejected: rejected, warnings: warnings, date: date, startedAt: startedAt };
}

function validateRun_(r, today) {
  const e = [];
  e.push(...validateDate_(r.date, today));
  RUN_FIELDS_.forEach((f) => pushIf_(e, checkNum_(r[f.key], f.key, f.min, f.max, false)));
  pushIf_(e, checkNum_(r.durationSec, 'durationSec', 60, 86400, false));
  pushIf_(e, checkNum_(r.avgPaceSecPerKm, 'avgPaceSecPerKm', 150, 1200, false));
  if (r.startedAt && !isIsoDateTime_(r.startedAt)) e.push('startedAt inválido');
  if (typeof r.distanceKm !== 'number' || typeof r.durationSec !== 'number') e.push('distancia y duración son obligatorias');
  return e;
}

function runExtract(p) {
  const mime = validateMedia_('image', p.mime, p.data);
  const settings = getSettings();
  const tz = settings.profile.timezone;
  const today = todayIso_(tz);
  const ai = callJson_('FAST', RUN_SYSTEM_, { tarea: 'Extrae los datos de la carrera del pantallazo' }, RUN_SCHEMA_, validateRunExtraction_,
    [{ inlineData: { mimeType: mime, data: p.data } }]);
  const r = sanitizeRun_(ai, today, (d) => offsetFor_(d, tz));
  return { fields: r.fields, rejected: r.rejected, warnings: r.warnings, date: r.date, startedAt: r.startedAt };
}

function commitRun_(input, tz, today) {
  requireDate_(input.date);
  const rec = Object.assign({}, input);
  rec.id = rec.id || makeId_('r', rec.date, tz);
  const errors = validateRun_(rec, today);
  if (errors.length) throw { code: 'VALIDATION', message: errors.join('; ') };
  return upsertShard_('runs', rec, sortByDateTime_, tz);
}

function runDelete(p) {
  requireDate_(p.date);
  if (typeof p.id !== 'string') throw { code: 'VALIDATION', message: 'id requerido' };
  const path = 'runs/' + p.date.slice(0, 7) + '.json';
  return withLock_(() => {
    const arr = readJson_(path, []);
    const next = arr.filter((r) => r.id !== p.id);
    if (next.length === arr.length) throw { code: 'NOT_FOUND', message: 'Carrera no encontrada' };
    writeFile_(path, next);
    return { revision: bumpRevision_() };
  });
}

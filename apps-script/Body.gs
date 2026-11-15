/**
 * Medidas corporales con cinta (PLAN 6.4). Catálogo, validación, extracción por voz y fusión de registros.
 * Funciones puras salvo bodyExtract. Claves: neck, shoulders, chest, waist, hip y, por lado (L/R),
 * arm, forearm, thigh, calf.
 */

const MEASURES_ = [
  { key: 'neck', min: 25, max: 60 }, { key: 'shoulders', min: 80, max: 170 }, { key: 'chest', min: 60, max: 170 },
  { key: 'waist', min: 50, max: 170 }, { key: 'hip', min: 60, max: 180 },
  { key: 'armL', min: 15, max: 70 }, { key: 'armR', min: 15, max: 70 },
  { key: 'forearmL', min: 15, max: 50 }, { key: 'forearmR', min: 15, max: 50 },
  { key: 'thighL', min: 30, max: 100 }, { key: 'thighR', min: 30, max: 100 },
  { key: 'calfL', min: 20, max: 65 }, { key: 'calfR', min: 20, max: 65 }
];
const MEASURE_KEYS_ = MEASURES_.map((m) => m.key);
const MEASURE_PARTS_ = ['neck', 'shoulders', 'chest', 'waist', 'hip', 'arm', 'forearm', 'thigh', 'calf'];
const PAIRED_PARTS_ = ['arm', 'forearm', 'thigh', 'calf'];
const SUSPICIOUS_PCT_ = 10;

function measureDef_(key) { return MEASURES_.find((m) => m.key === key) || null; }

/** Errores de un objeto { clave: cm }. Solo claves conocidas y dentro de rango. */
function validateMeasurements_(m) {
  const e = [];
  if (m === null || m === undefined) return e;
  if (typeof m !== 'object' || Array.isArray(m)) return ['measurementsCm debe ser un objeto'];
  Object.keys(m).forEach((k) => {
    const d = measureDef_(k);
    if (!d) { e.push('medida desconocida: ' + k); return; }
    if (!isNum_(m[k]) || m[k] < d.min || m[k] > d.max) e.push(k + ' fuera de rango (' + d.min + '-' + d.max + ' cm)');
  });
  return e;
}

/** Un registro por día: los campos nuevos sustituyen a los antiguos y las medidas se fusionan clave a clave. */
function mergeBody_(prev, input) {
  const out = Object.assign({}, prev || {}, input);
  if ((prev && prev.measurementsCm) || input.measurementsCm) {
    out.measurementsCm = Object.assign({}, (prev && prev.measurementsCm) || {}, input.measurementsCm || {});
  }
  return out;
}

/** Última medida conocida de cada clave: { clave: { value, date } }. `records` en cualquier orden. */
function latestMeasurements_(records) {
  const out = {};
  (records || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((r) => {
    Object.keys(r.measurementsCm || {}).forEach((k) => { out[k] = { value: r.measurementsCm[k], date: r.date }; });
  });
  return out;
}

/** Cambios sospechosos (más de un 10 %) respecto a la última medida: probable error de dictado o de cinta. */
function measurementChanges_(latest, next) {
  const out = [];
  Object.keys(next || {}).forEach((k) => {
    const p = latest[k];
    if (!p || !p.value) return;
    const pct = Math.round((next[k] - p.value) / p.value * 1000) / 10;
    if (Math.abs(pct) > SUSPICIOUS_PCT_) out.push({ key: k, prev: p.value, next: next[k], pct: pct });
  });
  return out;
}

// ---------- Extracción por voz ----------

const BODY_SCHEMA_ = { type: 'OBJECT', properties: {
  transcript: { type: 'STRING' },
  items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
    part: { type: 'STRING' }, side: { type: 'STRING', nullable: true }, valueCm: { type: 'NUMBER' } }, required: ['part', 'valueCm'] } },
  weightKg: { type: 'NUMBER', nullable: true }
}, required: ['transcript', 'items'] };

const BODY_SYSTEM_ = 'Recibes el audio de una persona que dicta medidas corporales tomadas con cinta métrica, en español. ' +
  'Transcríbelo en "transcript" y extrae cada medida en "items" con "part", "side" y "valueCm". ' +
  'Partes ("part"): neck (cuello), shoulders (hombros), chest (pecho o torso), waist (cintura), hip (cadera o glúteos), ' +
  'arm (bíceps o brazo), forearm (antebrazo), thigh (muslo), calf (gemelo o pantorrilla). ' +
  '"side": left (izquierdo), right (derecho), both (si dice "ambos" o "los dos"), o null si no lo dice o la parte no tiene lado. ' +
  'Los valores van en centímetros: "treinta y ocho coma cinco" es 38.5; si los da en milímetros, conviértelos. ' +
  'Si dicta el peso corporal en kilos, ponlo en "weightKg". Solo extrae lo que se dice: no inventes ni completes medidas. ' +
  'Responde solo con el JSON pedido.';

function validateBodyExtraction_(o) {
  const e = [];
  if (!o || typeof o.transcript !== 'string') return ['falta transcript'];
  if (!Array.isArray(o.items)) return ['items debe ser una lista'];
  if (o.items.length > 30) e.push('demasiadas medidas');
  o.items.forEach((it, i) => {
    if (MEASURE_PARTS_.indexOf(it.part) < 0) e.push('medida ' + (i + 1) + ': parte desconocida');
    if (it.side !== null && it.side !== undefined && ['left', 'right', 'both'].indexOf(it.side) < 0) e.push('medida ' + (i + 1) + ': lado inválido');
    if (!isNum_(it.valueCm)) e.push('medida ' + (i + 1) + ': valor inválido');
  });
  if (o.weightKg !== null && o.weightKg !== undefined && !isNum_(o.weightKg)) e.push('weightKg inválido');
  return e;
}

/** De lo que dijo la IA a { measurements, weightKg, rejected }. Nada fuera de rango o ambiguo se guarda. */
function sanitizeExtraction_(ai) {
  const measurements = {};
  const rejected = [];
  (ai.items || []).forEach((it) => {
    const value = Math.round(it.valueCm * 10) / 10;
    let keys;
    if (PAIRED_PARTS_.indexOf(it.part) >= 0) {
      if (it.side === 'left') keys = [it.part + 'L'];
      else if (it.side === 'right') keys = [it.part + 'R'];
      else if (it.side === 'both') keys = [it.part + 'L', it.part + 'R'];
      else { rejected.push({ part: it.part, valueCm: value, reason: 'missing_side' }); return; }
    } else {
      keys = [it.part];
    }
    keys.forEach((k) => {
      const d = measureDef_(k);
      if (value < d.min || value > d.max) rejected.push({ part: k, valueCm: value, reason: 'out_of_range' });
      else measurements[k] = value;
    });
  });
  let weightKg = null;
  if (isNum_(ai.weightKg)) {
    if (ai.weightKg >= 20 && ai.weightKg <= 400) weightKg = Math.round(ai.weightKg * 10) / 10;
    else rejected.push({ part: 'weightKg', valueCm: ai.weightKg, reason: 'out_of_range' });
  }
  return { measurements: measurements, weightKg: weightKg, rejected: rejected };
}

/** Dictado de medidas: audio → medidas propuestas. No guarda nada: el usuario revisa y confirma. */
function bodyExtract(p) {
  const mime = validateMedia_('audio', p.mime, p.data);
  const ai = callJson_('FAST', BODY_SYSTEM_, { tarea: 'Extrae las medidas dictadas en el audio' }, BODY_SCHEMA_, validateBodyExtraction_,
    [{ inlineData: { mimeType: mime, data: p.data } }]);
  const res = sanitizeExtraction_(ai);
  const latest = latestMeasurements_(readJson_('body.json', []));
  return { transcript: ai.transcript.slice(0, 2000), measurements: res.measurements, weightKg: res.weightKg, rejected: res.rejected,
    previous: latest, suspicious: measurementChanges_(latest, res.measurements) };
}

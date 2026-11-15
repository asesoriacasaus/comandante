/**
 * Exportar e importar datos (PLAN 11, Fase 5). Formato JSON propio con versión.
 * La importación valida cada registro con los mismos validadores que el guardado normal
 * y fusiona por id: nunca borra lo que ya existe.
 */

const EXPORT_FORMAT_ = 'comandante-export';
const EXPORT_VERSION_ = 1;
const IMPORT_MAX_RECORDS_ = 20000;

function monthOf_(rec) { return String(rec.date || '').slice(0, 7); }

/** Agrupa registros por mes: { '2026-11': [...] }. */
function groupByMonth_(records) {
  const out = {};
  (records || []).forEach((r) => { if (!r || typeof r !== 'object') return; const m = monthOf_(r); if (/^\d{4}-\d{2}$/.test(m)) (out[m] = out[m] || []).push(r); });
  return out;
}

/** Fusiona `incoming` en `existing` por `key`. Lo que ya existe con el mismo id se sustituye por lo importado. */
function mergeById_(existing, incoming, key) {
  const map = {};
  (existing || []).forEach((r) => { map[r[key]] = r; });
  (incoming || []).forEach((r) => { map[r[key]] = r; });
  return Object.keys(map).map((k) => map[k]);
}

function buildExport_(parts) {
  return { format: EXPORT_FORMAT_, version: EXPORT_VERSION_, exportedAt: new Date().toISOString(),
    settings: parts.settings, plan: parts.plan || null, body: parts.body || [],
    sessions: groupByMonth_(parts.sessions), runs: groupByMonth_(parts.runs), meals: groupByMonth_(parts.meals) };
}

/** Todos los registros de un objeto { 'AAAA-MM': [...] } en una lista plana. */
function flatten_(byMonth) {
  const out = [];
  Object.keys(byMonth || {}).forEach((m) => (Array.isArray(byMonth[m]) ? byMonth[m] : []).forEach((r) => out.push(r)));
  return out;
}

/** Errores que impiden importar. Cada registro se valida como si se guardara ahora. */
function validateImport_(data, today, equipment) {
  const e = [];
  if (!data || typeof data !== 'object' || data.format !== EXPORT_FORMAT_) return ['El archivo no es una exportación de Comandante'];
  if (data.version !== EXPORT_VERSION_) return ['Versión de exportación no compatible: ' + data.version];
  const sessions = flatten_(data.sessions); const runs = flatten_(data.runs); const meals = flatten_(data.meals);
  const body = Array.isArray(data.body) ? data.body : [];
  if (sessions.length + runs.length + meals.length + body.length > IMPORT_MAX_RECORDS_) return ['Demasiados registros'];
  const dup = (list, key, label) => { const seen = {}; list.forEach((r) => { if (!r || typeof r !== 'object') return; if (seen[r[key]]) e.push(label + ' repetido: ' + r[key]); seen[r[key]] = 1; }); };
  const wrap = (label, list, fn) => list.forEach((r, i) => { if (!r || typeof r !== 'object') { e.push(label + ' ' + (i + 1) + ': registro inválido'); return; }
    fn(r).slice(0, 2).forEach((m) => e.push(label + ' ' + (r.id || r.date || i + 1) + ': ' + m)); });
  wrap('Sesión', sessions, (r) => (SESSION_ID_RE_.test(String(r.id)) ? validateSession_(r, today, equipment) : ['id inválido']));
  wrap('Carrera', runs, (r) => (r.id ? validateRun_(r, today) : ['id requerido']));
  wrap('Comida', meals, (r) => validateMeal_(r, today));
  wrap('Cuerpo', body, (r) => validateBody_(r, today));
  [['Sesión', data.sessions], ['Carrera', data.runs], ['Comida', data.meals]].forEach(([label, byMonth]) => {
    Object.keys(byMonth || {}).forEach((m) => {
      if (!Array.isArray(byMonth[m])) { e.push(label + ': el mes ' + m + ' no es una lista'); return; }
      byMonth[m].forEach((r) => { if (r && typeof r === 'object' && monthOf_(r) !== m) e.push(label + ' ' + (r.id || '?') + ': está en el mes ' + m + ' pero su fecha es ' + r.date); });
    });
  });
  dup(sessions, 'id', 'Sesión'); dup(runs, 'id', 'Carrera'); dup(meals, 'id', 'Comida'); dup(body, 'date', 'Cuerpo');
  if (data.settings && validateSettings_(deepMerge_(defaultSettings_(), data.settings)).length) e.push('Ajustes inválidos');
  return e.slice(0, 20);
}

// ---------- Acciones con Drive ----------

function listShards_(dir) {
  const out = [];
  const files = folder_(dir).getFiles();
  while (files.hasNext()) { const f = files.next(); if (/^\d{4}-\d{2}\.json$/.test(f.getName())) out.push(f.getName().replace('.json', '')); }
  return out.sort();
}

function exportAll() {
  const load = (dir) => { const all = []; listShards_(dir).forEach((m) => readJson_(dir + '/' + m + '.json', []).forEach((r) => all.push(r))); return all; };
  return buildExport_({ settings: getSettings(), plan: readPlan_(), body: readJson_('body.json', []), sessions: load('sessions'), runs: load('runs'), meals: load('meals') });
}

function importAll(p) {
  const data = p && p.data;
  const settings = getSettings();
  const today = todayIso_(settings.profile.timezone);
  const errors = validateImport_(data, today, settings.equipment);
  if (errors.length) throw { code: 'VALIDATION', message: errors.join(' | ') };
  let counts = { sessions: 0, runs: 0, meals: 0, body: 0 };
  withLock_(() => {
    [['sessions', data.sessions], ['runs', data.runs], ['meals', data.meals]].forEach(([dir, byMonth]) => {
      Object.keys(byMonth || {}).forEach((m) => {
        if (!/^\d{4}-\d{2}$/.test(m) || !Array.isArray(byMonth[m])) return;
        const path = dir + '/' + m + '.json';
        const merged = mergeById_(readJson_(path, []), byMonth[m], 'id').sort(sortByDateTime_);
        writeFile_(path, merged);
        counts[dir] += byMonth[m].length;
      });
    });
    if (Array.isArray(data.body) && data.body.length) {
      writeFile_('body.json', mergeById_(readJson_('body.json', []), data.body, 'date').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)));
      counts.body = data.body.length;
    }
    bumpRevision_();
  });
  return counts;
}

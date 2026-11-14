/**
 * Persistencia JSON en Google Drive (carpeta GymAppData) con sharding mensual.
 * Escrituras bajo LockService. Upsert por id: reenviar el mismo registro no duplica.
 */

const ROOT_NAME_ = 'GymAppData';
const BACKUP_KEEP_ = 7;

// ---------- Drive: lectura y escritura de bajo nivel ----------

function rootFolder_() {
  const it = DriveApp.getFoldersByName(ROOT_NAME_);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_NAME_);
}

function folder_(sub) {
  let cur = rootFolder_();
  if (!sub) return cur;
  sub.split('/').forEach((p) => {
    const it = cur.getFoldersByName(p);
    cur = it.hasNext() ? it.next() : cur.createFolder(p);
  });
  return cur;
}

function fileExists_(path) {
  const parts = path.split('/');
  const name = parts.pop();
  return folder_(parts.join('/')).getFilesByName(name).hasNext();
}

function readJson_(path, fallback) {
  const parts = path.split('/');
  const name = parts.pop();
  const it = folder_(parts.join('/')).getFilesByName(name);
  if (!it.hasNext()) return fallback;
  try {
    return JSON.parse(it.next().getBlob().getDataAsString());
  } catch (_) {
    // No devolver fallback: sobrescribir un archivo corrupto borraría datos.
    throw { code: 'STORAGE', message: 'Archivo corrupto, revisar en Drive: ' + path };
  }
}

/** Escritura sin lock. Usar siempre dentro de withLock_. */
function writeFile_(path, obj) {
  const payload = JSON.stringify(obj);
  if (payload === undefined) throw { code: 'INTERNAL', message: 'No se puede serializar ' + path };
  JSON.parse(payload); // validación de round-trip antes de escribir
  const parts = path.split('/');
  const name = parts.pop();
  const dir = folder_(parts.join('/'));
  const it = dir.getFilesByName(name);
  if (it.hasNext()) it.next().setContent(payload);
  else dir.createFile(name, payload, 'application/json');
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw { code: 'STORAGE', message: 'Almacenamiento ocupado, reintenta' };
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function bumpRevision_() {
  const meta = readJson_('meta.json', { schemaVersion: 1, lastRevision: 0, updatedAt: null });
  meta.lastRevision = (meta.lastRevision || 0) + 1;
  meta.updatedAt = new Date().toISOString();
  writeFile_('meta.json', meta);
  return meta.lastRevision;
}

// ---------- Utilidades puras ----------

function todayIso_(tz) {
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

function makeId_(prefix, date, tz) {
  const day = String(date).replace(/-/g, '');
  const hm = Utilities.formatDate(new Date(), tz, 'HHmm');
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return prefix + '_' + day + '_' + hm + '_' + rand;
}

/** Lista de claves 'YYYY-MM' entre dos fechas ISO inclusive. */
function monthsBetween_(from, to) {
  const out = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(y + '-' + String(m).padStart(2, '0'));
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Día de la semana en minúsculas, independiente de la zona horaria del script. */
function weekdayName_(date) {
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const [y, m, d] = date.split('-').map(Number);
  return names[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Mezcla profunda de objetos. Los arrays y escalares del parche sustituyen. */
function deepMerge_(base, patch) {
  const out = Object.assign({}, base);
  Object.keys(patch).forEach((k) => {
    const pv = patch[k];
    const bv = out[k];
    const plain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
    out[k] = plain(pv) && plain(bv) ? deepMerge_(bv, pv) : pv;
  });
  return out;
}

/** Métricas de sesión: volumen, series de trabajo, duración y distancia. */
function computeSessionMetrics_(s) {
  let totalVolumeKg = 0;
  let workingSets = 0;

  (s.exercises || []).forEach((ex) => {
    const isBodyweight = ex.kind === 'bodyweight' || s.type === 'bodyweight';
    const factor = typeof ex.bodyweightFactor === 'number' ? ex.bodyweightFactor : 1;
    const bw = Number(ex.bodyweightKg) || 0;
    const added = Number(ex.addedWeightKg) || 0;
    (ex.sets || []).forEach((set) => {
      if (set.type === 'working') workingSets++;
      const reps = Number(set.reps) || 0;
      if (isBodyweight) {
        totalVolumeKg += reps * (bw * factor + added);
      } else {
        totalVolumeKg += reps * (Number(set.weightKg) || 0);
      }
    });
  });

  let distanceM = 0;
  (s.cardio || []).forEach((c) => { distanceM += Number(c.distanceM) || 0; });

  let durationMin = null;
  if (s.startedAt && s.endedAt) {
    const ms = Date.parse(s.endedAt) - Date.parse(s.startedAt);
    if (ms >= 0) durationMin = Math.round(ms / 60000);
  }

  return {
    totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
    workingSets: workingSets,
    durationMin: durationMin,
    distanceKm: Math.round((distanceM / 1000) * 100) / 100,
    activeKcalEstimate: null
  };
}

function sortByDateTime_(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ta = a.startedAt || a.time || '';
  const tb = b.startedAt || b.time || '';
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

// ---------- Ajustes y valores por defecto ----------

function defaultSettings_() {
  return {
    schemaVersion: 1,
    profile: { name: '', sex: 'male', birthYear: null, heightCm: null, timezone: 'Europe/Madrid', voiceLang: 'es-ES' },
    units: { weight: 'kg', distance: 'km', length: 'cm' },
    goal: {
      type: 'recomp', targetWeightKg: null, rateKgPerWeek: 0, targetKcal: null,
      targetProteinG: null, targetCarbsG: null, targetFatG: null, trainingDaysPerWeek: null
    },
    experience: 'intermediate',
    injuries: [],
    activePlanId: null
  };
}

function getSettings() {
  return readJson_('settings.json', defaultSettings_());
}

function updateSettings(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw { code: 'VALIDATION', message: 'patch requerido' };
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'schemaVersion')) {
    throw { code: 'VALIDATION', message: 'schemaVersion no es editable' };
  }
  return withLock_(() => {
    const merged = deepMerge_(getSettings(), patch);
    const errors = validateSettings_(merged);
    if (errors.length) throw { code: 'VALIDATION', message: errors.join('; ') };
    writeFile_('settings.json', merged);
    bumpRevision_();
    return merged;
  });
}

// ---------- Commit (upsert) ----------

function requireDate_(date) {
  if (!isIsoDate_(date)) throw { code: 'VALIDATION', message: 'date debe tener formato YYYY-MM-DD' };
}

function commitRecord(entity, record) {
  if (!record || typeof record !== 'object') throw { code: 'VALIDATION', message: 'record requerido' };
  const tz = getSettings().profile.timezone;
  const today = todayIso_(tz);
  switch (entity) {
    case 'session': return commitSession_(record, tz, today);
    case 'meal': return commitMeal_(record, tz, today);
    case 'body': return commitBody_(record, today);
    default: throw { code: 'VALIDATION', message: 'entidad desconocida: ' + entity };
  }
}

function commitSession_(input, tz, today) {
  requireDate_(input.date);
  const rec = Object.assign({}, input);
  rec.id = rec.id || makeId_('s', rec.date, tz);
  const errors = validateSession_(rec, today);
  if (errors.length) throw { code: 'VALIDATION', message: errors.join('; ') };
  rec.metrics = computeSessionMetrics_(rec);
  return upsertShard_('sessions', rec, sortByDateTime_, tz);
}

function commitMeal_(input, tz, today) {
  requireDate_(input.date);
  const rec = Object.assign({}, input);
  rec.id = rec.id || makeId_('m', rec.date, tz);
  const errors = validateMeal_(rec, today);
  if (errors.length) throw { code: 'VALIDATION', message: errors.join('; ') };
  // Los totales se recalculan siempre desde los ítems (fuente de verdad).
  const sum = (k) => rec.items.reduce((acc, it) => acc + (Number(it[k]) || 0), 0);
  rec.totals = {
    kcal: Math.round(sum('kcal') * 10) / 10,
    proteinG: Math.round(sum('proteinG') * 10) / 10,
    carbsG: Math.round(sum('carbsG') * 10) / 10,
    fatG: Math.round(sum('fatG') * 10) / 10,
    fiberG: Math.round(sum('fiberG') * 10) / 10
  };
  return upsertShard_('meals', rec, sortByDateTime_, tz);
}

function upsertShard_(dir, rec, sortFn, tz) {
  const path = dir + '/' + rec.date.slice(0, 7) + '.json';
  return withLock_(() => {
    const arr = readJson_(path, []);
    const idx = arr.findIndex((x) => x.id === rec.id);
    if (idx >= 0) arr[idx] = rec;
    else arr.push(rec);
    arr.sort(sortFn);
    writeFile_(path, arr);
    const revision = bumpRevision_();
    maybeBackup_(tz);
    return { id: rec.id, revision: revision, updated: idx >= 0 };
  });
}

function commitBody_(input, today) {
  requireDate_(input.date);
  const errors = validateBody_(input, today);
  if (errors.length) throw { code: 'VALIDATION', message: errors.join('; ') };
  return withLock_(() => {
    const arr = readJson_('body.json', []);
    const idx = arr.findIndex((x) => x.date === input.date);
    // Un check-in por día: los campos nuevos sustituyen a los anteriores del mismo día.
    if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], input);
    else arr.push(input);
    arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    writeFile_('body.json', arr);
    const revision = bumpRevision_();
    return { id: input.date, revision: revision, updated: idx >= 0 };
  });
}

// ---------- Consulta y día ----------

function queryRecords(p) {
  const entity = p.entity;
  const from = p.from;
  const to = p.to;
  requireDate_(from);
  requireDate_(to);
  const filters = p.filters || {};

  const inRange = (item) => item.date >= from && item.date <= to;
  const matchesFilters = (item) => Object.keys(filters).every((k) => {
    if (item[k] === filters[k]) return true;
    const ids = []
      .concat(item.exercises || [], item.cardio || [])
      .map((x) => x.exerciseId);
    return k === 'exerciseId' && ids.indexOf(filters[k]) >= 0;
  });

  let items;
  if (entity === 'body') {
    items = readJson_('body.json', []).filter(inRange);
  } else if (entity === 'session' || entity === 'meal') {
    const dir = entity === 'session' ? 'sessions' : 'meals';
    items = [];
    monthsBetween_(from, to).forEach((ym) => {
      readJson_(dir + '/' + ym + '.json', []).forEach((x) => items.push(x));
    });
    items = items.filter(inRange);
  } else {
    throw { code: 'VALIDATION', message: 'entity inválida: ' + entity };
  }

  return { items: items.filter(matchesFilters) };
}

function getDay(date) {
  requireDate_(date);
  const settings = getSettings();
  const ym = date.slice(0, 7);
  const sessions = readJson_('sessions/' + ym + '.json', []).filter((s) => s.date === date);
  const meals = readJson_('meals/' + ym + '.json', []).filter((m) => m.date === date);
  const body = readJson_('body.json', []).find((b) => b.date === date) || null;
  const plans = readJson_('plans.json', { plans: [] }).plans || [];
  const activePlan = plans.find((pl) => pl.id === settings.activePlanId) || null;

  // Solo modo weekday en esta fase. Rotación se resuelve en el Hito 5.
  let planDay = null;
  if (activePlan && activePlan.mode === 'weekday' && activePlan.days) {
    planDay = activePlan.days[weekdayName_(date)] || null;
  }
  return { date: date, sessions: sessions, meals: meals, body: body, plan: planDay };
}

// ---------- Copias de seguridad y setup ----------

function maybeBackup_(tz) {
  const today = todayIso_(tz);
  const name = 'backups/' + today + '.json';
  if (fileExists_(name)) return;
  const month = today.slice(0, 7);
  writeFile_(name, {
    date: today,
    settings: getSettings(),
    plans: readJson_('plans.json', { plans: [] }),
    body: readJson_('body.json', []),
    sessions: readJson_('sessions/' + month + '.json', []),
    meals: readJson_('meals/' + month + '.json', [])
  });
  pruneBackups_(BACKUP_KEEP_);
}

function pruneBackups_(keep) {
  const names = [];
  const files = folder_('backups').getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f.getName())) names.push(f);
  }
  names.sort((a, b) => (a.getName() < b.getName() ? 1 : -1));
  names.slice(keep).forEach((f) => f.setTrashed(true));
}

function ensureFile_(path, obj) {
  if (!fileExists_(path)) writeFile_(path, obj);
}

/** Ejecutar una vez desde el editor. Crea la estructura de GymAppData. */
function setup() {
  withLock_(() => {
    folder_('sessions');
    folder_('meals');
    folder_('backups');
    ensureFile_('settings.json', defaultSettings_());
    ensureFile_('plans.json', { plans: [] });
    ensureFile_('exercises-user.json', []);
    ensureFile_('body.json', []);
    ensureFile_('meta.json', { schemaVersion: 1, lastRevision: 0, updatedAt: new Date().toISOString() });
  });
  const token = PropertiesService.getScriptProperties().getProperty('APP_TOKEN') || '';
  if (token.length < 32) Logger.log('AVISO: define APP_TOKEN (mínimo 32 caracteres) en Propiedades del script.');
  Logger.log('GymAppData lista: ' + rootFolder_().getUrl());
}

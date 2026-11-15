/**
 * Persistencia JSON en Google Drive (carpeta ComandanteData) con sharding mensual.
 * Escrituras bajo LockService. Upsert por id: reenviar el mismo registro no duplica.
 */

const ROOT_NAME_ = 'ComandanteData';
const LEGACY_ROOT_NAME_ = 'GymAppData';
const BACKUP_KEEP_ = 7;

// ---------- Caché (CacheService) ----------
// Buscar carpetas y archivos por nombre en Drive cuesta 0,2 s o más cada vez. Se guardan en la caché del script:
// los identificadores de carpetas y archivos y el contenido de los JSON pequeños. Toda escritura de esta capa
// actualiza la caché, así que lo leído nunca es más antiguo que lo último guardado por la propia app.
const CACHE_TTL_SEC_ = 21600;       // 6 h, el máximo de CacheService
const CACHE_MAX_BYTES_ = 90000;     // el límite de CacheService es 100 KB por valor
const CACHE_NONE_ = '\u0000none';   // el archivo no existe (se cachea para no volver a buscarlo)

function cacheKey_(kind, path) { return kind + ':' + path; }
function utf8Len_(s) { return unescape(encodeURIComponent(String(s))).length; }
function cacheable_(payload) { return typeof payload === 'string' && utf8Len_(payload) <= CACHE_MAX_BYTES_; }

function cacheGet_(key) {
  try { return CacheService.getScriptCache().get(key); } catch (_) { return null; }
}
function cachePut_(key, value) {
  try { CacheService.getScriptCache().put(key, value, CACHE_TTL_SEC_); } catch (_) { /* la caché es opcional */ }
}
function cacheRemove_(key) {
  try { CacheService.getScriptCache().remove(key); } catch (_) { /* la caché es opcional */ }
}

/** Olvida lo que se sabe de un archivo (úsalo si lo editas a mano en Drive). */
function invalidatePath_(path) {
  ['c', 'id:file'].forEach((k) => cacheRemove_(cacheKey_(k, path)));
}

/** Ejecutar desde el editor si editas a mano algún archivo de ComandanteData. */
function clearDataCache() {
  CacheService.getScriptCache().removeAll(['id:root', 'id:dir:', 'id:dir:sessions', 'id:dir:runs', 'id:dir:meals', 'id:dir:plan', 'id:dir:plan/history', 'id:dir:media', 'id:dir:backups',
    'c:settings.json', 'c:meta.json', 'c:body.json', 'c:plan/current.json', 'c:exercises.json']);
  Logger.log('Caché de datos limpiada para los archivos principales. Los de cada mes caducan solos a las 6 h.');
}

// ---------- Drive: lectura y escritura de bajo nivel ----------

function findRootFolder_() {
  const it = DriveApp.getFoldersByName(ROOT_NAME_);
  if (it.hasNext()) return it.next();
  // Migración de nombre: la carpeta antigua se renombra, no se copia ni se borra nada.
  const old = DriveApp.getFoldersByName(LEGACY_ROOT_NAME_);
  if (old.hasNext()) {
    const f = old.next();
    f.setName(ROOT_NAME_);
    return f;
  }
  return DriveApp.createFolder(ROOT_NAME_);
}

function rootFolder_() {
  const key = cacheKey_('id', 'root');
  const id = cacheGet_(key);
  if (id) { try { return DriveApp.getFolderById(id); } catch (_) { cacheRemove_(key); } }
  const f = findRootFolder_();
  cachePut_(key, f.getId());
  return f;
}

function folder_(sub) {
  if (!sub) return rootFolder_();
  const key = cacheKey_('id:dir', sub);
  const id = cacheGet_(key);
  if (id) { try { return DriveApp.getFolderById(id); } catch (_) { cacheRemove_(key); } }
  let cur = rootFolder_();
  sub.split('/').forEach((p) => {
    const it = cur.getFoldersByName(p);
    cur = it.hasNext() ? it.next() : cur.createFolder(p);
  });
  cachePut_(key, cur.getId());
  return cur;
}

/** Archivo por ruta, o null. Usa el identificador cacheado cuando lo hay. */
function findFile_(path) {
  const key = cacheKey_('id:file', path);
  const id = cacheGet_(key);
  if (id) { try { return DriveApp.getFileById(id); } catch (_) { cacheRemove_(key); } }
  const parts = path.split('/');
  const name = parts.pop();
  const it = folder_(parts.join('/')).getFilesByName(name);
  if (!it.hasNext()) return null;
  const f = it.next();
  cachePut_(key, f.getId());
  return f;
}

function fileExists_(path) {
  const hit = cacheGet_(cacheKey_('c', path));
  if (hit !== null) return hit !== CACHE_NONE_;
  return findFile_(path) !== null;
}

function readJson_(path, fallback) {
  const ckey = cacheKey_('c', path);
  const hit = cacheGet_(ckey);
  if (hit === CACHE_NONE_) return fallback;
  if (hit !== null) {
    try { return JSON.parse(hit); } catch (_) { cacheRemove_(ckey); }
  }
  const file = findFile_(path);
  if (!file) { cachePut_(ckey, CACHE_NONE_); return fallback; }
  const text = file.getBlob().getDataAsString();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    // No devolver fallback: sobrescribir un archivo corrupto borraría datos.
    throw { code: 'STORAGE', message: 'Archivo corrupto, revisar en Drive: ' + path };
  }
  if (cacheable_(text)) cachePut_(ckey, text);
  return parsed;
}

/** Escritura sin lock. Usar siempre dentro de withLock_. */
function writeFile_(path, obj) {
  const payload = JSON.stringify(obj);
  if (payload === undefined) throw { code: 'INTERNAL', message: 'No se puede serializar ' + path };
  JSON.parse(payload); // validación de round-trip antes de escribir
  const file = findFile_(path);
  if (file) {
    file.setContent(payload);
  } else {
    const parts = path.split('/');
    const name = parts.pop();
    const created = folder_(parts.join('/')).createFile(name, payload, 'application/json');
    cachePut_(cacheKey_('id:file', path), created.getId());
  }
  if (cacheable_(payload)) cachePut_(cacheKey_('c', path), payload);
  else cacheRemove_(cacheKey_('c', path));
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

/**
 * Contador de revisión. Antes se escribía en meta.json en cada cambio (una escritura de Drive de ~0,4 s por serie)
 * y la app nunca lo leía; ahora vive en la caché del script.
 */
function bumpRevision_() {
  const n = (Number(cacheGet_('rev')) || 0) + 1;
  cachePut_('rev', String(n));
  return n;
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

/**
 * Métricas de sesión: volumen, series efectivas (no calentamiento), series por grupo
 * (primario cuenta 1, secundario 0,5) y duración. `opts.bodyweightKg` para peso corporal.
 */
function computeSessionMetrics_(s, opts) {
  opts = opts || {};
  const library = opts.library || exerciseSeed_();
  let totalVolumeKg = 0;
  let workingSets = 0;
  const setsByGroup = {};

  (s.exercises || []).forEach((ex) => {
    const def = findExercise_(ex.exerciseId || ex.name, library);
    (ex.sets || []).forEach((set) => {
      if (set.type === 'warmup') return;
      workingSets++;
      totalVolumeKg += setVolume_(set, opts.bodyweightKg, def && def.bodyweightFactor);
      if (def) {
        def.primary.forEach((g) => { setsByGroup[g] = (setsByGroup[g] || 0) + 1; });
        def.secondary.forEach((g) => { setsByGroup[g] = (setsByGroup[g] || 0) + 0.5; });
      }
    });
  });

  let durationMin = null;
  if (s.startedAt && s.endedAt) {
    const ms = Date.parse(s.endedAt) - Date.parse(s.startedAt);
    if (ms >= 0) durationMin = Math.round(ms / 60000);
  }

  return {
    totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
    workingSets: workingSets,
    durationMin: durationMin,
    setsByGroup: setsByGroup
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
    schemaVersion: 2,
    profile: { sex: null, birthYear: null, heightCm: null, timezone: 'Europe/Madrid' },
    goal: { type: 'recomp', startDate: '2026-11-14', targetDate: '2027-05-14',
            startWeightKg: null, targetWeightKg: null, startWaistCm: null },
    equipment: { barbellKg: 20, ezBarKg: 10, dumbbellStepKg: 2, plateMinKg: 1.25, stackStepKg: 5 },
    training: { daysPerWeek: [3, 4], groupsPerSession: [1, 2], runsPerWeek: [1, 2], sessionMinutes: 75, useRir: true },
    strength: { experience: 'advanced', referenceExerciseId: 'press_banca', referenceReps: 10, referenceTotalKg: null },
    nutrition: { proteinGPerKg: 2.0, kcalStrategy: 'maintenance_minus_10', activityFactor: 1.55, fatGPerKg: 0.9, kcalAdjust: 0 },
    coach: { persona: 'comandante', intensity: 'alta' },
    notifications: { email: null, weekly: true, weeklyAt: 'domingo 19:00', reminder: true,
                     reminderAt: '07:30', reminderAfterRestDays: 2 }
  };
}

/** Un settings.json de una versión anterior se sustituye por los valores por defecto (solo se conserva la zona horaria). */
function getSettings() {
  const stored = readJson_('settings.json', null);
  if (stored && stored.schemaVersion === 2) return deepMerge_(defaultSettings_(), stored);
  const base = defaultSettings_();
  if (stored && stored.profile && typeof stored.profile.timezone === 'string') base.profile.timezone = stored.profile.timezone;
  return base;
}

/** ¿Están rellenos los datos de la pantalla de bienvenida? */
function isOnboarded_(s) {
  const p = s.profile; const g = s.goal;
  return [p.sex, p.birthYear, p.heightCm, g.startWeightKg, g.targetWeightKg, g.startWaistCm, (s.strength || {}).referenceTotalKg].every((v) => v !== null && v !== undefined);
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
    case 'run': return commitRun_(record, tz, today);
    default: throw { code: 'VALIDATION', message: 'entidad desconocida: ' + entity };
  }
}

/** Último peso registrado; si no hay, el de partida de los ajustes. */
function latestBodyweight_(settings) {
  const arr = readJson_('body.json', []);
  for (let i = arr.length - 1; i >= 0; i--) if (typeof arr[i].weightKg === 'number') return arr[i].weightKg;
  return (settings.goal && settings.goal.startWeightKg) || null;
}

function commitSession_(input, tz, today) {
  requireDate_(input.date);
  const rec = Object.assign({}, input);
  rec.id = rec.id || makeId_('s', rec.date, tz);
  const settings = getSettings();
  const errors = validateSession_(rec, today, settings.equipment);
  if (errors.length) throw { code: 'VALIDATION', message: errors.join('; ') };
  rec.metrics = computeSessionMetrics_(rec, { bodyweightKg: latestBodyweight_(settings) });
  return upsertShard_('sessions', rec, sortByDateTime_, tz);
}

function commitMeal_(input, tz, today) {
  requireDate_(input.date);
  const rec = Object.assign({}, input);
  rec.id = rec.id || makeId_('m', rec.date, tz);
  const errors = validateMeal_(rec, today);
  if (errors.length) throw { code: 'VALIDATION', message: errors.join('; ') };
  // Los totales se recalculan siempre desde los ítems (fuente de verdad): macros y micronutrientes.
  rec.totals = sumMeals_([rec]);
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
    if (idx >= 0) arr[idx] = mergeBody_(arr[idx], input);
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
  } else if (entity === 'session' || entity === 'meal' || entity === 'run') {
    const dir = entity === 'session' ? 'sessions' : entity === 'meal' ? 'meals' : 'runs';
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
    plan: readJson_('plan/current.json', null),
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

/** Ejecutar una vez desde el editor. Crea la estructura de ComandanteData. */
function setup() {
  clearDataCache();
  withLock_(() => {
    ['sessions', 'runs', 'meals', 'plan', 'plan/history', 'media', 'backups'].forEach(folder_);
    ensureFile_('settings.json', defaultSettings_());
    ensureFile_('exercises.json', []);
    ensureFile_('body.json', []);
    ensureFile_('meta.json', { schemaVersion: 2, lastRevision: 0, updatedAt: new Date().toISOString() });
  });
  const token = PropertiesService.getScriptProperties().getProperty('APP_TOKEN') || '';
  if (token.length < 32) Logger.log('AVISO: define APP_TOKEN (mínimo 32 caracteres) en Propiedades del script.');
  Logger.log('ComandanteData lista: ' + rootFolder_().getUrl());
}

/**
 * Ahorro de IA (PLAN 7.5). Tres piezas:
 *  - Caché de respuestas idénticas (6 h): un reintento, la misma foto o el mismo texto no vuelven a gastar tokens.
 *  - Contador del mes: llamadas hechas por tipo de modelo y llamadas ahorradas por cada vía, para enseñarlo en Ajustes.
 *  - Las reglas locales viven en cada módulo (comidas conocidas, catálogo de suplementos, banco de frases).
 */

/** Clave de una petición: modelo + instrucciones + datos + adjuntos. null si no se puede calcular (por ejemplo, en los tests). */
function aiCacheKey_(tier, system, data, parts) {
  try {
    const raw = [tier, geminiModel_(tier), system, data].concat((parts || []).map((p) => (p.inlineData ? p.inlineData.mimeType + ':' + p.inlineData.data : p.text || ''))).join('\u0001');
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
    return 'ai/' + bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
  } catch (_) { return null; }
}

function aiCacheGet_(key) {
  if (!key) return null;
  const hit = cacheReadContent_(key);
  if (!hit || hit === CACHE_NONE_) return null;
  try { return JSON.parse(hit); } catch (_) { return null; }
}

function aiCachePut_(key, obj) {
  if (key) cacheWriteContent_(key, JSON.stringify(obj));
}

// ---------- Contador del mes ----------

const AI_USO_KEY_ = 'AI_USO';

/** Suma `n` a una cuenta del mes en curso. tipo: 'llamada' o 'ahorro'; clave: el modelo o la vía de ahorro. Nunca rompe la acción. */
function aiCount_(tipo, clave, n) {
  try {
    const props = PropertiesService.getScriptProperties();
    const mes = new Date().toISOString().slice(0, 7);
    let u = null;
    try { u = JSON.parse(props.getProperty(AI_USO_KEY_) || 'null'); } catch (_) { u = null; }
    u = aiUsoSumar_(u, mes, tipo, clave, n || 1);
    props.setProperty(AI_USO_KEY_, JSON.stringify(u));
  } catch (_) { /* contar es secundario */ }
}

/** Pura: { mes, llamadas: {…}, ahorros: {…}, anterior } con el mes nuevo empezando de cero y el anterior guardado. */
function aiUsoSumar_(u, mes, tipo, clave, n) {
  if (!u || u.mes !== mes) u = { mes: mes, llamadas: {}, ahorros: {}, anterior: u && u.mes ? { mes: u.mes, llamadas: u.llamadas, ahorros: u.ahorros } : null };
  const grupo = tipo === 'ahorro' ? u.ahorros : u.llamadas;
  grupo[clave] = (grupo[clave] || 0) + n;
  return u;
}

/** Para Ajustes: el uso del mes (las cuentas que hace el móvil por su cuenta se suman allí). */
function aiUsage() {
  let u = null;
  try { u = JSON.parse(PropertiesService.getScriptProperties().getProperty(AI_USO_KEY_) || 'null'); } catch (_) { u = null; }
  return { uso: u };
}

// ---------- Banco de frases del Comandante ----------
// En lugar de pedir a la IA dos mensajes por sesión (inicio y cierre), se le piden de una vez muchas frases cortas con la
// personalidad, sin datos concretos, y se guardan en Drive. Cada mensaje = una frase del banco + los datos reales, que pone
// el código (el texto neutro de siempre). El banco se rehace si cambia la personalidad o la intensidad, o a los 45 días.

const FRASES_PATH_ = 'ai/frases.json';
const FRASES_DIAS_ = 45;
const FRASES_GRUPOS_ = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'];
const FRASES_CIERRE_ = ['completa', 'incompleta', 'molestia'];

function frasesSchema_() {
  const lista = { type: 'ARRAY', items: { type: 'STRING' } };
  const props = (keys) => keys.reduce((o, k) => { o[k] = lista; return o; }, {});
  return { type: 'OBJECT', properties: {
    inicio: { type: 'OBJECT', properties: props(FRASES_GRUPOS_), required: FRASES_GRUPOS_ },
    cierre: { type: 'OBJECT', properties: props(FRASES_CIERRE_), required: FRASES_CIERRE_ }
  }, required: ['inicio', 'cierre'] };
}

const FRASES_TAREA_ = 'Escribe frases sueltas para reutilizar muchos días. Cada frase: una sola oración de 6 a 22 palabras, con tu ' +
  'personalidad, SIN cifras, cargas, series, nombres de ejercicios ni fechas (los datos los añade la app detrás). ' +
  '"inicio": para cada grupo muscular, 4 frases distintas de arenga para empezar una sesión que lo trabaja, mencionando el grupo. ' +
  '"cierre": 5 frases para cerrar una sesión "completa", 5 para una "incompleta" (quedó algo sin hacer, sin reñir) y 5 para una con ' +
  '"molestia" (prudencia: escuchar al cuerpo, bajar o parar). Varía el vocabulario entre frases.';

/** Pura: el banco sirve si tiene frases en todas las categorías. */
function validateFrases_(o) {
  const e = [];
  const ok = (arr) => Array.isArray(arr) && arr.filter((x) => typeof x === 'string' && x.trim().length >= 10 && x.length <= 260).length >= 2;
  if (!o || !o.inicio || !o.cierre) return ['faltan inicio o cierre'];
  FRASES_GRUPOS_.forEach((g) => { if (!ok(o.inicio[g])) e.push('inicio.' + g); });
  FRASES_CIERRE_.forEach((c) => { if (!ok(o.cierre[c])) e.push('cierre.' + c); });
  return e;
}

/** Pura: ¿hay que rehacer el banco? */
function frasesCaducadas_(banco, firma, hoyIso) {
  if (!banco || banco.firma !== firma || !banco.creado) return true;
  return daysBetween_(String(banco.creado).slice(0, 10), hoyIso) >= FRASES_DIAS_;
}

/**
 * Pura: siguiente frase de una lista, rotando sin repetir hasta agotarla. Devuelve { frase, uso } con el contador actualizado.
 * Las frases se limpian (sin rayas largas, una sola línea) por si la IA se salta las instrucciones.
 */
function siguienteFrase_(lista, uso, clave) {
  const limpias = (lista || []).map((x) => String(x).replace(/\s+/g, ' ').replace(/—/g, ',').trim()).filter((x) => x.length >= 10);
  if (!limpias.length) return { frase: null, uso: uso || {} };
  const u = Object.assign({}, uso || {});
  const i = (u[clave] || 0) % limpias.length;
  u[clave] = (u[clave] || 0) + 1;
  return { frase: limpias[i], uso: u };
}

function firmaPersona_(persona, intensity) {
  try {
    const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(persona || '') + '|' + intensity, Utilities.Charset.UTF_8);
    return b.slice(0, 8).map((x) => ((x + 256) % 256).toString(16).padStart(2, '0')).join('');
  } catch (_) { return String(intensity); }
}

/** El banco vigente: el guardado si sirve; si no, uno nuevo con UNA llamada. null si no hay personalidad o falla la IA. */
function bancoFrases_(settings) {
  const persona = PropertiesService.getScriptProperties().getProperty('PERSONA_PROMPT') || '';
  if (!persona.trim()) return null;   // sin personalidad, el texto neutro basta y no se gasta nada
  const firma = firmaPersona_(persona, settings.coach.intensity);
  const hoy = todayIso_(settings.profile.timezone);
  const banco = readJson_(FRASES_PATH_, null);
  if (!frasesCaducadas_(banco, firma, hoy)) return banco;
  try {
    const ai = callJson_('FAST', buildCoachSystem_(persona, settings.coach.intensity), { tarea: FRASES_TAREA_ }, frasesSchema_(), validateFrases_);
    const nuevo = { firma: firma, creado: new Date().toISOString(), inicio: ai.inicio, cierre: ai.cierre, uso: {} };
    withLock_(() => writeFile_(FRASES_PATH_, nuevo));
    return nuevo;
  } catch (err) {
    console.error('bancoFrases_ ' + (err && err.code ? err.code : 'error'));
    return banco && banco.inicio ? banco : null;   // mejor una frase antigua que ninguna
  }
}

/** Una frase del banco para un tipo y una clave (grupo o resultado). null si no hay banco. */
function fraseDelBanco_(settings, tipo, clave) {
  const banco = bancoFrases_(settings);
  if (!banco || !banco[tipo]) return null;
  const r = siguienteFrase_(banco[tipo][clave], banco.uso, tipo + ':' + clave);
  if (!r.frase) return null;
  try { withLock_(() => { const b = readJson_(FRASES_PATH_, null); if (b) { b.uso = r.uso; writeFile_(FRASES_PATH_, b); } }); } catch (_) { /* la rotación es secundaria */ }
  aiCount_('ahorro', 'frases');
  return r.frase;
}

/** Pura: resultado de una sesión para elegir la frase de cierre. */
function resultadoSesion_(review, painCount) {
  if (painCount > 0 || (review.issues || []).some((i) => i.type === 'pain')) return 'molestia';
  return (review.missing || []).length ? 'incompleta' : 'completa';
}

/** Modo de los mensajes: 'ahorro' (banco de frases + datos; por defecto) o 'ia' (un mensaje a medida por sesión). */
function mensajesAhorro_(settings) { return ((settings.coach || {}).messages || 'ahorro') !== 'ia'; }

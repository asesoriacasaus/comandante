/**
 * Autenticación por token compartido (APP_TOKEN en Script Properties),
 * límite por token y bloqueo global por fallos (PLAN 5.2).
 */

const AUTH_FAIL_LIMIT_ = 20;       // fallos por hora antes de bloquear
const AUTH_BLOCK_SEC_ = 15 * 60;   // duración del bloqueo

function checkToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN') || '';
  if (expected.length < 32) {
    console.error('APP_TOKEN ausente o demasiado corto (mínimo 32 caracteres)');
    return false;
  }
  if (typeof token !== 'string') return false;
  return constantTimeEquals_(token, expected);
}

/** Comparación en tiempo constante: recorre siempre la longitud máxima. */
function constantTimeEquals_(a, b) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ca = a.charCodeAt(i) || 0;
    const cb = b.charCodeAt(i) || 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

function checkRate_(token) {
  const minute = Math.floor(Date.now() / 60000);
  const key = 'rl:' + hashToken_(String(token)) + ':' + minute;
  const cache = CacheService.getScriptCache();
  const current = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(current), 120);
  return current <= CONFIG.RATE_LIMIT_PER_MIN;
}

/** Hash del token para no usar el token en claves de caché. */
function hashToken_(token) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token);
  return Utilities.base64EncodeWebSafe(bytes).slice(0, 16);
}

// ---------- Bloqueo global por fallos ----------

/** ¿Hay un bloqueo activo? `cache` y `nowMs` se inyectan para poder probarlo. */
function isAuthBlocked_(cache, nowMs) {
  const until = Number(cache.get('auth:block') || 0);
  return until > nowMs;
}

/**
 * Registra un token incorrecto. Devuelve { blocked, justBlocked }.
 * El contador es por hora natural; no es atómico, pero basta para frenar un ataque.
 */
function registerAuthFailure_(cache, nowMs) {
  const hour = Math.floor(nowMs / 3600000);
  const key = 'auth:fail:' + hour;
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 3700);
  if (count > AUTH_FAIL_LIMIT_ && !isAuthBlocked_(cache, nowMs)) {
    cache.put('auth:block', String(nowMs + AUTH_BLOCK_SEC_ * 1000), AUTH_BLOCK_SEC_);
    cache.put(key, '0', 3700); // al volver a abrirse, cuenta desde cero
    return { blocked: true, justBlocked: true };
  }
  return { blocked: isAuthBlocked_(cache, nowMs), justBlocked: false };
}

function alertOwnerBlocked_() {
  try {
    MailApp.sendEmail(
      Session.getEffectiveUser().getEmail(),
      'Comandante: autenticación bloqueada 15 minutos',
      'Se han detectado más de ' + AUTH_FAIL_LIMIT_ + ' tokens incorrectos en una hora. ' +
      'La autenticación queda bloqueada 15 minutos. Si no has sido tú, rota el APP_TOKEN.'
    );
  } catch (err) {
    console.error('No se pudo enviar la alerta de bloqueo');
  }
}

/** Puerta de entrada: devuelve null si pasa, o el código de error. */
function authGate_(token) {
  const cache = CacheService.getScriptCache();
  const now = Date.now();
  if (isAuthBlocked_(cache, now)) return 'LOCKED';
  if (!checkToken_(token)) {
    const r = registerAuthFailure_(cache, now);
    if (r.justBlocked) alertOwnerBlocked_();
    return r.blocked ? 'LOCKED' : 'AUTH';
  }
  if (!checkRate_(token)) return 'RATE_LIMIT';
  return null;
}

/**
 * Autenticación por token compartido (APP_TOKEN en Script Properties)
 * y rate limit por minuto usando CacheService.
 */

function checkToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN') || '';
  if (expected.length < 32) {
    console.error('APP_TOKEN ausente o demasiado corto (mínimo 32 caracteres)');
    return false;
  }
  if (typeof token !== 'string') return false;
  return constantTimeEquals_(token, expected);
}

/**
 * Comparación en tiempo constante: recorre siempre la longitud máxima
 * y acumula diferencias con XOR. No corta en el primer carácter distinto.
 */
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

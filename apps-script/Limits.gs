/** Límites de tamaño y listas blancas (PLAN 5.2). Funciones puras. */

const LIMITS_ = {
  TEXT_CHARS: 2000,
  AUDIO_BYTES: 2 * 1024 * 1024,
  IMAGE_BYTES: 4 * 1024 * 1024,
  BODY_BYTES: 6 * 1024 * 1024
};

const AUDIO_MIMES_ = ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg',
  'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/flac'];
const IMAGE_MIMES_ = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];

/** "audio/mp4;codecs=mp4a.40.2" → "audio/mp4". */
function baseMime_(mime) {
  return String(mime || '').split(';')[0].trim().toLowerCase();
}

/** Bytes reales de un base64 (sin decodificarlo). */
function base64Bytes_(b64) {
  const s = String(b64 || '');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.floor(s.length * 3 / 4) - pad;
}

function checkBodySize_(rawLength) {
  if (rawLength > LIMITS_.BODY_BYTES) throw { code: 'TOO_LARGE', message: 'Petición demasiado grande (máx. 6 MB)' };
}

function validateText_(text) {
  const t = String(text == null ? '' : text);
  if (t.length > LIMITS_.TEXT_CHARS) throw { code: 'TOO_LARGE', message: 'Texto demasiado largo (máx. 2.000 caracteres)' };
  return t;
}

/** Valida un adjunto { mime, data(base64) }. kind: 'audio' | 'image'. Devuelve el MIME limpio. */
function validateMedia_(kind, mime, data) {
  const list = kind === 'audio' ? AUDIO_MIMES_ : IMAGE_MIMES_;
  const max = kind === 'audio' ? LIMITS_.AUDIO_BYTES : LIMITS_.IMAGE_BYTES;
  const m = baseMime_(mime);
  if (list.indexOf(m) < 0) throw { code: 'VALIDATION', message: 'Tipo de archivo no permitido: ' + m };
  if (typeof data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(data) || data.length < 16) {
    throw { code: 'VALIDATION', message: 'Datos de archivo inválidos' };
  }
  if (base64Bytes_(data) > max) {
    throw { code: 'TOO_LARGE', message: kind === 'audio' ? 'Audio demasiado grande (máx. 2 MB)' : 'Imagen demasiado grande (máx. 4 MB)' };
  }
  return m;
}

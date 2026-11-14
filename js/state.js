// Configuración del cliente en localStorage. Solo URL del Web App y token.
const KEYS = { apiUrl: 'gym.apiUrl', token: 'gym.token' };

function read(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch (err) {
    console.error('localStorage no disponible', err);
    return '';
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.error('No se pudo guardar en localStorage', err);
  }
}

export function getConfig() {
  return { apiUrl: read(KEYS.apiUrl), token: read(KEYS.token) };
}

export function saveConfig({ apiUrl, token }) {
  write(KEYS.apiUrl, String(apiUrl || '').trim());
  write(KEYS.token, String(token || '').trim());
}

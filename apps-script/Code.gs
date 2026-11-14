/**
 * Punto de entrada del Web App. Todas las peticiones llegan como POST text/plain
 * con cuerpo JSON: { action, token, payload }. Siempre responde HTTP 200.
 */
const CONFIG = { VERSION: '0.1.0', RATE_LIMIT_PER_MIN: 60 };

function doPost(e) {
  const t0 = Date.now();
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (_) {
    return json_({ ok: false, error: { code: 'VALIDATION', message: 'JSON inválido' } });
  }

  if (!checkToken_(body.token)) {
    return json_({ ok: false, error: { code: 'AUTH', message: 'Token inválido' } });
  }
  if (!checkRate_(body.token)) {
    return json_({ ok: false, error: { code: 'RATE_LIMIT', message: 'Demasiadas peticiones' } });
  }

  const payload = body.payload || {};

  // Acciones del Hito 1. parse, analysis, range, etc. se añaden en sus hitos.
  const handlers = {
    ping: () => ({ version: CONFIG.VERSION, time: new Date().toISOString() }),
    commit: () => commitRecord(payload.entity, payload.record),
    query: () => queryRecords(payload),
    day: () => getDay(payload.date),
    'settings.get': () => getSettings(),
    'settings.update': () => updateSettings(payload.patch),
    parse: () => parseUtterance(payload)
  };

  const action = String(body.action || '');
  if (!Object.prototype.hasOwnProperty.call(handlers, action)) {
    return json_({ ok: false, error: { code: 'VALIDATION', message: 'action desconocida' } });
  }

  try {
    const data = handlers[action]();
    return json_({ ok: true, action: action, data: data, meta: { ms: Date.now() - t0 } });
  } catch (err) {
    console.error(err);
    return json_({
      ok: false,
      error: { code: err.code || 'INTERNAL', message: String(err.message || err) }
    });
  }
}

/** Health check manual desde el navegador. El frontend usa doPost. */
function doGet() {
  return json_({ ok: true, data: { health: 'ok', version: CONFIG.VERSION } });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

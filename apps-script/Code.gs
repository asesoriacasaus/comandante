/**
 * Punto de entrada del Web App. Todas las peticiones llegan como POST text/plain
 * con cuerpo JSON: { action, token, payload }. Siempre responde HTTP 200.
 */
const CONFIG = { VERSION: '0.3.0', RATE_LIMIT_PER_MIN: 60 };

function doPost(e) {
  const t0 = Date.now();
  const raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
  try {
    checkBodySize_(raw.length);
  } catch (err) {
    return json_({ ok: false, error: { code: err.code, message: err.message } });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch (_) {
    return json_({ ok: false, error: { code: 'VALIDATION', message: 'JSON inválido' } });
  }
  if (!body || typeof body !== 'object') {
    return json_({ ok: false, error: { code: 'VALIDATION', message: 'JSON inválido' } });
  }

  const denied = authGate_(body.token);
  if (denied) {
    const msg = { AUTH: 'Token inválido', LOCKED: 'Acceso bloqueado temporalmente', RATE_LIMIT: 'Demasiadas peticiones' }[denied];
    return json_({ ok: false, error: { code: denied, message: msg } });
  }

  const payload = body.payload || {};
  const handlers = {
    ping: () => ({ version: CONFIG.VERSION, time: new Date().toISOString() }),
    'ping.ai': () => pingAi(),
    'ai.models': () => ({ models: listGeminiModels_() }),
    'ai.probe': () => aiProbe(payload),
    'plan.state': () => planState(),
    'plan.cycle.propose': () => proposeCycle(),
    'plan.cycle.accept': () => acceptCycle(payload.cycle),
    'plan.today': () => planToday(),
    commit: () => commitRecord(payload.entity, payload.record),
    query: () => queryRecords(payload),
    day: () => getDay(payload.date),
    'settings.get': () => getSettings(),
    'settings.update': () => updateSettings(payload.patch)
  };

  const action = String(body.action || '');
  if (!Object.prototype.hasOwnProperty.call(handlers, action)) {
    return json_({ ok: false, error: { code: 'VALIDATION', message: 'action desconocida' } });
  }

  try {
    const data = handlers[action]();
    // Solo código y tiempo en logs: nunca audio, transcripciones ni datos de salud.
    console.log(action + ' ok ' + (Date.now() - t0) + 'ms');
    return json_({ ok: true, action: action, data: data, meta: { ms: Date.now() - t0 } });
  } catch (err) {
    console.error(action + ' error ' + (err && err.code ? err.code : 'INTERNAL'));
    return json_({
      ok: false,
      error: { code: (err && err.code) || 'INTERNAL', message: err && err.code ? String(err.message) : 'Error interno' }
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

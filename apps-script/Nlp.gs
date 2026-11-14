/**
 * Interpretación de texto por voz: DeepSeek + validación + una reparación.
 * Devuelve el contrato de §6.2 o lanza VALIDATION (el frontend cae al formulario).
 */

const NLP_MAX_TEXT_ = 1000;

function parseUtterance(payload) {
  payload = payload || {};
  const text = String(payload.text || '').trim().slice(0, NLP_MAX_TEXT_);
  if (!text) throw { code: 'VALIDATION', message: 'El texto está vacío' };

  const ctx = payload.context || {};
  const timezone = ctx.timezone || getSettings().profile.timezone;
  const date = isIsoDate_(ctx.date) ? ctx.date : todayIso_(timezone);

  // El texto del usuario solo entra aquí, en el mensaje user.
  const userMessage = 'Contexto: fechaActual=' + date + ', timezone=' + timezone +
    '\nTexto: ' + JSON.stringify(text);
  const messages = buildParseMessages_(userMessage);
  const opts = { temperature: 0.2, max_tokens: 1200 };

  let res = callDeepSeek_(messages, opts);
  let parsed = safeJsonParse_(res.content);
  let check = validParseResponse_(parsed);

  if (!check.valid) {
    messages.push({ role: 'assistant', content: res.content });
    messages.push({ role: 'user', content: buildRepairPrompt_(check.errors) });
    res = callDeepSeek_(messages, opts);
    parsed = safeJsonParse_(res.content);
    check = validParseResponse_(parsed);
    if (!check.valid) {
      console.error('Parse fallido tras reparación: ' + check.errors.join('; '));
      throw { code: 'VALIDATION', message: 'No se pudo interpretar el texto' };
    }
  }
  return parsed;
}

function safeJsonParse_(content) {
  const cleaned = String(content || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    return null;
  }
}

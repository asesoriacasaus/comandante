/**
 * Cliente de DeepSeek. La API key vive solo en Script Properties (DEEPSEEK_API_KEY).
 * Modelo deepseek-chat (no reasoner: latencia alta y response_format inconsistente).
 */

const DEEPSEEK_URL_ = 'https://api.deepseek.com/chat/completions';

function callDeepSeek_(messages, opts) {
  opts = opts || {};
  const key = PropertiesService.getScriptProperties().getProperty('DEEPSEEK_API_KEY');
  if (!key) throw { code: 'DEEPSEEK', message: 'DEEPSEEK_API_KEY no configurada' };

  const res = UrlFetchApp.fetch(DEEPSEEK_URL_, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      model: opts.model || 'deepseek-chat',
      messages: messages,
      temperature: opts.temperature === undefined ? 0.2 : opts.temperature,
      max_tokens: opts.max_tokens || 1200,
      response_format: { type: 'json_object' }
    })
  });

  const status = res.getResponseCode();
  if (status >= 300) {
    throw { code: 'DEEPSEEK', message: 'HTTP ' + status + ': ' + res.getContentText().slice(0, 300) };
  }
  const body = JSON.parse(res.getContentText());
  const content = body.choices && body.choices[0] && body.choices[0].message &&
    body.choices[0].message.content;
  if (!content) throw { code: 'DEEPSEEK', message: 'Respuesta vacía de DeepSeek' };
  return { content: content, usage: body.usage };
}

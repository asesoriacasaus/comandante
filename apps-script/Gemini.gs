/**
 * Cliente de Gemini. Clave y modelos viven solo en Propiedades del script:
 * GEMINI_API_KEY, GEMINI_MODEL_FAST, GEMINI_MODEL_SMART.
 */

const GEMINI_BASE_ = 'https://generativelanguage.googleapis.com/v1beta/';

function geminiKey_() {
  const k = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!k) throw { code: 'AI_CONFIG', message: 'Falta GEMINI_API_KEY en las Propiedades del script' };
  return k;
}

function geminiModel_(tier) {
  const name = tier === 'SMART' ? 'GEMINI_MODEL_SMART' : 'GEMINI_MODEL_FAST';
  const m = PropertiesService.getScriptProperties().getProperty(name);
  if (!m) throw { code: 'AI_CONFIG', message: 'Falta ' + name + ' en las Propiedades del script' };
  return m;
}

/** Cuerpo de generateContent. Puro: se prueba en Node. */
function buildGeminiRequest_(system, parts, opts) {
  opts = opts || {};
  const gen = { temperature: opts.temperature === undefined ? 0.2 : opts.temperature };
  if (opts.schema) {
    gen.responseMimeType = 'application/json';
    gen.responseSchema = opts.schema;
  }
  const body = { contents: [{ role: 'user', parts: parts }], generationConfig: gen };
  // Las instrucciones van solo aquí; el texto del usuario nunca se mezcla con ellas.
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  return body;
}

/** Extrae el texto de la respuesta o lanza un error con código. Puro. */
function parseGeminiResponse_(body) {
  if (body && body.promptFeedback && body.promptFeedback.blockReason) {
    throw { code: 'AI_BLOCKED', message: 'La IA ha bloqueado la petición (' + body.promptFeedback.blockReason + ')' };
  }
  const cand = body && body.candidates && body.candidates[0];
  if (!cand) throw { code: 'AI_EMPTY', message: 'Respuesta vacía de la IA' };
  const parts = (cand.content && cand.content.parts) || [];
  const text = parts.map((p) => p.text || '').join('');
  if (!text) {
    if (cand.finishReason && cand.finishReason !== 'STOP') {
      throw { code: 'AI_BLOCKED', message: 'La IA no ha respondido (' + cand.finishReason + ')' };
    }
    throw { code: 'AI_EMPTY', message: 'Respuesta vacía de la IA' };
  }
  return { text: text, usage: body.usageMetadata || null, finishReason: cand.finishReason || null };
}

/** tier: 'FAST' | 'SMART'. Un reintento ante 429/5xx. Los errores no incluyen el cuerpo de la respuesta. */
function callGemini_(tier, system, parts, opts) {
  const model = geminiModel_(tier);
  const req = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': geminiKey_() },
    muteHttpExceptions: true,
    payload: JSON.stringify(buildGeminiRequest_(system, parts, opts))
  };
  const url = GEMINI_BASE_ + 'models/' + encodeURIComponent(model) + ':generateContent';
  let res = UrlFetchApp.fetch(url, req);
  let status = res.getResponseCode();
  if (status === 429 || status >= 500) {
    Utilities.sleep(1500);
    res = UrlFetchApp.fetch(url, req);
    status = res.getResponseCode();
  }
  if (status >= 300) {
    console.error('Gemini HTTP ' + status);
    throw { code: 'AI_HTTP', status: status, message: 'La IA ha devuelto el error HTTP ' + status };
  }
  const out = parseGeminiResponse_(JSON.parse(res.getContentText()));
  out.model = model;
  return out;
}

/** Lista de modelos disponibles para la clave: sirve para elegir los identificadores. */
function listGeminiModels_() {
  const res = UrlFetchApp.fetch(GEMINI_BASE_ + 'models?pageSize=200', {
    headers: { 'x-goog-api-key': geminiKey_() }, muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw { code: 'AI_HTTP', message: 'HTTP ' + res.getResponseCode() };
  return (JSON.parse(res.getContentText()).models || [])
    .filter((m) => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
    .map((m) => String(m.name).replace(/^models\//, ''));
}

// ---------- Acciones de la Fase 0 ----------

function pingAi() {
  const t0 = Date.now();
  const r = callGemini_('FAST', 'Responde solo con JSON.', [{ text: 'Devuelve {"ok":true}' }], {
    schema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] }
  });
  return { ok: true, model: r.model, ms: Date.now() - t0 };
}

const PROBE_SCHEMAS_ = {
  audio: { type: 'OBJECT', properties: {
    transcript: { type: 'STRING' }, summary: { type: 'STRING' }
  }, required: ['transcript', 'summary'] },
  image: { type: 'OBJECT', properties: {
    kind: { type: 'STRING' }, fields: { type: 'STRING' }
  }, required: ['kind', 'fields'] }
};
const PROBE_PROMPTS_ = {
  audio: 'Transcribe el audio en español y resume en una frase qué ejercicio, carga, repeticiones y RIR menciona.',
  image: 'Di si el pantallazo es de una carrera o de una báscula y lista cada campo con su valor, uno por línea.'
};

/** Prueba de riesgo (PLAN 12): audio o pantallazo → Gemini. Si audio/mp4 falla, reintenta como audio/aac. */
function aiProbe(p) {
  const kind = p && p.kind === 'image' ? 'image' : 'audio';
  const mime = validateMedia_(kind, p.mime, p.data);
  const t0 = Date.now();
  const run = (m) => callGemini_('FAST', 'Eres un asistente de pruebas técnicas. Responde solo JSON.',
    [{ text: PROBE_PROMPTS_[kind] }, { inlineData: { mimeType: m, data: p.data } }],
    { schema: PROBE_SCHEMAS_[kind] });
  let usedMime = mime;
  let r;
  try {
    r = run(mime);
  } catch (err) {
    if (kind === 'audio' && err.code === 'AI_HTTP' && err.status === 400 && mime !== 'audio/aac') {
      usedMime = 'audio/aac';
      r = run(usedMime);
    } else throw err;
  }
  let result = null;
  try { result = JSON.parse(r.text); } catch (_) { /* se devuelve en bruto */ }
  return { kind: kind, bytes: base64Bytes_(p.data), usedMime: usedMime, model: r.model,
    ms: Date.now() - t0, result: result, raw: result ? null : r.text.slice(0, 500) };
}

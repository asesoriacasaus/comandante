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
  const name = tier === 'SMART' ? 'GEMINI_MODEL_SMART' : tier === 'TTS' ? 'GEMINI_MODEL_TTS' : 'GEMINI_MODEL_FAST';
  const m = cleanModelName_(PropertiesService.getScriptProperties().getProperty(name));
  if (!m) throw { code: 'AI_CONFIG', message: 'Falta ' + name + ' en las Propiedades del script' };
  return m;
}

/** Tolera espacios, saltos de línea, comillas y el prefijo "models/" al pegar el identificador. */
function cleanModelName_(raw) {
  return String(raw == null ? '' : raw).trim().replace(/^["']+|["']+$/g, '').trim().replace(/^models\//, '');
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
  return callGeminiBody_(tier, buildGeminiRequest_(system, parts, opts));
}

/** Llamada a generateContent con un cuerpo ya construido (por ejemplo, una conversación de varios turnos). */
function callGeminiBody_(tier, body) {
  const model = geminiModel_(tier);
  const req = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': geminiKey_() },
    muteHttpExceptions: true,
    payload: JSON.stringify(body)
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
    console.error('Gemini HTTP ' + status + ' modelo=' + model);
    // El nombre del modelo no es secreto y ayuda a diagnosticar (404 = modelo mal escrito).
    throw { code: 'AI_HTTP', status: status, message: 'La IA ha devuelto el error HTTP ' + status + ' con el modelo "' + model + '"' };
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

// ---------- Voz del Comandante (síntesis de voz) ----------

const TTS_VOICES_ = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus',
  'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima',
  'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'];
const TTS_DEFAULT_VOICE_ = 'Orus';
const TTS_MAX_CHARS_ = 1200;
// Voz original: se pide un acento y una manera de decir, nunca la voz de una persona concreta.
// Los modelos de voz leen TODO lo que reciben: las indicaciones de estilo van separadas de la transcripción
// con la estructura que documenta Google ("notas del director" y "transcripción"), y existe un modo sin estilo de respaldo.
const TTS_STYLES_ = ['director', 'prefix', 'none'];
const TTS_DIRECTOR_ = '# AUDIO PROFILE: The Orator\n' +
  'A charismatic, passionate public speaker, speaking directly to one listener.\n\n' +
  "### DIRECTOR'S NOTES\n" +
  'Style: passionate, warm and combative orator. Energetic, with rhythmic phrasing and dramatic pauses. Clear, never shouting.\n' +
  'Accent: Venezuelan Spanish (Caribbean).\n' +
  'Pace: lively, with emphasis on exclamations.\n' +
  'Read only the transcript below, exactly as written. Do not read these notes aloud.\n\n' +
  '#### TRANSCRIPT\n';
const TTS_PREFIX_ = 'Say in a passionate, charismatic orator voice with a Venezuelan accent, energetic and rhythmic: ';

function ttsStyle_(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return TTS_STYLES_.indexOf(v) >= 0 ? v : 'director';
}

/** Texto que se envía al modelo de voz según el modo de estilo. */
function ttsPrompt_(text, style) {
  const s = ttsStyle_(style);
  return s === 'none' ? text : s === 'prefix' ? TTS_PREFIX_ + text : TTS_DIRECTOR_ + text;
}

/**
 * ¿Dura demasiado para lo que dice el texto? Señal de que el modelo ha leído también las indicaciones.
 * Un orador lento llega a ~2 palabras por segundo; por debajo de 1,3 más 4 s de margen algo sobra.
 */
function ttsLooksWrong_(seconds, text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return words > 0 && seconds > words / 1.3 + 4;
}

function ttsSeconds_(audio) {
  const m = /rate=(\d{4,6})/.exec(audio.mime);
  return base64Bytes_(audio.data) / ((m ? Number(m[1]) : 24000) * 2);
}

/** Voz de la Propiedad TTS_VOICE si está en la lista de voces; si no, la de por defecto. */
function ttsVoice_(raw) {
  const v = String(raw || '').trim();
  return TTS_VOICES_.indexOf(v) >= 0 ? v : TTS_DEFAULT_VOICE_;
}

function buildTtsRequest_(text, voice, style) {
  return { contents: [{ role: 'user', parts: [{ text: ttsPrompt_(text, style) }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: ttsVoice_(voice) } } } } };
}

/** Audio de la respuesta: { mime, data(base64) }. */
function parseGeminiAudio_(body) {
  if (body && body.promptFeedback && body.promptFeedback.blockReason) {
    throw { code: 'AI_BLOCKED', message: 'La IA ha bloqueado la petición (' + body.promptFeedback.blockReason + ')' };
  }
  const cand = body && body.candidates && body.candidates[0];
  const parts = (cand && cand.content && cand.content.parts) || [];
  const audio = parts.find((x) => x.inlineData && x.inlineData.data);
  if (!audio) throw { code: 'AI_EMPTY', message: 'La IA no ha devuelto audio' };
  return { mime: String(audio.inlineData.mimeType || 'audio/L16;codec=pcm;rate=24000'), data: audio.inlineData.data };
}

/** Una llamada al modelo de voz. Devuelve { mime, data }. */
function ttsCall_(text, voice, style) {
  const model = geminiModel_('TTS');
  const url = GEMINI_BASE_ + 'models/' + encodeURIComponent(model) + ':generateContent';
  const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': geminiKey_() },
    muteHttpExceptions: true, payload: JSON.stringify(buildTtsRequest_(text, voice, style)) });
  const status = res.getResponseCode();
  if (status >= 300) {
    console.error('TTS HTTP ' + status + ' modelo=' + model);
    throw { code: 'AI_HTTP', status: status, message: 'La IA ha devuelto el error HTTP ' + status + ' con el modelo "' + model + '"' };
  }
  return parseGeminiAudio_(JSON.parse(res.getContentText()));
}

/** Lee en voz alta un texto corto (los mensajes del Comandante). Si el audio sale demasiado largo, repite sin indicaciones de estilo. */
function ttsSpeak(p) {
  const text = validateText_(p && p.text).trim();
  if (!text) throw { code: 'VALIDATION', message: 'No hay texto que leer' };
  if (text.length > TTS_MAX_CHARS_) throw { code: 'TOO_LARGE', message: 'Texto demasiado largo para leerlo (máx. ' + TTS_MAX_CHARS_ + ' caracteres)' };
  const props = PropertiesService.getScriptProperties();
  const voice = ttsVoice_(props.getProperty('TTS_VOICE'));
  let style = ttsStyle_(props.getProperty('TTS_STYLE'));
  let out = ttsCall_(text, voice, style);
  if (style !== 'none' && ttsLooksWrong_(ttsSeconds_(out), text)) {
    console.error('TTS: audio demasiado largo con estilo ' + style + '; se repite sin estilo');
    style = 'none';
    out = ttsCall_(text, voice, style);
  }
  return { mime: out.mime, data: out.data, voice: voice, style: style };
}

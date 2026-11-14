// Pantalla de voz (Hito 2): dictado → parse → previsualización editable → commit.
import { call, ApiError } from '../api.js';
import { createRecognizer } from '../voice.js';
import { todayIso } from '../lib/dates.js';
import { toCommit, emptyDraft } from '../lib/records.js';

const INTENT_LABEL = {
  log_strength: 'Entreno de fuerza',
  log_bodyweight: 'Peso corporal',
  log_cardio: 'Cardio',
  log_meal: 'Comida',
  log_body: 'Peso y medidas'
};

const PENDING_INTENT = {
  query: 'Las consultas por voz llegan en el Hito 6.',
  plan_request: 'La creación de planes por voz llega en el Hito 5.',
  recommend: 'El coach de IA llega en el Hito 6.',
  unknown: 'No he entendido el texto. Prueba de nuevo o usa el formulario.'
};

const MANUAL_INTENTS = ['log_strength', 'log_bodyweight', 'log_cardio', 'log_meal', 'log_body'];

// Claves de datos que no se muestran en el editor.
const HIDDEN = new Set(['id', 'source', 'transcript', 'planId', 'planDayName', 'muscleMassSource',
  'exerciseId', 'kind', 'metrics', 'totals']);
// Claves numéricas: su input es type="number" aunque el valor sea null.
const NUM_KEYS = new Set(['reps', 'weightKg', 'rir', 'restSec', 'durationSec', 'distanceM', 'avgHr', 'maxHr',
  'rpe', 'kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'confidence', 'quantity', 'bodyFatPct',
  'muscleMassKg', 'addedWeightKg', 'bodyweightKg', 'waist', 'chest', 'armL', 'thighL']);
const LABELS = {
  date: 'Fecha', time: 'Hora', mealType: 'Comida', type: 'Tipo', exercises: 'Ejercicios', cardio: 'Cardio',
  name: 'Nombre', exerciseName: 'Ejercicio', sets: 'Series', reps: 'Repeticiones', weightKg: 'Peso (kg)',
  rir: 'RIR', restSec: 'Descanso (s)', durationSec: 'Duración (s)', distanceM: 'Distancia (m)',
  avgHr: 'FC media', zone: 'Zona', rpe: 'RPE', items: 'Alimentos', quantity: 'Cantidad', unit: 'Unidad',
  kcal: 'kcal', proteinG: 'Proteína (g)', carbsG: 'Hidratos (g)', fatG: 'Grasa (g)', fiberG: 'Fibra (g)',
  confidence: 'Confianza', bodyFatPct: '% grasa', muscleMassKg: 'Masa muscular (kg)',
  addedWeightKg: 'Lastre (kg)', bodyweightKg: 'Peso corporal (kg)', measurementsCm: 'Perímetros (cm)',
  notes: 'Notas', waist: 'Cintura', chest: 'Pecho', armL: 'Brazo', thighL: 'Muslo'
};

const S = {
  phase: 'idle',        // idle | listening | processing | preview | saved
  text: '',
  interim: '',
  notice: '',           // mensaje informativo
  error: '',
  settings: null,
  recognizer: null,
  draft: null,          // { entity, record }
  meta: null,           // { intent, confidence, warnings, missing_fields, clarification }
  manualIntent: 'log_meal',
  savedId: null
};

const esc = (v) => String(v === null || v === undefined ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- Árbol editable (genérico sobre el registro) ----------

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((o, k) => o[k], obj);
  parent[last] = value;
}

function renderLeaf(value, path, key, numeric) {
  const label = LABELS[key] || key;
  const isNum = numeric || typeof value === 'number';
  const shown = value === null || value === undefined ? '' : value;
  return `<label class="campo">${esc(label)}
    <input data-path="${esc(path)}" data-kind="${isNum ? 'number' : 'text'}"
      type="${isNum ? 'number' : 'text'}" ${isNum ? 'inputmode="decimal" step="any"' : ''}
      value="${esc(shown)}"></label>`;
}

function renderNode(value, path, key, numeric) {
  if (Array.isArray(value)) {
    const items = value.map((item, i) => `
      <fieldset class="bloque">
        <legend>${esc(LABELS[key] || key)} ${i + 1}
          <button type="button" class="btn-mini" data-remove="${esc(path + '.' + i)}">Quitar</button></legend>
        ${renderNode(item, path + '.' + i, '', false)}
      </fieldset>`).join('');
    return `${items}<button type="button" class="btn btn-sec" data-add="${esc(path)}">Añadir ${esc((LABELS[key] || key).toLowerCase())}</button>`;
  }
  if (value !== null && typeof value === 'object') {
    const rows = Object.keys(value)
      .filter((k) => !HIDDEN.has(k))
      .map((k) => renderNode(value[k], path ? path + '.' + k : k, k, numeric || key === 'measurementsCm'))
      .join('');
    return rows;
  }
  if (typeof value === 'string' && key === 'notes') {
    return `<label class="campo">Notas<textarea data-path="${esc(path)}" data-kind="text">${esc(value)}</textarea></label>`;
  }
  return renderLeaf(value, path, key, numeric || NUM_KEYS.has(key));
}

// ---------- Acciones ----------

function readInput(target) {
  const raw = target.value;
  if (target.dataset.kind === 'number') return raw === '' ? null : Number(raw);
  return raw === '' ? null : raw;
}

async function interpret(el, text) {
  S.phase = 'processing';
  S.error = '';
  S.notice = '';
  draw(el);
  try {
    if (!S.settings) S.settings = await call('settings.get');
    const tz = S.settings.profile.timezone || 'Europe/Madrid';
    const date = todayIso(tz);
    const parsed = await call('parse', {
      text,
      context: { date, timezone: tz, activePlanId: S.settings.activePlanId || null, lastSession: null }
    }, { timeoutMs: 30000 });

    if (!MANUAL_INTENTS.includes(parsed.intent)) {
      S.notice = PENDING_INTENT[parsed.intent] || PENDING_INTENT.unknown;
      if (parsed.clarification) S.notice += ' ' + parsed.clarification;
      S.phase = 'idle';
      draw(el);
      return;
    }

    let lastBodyweightKg = null;
    if (parsed.intent === 'log_bodyweight') {
      const from = shiftDays(date, -60);
      const q = await call('query', { entity: 'body', from, to: date });
      if (q.items.length) lastBodyweightKg = q.items[q.items.length - 1].weightKg;
    }

    const mapped = toCommit(parsed.intent, parsed.data, {
      date,
      transcript: text,
      profile: S.settings.profile,
      lastBodyweightKg
    });
    S.draft = mapped;
    S.meta = {
      intent: parsed.intent,
      confidence: parsed.confidence,
      warnings: parsed.warnings || [],
      missing_fields: parsed.missing_fields || [],
      clarification: parsed.clarification
    };
    S.phase = 'preview';
  } catch (err) {
    console.error(err);
    S.phase = 'idle';
    S.error = err instanceof ApiError && err.code === 'VALIDATION'
      ? 'No se pudo interpretar el texto. Usa el formulario manual.'
      : err.message;
  }
  draw(el);
}

function shiftDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function confirmSave(el) {
  S.phase = 'processing';
  S.error = '';
  draw(el);
  try {
    const res = await call('commit', { entity: S.draft.entity, record: S.draft.record });
    S.savedId = res.id;
    S.phase = 'saved';
  } catch (err) {
    console.error(err);
    S.error = err.message;
    S.phase = 'preview';
  }
  draw(el);
}

function toggleMic(el) {
  if (S.recognizer && S.phase === 'listening') {
    S.recognizer.stop();
    return;
  }
  const lang = (S.settings && S.settings.profile && S.settings.profile.voiceLang) || 'es-ES';
  S.recognizer = createRecognizer({
    lang,
    onPartial: (t) => { S.interim = t; draw(el); },
    onFinal: (t) => {
      S.text = t || S.text;
      S.interim = '';
      S.phase = 'idle';
      S.recognizer = null;
      draw(el);
    },
    onError: (code) => {
      S.recognizer = null;
      S.phase = 'idle';
      S.interim = '';
      if (code === 'unsupported' || code === 'not-allowed' || code === 'service-not-allowed') {
        S.error = 'Tu navegador no permite dictado. Usa el formulario o Chrome en Android.';
      } else if (code !== 'no-speech' && code !== 'aborted') {
        S.error = 'Error de dictado: ' + code;
      }
      draw(el);
    }
  });
  if (!S.recognizer) {
    S.error = 'Tu navegador no permite dictado. Usa el formulario o Chrome en Android.';
    draw(el);
    return;
  }
  S.phase = 'listening';
  S.error = '';
  S.recognizer.start();
  draw(el);
}

function openManual(el) {
  S.draft = emptyDraft(S.manualIntent, { date: todayIso((S.settings && S.settings.profile.timezone) || 'Europe/Madrid') });
  S.meta = { intent: S.manualIntent, confidence: null, warnings: [], missing_fields: [], clarification: null };
  S.phase = 'preview';
  S.error = '';
  draw(el);
}

function resetAll(el) {
  S.phase = 'idle';
  S.text = '';
  S.interim = '';
  S.draft = null;
  S.meta = null;
  S.error = '';
  S.notice = '';
  S.savedId = null;
  draw(el);
}

// ---------- Dibujo ----------

function renderPreview() {
  const m = S.meta;
  const warn = (m.warnings || []).length
    ? `<ul class="avisos">${m.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '';
  const missing = (m.missing_fields || []).length
    ? `<p class="nota">Falta: ${esc(m.missing_fields.join(', '))}</p>` : '';
  const conf = m.confidence === null || m.confidence === undefined
    ? '' : `<p class="nota">Confianza: ${Math.round(m.confidence * 100)} %</p>`;
  const title = INTENT_LABEL[m.intent] || 'Registro manual';
  return `
    <section class="card">
      <h3>${esc(title)}</h3>
      ${conf}${missing}${warn}
      <div class="editor">${renderNode(S.draft.record, '', '', false)}</div>
      <div class="acciones">
        <button type="button" id="btn-confirmar" class="btn">Confirmar y guardar</button>
        <button type="button" id="btn-descartar" class="btn btn-sec">Descartar</button>
      </div>
    </section>`;
}

function draw(el) {
  // Respuesta asíncrona que llega tras cambiar de sección: no dibujar.
  if (el.dataset.route !== 'log') return;
  let body = '';
  if (S.phase === 'saved') {
    body = `
      <section class="card">
        <p class="estado ok" role="status">Guardado correctamente (${esc(S.savedId)}).</p>
        <div class="acciones"><button type="button" id="btn-nuevo" class="btn">Nuevo registro</button></div>
      </section>`;
  } else if (S.phase === 'preview' && S.draft) {
    body = renderPreview();
  } else {
    const listening = S.phase === 'listening';
    const busy = S.phase === 'processing';
    body = `
      <section class="card captura">
        <button type="button" id="btn-mic" class="mic ${listening ? 'activo' : ''}" ${busy ? 'disabled' : ''}
          aria-pressed="${listening}" aria-label="${listening ? 'Parar dictado' : 'Empezar dictado'}">
          ${listening ? 'Escuchando… pulsa para parar' : 'Pulsa y habla'}
        </button>
        <label class="campo">Transcripción (editable)
          <textarea id="transcripcion" rows="3">${esc(listening && S.interim ? S.interim : S.text)}</textarea>
        </label>
        <div class="acciones">
          <button type="button" id="btn-interpretar" class="btn" ${busy || !S.text.trim() ? 'disabled' : ''}>
            ${busy ? 'Interpretando…' : 'Interpretar'}</button>
        </div>
      </section>
      <section class="card">
        <h3>Editar manualmente</h3>
        <label class="campo">Tipo de registro
          <select id="manual-tipo">
            ${MANUAL_INTENTS.map((i) => `<option value="${i}" ${i === S.manualIntent ? 'selected' : ''}>${esc(INTENT_LABEL[i])}</option>`).join('')}
          </select>
        </label>
        <div class="acciones"><button type="button" id="btn-manual" class="btn btn-sec">Abrir formulario</button></div>
      </section>`;
  }

  const info = S.error
    ? `<p class="estado error" role="alert">${esc(S.error)}</p>`
    : S.notice ? `<p class="nota" role="status">${esc(S.notice)}</p>` : '';

  el.innerHTML = `
    <section class="vista">
      <h2>Registro por voz</h2>
      ${info}
      ${body}
    </section>`;
}

export function render(el) {
  // Carga de ajustes al entrar. Si falla, la vista sigue sirviendo el formulario.
  if (!S.settings) {
    call('settings.get')
      .then((s) => { S.settings = s; })
      .catch((err) => { S.error = err.message; })
      .finally(() => draw(el));
  }

  el.onclick = (ev) => {
    const t = ev.target;
    if (t.id === 'btn-mic') return toggleMic(el);
    if (t.id === 'btn-interpretar') return interpret(el, S.text.trim());
    if (t.id === 'btn-manual') return openManual(el);
    if (t.id === 'btn-confirmar') return confirmSave(el);
    if (t.id === 'btn-descartar' || t.id === 'btn-nuevo') return resetAll(el);
    if (t.dataset.remove) {
      const path = t.dataset.remove;
      const parts = path.split('.');
      const idx = Number(parts.pop());
      getPath(S.draft.record, parts.join('.')).splice(idx, 1);
      return draw(el);
    }
    if (t.dataset.add) {
      const arr = getPath(S.draft.record, t.dataset.add);
      const template = arr.length ? JSON.parse(JSON.stringify(arr[arr.length - 1])) : {};
      Object.keys(template).forEach((k) => {
        const v = template[k];
        if (typeof v === 'number') template[k] = null;
        else if (typeof v === 'string' && k !== 'unit') template[k] = '';
        else if (Array.isArray(v)) template[k] = [];
      });
      arr.push(template);
      return draw(el);
    }
  };

  el.oninput = (ev) => {
    const t = ev.target;
    if (t.id === 'transcripcion') {
      S.text = t.value;
      const btn = el.querySelector('#btn-interpretar');
      if (btn) btn.disabled = !t.value.trim();
      return;
    }
    if (t.dataset.path && S.draft) setPath(S.draft.record, t.dataset.path, readInput(t));
  };

  el.onchange = (ev) => {
    if (ev.target.id === 'manual-tipo') S.manualIntent = ev.target.value;
  };

  draw(el);
}

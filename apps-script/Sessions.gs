/** Sesión en curso: inicio, clips de voz, edición y cierre (PLAN 6.3 y 9). Parte con Drive y Gemini. */

const SESSION_ID_RE_ = /^s_\d{8}_[A-Za-z0-9_]{4,20}$/;
const CLIP_ID_RE_ = /^c_[A-Za-z0-9_]{6,40}$/;

function sessionPath_(id) {
  if (!SESSION_ID_RE_.test(String(id))) throw { code: 'VALIDATION', message: 'id de sesión inválido' };
  const d = id.slice(2, 10);
  return 'sessions/' + d.slice(0, 4) + '-' + d.slice(4, 6) + '.json';
}

function readSession_(id) {
  const s = readJson_(sessionPath_(id), []).find((x) => x.id === id);
  if (!s) throw { code: 'NOT_FOUND', message: 'Sesión no encontrada' };
  return s;
}

/** Lectura-modificación-escritura de una sesión bajo lock. `fn` recibe la sesión y devuelve la nueva. */
function mutateSession_(id, fn) {
  const path = sessionPath_(id);
  const settings = getSettings();
  return withLock_(() => {
    const arr = readJson_(path, []);
    const idx = arr.findIndex((x) => x.id === id);
    if (idx < 0) throw { code: 'NOT_FOUND', message: 'Sesión no encontrada' };
    const next = fn(arr[idx]);
    next.metrics = computeSessionMetrics_(next, { bodyweightKg: latestBodyweight_(settings) });
    arr[idx] = next;
    writeFile_(path, arr);
    bumpRevision_();
    return next;
  });
}

function startIfPlanned_(s) {
  if (s.status === 'planned') { s.status = 'in_progress'; s.startedAt = new Date().toISOString(); }
  return s;
}

function sessionStart(id) {
  return { session: mutateSession_(id, (s) => {
    if (s.status === 'done') throw { code: 'VALIDATION', message: 'La sesión ya está cerrada' };
    return startIfPlanned_(s);
  }) };
}

function sessionGet(id) { return { session: readSession_(id) }; }

function sessionFinish(id) {
  return { session: mutateSession_(id, (s) => {
    if (s.status === 'done') throw { code: 'VALIDATION', message: 'La sesión ya está cerrada' };
    s.status = 'review';
    s.endedAt = new Date().toISOString();
    if (!s.startedAt) s.startedAt = s.endedAt;
    return s;
  }) };
}

function sessionEdit(p) {
  const settings = getSettings();
  const library = exerciseSeed_();
  return { session: mutateSession_(p.id, (s) => {
    if (s.status === 'done') throw { code: 'VALIDATION', message: 'La sesión ya está cerrada' };
    return applyOpOnce_(s, p.op || {}, settings.equipment, library);
  }) };
}

const OP_ID_RE_ = /^o_[A-Za-z0-9_]{6,40}$/;

/**
 * Aplica una edición una sola vez. Las ediciones hechas sin conexión se reenvían al volver la red y un
 * reintento tras un tiempo de espera podría llegar dos veces: con opId, la segunda no hace nada.
 */
function applyOpOnce_(s, op, equipment, library) {
  const id = op.opId;
  if (id !== undefined && !OP_ID_RE_.test(String(id))) throw { code: 'VALIDATION', message: 'id de edición inválido' };
  if (id && (s.appliedOps || []).indexOf(id) >= 0) return s;
  const out = applyEditOp_(s, op, equipment, library);
  if (id) out.appliedOps = (out.appliedOps || []).concat([id]).slice(-200);
  return out;
}

/** Procesa un clip de audio. Idempotente: reenviar el mismo clipId no duplica series. */
function clipProcess(p) {
  if (!CLIP_ID_RE_.test(String(p.clipId))) throw { code: 'VALIDATION', message: 'id de clip inválido' };
  const mime = validateMedia_('audio', p.mime, p.data);
  const session = readSession_(p.sessionId);
  if (session.status === 'done') throw { code: 'VALIDATION', message: 'La sesión ya está cerrada' };
  if ((session.clips || []).some((c) => c.id === p.clipId)) return { session: session, duplicate: true };

  const settings = getSettings();
  const library = exerciseSeed_();
  const ai = callJson_('CLIP', CLIP_SYSTEM_, buildClipUser_(session, library), CLIP_SCHEMA_, validateClipResponse_,
    [{ inlineData: { mimeType: mime, data: p.data } }]);

  const updated = mutateSession_(p.sessionId, (s) => {
    if ((s.clips || []).some((c) => c.id === p.clipId)) return s;
    const res = eventsToSets_(ai.events, s, { library: library, equipment: settings.equipment, clipId: p.clipId, at: setTime_(p.ts) });
    s.exercises = res.exercises;
    s.pending = (s.pending || []).concat(res.pending);
    s.painFlags = (s.painFlags || []).concat(res.pain);
    s.clips = (s.clips || []).concat([{ id: p.clipId, ts: String(p.ts || new Date().toISOString()).slice(0, 40),
      transcript: ai.transcript.slice(0, 4000), events: ai.events, warnings: res.warnings, status: 'processed' }]);
    return startIfPlanned_(s);
  });
  return { session: updated };
}

// ---------- Revisión y cierre ----------

function previousSameKey_(session, settings) {
  const today = todayIso_(settings.profile.timezone);
  const all = loadSessionsSince_(addDays_(today, -120), today).filter((s) => s.id !== session.id);
  return lastSessionOfKey_(all, session.cycleKey);
}

/**
 * Revisión de la sesión: cálculo determinista y mensaje de cierre NEUTRO al instante.
 * El mensaje con la personalidad llega después (sessionReviewMessage) para no bloquear la pantalla.
 */
function sessionReview(id) {
  let s = readSession_(id);
  if (['review', 'done'].indexOf(s.status) < 0) throw { code: 'VALIDATION', message: 'La sesión aún no está en revisión' };
  const settings = getSettings();
  const review = buildReview_(s, previousSameKey_(s, settings), exerciseSeed_(), { bodyweightKg: latestBodyweight_(settings) });
  if (!s.reviewMessage) {
    const neutral = neutralReviewMessage_(review);
    s = mutateSession_(id, (q) => { if (!q.reviewMessage) { q.reviewMessage = neutral; q.reviewMessageSource = 'neutral'; } return q; });
  }
  return { session: s, review: review };
}

/** Mensaje de cierre con la personalidad. Se intenta una sola vez; si la IA falla se queda el neutro. */
function sessionReviewMessage(id) {
  const s = readSession_(id);
  if (s.reviewMessageSource === 'ai') return { session: s };
  const settings = getSettings();
  const review = buildReview_(s, previousSameKey_(s, settings), exerciseSeed_(), { bodyweightKg: latestBodyweight_(settings) });
  const msg = coachMessage_(s.groups, review.issues.map((i) => i.type), settings,
    { series: review.summary.workingSets, volumenKg: Math.round(review.summary.totalVolumeKg), sinHacer: review.missing.map((m) => m.name), molestias: (s.painFlags || []).length },
    'Mensaje de cierre de la sesión (2 o 3 frases): reconoce el trabajo y di qué mirar la próxima vez', neutralReviewMessage_(review));
  return { session: mutateSession_(id, (q) => { q.reviewMessage = msg; q.reviewMessageSource = 'ai'; return q; }) };
}

/** Mensaje de arranque con la personalidad para la sesión de hoy. Se intenta una sola vez. */
function sessionMessage(id) {
  const s = readSession_(id);
  if (s.coachMessageSource === 'ai') return { session: s };
  const settings = getSettings();
  const msg = coachMessage_(s.groups, s.notes || [], settings, { ejercicios: (s.plannedExercises || []).length });
  return { session: mutateSession_(id, (q) => { q.coachMessage = msg; q.coachMessageSource = 'ai'; return q; }) };
}

function sessionSave(id) {
  const settings = getSettings();
  const today = todayIso_(settings.profile.timezone);
  return { session: mutateSession_(id, (s) => {
    if (s.status === 'done') throw { code: 'VALIDATION', message: 'La sesión ya está guardada' };
    if (s.status !== 'review') throw { code: 'VALIDATION', message: 'Termina la sesión antes de guardarla' };
    const errors = validateForSave_(s, today, settings.equipment);
    if (errors.length) throw { code: 'VALIDATION', message: errors.join(' ') };
    s.status = 'done';
    s.savedAt = new Date().toISOString();
    return s;
  }) };
}

function sessionDiscard(id) {
  return { session: mutateSession_(id, (s) => {
    if (s.status === 'done') throw { code: 'VALIDATION', message: 'Una sesión guardada no se descarta' };
    s.status = 'discarded';
    return s;
  }) };
}

/** Vuelve a la grabación desde la revisión (por ejemplo, si terminaste sin querer). */
function sessionResume(id) {
  return { session: mutateSession_(id, (s) => {
    if (s.status !== 'review') throw { code: 'VALIDATION', message: 'Solo se puede retomar una sesión en revisión' };
    s.status = 'in_progress';
    delete s.endedAt;
    return s;
  }) };
}

// ---------- Resumen ligero para Diario y Progreso ----------

/** 1RM estimado (Epley); por encima de 12 repeticiones no es fiable. Igual que js/lib/progress.js. */
function epley_(kg, reps) {
  if (!(kg > 0) || !(reps >= 1) || reps > 12) return null;
  return Math.round(kg * (reps === 1 ? 1 : 1 + reps / 30) * 10) / 10;
}

/**
 * Lo que necesitan las listas: unos cientos de bytes por sesión en vez de 10-15 KB (sin clips ni series).
 * El detalle se pide aparte con session.get cuando el usuario abre una sesión.
 */
function sessionSummary_(s) {
  const ex = (s.exercises || []).map((x) => {
    let best = null;
    (x.sets || []).forEach((set) => {
      if (set.type === 'warmup' || !set.load || set.load.implement === 'bodyweight') return;
      const v = epley_(set.load.totalKg, set.reps);
      if (v !== null && (best === null || v > best)) best = v;
    });
    return { exerciseId: x.exerciseId, name: x.name, sets: (x.sets || []).length, e1rm: best };
  });
  return { id: s.id, date: s.date, status: s.status, startedAt: s.startedAt || null, groups: s.groups || [],
    metrics: s.metrics || {}, pain: (s.painFlags || []).length, exercises: ex };
}

function sessionsSummary(p) {
  const r = queryRecords({ entity: 'session', from: p.from, to: p.to, filters: { status: 'done' } });
  return { items: r.items.map(sessionSummary_) };
}

// ---------- Resumen hablado del entreno ----------

const DEBRIEF_SCHEMA_ = { type: 'OBJECT', properties: {
  transcript: { type: 'STRING' },
  summary: { type: 'STRING' },
  energy: { type: 'INTEGER', nullable: true },
  feeling: { type: 'STRING', nullable: true },
  pains: { type: 'ARRAY', items: { type: 'STRING' } },
  nextTime: { type: 'STRING', nullable: true }
}, required: ['transcript', 'summary', 'pains'] };

const DEBRIEF_SYSTEM_ = 'Recibes un audio en español en el que una persona cuenta cómo le ha ido el entrenamiento de pesas que acaba de ' +
  'terminar. Puede haber ruido de gimnasio y habla andaluza (s aspiradas, seseo o ceceo): transcribe solo a quien habla. ' +
  'Devuelve "transcript" (lo dicho, sin inventar), "summary" (2 o 3 frases en segunda persona, claras, con lo importante), ' +
  '"energy" (1 muy cansado a 5 con mucha energía, solo si se deduce; si no, null), "feeling" (una o dos palabras: por ejemplo ' +
  '"fuerte", "cansado", "con prisa"; null si no se sabe), "pains" (cada molestia o dolor que mencione, con la zona; lista vacía si no hay) ' +
  'y "nextTime" (lo que quiere cambiar o recordar para la próxima vez; null si no dice nada). No añadas consejos ni datos que no diga. ' +
  'Responde solo con el JSON pedido.';

function validateDebrief_(o) {
  const e = [];
  if (!o || typeof o.transcript !== 'string' || typeof o.summary !== 'string') return ['faltan transcript o summary'];
  if (!Array.isArray(o.pains)) e.push('pains debe ser una lista');
  if (o.energy !== null && o.energy !== undefined && !(Number.isInteger(o.energy) && o.energy >= 1 && o.energy <= 5)) e.push('energy fuera de rango');
  return e;
}

/** Lo que se guarda en la sesión. Pura. */
function buildDebrief_(ai, atIso) {
  const txt = (s, n) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : null);
  return { at: atIso, transcript: txt(ai.transcript, 4000) || '', summary: txt(ai.summary, 600) || '',
    energy: Number.isInteger(ai.energy) && ai.energy >= 1 && ai.energy <= 5 ? ai.energy : null,
    feeling: txt(ai.feeling, 40), nextTime: txt(ai.nextTime, 300),
    pains: (ai.pains || []).map((p) => txt(p, 200)).filter(Boolean).slice(0, 5) };
}

/** Graba el resumen hablado de una sesión en revisión o ya guardada. Sustituye al anterior si lo había. */
function sessionDebrief(p) {
  const mime = validateMedia_('audio', p.mime, p.data);
  const session = readSession_(p.id);
  if (['review', 'done'].indexOf(session.status) < 0) throw { code: 'VALIDATION', message: 'El resumen se graba al terminar la sesión' };
  const ai = callJson_('CLIP', DEBRIEF_SYSTEM_, { tarea: 'Resume cómo ha ido el entrenamiento', grupos: session.groups || [] },
    DEBRIEF_SCHEMA_, validateDebrief_, [{ inlineData: { mimeType: mime, data: p.data } }]);
  const d = buildDebrief_(ai, new Date().toISOString());
  return { session: mutateSession_(p.id, (s) => {
    s.painFlags = (s.painFlags || []).filter((f) => f.source !== 'debrief')
      .concat(d.pains.map((t) => ({ clipId: null, source: 'debrief', text: t, exerciseId: null })));
    s.debrief = d;
    return s;
  }) };
}

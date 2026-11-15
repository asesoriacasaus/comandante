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
    return applyEditOp_(s, p.op || {}, settings.equipment, library);
  }) };
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
  const ai = callJson_('FAST', CLIP_SYSTEM_, buildClipUser_(session, library), CLIP_SCHEMA_, validateClipResponse_,
    [{ inlineData: { mimeType: mime, data: p.data } }]);

  const updated = mutateSession_(p.sessionId, (s) => {
    if ((s.clips || []).some((c) => c.id === p.clipId)) return s;
    const res = eventsToSets_(ai.events, s, { library: library, equipment: settings.equipment, clipId: p.clipId });
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
  const all = loadSessionsSince_(addDays_(today, -180), today).filter((s) => s.id !== session.id);
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

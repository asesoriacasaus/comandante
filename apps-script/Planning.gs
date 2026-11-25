/** Plan del día y ciclo (PLAN 8.1). Parte con Drive y Gemini; la lógica está en Planner.gs y PlanGen.gs. */

function readPlan_() { return readJson_('plan/current.json', null); }

function loadSessionsSince_(fromIso, toIso) {
  const out = [];
  monthsBetween_(fromIso, toIso).forEach((ym) => readJson_('sessions/' + ym + '.json', []).forEach((s) => out.push(s)));
  return out;
}
function loadRunsSince_(fromIso, toIso) {
  const out = [];
  monthsBetween_(fromIso, toIso).forEach((ym) => readJson_('runs/' + ym + '.json', []).forEach((r) => out.push(r)));
  return out;
}
function addDays_(iso, n) {
  const d = new Date(dayNumber_(iso) * 86400000 + n * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Llama a Gemini pidiendo JSON, valida y reintenta una vez con los errores. */
function callJson_(tier, system, userObj, schema, validate, extraParts) {
  const data = JSON.stringify(userObj);
  // Una petición idéntica en las últimas 6 h (reintento, la misma foto o el mismo texto) no vuelve a gastar tokens.
  const key = aiCacheKey_(tier, system, data, extraParts);
  const cached = aiCacheGet_(key);
  if (cached && !validate(cached).length) { aiCount_('ahorro', 'cache'); return cached; }
  let extra = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts = [{ text: data }].concat(extraParts || []);
    if (extra) parts.push({ text: 'Tu respuesta anterior tenía estos errores: ' + extra + '. Devuelve el JSON corregido.' });
    const r = callGemini_(tier, system, parts, { schema: schema, temperature: 0.4 });
    let obj = null;
    try { obj = JSON.parse(r.text); } catch (_) { /* se trata como inválido */ }
    const errors = obj ? validate(obj) : ['no es JSON válido'];
    if (!errors.length) { aiCachePut_(key, obj); return obj; }
    extra = errors.join('; ');
  }
  throw { code: 'VALIDATION', message: 'La IA no ha devuelto un resultado válido' };
}

function coachMessage_(groups, notes, settings, facts, task, fallback) {
  const persona = PropertiesService.getScriptProperties().getProperty('PERSONA_PROMPT') || '';
  try {
    const r = callGemini_('FAST', buildCoachSystem_(persona, settings.coach.intensity),
      [{ text: JSON.stringify({ tarea: task || 'Mensaje breve para el inicio de la sesión de hoy', gruposDeHoy: groupsEs_(groups), avisos: notes, datos: facts }) }],
      { schema: MESSAGE_SCHEMA_, temperature: 0.8 });
    const m = JSON.parse(r.text).message;
    if (typeof m === 'string' && m.trim()) return m.trim().slice(0, 400);
  } catch (err) {
    console.error('coachMessage_ ' + (err && err.code ? err.code : 'error')); // solo el código
  }
  return fallback || neutralCoachMessage_(groups, notes);
}

// ---------- Acciones ----------

function planState() {
  const settings = getSettings();
  const plan = readPlan_();
  return { onboarded: isOnboarded_(settings), settings: settings, cycle: plan ? plan.cycle : null };
}

function proposeCycle() {
  const settings = getSettings();
  return callJson_('SMART', CYCLE_SYSTEM_, buildCycleUser_(settings), CYCLE_SCHEMA_, (o) => validateCycle_(o));
}

function acceptCycle(cycle) {
  if (!cycle || !Array.isArray(cycle.sessions)) throw { code: 'VALIDATION', message: 'ciclo requerido' };
  const clean = { sessions: cycle.sessions.map((s) => ({ key: String(s.key), groups: (s.groups || []).map(String) })) };
  const errors = validateCycle_(clean);
  if (errors.length) throw { code: 'VALIDATION', message: errors.join('; ') };
  const settings = getSettings();
  const today = todayIso_(settings.profile.timezone);
  return withLock_(() => {
    writeFile_('plan/current.json', { schemaVersion: 2, cycle: clean, cycleStartDate: today, lastDeloadDate: null });
    bumpRevision_();
    return { cycle: clean };
  });
}

/**
 * Sesión de hoy: la existente o una nueva. Nunca llama a Gemini si ya está generada.
 * Con `opts.extra` (segunda sesión del día, a petición): si la de hoy ya está hecha, se genera la siguiente de la rotación.
 * Si hay una sin terminar, se devuelve esa: nunca dos abiertas a la vez.
 */
function planToday(opts) {
  const extra = !!(opts && opts.extra);
  const settings = getSettings();
  if (!isOnboarded_(settings)) throw { code: 'ONBOARDING', message: 'Faltan tus datos en la pantalla de bienvenida' };
  const plan = readPlan_();
  if (!plan || !plan.cycle) throw { code: 'NO_CYCLE', message: 'Aún no hay un ciclo aceptado' };

  const tz = settings.profile.timezone;
  const today = todayIso_(tz);
  const nowIso = new Date().toISOString();
  const sessions = loadSessionsSince_(addDays_(today, -120), today);

  const existing = pickTodaySession_(sessions, today);
  if (existing && !(extra && existing.status === 'done')) return { session: existing, source: 'existing' };

  const runs = loadRunsSince_(addDays_(today, -7), today);
  const pick = pickNextSession_(plan.cycle, sessions, runs, nowIso);
  const eq = settings.equipment;
  const library = exerciseSeed_();

  // Descarga: cada 6 semanas desde la última (o desde el inicio del ciclo); dura 7 días.
  const anchor = plan.lastDeloadDate || plan.cycleStartDate || today;
  let lastDeloadDate = plan.lastDeloadDate || null;
  let deload = lastDeloadDate && daysBetween_(lastDeloadDate, today) < 7;
  if (!deload && shouldDeload_(Math.floor(daysBetween_(anchor, today) / 7), plan.stalledMainLifts || 0)) { deload = true; lastDeloadDate = today; }

  const prev = lastSessionOfKey_(sessions, pick.key);
  let planned;
  if (prev) {
    planned = planFromHistory_(prev, sessions, library, eq);
  } else {
    const ai = callJson_('SMART', SESSION_SYSTEM_, buildSessionUser_(pick.groups, settings, library), SESSION_PLAN_SCHEMA_,
      (o) => validateAiPlan_(o, pick.groups, library));
    planned = buildPlannedFromAi_(ai, library, eq);
  }

  const ruled = applyPlanRules_(planned, { lastLoads: lastLoads_(sessions), returnAdjust: returnAdjust_(sessions, today),
    deload: !!deload, firstSession: !prev, equipment: eq });
  // Prioridad de volumen de la revisión semanal: no se aplica en descarga, tras un parón ni en la primera sesión.
  if (prev && !deload && ruled.notes.indexOf('layoff') < 0) {
    const pr = applyPriority_(ruled.exercises, plan.priorityGroups, library);
    if (pr.boosted.length) { ruled.exercises = pr.exercises; ruled.notes.push('priority'); }
  }
  const notes = ruled.notes.concat(pick.reason === 'long_run_skip_legs' ? ['long_run'] : [], pick.warning ? [pick.warning] : [], existing ? ['second_today'] : []);

  const rec = { id: makeId_('s', today, tz), date: today, status: 'planned', cycleKey: pick.key, groups: pick.groups,
    plannedExercises: ruled.exercises, clips: [], exercises: [], notes: notes,
    // El mensaje con la personalidad llega después (session.message): la IA no bloquea la pantalla.
    coachMessage: neutralCoachMessage_(pick.groups, notes), coachMessageSource: 'neutral' };
  // Dos cargas de Hoy a la vez (abrir la app y tocar la pestaña, por ejemplo) generaban dos sesiones del mismo día.
  // La generación va fuera del lock (puede tardar); la comprobación final y la escritura, dentro.
  const ganadora = commitTodaySession_(rec, tz, today, extra);
  if (ganadora.id !== rec.id) return { session: ganadora, source: 'existing' };
  if (lastDeloadDate !== plan.lastDeloadDate) {
    withLock_(() => { writeFile_('plan/current.json', Object.assign({}, plan, { lastDeloadDate: lastDeloadDate })); bumpRevision_(); });
  }
  return { session: rec, source: 'generated', pick: { reason: pick.reason, skippedKey: pick.skippedKey } };
}

const TODAY_STATUS_RANK_ = { in_progress: 0, review: 1, planned: 2, done: 3 };

/** Peso de una sesión: tiene series o clips (trabajo hecho que no se puede esconder). */
function sessionHasWork_(s) {
  return (s.exercises || []).some((x) => (x.sets || []).length) || (s.clips || []).length > 0;
}

/**
 * La sesión de hoy entre las que haya (pura). Prioridad: en curso, en revisión, planificada y hecha. A igualdad,
 * la que tiene trabajo y luego la empezada más tarde. Así un duplicado vacío nunca tapa a la sesión real.
 */
function pickTodaySession_(sessions, today) {
  const cand = (sessions || []).filter((s) => s.date === today && TODAY_STATUS_RANK_[s.status] !== undefined);
  cand.sort((a, b) => (TODAY_STATUS_RANK_[a.status] - TODAY_STATUS_RANK_[b.status])
    || ((sessionHasWork_(b) ? 1 : 0) - (sessionHasWork_(a) ? 1 : 0))
    || String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
  return cand[0] || null;
}

/** Guarda la sesión nueva de hoy salvo que, dentro del lock, ya exista una: entonces devuelve esa y no escribe nada. */
function commitTodaySession_(rec, tz, today, extra) {
  // Con `extra`, una sesión ya hecha no impide crear otra; una abierta (planificada, en curso o en revisión), sí.
  const r = commitSession_(rec, tz, today, (arr) => { const ya = pickTodaySession_(arr, today); return ya && !(extra && ya.status === 'done') ? ya : null; });
  return r.existing || rec;
}

/** Estado y sesión de hoy en UNA sola llamada. Si la sesión falla, el estado se devuelve igualmente. */
/** Segunda sesión del día, a petición del usuario. */
function planExtra() { return planToday({ extra: true }); }

function hoyLoad() {
  const state = planState();
  let today = null;
  let todayError = null;
  if (state.onboarded && state.cycle) {
    try { today = planToday(); } catch (err) { todayError = { code: (err && err.code) || 'INTERNAL', message: err && err.code ? String(err.message) : 'Error interno' }; }
  }
  return { onboarded: state.onboarded, hasCycle: !!state.cycle, today: today, todayError: todayError };
}

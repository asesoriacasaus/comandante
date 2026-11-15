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
  let extra = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const parts = [{ text: data }].concat(extraParts || []);
    if (extra) parts.push({ text: 'Tu respuesta anterior tenía estos errores: ' + extra + '. Devuelve el JSON corregido.' });
    const r = callGemini_(tier, system, parts, { schema: schema, temperature: 0.4 });
    let obj = null;
    try { obj = JSON.parse(r.text); } catch (_) { /* se trata como inválido */ }
    const errors = obj ? validate(obj) : ['no es JSON válido'];
    if (!errors.length) return obj;
    extra = errors.join('; ');
  }
  throw { code: 'VALIDATION', message: 'La IA no ha devuelto un resultado válido' };
}

function coachMessage_(groups, notes, settings, facts) {
  const persona = PropertiesService.getScriptProperties().getProperty('PERSONA_PROMPT') || '';
  try {
    const r = callGemini_('FAST', buildCoachSystem_(persona, settings.coach.intensity),
      [{ text: JSON.stringify({ tarea: 'Mensaje breve para el inicio de la sesión de hoy', gruposDeHoy: groupsEs_(groups), avisos: notes, datos: facts }) }],
      { schema: MESSAGE_SCHEMA_, temperature: 0.8 });
    const m = JSON.parse(r.text).message;
    if (typeof m === 'string' && m.trim()) return m.trim().slice(0, 400);
  } catch (err) {
    console.error('coachMessage_ ' + (err && err.code ? err.code : 'error')); // solo el código
  }
  return neutralCoachMessage_(groups, notes);
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

/** Sesión de hoy: la existente o una nueva. Nunca llama a Gemini si ya está generada. */
function planToday() {
  const settings = getSettings();
  if (!isOnboarded_(settings)) throw { code: 'ONBOARDING', message: 'Faltan tus datos en la pantalla de bienvenida' };
  const plan = readPlan_();
  if (!plan || !plan.cycle) throw { code: 'NO_CYCLE', message: 'Aún no hay un ciclo aceptado' };

  const tz = settings.profile.timezone;
  const today = todayIso_(tz);
  const nowIso = new Date().toISOString();
  const sessions = loadSessionsSince_(addDays_(today, -120), today);

  const existing = sessions.filter((s) => s.date === today && ['planned', 'in_progress', 'review', 'done'].indexOf(s.status) >= 0)
    .sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0))[0];
  if (existing) return { session: existing, source: 'existing' };

  const runs = loadRunsSince_(addDays_(today, -7), today);
  const pick = pickNextSession_(plan.cycle, sessions, runs, nowIso);
  const eq = settings.equipment;
  const library = exerciseSeed_();

  // Descarga: cada 6 semanas desde la última (o desde el inicio del ciclo); dura 7 días.
  const anchor = plan.lastDeloadDate || plan.cycleStartDate || today;
  let lastDeloadDate = plan.lastDeloadDate || null;
  let deload = lastDeloadDate && daysBetween_(lastDeloadDate, today) < 7;
  if (!deload && shouldDeload_(Math.floor(daysBetween_(anchor, today) / 7), 0)) { deload = true; lastDeloadDate = today; }

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
  const notes = ruled.notes.concat(pick.reason === 'long_run_skip_legs' ? ['long_run'] : [], pick.warning ? [pick.warning] : []);

  const rec = { id: makeId_('s', today, tz), date: today, status: 'planned', cycleKey: pick.key, groups: pick.groups,
    plannedExercises: ruled.exercises, clips: [], exercises: [], notes: notes,
    coachMessage: coachMessage_(pick.groups, notes, settings, { ejercicios: ruled.exercises.length }) };
  commitSession_(rec, tz, today);
  if (lastDeloadDate !== plan.lastDeloadDate) {
    withLock_(() => { writeFile_('plan/current.json', Object.assign({}, plan, { lastDeloadDate: lastDeloadDate })); bumpRevision_(); });
  }
  return { session: rec, source: 'generated', pick: { reason: pick.reason, skippedKey: pick.skippedKey } };
}

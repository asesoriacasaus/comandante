/** Revisión semanal y recordatorios: orquestación con Drive, Gemini y correo (la lógica está en Weekly.gs). */

/** "2026-11-16" → "2026-W47" (semana ISO). */
function isoWeekKey_(iso) {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return y + '-W' + String(week).padStart(2, '0');
}

function mailTo_(settings) {
  return (settings.notifications && settings.notifications.email) || Session.getEffectiveUser().getEmail();
}

/** Mensaje largo del Comandante: primero el modelo "listo", después el rápido y, si fallan, texto neutro. */
function weeklyMessage_(facts, plan, settings) {
  const persona = PropertiesService.getScriptProperties().getProperty('PERSONA_PROMPT') || '';
  const system = buildCoachSystem_(persona, settings.coach.intensity).replace('en 1 o 2 frases', 'en un texto de 6 a 9 frases, como un programa semanal');
  const parts = [{ text: JSON.stringify({ tarea: 'Escribe el comentario de apertura del correo semanal: reconoce lo hecho, señala lo que falló y motiva para la semana siguiente. ' +
    'Usa solo los datos dados; no inventes cifras ni cambies los ajustes ya decididos.',
    semana: { entrenos: facts.training.sessions, series: facts.training.sets, volumenKg: facts.training.volumeKg, gruposCortos: groupsEs_(facts.training.belowMin),
      molestias: facts.training.pain, carreras: facts.runs, pesoMedioKg: facts.body.weight.avg, cambioPesoKg: facts.body.weight.delta, diasConComida: facts.nutrition.daysLogged },
    ajusteDeCalorias: plan.adjustment.reason }) }];
  for (const tier of ['SMART', 'FAST']) {
    try {
      const r = callGemini_(tier, system, parts, { schema: MESSAGE_SCHEMA_, temperature: 0.8 });
      const m = JSON.parse(r.text).message;
      if (typeof m === 'string' && m.trim()) return m.trim().slice(0, 1800);
    } catch (err) {
      console.error('weeklyMessage_ ' + tier + ' ' + (err && err.code ? err.code : 'error'));
    }
  }
  return neutralWeeklyMessage_(facts, plan);
}

/**
 * Revisión semanal. p.dryRun: calcula y devuelve la vista previa sin enviar ni guardar nada.
 * p.force: repite aunque ya exista la revisión de esta semana.
 */
function weeklyReview(p) {
  p = p || {};
  const settings = getSettings();
  const tz = settings.profile.timezone;
  const today = todayIso_(tz);
  const plan = readPlan_();
  const library = exerciseSeed_();
  const sessions = loadSessionsSince_(addDays_(today, -90), today);
  const runs = loadRunsSince_(addDays_(today, -28), today);
  const meals = loadMeals_(addDays_(today, -13), today);
  const body = readJson_('body.json', []).filter((r) => r.date >= addDays_(today, -120));
  const targets = nutritionTargets_(settings, latestBodyweight_(settings), Number(today.slice(0, 4)));

  const facts = weeklyFacts_({ today: today, sessions: sessions, runs: runs, meals: meals, body: body, targets: targets, library: library, settings: settings });
  const adjustment = calorieAdjustment_(facts);
  const planInfo = { adjustment: adjustment, priorityGroups: facts.training.belowMin, stalled: stalledMainLifts_(sessions, library),
    nextSession: plan && plan.cycle ? (function () { const k = pickNextSession_(plan.cycle, sessions, runs, new Date().toISOString()); return { key: k.key, groups: k.groups }; })() : null };

  const weekKey = isoWeekKey_(today);
  const histPath = 'plan/history/' + weekKey + '.json';
  if (!p.dryRun && !p.force && fileExists_(histPath)) return { skipped: true, week: weekKey };

  const message = weeklyMessage_(facts, planInfo, settings);
  const mail = buildWeeklyEmail_(facts, planInfo, message);
  if (p.dryRun) return { skipped: false, dryRun: true, week: weekKey, subject: mail.subject, text: mail.text, adjustment: adjustment };

  const newAdjust = clampAdjust_(settings.nutrition.kcalAdjust, adjustment.deltaKcal);
  withLock_(() => {
    writeFile_(histPath, { week: weekKey, createdAt: new Date().toISOString(), facts: facts, plan: planInfo, message: message });
    if (plan) writeFile_('plan/current.json', Object.assign({}, plan, { priorityGroups: planInfo.priorityGroups, stalledMainLifts: planInfo.stalled.length, lastWeeklyReview: today }));
    bumpRevision_();
  });
  if (newAdjust !== (settings.nutrition.kcalAdjust || 0)) updateSettings({ nutrition: { kcalAdjust: newAdjust } });
  if (settings.notifications.weekly !== false) {
    MailApp.sendEmail({ to: mailTo_(settings), subject: mail.subject, body: mail.text, htmlBody: mail.html });
  }
  return { skipped: false, week: weekKey, subject: mail.subject, text: mail.text, adjustment: adjustment, kcalAdjust: newAdjust };
}

// ---------- Disparadores de tiempo ----------

function weeklyTrigger() {
  try { weeklyReview({}); } catch (err) { console.error('weeklyTrigger ' + (err && err.code ? err.code : 'error')); }
}

function reminderTrigger() {
  try {
    const settings = getSettings();
    const tz = settings.profile.timezone;
    const today = todayIso_(tz);
    const props = PropertiesService.getScriptProperties();
    const sessions = loadSessionsSince_(addDays_(today, -60), today);
    if (!shouldRemind_(sessions, today, settings, props.getProperty('LAST_REMINDER'))) return;
    const plan = readPlan_();
    if (!plan || !plan.cycle) return;
    const pick = pickNextSession_(plan.cycle, sessions, loadRunsSince_(addDays_(today, -7), today), new Date().toISOString());
    const done = sortDone_(sessions);
    const mail = buildReminderEmail_(pick, daysBetween_(done[done.length - 1].date, today));
    MailApp.sendEmail({ to: mailTo_(settings), subject: mail.subject, body: mail.text, htmlBody: mail.html });
    props.setProperty('LAST_REMINDER', today);
  } catch (err) { console.error('reminderTrigger ' + (err && err.code ? err.code : 'error')); }
}

/** Ejecutar una vez desde el editor: crea el correo semanal (domingo 19:00) y el aviso diario (hacia las 7:00). */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (['weeklyTrigger', 'reminderTrigger'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('weeklyTrigger').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(19).create();
  ScriptApp.newTrigger('reminderTrigger').timeBased().everyDays(1).atHour(7).create();
  Logger.log('Disparadores creados: correo semanal (domingo, 19:00) y aviso diario (hacia las 7:00).');
}

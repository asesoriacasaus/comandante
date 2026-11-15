/**
 * Revisión semanal y avisos (PLAN 8.5 y 8.6). Parte pura: hechos de la semana, ajustes por reglas,
 * correo y recordatorio. La IA solo redacta el texto; ninguna cifra ni ajuste depende de ella.
 */

const KCAL_STEP_ = 150;
const KCAL_ADJUST_MAX_ = 450;
const WEIGHT_DROP_LIMIT_ = 0.5;   // kg por semana: por debajo, riesgo de perder músculo
const WAIST_RISE_LIMIT_ = 0.5;    // cm por semana

function inRange_(date, from, to) { return date >= from && date <= to; }
function avg_(arr) { return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 100) / 100 : null; }

/** Media de peso de una ventana de fechas y su cambio frente a la ventana anterior. */
function trendOf_(body, pick, from, to, prevFrom, prevTo) {
  const vals = (a, b) => body.filter((r) => inRange_(r.date, a, b)).map(pick).filter(isNum_);
  const now = avg_(vals(from, to));
  const before = avg_(vals(prevFrom, prevTo));
  return { avg: now, prevAvg: before, delta: now !== null && before !== null ? Math.round((now - before) * 100) / 100 : null };
}

/** Carga más alta de cada ejercicio hecho en la semana frente a su última aparición anterior. */
function progressionsOf_(done, from, to) {
  const out = [];
  const seen = {};
  done.filter((s) => inRange_(s.date, from, to)).forEach((s) => (s.exercises || []).forEach((x) => {
    const top = heaviest_(x.sets);
    if (!top || seen[x.exerciseId]) return;
    seen[x.exerciseId] = 1;
    let prevTop = null;
    done.filter((q) => q.date < from).forEach((q) => (q.exercises || []).forEach((y) => { if (y.exerciseId === x.exerciseId) prevTop = heaviest_(y.sets) || prevTop; }));
    out.push({ name: x.name, kg: top.totalKg, prevKg: prevTop ? prevTop.totalKg : null,
      deltaKg: prevTop && prevTop.implement === top.implement ? round2_(top.totalKg - prevTop.totalKg) : null });
  }));
  return out.slice(0, 10);
}

/** Todos los hechos de la semana que termina en `today`. Entradas ya filtradas por usuario, sin datos de la IA. */
function weeklyFacts_(d) {
  const today = d.today;
  const from = addDays_(today, -6);
  const prevFrom = addDays_(today, -13);
  const prevTo = addDays_(today, -7);
  const done = sortDone_(d.sessions);
  const wk = done.filter((s) => inRange_(s.date, from, today));
  const prev = done.filter((s) => inRange_(s.date, prevFrom, prevTo));
  const sum = (list, f) => list.reduce((a, s) => a + f(s), 0);
  const setsByGroup = weeklyGroupSets_(done, from, today);

  const runs = (d.runs || []).filter((r) => inRange_(r.date, from, today));
  const meals = (d.meals || []).filter((m) => inRange_(m.date, from, today));
  const mealDays = {};
  meals.forEach((m) => { (mealDays[m.date] = mealDays[m.date] || []).push(m); });
  const dayTotals = Object.keys(mealDays).map((k) => sumMeals_(mealDays[k]));

  const waistNow = (d.body || []).filter((r) => inRange_(r.date, from, today) && r.measurementsCm && isNum_(r.measurementsCm.waist)).map((r) => r.measurementsCm.waist);
  const waistBefore = (d.body || []).filter((r) => r.date < from && r.measurementsCm && isNum_(r.measurementsCm.waist)).map((r) => r.measurementsCm.waist);

  return {
    from: from, to: today,
    training: { sessions: wk.length, sets: sum(wk, (s) => (s.metrics || {}).workingSets || 0), volumeKg: Math.round(sum(wk, (s) => (s.metrics || {}).totalVolumeKg || 0)),
      prevVolumeKg: Math.round(sum(prev, (s) => (s.metrics || {}).totalVolumeKg || 0)), prevSessions: prev.length, setsByGroup: setsByGroup,
      belowMin: wk.length ? groupsBelowMin_(setsByGroup) : [], pain: sum(wk, (s) => (s.painFlags || []).length),
      list: wk.map((s) => ({ date: s.date, cycleKey: s.cycleKey, groups: s.groups, sets: (s.metrics || {}).workingSets || 0, volumeKg: Math.round((s.metrics || {}).totalVolumeKg || 0) })),
      progressions: progressionsOf_(done, from, today) },
    runs: { count: runs.length, km: Math.round(sum(runs, (r) => r.distanceKm || 0) * 10) / 10, longRuns: runs.filter(isLongRun_).length },
    nutrition: { daysLogged: dayTotals.length, avgKcal: avg_(dayTotals.map((t) => t.kcal).filter(isNum_)), avgProteinG: avg_(dayTotals.map((t) => t.proteinG).filter(isNum_)),
      targets: d.targets || null, micro: weekNutrition_(meals, today) },
    body: { weight: trendOf_(d.body || [], (r) => r.weightKg, from, today, prevFrom, prevTo),
      waist: { now: waistNow.length ? waistNow[waistNow.length - 1] : null, before: waistBefore.length ? waistBefore[waistBefore.length - 1] : null },
      fat: trendOf_(d.body || [], (r) => r.bodyFatPct, from, today, prevFrom, prevTo) }
  };
}

/** Ajuste de calorías (8.5). Devuelve { deltaKcal, reason }. Sin datos de dos semanas no se toca nada. */
function calorieAdjustment_(facts) {
  const w = facts.body.weight;
  if (w.delta === null) return { deltaKcal: 0, reason: 'insufficient_data' };
  if (w.delta < -WEIGHT_DROP_LIMIT_) return { deltaKcal: KCAL_STEP_, reason: 'weight_dropping_fast' };
  const wa = facts.body.waist;
  if (wa.now !== null && wa.before !== null && wa.now - wa.before > WAIST_RISE_LIMIT_) return { deltaKcal: -KCAL_STEP_, reason: 'waist_rising' };
  return { deltaKcal: 0, reason: 'on_track' };
}

function clampAdjust_(current, delta) { return Math.max(-KCAL_ADJUST_MAX_, Math.min(KCAL_ADJUST_MAX_, (current || 0) + delta)); }

/** Ejercicios principales estancados: mismas cargas y sin más repeticiones en sus tres últimas apariciones. */
function stalledMainLifts_(sessions, library) {
  const byEx = {};
  sortDone_(sessions).forEach((s) => (s.exercises || []).forEach((x) => {
    const def = exerciseById_(x.exerciseId, library);
    const top = heaviest_(x.sets);
    if (!def || def.kind !== 'compound' || !top) return;
    const reps = nonWarmup_(x.sets).reduce((a, q) => a + q.reps, 0);
    (byEx[x.exerciseId] = byEx[x.exerciseId] || []).push({ kg: top.totalKg, reps: reps });
  }));
  return Object.keys(byEx).filter((id) => {
    const h = byEx[id].slice(-3);
    return h.length === 3 && h[1].kg <= h[0].kg && h[2].kg <= h[0].kg && h[2].reps <= h[0].reps;
  });
}

/** +1 serie (máximo 6) a los ejercicios de los grupos prioritarios. No actúa en descarga ni tras parón. */
function applyPriority_(exercises, priorityGroups, library) {
  if (!priorityGroups || !priorityGroups.length) return { exercises: exercises, boosted: [] };
  const boosted = [];
  const out = exercises.map((ex) => {
    const def = exerciseById_(ex.exerciseId, library);
    if (def && def.primary.some((g) => priorityGroups.indexOf(g) >= 0) && ex.sets < 6) { boosted.push(ex.exerciseId); return Object.assign({}, ex, { sets: ex.sets + 1 }); }
    return ex;
  });
  return { exercises: out, boosted: boosted };
}

// ---------- Correo ----------

function escapeHtml_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtKg_(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }
function fmtSigned_(n, unit) { return n === null || n === undefined ? '' : (n > 0 ? '+' : n < 0 ? '−' : '') + String(Math.abs(Math.round(n * 100) / 100)).replace('.', ',') + (unit ? ' ' + unit : ''); }

const ADJUST_TEXT_ = {
  weight_dropping_fast: 'Tu peso medio ha bajado más de 0,5 kg: subo 150 kcal para proteger el músculo.',
  waist_rising: 'La cintura ha subido más de 0,5 cm: bajo 150 kcal.',
  on_track: 'Vas en la dirección correcta: no toco las calorías.',
  insufficient_data: 'Faltan pesos de las dos últimas semanas: no toco las calorías. Pésate con regularidad.'
};

/** Secciones del correo como texto plano; el HTML se construye a partir de ellas escapando todo. */
function weeklySections_(facts, plan) {
  const t = facts.training; const rn = facts.runs; const n = facts.nutrition; const b = facts.body;
  const sections = [];
  const tr = [t.sessions + ' sesión(es), ' + t.sets + ' series de trabajo, ' + t.volumeKg + ' kg de volumen' + (t.prevSessions ? ' (semana anterior: ' + t.prevSessions + ' sesiones, ' + t.prevVolumeKg + ' kg)' : '') + '.'];
  facts.training.progressions.filter((p) => p.deltaKg).forEach((p) => tr.push(p.name + ': ' + fmtSigned_(p.deltaKg, 'kg') + ' en la carga más alta.'));
  if (t.belowMin.length) tr.push('Grupos por debajo de 8 series: ' + groupsEs_(t.belowMin).replace(/ y /g, ', ') + '. La semana que viene tendrán una serie más.');
  if (t.pain) tr.push('Anotaste ' + t.pain + ' molestia(s). Si persisten, baja la carga o consúltalo.');
  sections.push({ title: 'Entrenamiento', lines: tr });
  sections.push({ title: 'Carreras', lines: [rn.count ? rn.count + ' salida(s), ' + fmtKg_(rn.km) + ' km' + (rn.longRuns ? ', con ' + rn.longRuns + ' tirada(s) larga(s)' : '') + '.' : 'Esta semana no has registrado carreras.'] });
  const body = [];
  if (b.weight.avg !== null) body.push('Peso medio: ' + fmtKg_(b.weight.avg) + ' kg' + (b.weight.delta !== null ? ' (' + fmtSigned_(b.weight.delta, 'kg') + ' frente a la semana anterior)' : '') + '.');
  if (b.waist.now !== null) body.push('Cintura: ' + fmtKg_(b.waist.now) + ' cm' + (b.waist.before !== null ? ' (' + fmtSigned_(Math.round((b.waist.now - b.waist.before) * 10) / 10, 'cm') + ')' : '') + '.');
  if (b.fat.avg !== null) body.push('Grasa corporal: ' + fmtKg_(b.fat.avg) + ' %' + (b.fat.delta !== null ? ' (' + fmtSigned_(b.fat.delta, 'pp') + ')' : '') + '.');
  sections.push({ title: 'Cuerpo', lines: body.length ? body : ['Sin pesos ni medidas esta semana.'] });
  const nu = [];
  if (n.daysLogged) nu.push('Registraste ' + n.daysLogged + ' día(s). Media: ' + Math.round(n.avgKcal || 0) + ' kcal y ' + Math.round(n.avgProteinG || 0) + ' g de proteína' + (n.targets ? ' (objetivo: ' + n.targets.kcal + ' kcal y ' + n.targets.proteinG + ' g)' : '') + '.');
  else nu.push('Esta semana no has registrado comidas.');
  n.micro.alerts.forEach((a) => { const m = MICROS_.find((x) => x.key === a.key); nu.push((a.level === 'low' ? 'Poco ' : 'Mucho ') + m.label.toLowerCase() + ' (' + a.pct + ' % de la referencia, aproximado).'); });
  sections.push({ title: 'Comida', lines: nu });
  const pl = [ADJUST_TEXT_[plan.adjustment.reason]];
  if (plan.nextSession) pl.push('Próxima sesión del ciclo: ' + plan.nextSession.key + ' (' + groupsEs_(plan.nextSession.groups) + ').');
  if (plan.priorityGroups.length) pl.push('Prioridad de volumen: ' + groupsEs_(plan.priorityGroups).replace(/ y /g, ', ') + '.');
  if (plan.stalled.length) pl.push('Ejercicios estancados: ' + plan.stalled.length + '. Si se mantienen, tocará una semana de descarga.');
  sections.push({ title: 'Plan de la semana que viene', lines: pl });
  return sections;
}

function buildWeeklyEmail_(facts, plan, message, nameFrom) {
  const subject = 'Comandante · Balance semanal (' + facts.from.slice(8) + '/' + facts.from.slice(5, 7) + ' al ' + facts.to.slice(8) + '/' + facts.to.slice(5, 7) + ')';
  const sections = weeklySections_(facts, plan);
  const text = [message, ''].concat(sections.reduce((a, s) => a.concat([s.title.toUpperCase()], s.lines.map((l) => '- ' + l), ['']), [])).join('\n').trim();
  const html = '<div style="font-family:Georgia,serif;color:#1c1b19;max-width:560px;margin:0 auto;padding:16px">' +
    '<p style="font-size:18px;line-height:1.5;border-left:3px solid #4a4a2a;padding-left:12px;margin:0 0 20px">' + escapeHtml_(message).replace(/\n/g, '<br>') + '</p>' +
    sections.map((s) => '<h3 style="font-weight:normal;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#5b574f;margin:20px 0 6px">' + escapeHtml_(s.title) + '</h3>' +
      '<ul style="margin:0;padding-left:18px;font-family:Arial,sans-serif;font-size:15px;line-height:1.55">' + s.lines.map((l) => '<li>' + escapeHtml_(l) + '</li>').join('') + '</ul>').join('') + '</div>';
  return { subject: subject, text: text, html: html };
}

function neutralWeeklyMessage_(facts, plan) {
  const t = facts.training;
  return t.sessions ? 'Semana cerrada: ' + t.sessions + ' sesiones y ' + t.volumeKg + ' kg de volumen. Aquí tienes el balance y el plan.'
    : 'Esta semana no has entrenado. Aquí tienes el balance y el plan: lo importante es volver a la rutina.';
}

// ---------- Recordatorio ----------

/** ¿Enviar el aviso de "toca entrenar"? Tras N días de descanso, sin sesión hoy y sin haber avisado hoy. */
function shouldRemind_(sessions, todayIso, settings, lastReminderDate) {
  const n = settings.notifications;
  if (!n.reminder || lastReminderDate === todayIso) return false;
  if (sessions.some((s) => s.date === todayIso && ['planned', 'in_progress', 'review', 'done'].indexOf(s.status) >= 0 && s.status !== 'planned')) return false;
  const done = sortDone_(sessions);
  if (!done.length) return false;
  return daysBetween_(done[done.length - 1].date, todayIso) >= (n.reminderAfterRestDays || 2);
}

function buildReminderEmail_(pick, days) {
  const text = 'Llevas ' + days + ' días sin entrenar. Hoy toca la sesión ' + pick.key + ': ' + groupsEs_(pick.groups) + '. Abre Comandante al llegar al gimnasio y la tendrás lista.';
  return { subject: 'Comandante · Hoy toca ' + groupsEs_(pick.groups), text: text,
    html: '<div style="font-family:Georgia,serif;color:#1c1b19;max-width:560px;margin:0 auto;padding:16px;font-size:17px;line-height:1.5">' + escapeHtml_(text) + '</div>' };
}

/**
 * Tests ejecutables desde el editor de Apps Script: correr test_all().
 * Los test_pure_* no tocan Drive. test_commit_roundtrip escribe en un mes
 * de prueba (1999-01) y lo manda a la papelera al terminar.
 */

function assert_(cond, msg) {
  if (!cond) throw new Error('FALLO: ' + msg);
}

function test_pure_validators() {
  const today = '2026-11-11';
  const bar = (perSideKg) => ({ implement: 'barbell', perSideKg: perSideKg });
  const okSession = {
    id: 's1', date: '2026-11-11', status: 'done', groups: ['chest'],
    startedAt: '2026-11-11T07:30:00+01:00', endedAt: '2026-11-11T08:35:00+01:00',
    exercises: [{ exerciseId: 'press_banca', sets: [{ order: 1, type: 'working', reps: 8, rir: 2, load: bar(20), restSec: 150 }] }]
  };
  assert_(validateSession_(okSession, today).length === 0, 'sesión válida no debe tener errores: ' + validateSession_(okSession, today));
  assert_(validateSession_(Object.assign({}, okSession, { date: '2026-11-20' }), today).length > 0, 'fecha futura debe fallar');
  assert_(validateSession_(Object.assign({}, okSession, { date: '2026-02-30' }), today).length > 0, 'fecha inexistente debe fallar');
  assert_(validateSession_(Object.assign({}, okSession, { status: 'zumba' }), today).length > 0, 'status inválido debe fallar');
  assert_(validateSession_(Object.assign({}, okSession, { groups: ['cejas'] }), today).length > 0, 'grupo inválido debe fallar');
  assert_(validateSession_(Object.assign({}, okSession, { endedAt: '2026-11-11T07:00:00+01:00' }), today).length > 0, 'fin anterior al inicio debe fallar');
  assert_(validateSession_({ id: 'p1', date: '2026-12-01', status: 'planned', exercises: [] }, today).length === 0, 'sesión planificada futura y vacía es válida');
  assert_(validateSession_({ id: 's4', date: '2026-11-11', status: 'done' }, today).length > 0, 'sesión hecha sin ejercicios debe fallar');

  const badReps = JSON.parse(JSON.stringify(okSession));
  badReps.exercises[0].sets[0].reps = 2.5;
  assert_(validateSession_(badReps, today).length > 0, 'reps no enteras deben fallar');
  const rirNull = JSON.parse(JSON.stringify(okSession));
  rirNull.exercises[0].sets[0].rir = null;
  assert_(validateSession_(rirNull, today).length === 0, 'rir null (no mencionado) es válido');

  const meal = {
    id: 'm1', date: '2026-11-11', time: '13:30', mealType: 'lunch',
    items: [
      { name: 'pollo', quantity: 150, unit: 'g', kcal: 248, proteinG: 46.5, carbsG: 0, fatG: 5.4, fiberG: 0, confidence: 0.9 },
      { name: 'arroz', quantity: 200, unit: 'g', kcal: 260, proteinG: 5.4, carbsG: 56, fatG: 0.6, fiberG: 0.6, confidence: 0.9 }
    ],
    totals: { kcal: 508, proteinG: 51.9 }
  };
  assert_(validateMeal_(meal, today).length === 0, 'comida válida no debe tener errores');
  assert_(validateMeal_(Object.assign({}, meal, { totals: { kcal: 600, proteinG: 51.9 } }), today).length > 0,
    'totales que no cuadran deben fallar');
  const badUnit = JSON.parse(JSON.stringify(meal));
  badUnit.items[0].unit = 'litros';
  assert_(validateMeal_(badUnit, today).length > 0, 'unidad inválida debe fallar');

  assert_(validateBody_({ date: '2026-11-11', weightKg: 75.4, bodyFatPct: 15.2 }, today).length === 0, 'check-in válido');
  assert_(validateBody_({ date: '2026-11-11', weightKg: 5 }, today).length > 0, 'peso fuera de rango debe fallar');
  return 'ok';
}

function test_pure_metrics() {
  const s = {
    startedAt: '2026-11-11T07:30:00+01:00', endedAt: '2026-11-11T08:35:00+01:00',
    exercises: [
      { exerciseId: 'press_banca', sets: [
        { type: 'warmup', reps: 10, load: { implement: 'barbell', barKg: 20, perSideKg: 10, totalKg: 40 } },
        { type: 'working', reps: 8, load: { implement: 'barbell', barKg: 20, perSideKg: 20, totalKg: 60 } },
        { type: 'working', reps: 8, load: { implement: 'barbell', barKg: 20, perSideKg: 20, totalKg: 60 } }
      ] },
      { exerciseId: 'dominadas', sets: [{ type: 'working', reps: 6, load: { implement: 'bodyweight', addedKg: 10, totalKg: 10 } }] }
    ]
  };
  const m = computeSessionMetrics_(s, { bodyweightKg: 80 });
  // 8×60 + 8×60 + 6×(80×1 + 10) = 960 + 540 = 1500 (el calentamiento no cuenta)
  assert_(m.totalVolumeKg === 1500, 'volumen total esperado 1500, obtenido ' + m.totalVolumeKg);
  assert_(m.workingSets === 3, 'series efectivas esperadas: 3');
  assert_(m.durationMin === 65, 'duración esperada: 65 min');
  assert_(m.setsByGroup.chest === 2 && m.setsByGroup.back === 1, 'series por grupo (primario 1)');
  assert_(m.setsByGroup.shoulders === 1 && m.setsByGroup.triceps === 1 && m.setsByGroup.biceps === 0.5, 'secundarios cuentan 0,5');
  return 'ok';
}

function test_pure_loads() {
  const eq = { barbellKg: 20, ezBarKg: 10 };
  let r = normalizeLoad_({ implement: 'barbell', perSideKg: 20 }, eq);
  assert_(r.load.totalKg === 60 && r.load.barKg === 20, '"20 a cada lado" con barra de 20 = 60 kg');
  r = normalizeLoad_({ implement: 'barbell', perSideKg: 0 }, eq);
  assert_(r.load.totalKg === 20, '"la barra sola" = 20 kg');
  r = normalizeLoad_({ implement: 'barbell', totalKg: 50 }, eq);
  assert_(r.load.perSideKg === 15, 'total 50 → 15 por lado');
  r = normalizeLoad_({ implement: 'barbell', perSideKg: 20, totalKg: 70 }, eq);
  assert_(r.load === null && r.errors.length > 0, 'total que no cuadra debe fallar');
  r = normalizeLoad_({ implement: 'barbell', totalKg: 10 }, eq);
  assert_(r.load === null, 'total menor que la barra debe fallar');
  r = normalizeLoad_({ implement: 'ezbar', perSideKg: 10 }, eq);
  assert_(r.load.totalKg === 30, 'barra Z de 10 + 2×10 = 30');
  r = normalizeLoad_({ implement: 'dumbbell', perHandKg: 15 }, eq);
  assert_(r.load.totalKg === 30 && r.load.count === 2, '"mancuernas de 15" = 15 por mano, 2 mancuernas');
  r = normalizeLoad_({ implement: 'dumbbell', perHandKg: 24, count: 1 }, eq);
  assert_(r.load.totalKg === 24, 'una mancuerna de 24');
  r = normalizeLoad_({ implement: 'machine', stackKg: 70 }, eq);
  assert_(r.load.totalKg === 70, 'máquina: pila tal cual');
  r = normalizeLoad_({ implement: 'bodyweight' }, eq);
  assert_(r.load.addedKg === 0, 'peso corporal sin lastre');
  assert_(normalizeLoad_({ implement: 'barbell' }, eq).load === null, 'barra sin carga debe fallar');
  assert_(normalizeLoad_({ implement: 'trineo', stackKg: 5 }, eq).load === null, 'implemento desconocido');
  assert_(normalizeLoad_(null, eq).load === null, 'sin carga');
  // Volumen
  const set = { type: 'working', reps: 10, load: { implement: 'dumbbell', perHandKg: 15, count: 2, totalKg: 30 } };
  assert_(setVolume_(set, 80, 1) === 300, 'volumen = reps × total');
  assert_(setVolume_({ type: 'warmup', reps: 10, load: set.load }, 80, 1) === 0, 'el calentamiento no suma volumen');
  assert_(setVolume_({ type: 'working', reps: 10, load: { implement: 'bodyweight', addedKg: 0 } }, 80, 0.65) === 520, 'flexiones: 10 × 80 × 0,65');
  return 'ok';
}

function test_pure_exercises() {
  const lib = exerciseSeed_();
  assert_(lib.length >= 85 && lib.length <= 110, 'tamaño de la biblioteca: ' + lib.length);
  const ids = {};
  lib.forEach((e) => {
    assert_(!ids[e.id], 'id duplicado: ' + e.id); ids[e.id] = 1;
    assert_(e.name && e.implements.length > 0, e.id + ': nombre e implementos');
    assert_(e.primary.length > 0, e.id + ': necesita grupo primario');
    e.primary.concat(e.secondary).forEach((g) => assert_(GROUPS_.indexOf(g) >= 0, e.id + ': grupo inválido ' + g));
    e.implements.forEach((i) => assert_(IMPLEMENTS_.indexOf(i) >= 0, e.id + ': implemento inválido ' + i));
  });
  GROUPS_.forEach((g) => assert_(lib.some((e) => e.primary.indexOf(g) >= 0), 'ningún ejercicio primario para ' + g));
  assert_(findExercise_('Press banca', lib).id === 'press_banca', 'nombre exacto');
  assert_(findExercise_('PRESS BANCA!', lib).id === 'press_banca', 'tolera mayúsculas y signos');
  assert_(findExercise_('banca', lib).id === 'press_banca', 'alias "banca"');
  assert_(findExercise_('press banca inclinado', lib).id === 'press_inclinado', 'gana el nombre más largo');
  assert_(findExercise_('hice dominadas hoy', lib).id === 'dominadas', 'coincidencia dentro de una frase');
  assert_(findExercise_('Peso muerto rumano', lib).id === 'peso_muerto_rumano', 'rumano distinto de peso muerto');
  assert_(findExercise_('sentadilla búlgara', lib).id === 'sentadilla_bulgara', 'acentos');
  assert_(findExercise_('press de banca', lib).id === 'press_banca', 'ignora palabras de relleno (de)');
  assert_(findExercise_('curl de bíceps con mancuernas', lib).id === 'curl_mancuernas', 'curl de bíceps con mancuernas');
  assert_(findExercise_('el remo con barra', lib).id === 'remo_barra', 'artículos y preposiciones');
  assert_(findExercise_('baile flamenco', lib) === null, 'desconocido → null');
  assert_(findExercise_('', lib) === null, 'vacío → null');
  return 'ok';
}

function test_pure_helpers() {
  assert_(JSON.stringify(monthsBetween_('2026-11-01', '2027-02-10')) ===
    JSON.stringify(['2026-11', '2026-12', '2027-01', '2027-02']), 'monthsBetween_ cruza años');
  assert_(JSON.stringify(monthsBetween_('2026-03-05', '2026-03-20')) === JSON.stringify(['2026-03']), 'mismo mes');
  assert_(weekdayName_('2026-11-11') === 'wednesday', '2026-11-11 es miércoles');
  assert_(weekdayName_('2026-11-09') === 'monday', '2026-11-09 es lunes');

  const merged = deepMerge_({ goal: { targetKcal: 2400, type: 'recomp' }, injuries: ['x'] },
    { goal: { targetKcal: 2200 }, injuries: [] });
  assert_(merged.goal.targetKcal === 2200 && merged.goal.type === 'recomp', 'deepMerge_ conserva claves hermanas');
  assert_(merged.injuries.length === 0, 'deepMerge_ sustituye arrays');

  assert_(constantTimeEquals_('abc', 'abc') === true, 'iguales');
  assert_(constantTimeEquals_('abc', 'abd') === false, 'distintos');
  assert_(constantTimeEquals_('abc', 'abcd') === false, 'longitudes distintas');
  assert_(constantTimeEquals_('', '') === true, 'vacíos');
  return 'ok';
}

function test_commit_roundtrip() {
  const tz = 'Europe/Madrid';
  const rec = {
    id: 's_test_19990105_0730_t1t1', date: '1999-01-05', status: 'done',
    startedAt: '1999-01-05T07:30:00+01:00', endedAt: '1999-01-05T08:00:00+01:00',
    exercises: [{ exerciseId: 'press_banca', name: 'Press banca',
      sets: [{ order: 1, type: 'working', reps: 8, rir: 2, restSec: 150, load: { implement: 'barbell', perSideKg: 30 } }] }]
  };
  try {
    const first = commitRecord('session', rec);
    const second = commitRecord('session', rec); // reenvío: no debe duplicar
    assert_(first.id === second.id && second.updated === true, 'commit repetido debe hacer upsert');
    const q = queryRecords({ entity: 'session', from: '1999-01-01', to: '1999-01-31' });
    assert_(q.items.length === 1, 'debe haber exactamente 1 sesión tras reenviar, hay ' + q.items.length);
    assert_(q.items[0].metrics.totalVolumeKg === 640, 'métricas recalculadas al guardar');
  } finally {
    const it = folder_('sessions').getFilesByName('1999-01.json');
    while (it.hasNext()) it.next().setTrashed(true);
    invalidatePath_('sessions/1999-01.json');
  }
  return 'ok';
}

function fakeCache_() {
  const m = {};
  return { get: (k) => (k in m ? m[k] : null), put: (k, v) => { m[k] = String(v); } };
}

function test_pure_auth_lockout() {
  const cache = fakeCache_();
  const t = 1700000000000;
  for (let i = 0; i < AUTH_FAIL_LIMIT_; i++) {
    assert_(registerAuthFailure_(cache, t + i).blocked === false, 'no debe bloquear antes del límite');
  }
  const r = registerAuthFailure_(cache, t + 100);
  assert_(r.blocked && r.justBlocked, 'el fallo 21 debe bloquear');
  assert_(isAuthBlocked_(cache, t + 60000), 'sigue bloqueado a los 60 s');
  assert_(!isAuthBlocked_(cache, t + AUTH_BLOCK_SEC_ * 1000 + 1000), 'se desbloquea a los 15 min');
  assert_(registerAuthFailure_(cache, t + 200).justBlocked === false, 'no reenvía alerta mientras dura el bloqueo');
  return 'ok';
}

function test_pure_limits() {
  const b64 = (n) => 'A'.repeat(Math.ceil(n / 3) * 4);
  assert_(baseMime_('Audio/MP4;codecs=mp4a.40.2') === 'audio/mp4', 'baseMime_ limpia parámetros');
  assert_(validateMedia_('audio', 'audio/mp4;codecs=mp4a.40.2', b64(1000)) === 'audio/mp4', 'audio válido');
  let code = null;
  try { validateMedia_('audio', 'audio/mp4', b64(2 * 1024 * 1024 + 10)); } catch (e) { code = e.code; }
  assert_(code === 'TOO_LARGE', 'audio >2 MB debe rechazarse');
  code = null;
  try { validateMedia_('image', 'image/svg+xml', b64(1000)); } catch (e) { code = e.code; }
  assert_(code === 'VALIDATION', 'MIME fuera de lista blanca');
  code = null;
  try { validateMedia_('image', 'image/png', 'no es base64!!!!!!!!'); } catch (e) { code = e.code; }
  assert_(code === 'VALIDATION', 'base64 inválido');
  code = null;
  try { validateText_('x'.repeat(2001)); } catch (e) { code = e.code; }
  assert_(code === 'TOO_LARGE', 'texto >2000');
  assert_(validateText_('hola') === 'hola', 'texto corto pasa');
  code = null;
  try { checkBodySize_(6 * 1024 * 1024 + 1); } catch (e) { code = e.code; }
  assert_(code === 'TOO_LARGE', 'cuerpo >6 MB');
  assert_(base64Bytes_('QUJD') === 3 && base64Bytes_('QUI=') === 2, 'base64Bytes_');
  return 'ok';
}

function test_pure_gemini() {
  assert_(cleanModelName_('  gemini-2.5-flash\n') === 'gemini-2.5-flash', 'recorta espacios y saltos de línea');
  assert_(cleanModelName_('"models/gemini-2.5-flash"') === 'gemini-2.5-flash', 'quita comillas y prefijo models/');
  assert_(cleanModelName_(null) === '', 'null → vacío');
  const req = buildGeminiRequest_('SISTEMA', [{ text: 'usuario' }], { schema: { type: 'OBJECT' } });
  assert_(req.systemInstruction.parts[0].text === 'SISTEMA', 'instrucciones en systemInstruction');
  assert_(JSON.stringify(req.contents).indexOf('SISTEMA') < 0, 'las instrucciones no se mezclan con el mensaje del usuario');
  assert_(req.generationConfig.responseMimeType === 'application/json', 'JSON forzado con schema');
  const ok = parseGeminiResponse_({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] }, finishReason: 'STOP' }] });
  assert_(ok.text === '{"a":1}', 'extrae el texto');
  let code = null;
  try { parseGeminiResponse_({ promptFeedback: { blockReason: 'SAFETY' } }); } catch (e) { code = e.code; }
  assert_(code === 'AI_BLOCKED', 'bloqueo detectado');
  code = null;
  try { parseGeminiResponse_({ candidates: [{ finishReason: 'SAFETY' }] }); } catch (e) { code = e.code; }
  assert_(code === 'AI_BLOCKED', 'corte por seguridad detectado');
  code = null;
  try { parseGeminiResponse_({}); } catch (e) { code = e.code; }
  assert_(code === 'AI_EMPTY', 'respuesta vacía');
  return 'ok';
}

// ---------- Planificador ----------

const CYCLE_ = { sessions: [
  { key: 'A', groups: ['chest', 'triceps'] },
  { key: 'B', groups: ['back', 'biceps'] },
  { key: 'C', groups: ['quads', 'hamstrings', 'glutes', 'calves'] },
  { key: 'D', groups: ['shoulders', 'core'] }
] };
const doneS_ = (key, date) => ({ status: 'done', cycleKey: key, date: date, groups: [] });
const bb_ = (perSideKg) => normalizeLoad_({ implement: 'barbell', perSideKg: perSideKg }, {}).load;
const wset_ = (reps, rir, load) => ({ type: 'working', reps: reps, rir: rir, load: load });
const RX_ = { repsMin: 8, repsMax: 10, targetRir: 2 };

function test_pure_rotation() {
  assert_(validateCycle_(CYCLE_).length === 0, 'ciclo válido: ' + validateCycle_(CYCLE_));
  assert_(validateCycle_({ sessions: [{ key: 'A', groups: ['chest', 'back', 'triceps'] }, { key: 'B', groups: ['quads', 'glutes'] },
    { key: 'C', groups: ['shoulders', 'biceps'] }] }).length > 0, 'más de 2 grupos o grupos sin cubrir debe fallar');
  assert_(validateCycle_({ sessions: [CYCLE_.sessions[0], CYCLE_.sessions[1]] }).length > 0, 'ciclo demasiado corto');

  const next = (done) => pendingKeys_(CYCLE_, done)[0];
  assert_(next([]) === 'A', 'sin historial empieza por A');
  assert_(next([doneS_('A', '2026-11-01')]) === 'B', 'tras A toca B');
  assert_(next([doneS_('A', '2026-11-01'), doneS_('B', '2026-11-03')]) === 'C', 'tras A y B toca C');
  assert_(next([doneS_('A', '2026-11-01'), doneS_('B', '2026-11-03'), doneS_('C', '2026-11-05'), doneS_('D', '2026-11-07')]) === 'A', 'vuelta completa reinicia');
  assert_(next([doneS_('A', '2026-11-01'), doneS_('A', '2026-11-03')]) === 'B', 'repetir A no avanza de más');
  assert_(next([doneS_('B', '2026-11-01')]) === 'A', 'si B se hizo primero, A sigue pendiente');
  assert_(next([{ status: 'planned', cycleKey: 'A', date: '2026-11-01' }]) === 'A', 'las planificadas no cuentan');

  const done = [doneS_('A', '2026-11-01'), doneS_('B', '2026-11-03')];
  const now = '2026-11-05T09:00:00Z';
  let p = pickNextSession_(CYCLE_, done, [], now);
  assert_(p.key === 'C' && p.reason === 'rotation', 'sin carreras toca pierna');
  const long = { date: '2026-11-04', startedAt: '2026-11-04T13:00:00Z', durationSec: 4200, distanceKm: 8 };
  p = pickNextSession_(CYCLE_, done, [long], now);
  assert_(p.key === 'D' && p.skippedKey === 'C' && p.reason === 'long_run_skip_legs', 'tirada larga hace 20 h adelanta la sesión sin pierna');
  p = pickNextSession_(CYCLE_, done, [Object.assign({}, long, { startedAt: '2026-11-03T13:00:00Z' })], now);
  assert_(p.key === 'C', 'tirada larga hace 44 h no cuenta');
  p = pickNextSession_(CYCLE_, done, [{ date: '2026-11-04', startedAt: '2026-11-04T13:00:00Z', durationSec: 1800, distanceKm: 5 }], now);
  assert_(p.key === 'C', 'una salida corta no cuenta');
  p = pickNextSession_(CYCLE_, done, [{ date: '2026-11-04', startedAt: '2026-11-04T13:00:00Z', durationSec: 3000, distanceKm: 10.5 }], now);
  assert_(p.key === 'D', '10 km también es tirada larga');
  p = pickNextSession_(CYCLE_, [done[0], done[1], doneS_('D', '2026-11-04')], [long], now);
  assert_(p.key === 'C' && p.warning === 'legs_after_long_run', 'si solo queda pierna, se mantiene con aviso');
  p = pickNextSession_(CYCLE_, done, [{ date: '2026-11-05', durationSec: 4000 }], '2026-11-05T20:00:00Z');
  assert_(p.key === 'D', 'sin hora se asume mediodía');

  assert_(returnAdjust_(done, '2026-11-10').loadFactor === 1, '7 días no activa la regla de vuelta');
  const r = returnAdjust_(done, '2026-11-11');
  assert_(r.days === 8 && r.loadFactor === 0.9 && r.setsDelta === -1, '8 días: −10 % y −1 serie');
  assert_(returnAdjust_([], '2026-11-11').loadFactor === 1, 'sin historial no hay ajuste');
  return 'ok';
}

function test_pure_progression() {
  const eq = { barbellKg: 20, plateMinKg: 1.25, dumbbellStepKg: 2, stackStepKg: 5 };
  const top = (load) => [wset_(10, 2, load), wset_(10, 2, load), wset_(10, 3, load), wset_(10, 2, load)];

  let r = nextProgression_([{ sets: top(bb_(20)) }], RX_, eq);
  assert_(r.action === 'increase' && r.load.totalKg === 62.5 && r.load.perSideKg === 21.25, 'barra: +2,5 kg (1,25 por lado)');
  const db = normalizeLoad_({ implement: 'dumbbell', perHandKg: 15 }, eq).load;
  r = nextProgression_([{ sets: top(db) }], RX_, eq);
  assert_(r.load.perHandKg === 17 && r.load.totalKg === 34, 'mancuernas: siguiente par (+2 kg por mano)');
  const mq = normalizeLoad_({ implement: 'machine', stackKg: 70 }, eq).load;
  r = nextProgression_([{ sets: top(mq) }], RX_, eq);
  assert_(r.load.stackKg === 75, 'máquina: siguiente placa');

  r = nextProgression_([{ sets: [wset_(10, 2, bb_(20)), wset_(9, 2, bb_(20)), wset_(9, 2, bb_(20))] }], RX_, eq);
  assert_(r.action === 'hold' && r.reason === 'in_range', 'dentro del rango: mantener');
  r = nextProgression_([{ sets: [wset_(10, 2, bb_(20)), wset_(7, 1, bb_(20))] }], RX_, eq);
  assert_(r.action === 'hold' && r.reason === 'below_target', 'una serie bajo el mínimo: mantener');
  r = nextProgression_([{ sets: top(bb_(20)).map((s) => Object.assign({}, s, { rir: 0 })) }], RX_, eq);
  assert_(r.action === 'hold', 'RIR menor que objetivo − 1: no sube aunque llegue a 10');
  r = nextProgression_([{ sets: top(bb_(20)).map((s) => Object.assign({}, s, { rir: 1 })) }], RX_, eq);
  assert_(r.action === 'hold', 'RIR 1 con objetivo 2: no sube');
  r = nextProgression_([{ sets: top(bb_(20)).map((s) => Object.assign({}, s, { rir: null })) }], RX_, eq);
  assert_(r.action === 'increase' && r.rirUnknown === true, 'RIR sin registrar no bloquea, pero se marca');

  const miss = { sets: [wset_(7, 2, bb_(20)), wset_(6, 1, bb_(20))] };
  r = nextProgression_([miss, miss], RX_, eq);
  assert_(r.action === 'decrease' && r.suggestVariant && r.load.totalKg < 60 && r.load.totalKg >= 52.5, 'dos fallos seguidos: bajar 5-10 % o variante, obtenido ' + r.load.totalKg);
  r = nextProgression_([{ sets: top(bb_(20)) }, miss], RX_, eq);
  assert_(r.action === 'hold', 'un solo fallo tras una buena: mantener');
  r = nextProgression_([{ sets: [{ type: 'warmup', reps: 10, load: bb_(10) }] }], RX_, eq);
  assert_(r.reason === 'no_history', 'solo calentamiento = sin historial');

  // Límite duro ±10 %
  let c = clampLoadChange_(bb_(20), bb_(30), eq);
  assert_(c.clamped && c.load.totalKg <= 66 && c.load.totalKg >= 62.5, 'subida de 60 a 80 se recorta, obtenido ' + c.load.totalKg);
  c = clampLoadChange_(bb_(20), bb_(10), eq);
  assert_(c.clamped && c.load.totalKg >= 54 && c.load.totalKg <= 60, 'bajada de 60 a 40 se recorta, obtenido ' + c.load.totalKg);
  c = clampLoadChange_(bb_(20), bb_(21.25), eq);
  assert_(!c.clamped, 'un escalón normal no se recorta');
  const db8 = normalizeLoad_({ implement: 'dumbbell', perHandKg: 8 }, eq).load;
  const db10 = normalizeLoad_({ implement: 'dumbbell', perHandKg: 10 }, eq).load;
  assert_(!clampLoadChange_(db8, db10, eq).clamped, 'cargas ligeras: un escalón siempre se permite');

  // Descarga
  assert_(shouldDeload_(6, 0) && shouldDeload_(3, 2) && !shouldDeload_(3, 1) && !shouldDeload_(2, 5), 'criterios de descarga');
  const dl = applyDeload_({ exerciseId: 'press_banca', sets: 4, targetLoad: bb_(20) }, eq);
  assert_(dl.sets === 2 && dl.targetLoad.totalKg >= 52.5 && dl.targetLoad.totalKg <= 56, 'descarga: −40 % volumen y ~−10 % carga, obtenido ' + dl.targetLoad.totalKg);
  assert_(applyDeload_({ sets: 1, targetLoad: null }, eq).sets === 1, 'nunca menos de 1 serie');

  // Carga inicial
  const st = conservativeStart_('barbell', 65, eq);
  assert_(st.totalKg <= 55.25 && st.totalKg >= 50, 'inicio conservador (85 %) y hacia abajo, obtenido ' + st.totalKg);
  return 'ok';
}

function test_pure_plan_rules() {
  const eq = { barbellKg: 20, plateMinKg: 1.25 };
  const planned = [{ exerciseId: 'press_banca', sets: 4, repsMin: 8, repsMax: 10, targetRir: 2, targetLoad: bb_(30) }];
  const ctx = { lastLoads: { press_banca: bb_(20) }, equipment: eq };
  let r = applyPlanRules_(planned, ctx);
  assert_(r.exercises[0].targetLoad.totalKg <= 66 && r.notes.indexOf('clamped:press_banca') >= 0, 'la propuesta de la IA se recorta');
  assert_(planned[0].targetLoad.totalKg === 80, 'no muta la entrada');

  r = applyPlanRules_(planned, { lastLoads: {}, equipment: eq, firstSession: true });
  assert_(r.exercises[0].targetRir === 3 && r.exercises[0].targetLoad.totalKg === 80, 'primera sesión: RIR 3 y sin recorte');
  assert_(r.notes.indexOf('first_session') >= 0, 'nota de primera sesión');

  r = applyPlanRules_([{ exerciseId: 'press_banca', sets: 4, targetLoad: bb_(20), targetRir: 2 }],
    { lastLoads: { press_banca: bb_(20) }, equipment: eq, returnAdjust: { loadFactor: 0.9, setsDelta: -1 } });
  assert_(r.exercises[0].sets === 3 && r.exercises[0].targetLoad.totalKg < 60 && r.notes.indexOf('layoff') >= 0, 'regla de vuelta aplicada');

  r = applyPlanRules_([{ exerciseId: 'press_banca', sets: 4, targetLoad: bb_(20), targetRir: 2 }],
    { lastLoads: {}, equipment: eq, deload: true, returnAdjust: { loadFactor: 0.9, setsDelta: -1 } });
  assert_(r.exercises[0].sets === 2 && r.notes.indexOf('deload') >= 0 && r.notes.indexOf('layoff') < 0, 'la descarga prevalece sobre la vuelta');

  // Volumen semanal
  const sessions = [
    { status: 'done', date: '2026-11-02', metrics: { setsByGroup: { chest: 10, triceps: 5 } } },
    { status: 'done', date: '2026-11-04', metrics: { setsByGroup: { chest: 2, back: 12 } } },
    { status: 'done', date: '2026-11-12', metrics: { setsByGroup: { chest: 99 } } }
  ];
  const w = weeklyGroupSets_(sessions, '2026-11-02', '2026-11-08');
  assert_(w.chest === 12 && w.back === 12 && w.triceps === 5, 'suma semanal por grupo');
  const low = groupsBelowMin_(w);
  assert_(low.indexOf('triceps') >= 0 && low.indexOf('quads') >= 0 && low.indexOf('chest') < 0, 'grupos por debajo de 8 series');
  return 'ok';
}

// ---------- Generación del plan ----------

function test_pure_settings() {
  const d = defaultSettings_();
  assert_(validateSettings_(d).length === 0, 'los ajustes por defecto son válidos: ' + validateSettings_(d));
  assert_(isOnboarded_(d) === false, 'por defecto no hay bienvenida completada');
  assert_(d.profile.heightCm === null && d.goal.startWeightKg === null && d.strength.referenceTotalKg === null,
    'ningún dato personal en los valores por defecto');
  const f = deepMerge_(d, { profile: { sex: 'male', birthYear: 1980, heightCm: 175 },
    goal: { startWeightKg: 80, targetWeightKg: 82, startWaistCm: 90 }, strength: { referenceTotalKg: 60 } });
  assert_(validateSettings_(f).length === 0 && isOnboarded_(f), 'ajustes rellenos válidos y bienvenida completa');
  assert_(validateSettings_(deepMerge_(d, { profile: { heightCm: 20 } })).length > 0, 'altura absurda rechazada');
  assert_(validateSettings_(deepMerge_(d, { coach: { intensity: 'extrema' } })).length > 0, 'intensidad inválida');
  assert_(validateSettings_(deepMerge_(d, { profile: { sex: 'otro' } })).length > 0, 'sexo inválido');
  return 'ok';
}

function lib_() { return exerciseSeed_(); }
const EQ_ = { barbellKg: 20, ezBarKg: 10, dumbbellStepKg: 2, plateMinKg: 1.25, stackStepKg: 5 };

function test_pure_plan_from_history() {
  const mk = (date, sets) => ({ status: 'done', cycleKey: 'A', date: date, groups: ['chest', 'triceps'],
    plannedExercises: [{ exerciseId: 'press_banca', name: 'Press banca', sets: 4, repsMin: 8, repsMax: 10, targetRir: 2, restSec: 120, targetLoad: bb_(20) }],
    exercises: [{ exerciseId: 'press_banca', sets: sets }] });
  const full = [wset_(10, 2, bb_(20)), wset_(10, 2, bb_(20)), wset_(10, 2, bb_(20)), wset_(10, 3, bb_(20))];
  const s1 = mk('2026-11-16', full);
  let plan = planFromHistory_(s1, [s1], lib_(), EQ_);
  assert_(plan.length === 1 && plan[0].exerciseId === 'press_banca', 'mismos ejercicios que la última vez');
  assert_(plan[0].targetLoad.totalKg === 62.5 && plan[0].progression === 'increase', 'sube la carga tras llegar al máximo');
  assert_(plan[0].sets === 4 && plan[0].repsMax === 10 && plan[0].targetRir === 2, 'conserva series y rangos');

  const weak = mk('2026-11-16', [wset_(9, 2, bb_(20)), wset_(8, 2, bb_(20)), wset_(8, 2, bb_(20))]);
  plan = planFromHistory_(weak, [weak], lib_(), EQ_);
  assert_(plan[0].targetLoad.totalKg === 60 && plan[0].progression === 'hold', 'en rango: mantiene');

  // Sin plannedExercises: se reconstruye desde lo hecho
  const bare = { status: 'done', cycleKey: 'A', date: '2026-11-16', exercises: [{ exerciseId: 'curl_barra', sets: [wset_(12, 2, normalizeLoad_({ implement: 'ezbar', perSideKg: 10 }, EQ_).load)] }] };
  plan = planFromHistory_(bare, [bare], lib_(), EQ_);
  assert_(plan[0].repsMin === 10 && plan[0].repsMax === 15 && plan[0].targetLoad.totalKg === 30, 'reconstruye rangos de aislamiento');

  assert_(exerciseHistory_([s1], 'press_banca', 2).length === 1 && exerciseHistory_([s1], 'sentadilla', 2).length === 0, 'historial por ejercicio');
  assert_(lastLoads_([s1]).press_banca.totalKg === 60, 'última carga conocida');
  assert_(lastSessionOfKey_([s1, mk('2026-11-20', full)], 'A').date === '2026-11-20', 'última sesión de la clave');
  assert_(lastSessionOfKey_([s1], 'B') === null, 'clave sin historial');
  return 'ok';
}

function test_pure_ai_plan() {
  const groups = ['chest', 'triceps'];
  const good = { exercises: [
    { exerciseId: 'press_banca', implement: 'barbell', sets: 4, repsMin: 6, repsMax: 10, estimated10RmTotalKg: 65, restSec: 120 },
    { exerciseId: 'press_inclinado', implement: 'dumbbell', sets: 3, repsMin: 8, repsMax: 12, estimated10RmTotalKg: 44, restSec: 90 },
    { exerciseId: 'aperturas', implement: 'cable', sets: 3, repsMin: 10, repsMax: 15, estimated10RmTotalKg: 30, restSec: 75 },
    { exerciseId: 'extension_polea', implement: 'cable', sets: 3, repsMin: 10, repsMax: 15, estimated10RmTotalKg: 35, restSec: 75 }
  ] };
  assert_(validateAiPlan_(good, groups, lib_()).length === 0, 'plan válido: ' + validateAiPlan_(good, groups, lib_()));
  const bad = (mut) => { const c = JSON.parse(JSON.stringify(good)); mut(c); return validateAiPlan_(c, groups, lib_()).length > 0; };
  assert_(bad((c) => { c.exercises[0].exerciseId = 'baile'; }), 'id inventado rechazado');
  assert_(bad((c) => { c.exercises[0].exerciseId = 'sentadilla'; }), 'ejercicio de otro grupo rechazado');
  assert_(bad((c) => { c.exercises[0].implement = 'machine'; }), 'implemento no válido rechazado');
  assert_(bad((c) => { c.exercises[1].exerciseId = 'press_banca'; }), 'ejercicio repetido rechazado');
  assert_(bad((c) => { c.exercises[0].sets = 9; }), 'demasiadas series rechazadas');
  assert_(bad((c) => { c.exercises[0].repsMin = 12; }), 'rango invertido rechazado');
  assert_(bad((c) => { c.exercises[0].estimated10RmTotalKg = -5; }), 'estimación negativa rechazada');
  assert_(bad((c) => { c.exercises = c.exercises.slice(0, 2); }), 'muy pocos ejercicios rechazados');
  assert_(validateAiPlan_({}, groups, lib_()).length > 0, 'sin ejercicios rechazado');

  const planned = buildPlannedFromAi_(good, lib_(), EQ_);
  assert_(planned[0].targetLoad.totalKg <= 55.25 && planned[0].targetLoad.totalKg >= 50, 'barra: 85 % hacia abajo, obtenido ' + planned[0].targetLoad.totalKg);
  assert_(planned[1].targetLoad.implement === 'dumbbell' && planned[1].targetLoad.perHandKg === 18, 'mancuernas: 44 × 0,85 / 2 → 18 por mano');
  assert_(planned.every((p) => p.targetRir === 3), 'primera sesión: RIR 3');
  const ruled = applyPlanRules_(planned, { lastLoads: {}, equipment: EQ_, firstSession: true });
  assert_(ruled.notes.indexOf('first_session') >= 0, 'primera sesión marcada');
  return 'ok';
}

function test_pure_prompts() {
  const settings = deepMerge_(defaultSettings_(), { strength: { referenceTotalKg: 65 } });
  const user = buildSessionUser_(['chest', 'triceps'], settings, lib_());
  assert_(user.ejerciciosPermitidos.length > 5 && user.ejerciciosPermitidos.every((x) => lib_().find((e) => e.id === x.id).primary.some((g) => ['chest', 'triceps'].indexOf(g) >= 0)), 'solo ejercicios de los grupos de hoy');
  assert_(user.referenciaDeFuerza.pesoTotalKg === 65, 'la referencia viaja en el mensaje del usuario');
  assert_(SESSION_SYSTEM_.indexOf('65') < 0, 'las instrucciones no contienen datos del usuario');
  assert_(JSON.stringify(buildCycleUser_(settings)).indexOf('65') < 0, 'el ciclo no necesita la referencia');

  const neutral = buildCoachSystem_('', 'alta');
  assert_(neutral.indexOf('neutro') >= 0 && neutral.indexOf('Personalidad') < 0, 'sin persona: tono neutro');
  const withP = buildCoachSystem_('TEXTO DE PRUEBA', 'baja');
  assert_(withP.indexOf('TEXTO DE PRUEBA') >= 0 && withP.indexOf('templado') >= 0, 'con persona e intensidad');
  assert_(buildCoachSystem_('x', 'alta').indexOf('No cambies ni inventes cargas') >= 0, 'el estilo no toca los números');
  assert_(buildCoachSystem_('x', 'alta').indexOf('dolor') >= 0, 'seguridad física incluida');
  const m = neutralCoachMessage_(['quads', 'glutes'], ['layoff', 'deload']);
  assert_(m.indexOf('cuádriceps y glúteos') >= 0 && m.indexOf('parado') >= 0 && m.indexOf('descarga') >= 0, 'mensaje neutro con avisos');
  assert_(CYCLE_SYSTEM_.indexOf('chest') >= 0, 'el ciclo pide los grupos válidos');
  return 'ok';
}

// ---------- Dictado ----------

const ev_ = (o) => Object.assign({ type: 'set', exerciseName: null, implement: null, setType: null, reps: null, rir: null,
  perSideKg: null, perHandKg: null, totalKg: null, stackKg: null, addedKg: null, count: null, repeatLast: false, side: null, text: null }, o);
const sess_ = (extra) => Object.assign({ id: 's_20261116_1800_ab12', date: '2026-11-16', status: 'in_progress', exercises: [], clips: [],
  plannedExercises: [
    { exerciseId: 'press_banca', name: 'Press banca', sets: 4, targetLoad: bb_(15) },
    { exerciseId: 'press_inclinado', name: 'Press inclinado', sets: 3, targetLoad: normalizeLoad_({ implement: 'dumbbell', perHandKg: 20 }, {}).load }
  ] }, extra || {});
function ctx_() { return { library: exerciseSeed_(), equipment: { barbellKg: 20, ezBarKg: 10, dumbbellStepKg: 2, plateMinKg: 1.25, stackStepKg: 5 }, clipId: 'c_20261116_1832_x7k2' }; }

function test_pure_dictation() {
  // "press banca con barra y 20 a cada lado, 8 repeticiones, me quedaban dos"
  let r = eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', perSideKg: 20, reps: 8, rir: 2 })], sess_(), ctx_());
  const set = r.exercises[0].sets[0];
  assert_(r.exercises[0].exerciseId === 'press_banca' && set.load.totalKg === 60 && set.reps === 8 && set.rir === 2, '"20 a cada lado" = 60 kg, 8 reps, RIR 2');
  assert_(set.order === 1 && set.type === 'working' && set.clipId === ctx_().clipId, 'orden, tipo y clip de origen');

  // "otra igual"
  const s2 = sess_({ exercises: r.exercises });
  r = eventsToSets_([ev_({ repeatLast: true })], s2, ctx_());
  assert_(r.exercises[0].sets.length === 2 && r.exercises[0].sets[1].load.totalKg === 60 && r.exercises[0].sets[1].reps === 8 && r.exercises[0].sets[1].rir === 2, '"otra igual" repite la última serie');
  r = eventsToSets_([ev_({ repeatLast: true, reps: 7, rir: 1 })], s2, ctx_());
  assert_(r.exercises[0].sets[1].reps === 7 && r.exercises[0].sets[1].rir === 1, '"otra igual pero 7" respeta lo nuevo');

  // Solo repeticiones: hereda la carga y lo marca
  r = eventsToSets_([ev_({ reps: 6, rir: 1 })], s2, ctx_());
  assert_(r.exercises[0].sets[1].load.totalKg === 60 && r.exercises[0].sets[1].flags.indexOf('inherited_load') >= 0, 'sin carga: hereda la anterior y lo señala');

  // Mancuernas de 15 y "otra serie de 10"
  r = eventsToSets_([ev_({ exerciseName: 'press inclinado', implement: 'dumbbell', perHandKg: 15, reps: 10 })], sess_(), ctx_());
  assert_(r.exercises[0].sets[0].load.totalKg === 30 && r.exercises[0].sets[0].load.count === 2 && r.exercises[0].sets[0].rir === null, '"mancuernas de 15" = 30 kg y RIR sin inventar (null)');

  // Cambio de ejercicio y orden de aparición
  r = eventsToSets_([ev_({ exerciseName: 'banca', implement: 'barbell', perSideKg: 20, reps: 8 }),
    ev_({ exerciseName: 'elevaciones laterales', implement: 'dumbbell', perHandKg: 8, reps: 12, rir: 1 }),
    ev_({ repeatLast: true })], sess_(), ctx_());
  assert_(r.exercises.length === 2 && r.exercises[1].exerciseId === 'elevaciones_laterales' && r.exercises[1].sets.length === 2, 'varios ejercicios en un clip, la repetición va al último');

  // Total de la barra dictado ("barra con 60 kilos")
  r = eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', totalKg: 60, reps: 5 })], sess_(), ctx_());
  assert_(r.exercises[0].sets[0].load.perSideKg === 20, 'total 60 con barra de 20 = 20 por lado');

  // Sin ejercicio ni historial: el siguiente del plan, con aviso
  r = eventsToSets_([ev_({ implement: 'barbell', perSideKg: 15, reps: 10 })], sess_(), ctx_());
  assert_(r.exercises[0].exerciseId === 'press_banca' && r.warnings[0] === 'assumed_exercise:press_banca', 'asume el siguiente del plan y avisa');
  // Sin carga dicha ni serie previa: usa el plan y lo señala
  r = eventsToSets_([ev_({ exerciseName: 'press banca', reps: 10 })], sess_(), ctx_());
  assert_(r.exercises[0].sets[0].load.totalKg === 50 && r.exercises[0].sets[0].flags[0] === 'load_from_plan', 'carga del plan señalada');
  // Implemento por defecto del plan
  r = eventsToSets_([ev_({ exerciseName: 'press inclinado', perHandKg: 22, reps: 8 })], sess_(), ctx_());
  assert_(r.exercises[0].sets[0].load.implement === 'dumbbell', 'implemento tomado del plan');

  // Pendientes: nunca se inventa
  r = eventsToSets_([ev_({ exerciseName: 'baile flamenco', reps: 5 })], sess_(), ctx_());
  assert_(r.exercises.length === 0 && r.pending[0].reason === 'unknown_exercise', 'ejercicio desconocido → pendiente');
  r = eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', perSideKg: 20 })], sess_(), ctx_());
  assert_(r.exercises.length === 0 && r.pending[0].reason === 'missing_reps', 'sin repeticiones → pendiente');
  r = eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', totalKg: 4, reps: 5 })], sess_(), ctx_());
  assert_(r.pending[0].reason === 'invalid_load', 'carga imposible → pendiente');
  r = eventsToSets_([ev_({ repeatLast: true })], sess_({ plannedExercises: [] }), ctx_());
  assert_(r.pending[0].reason === 'no_exercise', 'nada que repetir ni ejercicio');
  r = eventsToSets_([ev_({ exerciseName: 'curl de biceps', repeatLast: true })], sess_(), ctx_());
  assert_(r.pending[0].reason === 'nothing_to_repeat', 'repetir sin serie previa');

  // Dolor
  r = eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', perSideKg: 20, reps: 8 }),
    ev_({ type: 'pain', text: 'me molesta el hombro derecho' })], sess_(), ctx_());
  assert_(r.pain.length === 1 && r.pain[0].exerciseId === 'press_banca', 'dolor registrado para el entrenador');
  // Calentamiento y dropset
  r = eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', perSideKg: 10, reps: 10, setType: 'warmup' })], sess_(), ctx_());
  assert_(r.exercises[0].sets[0].type === 'warmup', 'calentamiento');
  assert_(sess_().exercises.length === 0, 'no muta la sesión original');
  return 'ok';
}

function test_pure_clip_validation() {
  const ok = { transcript: 'hola', events: [ev_({ exerciseName: 'press banca', reps: 8, perSideKg: 20, implement: 'barbell' })] };
  assert_(validateClipResponse_(ok).length === 0, 'respuesta válida: ' + validateClipResponse_(ok));
  assert_(validateClipResponse_({ transcript: 'x', events: [] }).length === 0, 'sin series es válido');
  assert_(validateClipResponse_({ events: [] }).length > 0, 'sin transcript');
  assert_(validateClipResponse_({ transcript: 'x', events: [ev_({ type: 'baile' })] }).length > 0, 'tipo inválido');
  assert_(validateClipResponse_({ transcript: 'x', events: [ev_({ implement: 'trineo' })] }).length > 0, 'implemento inválido');
  assert_(validateClipResponse_({ transcript: 'x', events: [ev_({ reps: 2.5 })] }).length > 0, 'reps no enteras');
  assert_(validateClipResponse_({ transcript: 'x', events: [ev_({ rir: 14 })] }).length > 0, 'rir fuera de rango');
  assert_(validateClipResponse_({ transcript: 'x', events: [ev_({ perSideKg: -5 })] }).length > 0, 'carga negativa');
  assert_(CLIP_SYSTEM_.indexOf('NO calcules kilos totales') >= 0, 'la IA no calcula totales');
  assert_(JSON.stringify(buildClipUser_(sess_(), ctx_().library)).indexOf('press_banca') >= 0, 'contexto con el plan de hoy');
  return 'ok';
}

function test_pure_edit_ops() {
  const base = sess_();
  const r0 = eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', perSideKg: 20, reps: 8, rir: 2 }), ev_({ repeatLast: true })], base, ctx_());
  const s = sess_({ exercises: r0.exercises, pending: [{ reason: 'missing_reps' }] });
  const eq = ctx_().equipment; const lib = ctx_().library;
  let n = applyEditOp_(s, { op: 'update', exerciseId: 'press_banca', order: 2, patch: { reps: 9, rir: 1 } }, eq, lib);
  assert_(n.exercises[0].sets[1].reps === 9 && n.exercises[0].sets[1].rir === 1, 'editar repeticiones y RIR');
  n = applyEditOp_(s, { op: 'update', exerciseId: 'press_banca', order: 1, patch: { load: { perSideKg: 22.5 } } }, eq, lib);
  assert_(n.exercises[0].sets[0].load.totalKg === 65, 'cambiar carga recalcula el total (22,5 por lado = 65)');
  assert_(s.exercises[0].sets[0].load.totalKg === 60, 'no muta la original');
  n = applyEditOp_(s, { op: 'delete', exerciseId: 'press_banca', order: 1 }, eq, lib);
  assert_(n.exercises[0].sets.length === 1 && n.exercises[0].sets[0].order === 1, 'borrar reordena');
  n = applyEditOp_(n, { op: 'delete', exerciseId: 'press_banca', order: 1 }, eq, lib);
  assert_(n.exercises.length === 0, 'sin series, el ejercicio desaparece');
  n = applyEditOp_(s, { op: 'add', exerciseId: 'curl_barra', set: { reps: 12, rir: 2, load: { implement: 'ezbar', perSideKg: 10 } } }, eq, lib);
  assert_(n.exercises[1].sets[0].load.totalKg === 30, 'añadir serie a un ejercicio nuevo');
  n = applyEditOp_(s, { op: 'dismiss_pending', index: 0 }, eq, lib);
  assert_(n.pending.length === 0, 'descartar pendiente');
  const fails = (op) => { try { applyEditOp_(s, op, eq, lib); return false; } catch (e) { return e.code === 'VALIDATION'; } };
  assert_(fails({ op: 'update', exerciseId: 'press_banca', order: 9, patch: {} }), 'serie inexistente');
  assert_(fails({ op: 'update', exerciseId: 'press_banca', order: 1, patch: { reps: -3 } }), 'reps negativas');
  assert_(fails({ op: 'update', exerciseId: 'press_banca', order: 1, patch: { load: { perSideKg: -1 } } }), 'carga negativa');
  assert_(fails({ op: 'add', exerciseId: 'baile', set: {} }), 'ejercicio desconocido');
  assert_(fails({ op: 'borrar_todo' }), 'operación desconocida');
  assert_(fails({ op: 'dismiss_pending', index: 7 }), 'pendiente inexistente');
  return 'ok';
}

function test_pure_ids() {
  assert_(SESSION_ID_RE_.test('s_20261116_1800_ab12') && !SESSION_ID_RE_.test('../x') && !SESSION_ID_RE_.test('s_2026_x'), 'ids de sesión');
  assert_(CLIP_ID_RE_.test('c_20261116_1832_x7k2') && !CLIP_ID_RE_.test('c_ ') && !CLIP_ID_RE_.test('x_20261116'), 'ids de clip');
  assert_(sessionPath_('s_20261116_1800_ab12') === 'sessions/2026-11.json', 'ruta del shard');
  let c = null; try { sessionPath_('../etc'); } catch (e) { c = e.code; }
  assert_(c === 'VALIDATION', 'id malicioso rechazado');
  return 'ok';
}

// ---------- Revisión ----------

function test_pure_review() {
  const lib = exerciseSeed_();
  const mkSet = (order, reps, rir, ps, extra) => Object.assign({ order: order, type: 'working', reps: reps, rir: rir, load: bb_(ps), clipId: 'c_1', flags: [] }, extra || {});
  const planned = [
    { exerciseId: 'press_banca', name: 'Press banca', sets: 4, repsMin: 6, repsMax: 10, targetRir: 3, targetLoad: bb_(15) },
    { exerciseId: 'press_inclinado', name: 'Press inclinado', sets: 3, repsMin: 8, repsMax: 12, targetRir: 3, targetLoad: normalizeLoad_({ implement: 'dumbbell', perHandKg: 20 }, {}).load },
    { exerciseId: 'extension_polea', name: 'Extensión de tríceps en polea', sets: 3, repsMin: 10, repsMax: 15, targetRir: 3, targetLoad: normalizeLoad_({ implement: 'cable', stackKg: 30 }, {}).load }
  ];
  const session = { id: 's_20261116_1800_ab12', cycleKey: 'A', groups: ['chest', 'triceps'], plannedExercises: planned,
    exercises: [
      { exerciseId: 'press_banca', name: 'Press banca', sets: [mkSet(1, 10, 2, 10, { type: 'warmup' }), mkSet(2, 8, 2, 20), mkSet(3, 8, null, 20, { flags: ['inherited_load'] })] },
      { exerciseId: 'curl_barra', name: 'Curl con barra', sets: [mkSet(1, 12, 2, 10)] }
    ],
    pending: [{ reason: 'unknown_exercise', text: 'baile' }], painFlags: [{ text: 'hombro' }] };
  const prev = { exercises: [{ exerciseId: 'press_banca', sets: [mkSet(1, 10, 2, 17.5), mkSet(2, 10, 2, 17.5)] }] };

  const r = buildReview_(session, prev, lib, { bodyweightKg: 80 });
  const pb = r.exercises[0];
  assert_(pb.doneSets === 2 && pb.plannedSets === 4, 'el calentamiento no cuenta: 2 series de 4 previstas');
  assert_(pb.topLoad.totalKg === 60 && pb.vsPlanKg === 10, 'frente al plan: 60 kg frente a 50');
  assert_(pb.vsLast.deltaKg === 5 && pb.vsLast.topKg === 55, 'frente a la última vez: +5 kg');
  assert_(pb.volumeKg === 960 && pb.vsLast.volumeKg === 1100 && pb.vsLast.volumePct === -13, 'volumen 960 frente a 1100 (−13 %)');
  assert_(pb.rirUnknown === 1 && pb.avgRir === 2, 'RIR sin dato contado aparte');
  assert_(r.exercises[1].inPlan === false && r.exercises[1].vsLast === null, 'ejercicio fuera del plan y sin historial');
  const types = r.issues.map((i) => i.type);
  ['fewer_sets', 'unplanned', 'missing', 'pending', 'inherited_load', 'rir_unknown', 'pain'].forEach((t) => assert_(types.indexOf(t) >= 0, 'falta el aviso ' + t));
  assert_(r.missing.length === 2 && r.missing[0].name === 'Press inclinado', 'ejercicios del plan sin hacer');
  assert_(r.summary.workingSets === 3 && r.hasPrevious, 'resumen y existencia de sesión previa');
  assert_(JSON.stringify(session).indexOf('vsLast') < 0, 'no muta la sesión');

  const clean = buildReview_({ plannedExercises: [planned[0]], exercises: [{ exerciseId: 'press_banca', name: 'Press banca', sets: [mkSet(1, 8, 2, 15), mkSet(2, 8, 2, 15), mkSet(3, 8, 2, 15), mkSet(4, 8, 2, 15)] }] }, null, lib, {});
  assert_(clean.issues.length === 0 && clean.hasPrevious === false && clean.exercises[0].vsPlanKg === 0, 'sesión limpia: sin avisos');

  const msg = neutralReviewMessage_(r);
  assert_(msg.indexOf('2 series') < 0 && msg.indexOf('3 series') >= 0 && msg.indexOf('Press inclinado') >= 0 && msg.indexOf('molestia') >= 0, 'mensaje neutro con datos reales');
  return 'ok';
}

function test_pure_save_validation() {
  const eq = { barbellKg: 20, ezBarKg: 10 };
  const ok = { id: 's_20261116_1800_ab12', date: '2026-11-16', status: 'review', groups: ['chest'], pending: [], startedAt: '2026-11-16T17:00:00Z', endedAt: '2026-11-16T18:10:00Z',
    exercises: [{ exerciseId: 'press_banca', name: 'Press banca', sets: [{ order: 1, type: 'working', reps: 8, rir: 2, load: bb_(20) }] }] };
  assert_(validateForSave_(ok, '2026-11-16', eq).length === 0, 'sesión correcta: ' + validateForSave_(ok, '2026-11-16', eq));
  assert_(validateForSave_(Object.assign({}, ok, { pending: [{ reason: 'x' }] }), '2026-11-16', eq).some((m) => m.indexOf('pendientes') >= 0), 'con pendientes no se guarda');
  assert_(validateForSave_(Object.assign({}, ok, { exercises: [] }), '2026-11-16', eq).length > 0, 'sin series no se guarda');
  const onlyWarm = JSON.parse(JSON.stringify(ok)); onlyWarm.exercises[0].sets[0].type = 'warmup';
  assert_(validateForSave_(onlyWarm, '2026-11-16', eq).some((m) => m.indexOf('serie de trabajo') >= 0), 'solo calentamiento no cuenta');
  const bad = JSON.parse(JSON.stringify(ok)); bad.exercises[0].sets[0].reps = null;
  assert_(validateForSave_(bad, '2026-11-16', eq).length > 0, 'serie sin repeticiones no se guarda');
  assert_(SESSION_STATUS_.indexOf('discarded') >= 0, 'existe el estado descartada');
  assert_(validateSession_({ id: 'x', date: '2026-11-16', status: 'discarded' }, '2026-11-16').length === 0, 'una sesión descartada es válida');
  assert_(pendingKeys_(CYCLE_, [{ status: 'discarded', cycleKey: 'A', date: '2026-11-16' }])[0] === 'A', 'una sesión descartada no cuenta para la rotación');
  return 'ok';
}

function test_pure_bar_inference() {
  const eq = { barbellKg: 20, ezBarKg: 10 };
  let r = normalizeLoad_({ implement: 'barbell', perSideKg: 10, totalKg: 30 }, eq);
  assert_(r.load === null && r.errors[0].indexOf('no cuadra') >= 0 && r.errors[0].indexOf('barKg') < 0, 'estricto por defecto y mensaje sin jerga');
  r = normalizeLoad_({ implement: 'barbell', perSideKg: 10, totalKg: 30 }, eq, { inferBar: true });
  assert_(r.load.barKg === 10 && r.load.totalKg === 30 && r.load.barInferred === true, 'deduce barra de 10 kg a partir de 10 por lado y 30 en total');
  r = normalizeLoad_({ implement: 'barbell', perSideKg: 20, totalKg: 60 }, eq, { inferBar: true });
  assert_(r.load.totalKg === 60 && !r.load.barInferred, 'si cuadra con la barra por defecto no se deduce nada');
  r = normalizeLoad_({ implement: 'barbell', perSideKg: 20, totalKg: 20 }, eq, { inferBar: true });
  assert_(r.load === null, 'barra deducida imposible (negativa) se rechaza');
  r = normalizeLoad_({ implement: 'barbell', perSideKg: 10, totalKg: 90 }, eq, { inferBar: true });
  assert_(r.load === null, 'barra deducida de 70 kg no es plausible');

  // En el dictado: se acepta, se avisa y se reutiliza en las series siguientes
  let res = eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', perSideKg: 10, totalKg: 30, reps: 8 })], sess_(), ctx_());
  const set = res.exercises[0].sets[0];
  assert_(res.pending.length === 0 && set.load.totalKg === 30 && set.load.barKg === 10 && set.flags.indexOf('bar_inferred') >= 0 && set.load.barInferred === undefined, 'dictado: barra deducida y señalada');
  const s2 = sess_({ exercises: res.exercises });
  res = eventsToSets_([ev_({ perSideKg: 12.5, reps: 8 })], s2, ctx_());
  assert_(res.exercises[0].sets[1].load.totalKg === 35, 'las series siguientes reutilizan la barra deducida (10 + 2 × 12,5)');

  // Pendientes con lo entendido
  res = eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', perSideKg: 20, totalKg: 20, reps: 8 })], sess_(), ctx_());
  assert_(res.pending.length === 0 && res.exercises[0].sets[0].load.totalKg === 60 && res.exercises[0].sets[0].flags.indexOf('total_ignored') >= 0,
    'total absurdo junto a "20 por lado": se fía de los kilos por lado (60 kg) y avisa');
  res = eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', totalKg: 4, reps: 8 })], sess_(), ctx_());
  assert_(res.pending[0].reason === 'invalid_load' && res.pending[0].heard.totalKg === 4 && res.pending[0].heard.reps === 8, 'el pendiente guarda lo que la IA entendió');
  const rv2 = buildReview_({ plannedExercises: [], exercises: eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', perSideKg: 20, totalKg: 20, reps: 8 })], sess_(), ctx_()).exercises }, null, ctx_().library, {});
  assert_(rv2.issues.some((i) => i.type === 'total_ignored'), 'la revisión avisa de que se ignoró el total');
  res = eventsToSets_([ev_({ exerciseName: 'baile', reps: 5 })], sess_(), ctx_());
  assert_(res.pending[0].heard.reps === 5, 'también en ejercicio desconocido');

  // Aviso en la revisión
  const rv = buildReview_({ plannedExercises: [], exercises: eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', perSideKg: 10, totalKg: 30, reps: 8 })], sess_(), ctx_()).exercises }, null, ctx_().library, {});
  assert_(rv.issues.some((i) => i.type === 'bar_inferred' && i.barKg === 10), 'la revisión avisa de la barra deducida');
  assert_(CLIP_SYSTEM_.indexOf('nunca reps 20') >= 0 && CLIP_SYSTEM_.indexOf('no sumes la barra') >= 0, 'el prompt distingue reps de kilos y no suma la barra');
  return 'ok';
}

// ---------- Medidas corporales ----------

function test_pure_measurements() {
  assert_(MEASURE_KEYS_.length === 13 && MEASURE_KEYS_.indexOf('armR') >= 0 && MEASURE_KEYS_.indexOf('calfL') >= 0, 'catálogo de 13 medidas');
  assert_(validateMeasurements_({ waist: 99.5, armR: 38, thighL: 62 }).length === 0, 'medidas válidas');
  assert_(validateMeasurements_({ waist: 20 }).length > 0, 'cintura de 20 cm imposible');
  assert_(validateMeasurements_({ armR: 380 }).length > 0, 'brazo de 380 cm (cm por mm) imposible');
  assert_(validateMeasurements_({ cejas: 5 }).length > 0, 'medida desconocida');
  assert_(validateMeasurements_({ arm: 35 }).length > 0, 'sin lado no es una clave válida');
  assert_(validateBody_({ date: '2026-11-11', weightKg: 80, measurementsCm: { waist: 99 } }, '2026-11-11').length === 0, 'registro con medidas válido');
  assert_(validateBody_({ date: '2026-11-11', measurementsCm: { waist: 999 } }, '2026-11-11').length > 0, 'registro con medida absurda rechazado');

  // Un segundo registro del mismo día no borra las medidas anteriores
  const m = mergeBody_({ date: 'd', weightKg: 80, measurementsCm: { waist: 99, armR: 37 } }, { date: 'd', measurementsCm: { armR: 38, thighR: 60 } });
  assert_(m.weightKg === 80 && m.measurementsCm.waist === 99 && m.measurementsCm.armR === 38 && m.measurementsCm.thighR === 60, 'fusión por clave y conserva el peso');
  assert_(mergeBody_(null, { date: 'd', weightKg: 80 }).measurementsCm === undefined, 'sin medidas no se inventa el objeto');

  const hist = [{ date: '2026-11-10', measurementsCm: { waist: 100, armR: 36 } }, { date: '2026-11-17', measurementsCm: { waist: 98.5 } }, { date: '2026-11-03', measurementsCm: { waist: 101, neck: 40 } }];
  const lat = latestMeasurements_(hist);
  assert_(lat.waist.value === 98.5 && lat.waist.date === '2026-11-17' && lat.armR.value === 36 && lat.neck.value === 40, 'última medida de cada clave, en cualquier orden');
  const ch = measurementChanges_(lat, { waist: 85, armR: 36.5, neck: 40 });
  assert_(ch.length === 1 && ch[0].key === 'waist' && ch[0].pct < -10, 'solo marca el cambio de más del 10 %: ' + JSON.stringify(ch));
  assert_(measurementChanges_(lat, { waist: 90 }).length === 0, 'un −8,6 % es un cambio normal y no se marca');
  assert_(measurementChanges_(lat, { calfL: 38 }).length === 0, 'sin referencia previa no hay aviso');
  return 'ok';
}

function test_pure_body_extraction() {
  const ok = { transcript: 'cintura noventa y nueve coma cinco, bíceps derecho treinta y ocho, muslos sesenta y dos', weightKg: 87.46,
    items: [{ part: 'waist', side: null, valueCm: 99.5 }, { part: 'arm', side: 'right', valueCm: 38 }, { part: 'thigh', side: 'both', valueCm: 62 }] };
  assert_(validateBodyExtraction_(ok).length === 0, 'extracción válida: ' + validateBodyExtraction_(ok));
  let r = sanitizeExtraction_(ok);
  assert_(r.measurements.waist === 99.5 && r.measurements.armR === 38 && r.measurements.thighL === 62 && r.measurements.thighR === 62, '"ambos" rellena izquierdo y derecho');
  assert_(r.weightKg === 87.5 && r.rejected.length === 0, 'peso redondeado a 0,1');
  r = sanitizeExtraction_({ items: [{ part: 'arm', side: null, valueCm: 36 }] });
  assert_(r.rejected[0].reason === 'missing_side' && Object.keys(r.measurements).length === 0, 'sin lado no se adivina');
  r = sanitizeExtraction_({ items: [{ part: 'waist', side: null, valueCm: 990 }, { part: 'calf', side: 'left', valueCm: 5 }], weightKg: 8 });
  assert_(r.rejected.length === 3 && r.rejected.every((x) => x.reason === 'out_of_range'), 'fuera de rango (mm por cm, etc.) se rechaza');
  r = sanitizeExtraction_({ items: [{ part: 'waist', valueCm: 99 }, { part: 'waist', valueCm: 98 }] });
  assert_(r.measurements.waist === 98, 'si se repite una medida, vale la última');
  assert_(validateBodyExtraction_({ transcript: 'x', items: [{ part: 'cejas', valueCm: 3 }] }).length > 0, 'parte desconocida');
  assert_(validateBodyExtraction_({ transcript: 'x', items: [{ part: 'arm', side: 'medio', valueCm: 3 }] }).length > 0, 'lado inválido');
  assert_(validateBodyExtraction_({ transcript: 'x', items: [{ part: 'arm', side: 'left', valueCm: '38' }] }).length > 0, 'valor no numérico');
  assert_(BODY_SYSTEM_.indexOf('no inventes') >= 0 && BODY_SYSTEM_.indexOf('both') >= 0, 'el prompt prohíbe inventar y define "ambos"');
  return 'ok';
}

function test_pure_scale() {
  const full = { kind: 'scale', date: null, weightKg: 87.5, bmi: 28.8, bodyFatPct: 23.3, muscleMassKg: 36, visceralFat: 13, bmrKcal: 1818,
    waterPct: 56.1, boneKg: 3.46, proteinPct: 16.6, fatFreeMassKg: 67.1 };
  assert_(validateScaleExtraction_(full).length === 0, 'extracción válida');
  const r = sanitizeScale_(full, '2026-11-15');
  assert_(Object.keys(r.fields).length === 10 && r.fields.boneKg === 3.46 && r.fields.bmrKcal === 1818 && r.rejected.length === 0, 'los 10 campos de una captura real');
  assert_(validateBody_(Object.assign({ date: '2026-11-15' }, r.fields), '2026-11-15').length === 0, 'el registro con esos campos es válido');
  const part = sanitizeScale_({ kind: 'scale', weightKg: 87.5, bodyFatPct: null }, '2026-11-15');
  assert_(Object.keys(part.fields).length === 1, 'lo que no se ve se omite');
  const bad = sanitizeScale_({ kind: 'scale', weightKg: 875, bodyFatPct: 233 }, '2026-11-15');
  assert_(bad.rejected.length === 2 && Object.keys(bad.fields).length === 0, 'valores imposibles rechazados (coma mal leída)');
  let c = null; try { sanitizeScale_({ kind: 'other' }, '2026-11-15'); } catch (e) { c = e.code; }
  assert_(c === 'VALIDATION', 'una imagen que no es báscula se rechaza');
  assert_(sanitizeScale_({ kind: 'scale', date: '2026-11-10', weightKg: 80 }, '2026-11-15').date === '2026-11-10', 'fecha visible aceptada');
  assert_(sanitizeScale_({ kind: 'scale', date: '2027-03-01', weightKg: 80 }, '2026-11-15').date === null, 'fecha futura descartada');
  assert_(sanitizeScale_({ kind: 'scale', date: 'ayer', weightKg: 80 }, '2026-11-15').date === null, 'fecha mal formada descartada');
  assert_(validateScaleExtraction_({ kind: 'scale', weightKg: '87' }).length > 0 && validateScaleExtraction_({ kind: 'foto' }).length > 0, 'validación del formato');
  assert_(SCALE_SYSTEM_.indexOf('nunca inventes ni calcules') >= 0, 'el prompt prohíbe inventar');
  assert_(validateBody_({ date: '2026-11-15', visceralFat: 99 }, '2026-11-15').length > 0, 'grasa visceral fuera de rango');
  return 'ok';
}

// ---------- Nutrición ----------

function test_pure_nutrition_targets() {
  const st = deepMerge_(defaultSettings_(), { profile: { sex: 'male', birthYear: 1990, heightCm: 180 } });
  // Mifflin-St Jeor: 10×80 + 6,25×180 − 5×36 + 5 = 1750
  const t = nutritionTargets_(st, 80, 2026);
  assert_(t.bmr === 1750 && t.tdee === 2713 && t.kcal === 2441, 'BMR 1750, mantenimiento 2713 (×1,55) y −10 % = 2441: ' + JSON.stringify(t));
  assert_(t.proteinG === 160 && t.fatG === 72, 'proteína 2 g/kg y grasa 0,9 g/kg');
  assert_(Math.abs(4 * t.proteinG + 9 * t.fatG + 4 * t.carbsG - t.kcal) <= 4, 'los macros suman las calorías objetivo');
  const f = nutritionTargets_(deepMerge_(st, { profile: { sex: 'female' } }), 80, 2026);
  assert_(f.bmr === 1584, 'mujer: −161 en lugar de +5');
  assert_(nutritionTargets_(defaultSettings_(), 80, 2026) === null, 'sin perfil no hay objetivos');
  assert_(nutritionTargets_(st, null, 2026) === null, 'sin peso no hay objetivos');
  const m = nutritionTargets_(deepMerge_(st, { nutrition: { kcalStrategy: 'maintenance' } }), 80, 2026);
  assert_(m.kcal === 2713, 'estrategia de mantenimiento');
  assert_(validateSettings_(deepMerge_(st, { nutrition: { proteinGPerKg: 9 } })).length > 0, 'proteína absurda rechazada');
  assert_(MICROS_.length === 21 && MICROS_.every((x) => x.ref > 0 && ['min', 'max'].indexOf(x.kind) >= 0), '21 micronutrientes con referencia');
  return 'ok';
}

const rawItem_ = (o) => Object.assign({ name: 'Pollo a la plancha', quantity: 150, unit: 'g', kcal: 248, proteinG: 46.5, carbsG: 0, fatG: 5.4, confidence: 0.8 }, o || {});

function test_pure_meal_extraction() {
  const ok = { mealType: 'lunch', time: '14:30', items: [rawItem_(), rawItem_({ name: 'Arroz', quantity: 200, kcal: 260, proteinG: 5.4, carbsG: 56, fatG: 0.6, fiberG: 0.6 })] };
  assert_(validateMealExtraction_(ok).length === 0, 'extracción válida: ' + validateMealExtraction_(ok));
  const r = sanitizeMeal_(ok);
  assert_(r.items.length === 2 && r.mealType === 'lunch' && r.time === '14:30' && r.warnings.length === 0, 'comida coherente sin avisos');
  assert_(r.items[1].fiberG === 0.6 && r.items[0].fiberG === undefined, 'los micronutrientes null se omiten');

  // Coherencia de calorías (Atwater)
  let n = normalizeMealItem_(rawItem_({ kcal: 900 }));
  assert_(n.flags[0] === 'kcal_fixed' && n.item.kcal === 235, 'calorías incoherentes con los macros se corrigen: ' + JSON.stringify(n));
  n = normalizeMealItem_(rawItem_({ kcal: null }));
  assert_(n.flags[0] === 'kcal_from_macros' && n.item.kcal === 235, 'sin calorías se calculan de los macros');
  n = normalizeMealItem_(rawItem_({ kcal: 240 }));
  assert_(n.flags.length === 0 && n.item.kcal === 240, 'dentro del 25 % se respeta la estimación');
  n = normalizeMealItem_(rawItem_({ name: 'Agua', quantity: 500, unit: 'ml', kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }));
  assert_(n.item.kcal === 0 && n.flags.length === 0, 'el agua tiene 0 kcal sin avisos');

  // Rangos y limpieza
  n = normalizeMealItem_(rawItem_({ proteinG: 9999, vitCMg: -5, ironMg: 2.345 }));
  assert_(n.item.proteinG === 300 && n.item.vitCMg === 0, 'se acotan los valores absurdos (máximo y mínimo)');
  assert_(n.item.ironMg === 2.35, 'micros con 2 decimales');
  assert_(normalizeMealItem_(rawItem_({ confidence: 7 })).item.confidence === 1, 'confianza acotada a 1');
  const low = sanitizeMeal_({ items: [rawItem_({ confidence: 0.3 })] });
  assert_(low.warnings.some((w) => w.flag === 'low_confidence'), 'confianza baja marcada');
  assert_(sanitizeMeal_({ mealType: 'elevenses', time: '25:99', items: [rawItem_()] }).mealType === null, 'tipo de comida inválido a null');
  assert_(sanitizeMeal_({ mealType: 'snack', time: 'tarde', items: [rawItem_()] }).time === null, 'hora inválida a null');

  // Validación del formato
  assert_(validateMealExtraction_({ items: [] }).length > 0, 'sin alimentos');
  assert_(validateMealExtraction_({ items: [rawItem_({ unit: 'litros' })] }).length > 0, 'unidad inválida');
  assert_(validateMealExtraction_({ items: [rawItem_({ quantity: 0 })] }).length > 0, 'cantidad cero');
  assert_(validateMealExtraction_({ items: [rawItem_({ proteinG: null })] }).length > 0, 'macros obligatorios');
  let c = null; try { sanitizeMeal_({ items: [] }); } catch (e) { c = e.code; }
  assert_(c === 'VALIDATION', 'sin alimentos no se acepta');
  assert_(MEAL_SYSTEM_.indexOf('NO por 100 g') >= 0 && MEAL_SYSTEM_.indexOf('No añadas alimentos') >= 0, 'el prompt pide totales y prohíbe inventar alimentos');
  return 'ok';
}

function test_pure_meal_totals() {
  const meal = (date, items) => ({ id: 'm_' + date, date: date, items: items });
  const a = { name: 'a', quantity: 1, unit: 'unidad', kcal: 500, proteinG: 30, carbsG: 50, fatG: 20, fiberG: 5, ironMg: 4, sodiumMg: 800 };
  const b = { name: 'b', quantity: 1, unit: 'unidad', kcal: 300, proteinG: 10, carbsG: 40, fatG: 8, fiberG: 3.5 };
  const tot = sumMeals_([meal('2026-11-15', [a, b])]);
  assert_(tot.kcal === 800 && tot.proteinG === 40 && tot.fiberG === 8.5 && tot.ironMg === 4 && tot.vitCMg === undefined, 'suma de macros y micros presentes');
  assert_(commitMealTotalsCheck_(), 'los totales guardados se recalculan con todos los nutrientes');

  // Media semanal: solo cuentan los días con datos
  const meals = [meal('2026-11-15', [a]), meal('2026-11-14', [a]), meal('2026-11-13', [a, b]), meal('2026-11-01', [a])];
  const w = weekNutrition_(meals, '2026-11-15');
  assert_(w.days === 3, 'tres días con comidas en la última semana (el del 1 de noviembre queda fuera)');
  assert_(Math.abs(w.avg.kcal - 600) < 0.01 && w.avg.ironMg === 4, 'media diaria de kcal 600');
  const lowIron = w.alerts.find((x) => x.key === 'ironMg');
  assert_(lowIron && lowIron.level === 'low' && lowIron.pct === 29, 'hierro: 4 de 14 mg es el 29 %, por debajo del 60 %: aviso');
  assert_(w.alerts.some((x) => x.key === 'fiberG' && x.level === 'low'), 'fibra baja también avisa');
  assert_(!w.alerts.some((x) => x.key === 'vitCMg'), 'sin dato de un nutriente no hay aviso (no se asume que falte)');
  assert_(weekNutrition_(meals.slice(0, 2), '2026-11-15').alerts.length === 0, 'con menos de 3 días de datos no se avisa');
  const salty = weekNutrition_([meal('2026-11-15', [Object.assign({}, a, { sodiumMg: 4000 })]), meal('2026-11-14', [Object.assign({}, a, { sodiumMg: 4000 })]), meal('2026-11-13', [Object.assign({}, a, { sodiumMg: 4000 })])], '2026-11-15');
  assert_(salty.alerts.some((x) => x.key === 'sodiumMg' && x.level === 'high'), 'sodio muy por encima: aviso de exceso');
  return 'ok';
}

function commitMealTotalsCheck_() {
  const rec = { id: 'm1', date: '2026-11-15', items: [{ name: 'a', quantity: 1, unit: 'unidad', kcal: 500, proteinG: 30, carbsG: 50, fatG: 20, vitCMg: 10 }] };
  const totals = sumMeals_([rec]);
  return totals.vitCMg === 10 && totals.kcal === 500;
}

// ---------- Carreras ----------

const OFF_ = () => '+01:00';
const rawRun_ = (o) => Object.assign({ kind: 'run', date: '2026-10-31', time: '11:17', durationText: '00:14:51', paceText: '7\'35"', distanceKm: 1.96,
  avgHr: 155, cadence: 130, kcal: 125, elevationM: 5, trainingLoad: 31 }, o || {});

function test_pure_runs() {
  assert_(parseDuration_('00:14:51') === 891 && parseDuration_('1:05:03') === 3903 && parseDuration_('14:51') === 891, 'duraciones hh:mm:ss, h:mm:ss y mm:ss');
  assert_(parseDuration_('00:75:00') === null && parseDuration_('12:99') === null && parseDuration_('abc') === null && parseDuration_('') === null, 'duraciones inválidas');
  assert_(parsePace_('7\'35"') === 455 && parsePace_("5'05\"") === 305 && parsePace_('6:10') === 370 && parsePace_('7\'35" /km') === 455, 'ritmos con formatos de reloj');
  assert_(parsePace_('7\'75"') === null && parsePace_('rápido') === null && parsePace_(null) === null, 'ritmos inválidos');

  assert_(validateRunExtraction_(rawRun_()).length === 0, 'extracción válida');
  const r = sanitizeRun_(rawRun_(), '2026-11-15', OFF_);
  assert_(r.fields.distanceKm === 1.96 && r.fields.durationSec === 891 && r.fields.avgPaceSecPerKm === 455 && r.fields.avgHr === 155, 'campos convertidos por el código');
  assert_(r.warnings.length === 0 && r.date === '2026-10-31' && r.startedAt === '2026-10-31T11:17:00+01:00', 'ritmo coherente y hora de inicio con offset');
  assert_(validateRun_(Object.assign({ date: '2026-10-31', startedAt: r.startedAt }, r.fields), '2026-11-15').length === 0, 'el registro resultante es válido');

  // Ritmo ausente: se calcula; ritmo incoherente: se avisa
  let x = sanitizeRun_(rawRun_({ paceText: null }), '2026-11-15', OFF_);
  assert_(x.fields.avgPaceSecPerKm === 455 && x.warnings[0] === 'pace_from_data', 'sin ritmo se calcula de distancia y duración');
  x = sanitizeRun_(rawRun_({ paceText: '4\'00"' }), '2026-11-15', OFF_);
  assert_(x.warnings[0] === 'pace_mismatch', 'ritmo que no cuadra con distancia y duración: aviso');
  x = sanitizeRun_(rawRun_({ avgHr: 150, maxHr: 120 }), '2026-11-15', OFF_);
  assert_(x.fields.maxHr === undefined && x.warnings.indexOf('maxhr_below_avg') >= 0, 'pulso máximo menor que el medio se descarta');

  // Rechazos
  x = sanitizeRun_(rawRun_({ distanceKm: 196, kcal: 99999 }), '2026-11-15', OFF_);
  assert_(x.rejected.some((q) => q.part === 'kcal') && x.fields.distanceKm === 196, 'kcal absurdas rechazadas');
  x = sanitizeRun_(rawRun_({ distanceKm: 1960 }), '2026-11-15', OFF_);
  assert_(x.rejected.some((q) => q.part === 'distanceKm'), 'distancia imposible (coma mal leída) rechazada');
  x = sanitizeRun_(rawRun_({ durationText: 'mucho' }), '2026-11-15', OFF_);
  assert_(x.rejected.some((q) => q.reason === 'unreadable') && x.fields.durationSec === undefined, 'duración ilegible');
  x = sanitizeRun_(rawRun_({ date: '2027-02-01' }), '2026-11-15', OFF_);
  assert_(x.date === null && x.startedAt === null, 'fecha futura descartada: sin hora de inicio');
  x = sanitizeRun_(rawRun_({ time: null }), '2026-11-15', OFF_);
  assert_(x.date === '2026-10-31' && x.startedAt === null, 'sin hora no se inventa startedAt');
  let c = null; try { sanitizeRun_({ kind: 'other' }, '2026-11-15', OFF_); } catch (e) { c = e.code; }
  assert_(c === 'VALIDATION', 'imagen que no es una carrera');
  assert_(validateRun_({ date: '2026-10-31', distanceKm: 5 }, '2026-11-15').length > 0, 'falta la duración');
  assert_(validateRun_({ date: '2026-10-31', distanceKm: 5, durationSec: 20 }, '2026-11-15').length > 0, 'duración de 20 s imposible');
  assert_(RUN_SYSTEM_.indexOf('nunca inventes ni calcules') >= 0 && RUN_SYSTEM_.indexOf('No extraigas zancada') >= 0, 'prompt prudente');

  // Conexión con la regla de carrera del planificador: una carrera guardada con este formato cuenta como tirada larga
  const run = Object.assign({ date: '2026-10-31', startedAt: r.startedAt }, r.fields);
  assert_(isLongRun_({ durationSec: 4000, distanceKm: 8 }) && !isLongRun_(run), 'una salida corta de 15 min no es tirada larga');
  assert_(recentLongRun_([{ date: '2026-11-14', startedAt: '2026-11-14T08:00:00+01:00', durationSec: 4000, distanceKm: 9 }], '2026-11-15T09:00:00+01:00'), 'tirada larga de ayer a las 8:00 cuenta a las 9:00 de hoy (25 h)');
  return 'ok';
}

// ---------- Revisión semanal ----------

const wsess_ = (date, key, groups, sets, vol, ex, extra) => Object.assign({ status: 'done', date: date, cycleKey: key, groups: groups,
  metrics: { workingSets: sets, totalVolumeKg: vol, setsByGroup: {} }, exercises: ex || [] }, extra || {});
const wex_ = (id, name, ps, reps) => ({ exerciseId: id, name: name, sets: [{ type: 'working', reps: reps || 8, rir: 2, load: bb_(ps) }, { type: 'working', reps: reps || 8, rir: 2, load: bb_(ps) }] });

function test_pure_weekly_facts() {
  const lib = exerciseSeed_();
  const sessions = [
    wsess_('2026-11-02', 'A', ['chest', 'triceps'], 12, 3000, [wex_('press_banca', 'Press banca', 15)]),
    wsess_('2026-11-10', 'A', ['chest', 'triceps'], 12, 3300, [wex_('press_banca', 'Press banca', 17.5)], { metrics: { workingSets: 12, totalVolumeKg: 3300, setsByGroup: { chest: 10, triceps: 4 } } }),
    wsess_('2026-11-12', 'B', ['back', 'biceps'], 10, 2500, [wex_('remo_barra', 'Remo con barra', 20)], { metrics: { workingSets: 10, totalVolumeKg: 2500, setsByGroup: { back: 9, biceps: 5 } }, painFlags: [{ text: 'x' }] }),
    wsess_('2026-11-14', 'D', ['shoulders'], 8, 1000, [], { status: 'discarded' })
  ];
  const body = [{ date: '2026-11-03', weightKg: 88, measurementsCm: { waist: 100 } }, { date: '2026-11-05', weightKg: 88.2 },
    { date: '2026-11-11', weightKg: 87.4, measurementsCm: { waist: 99 } }, { date: '2026-11-13', weightKg: 87.6, bodyFatPct: 23 }];
  const meals = [{ date: '2026-11-11', items: [{ name: 'a', quantity: 1, unit: 'unidad', kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 }] }, { date: '2026-11-12', items: [{ name: 'a', quantity: 1, unit: 'unidad', kcal: 2400, proteinG: 170, carbsG: 250, fatG: 70 }] }];
  const runs = [{ date: '2026-11-11', distanceKm: 12, durationSec: 4200 }, { date: '2026-11-13', distanceKm: 5, durationSec: 1700 }, { date: '2026-11-01', distanceKm: 20, durationSec: 7000 }];
  const f = weeklyFacts_({ today: '2026-11-16', sessions: sessions, runs: runs, meals: meals, body: body, targets: { kcal: 2470, proteinG: 174 }, library: lib });
  assert_(f.from === '2026-11-10' && f.to === '2026-11-16', 'ventana de 7 días terminada hoy');
  assert_(f.training.sessions === 2 && f.training.sets === 22 && f.training.volumeKg === 5800 && f.training.prevVolumeKg === 0, 'solo sesiones hechas de la semana (las descartadas y las anteriores no cuentan)');
  assert_(f.training.setsByGroup.chest === 10 && f.training.setsByGroup.back === 9, 'series por grupo');
  assert_(f.training.belowMin.indexOf('triceps') >= 0 && f.training.belowMin.indexOf('quads') >= 0 && f.training.belowMin.indexOf('chest') < 0, 'grupos por debajo de 8 series');
  assert_(f.training.pain === 1, 'molestias de la semana');
  const pb = f.training.progressions.find((x) => x.name === 'Press banca');
  assert_(pb.kg === 55 && pb.prevKg === 50 && pb.deltaKg === 5, 'progresión de carga frente a la última vez');
  assert_(f.training.progressions.find((x) => x.name === 'Remo con barra').prevKg === null, 'ejercicio nuevo sin comparación');
  assert_(f.runs.count === 2 && f.runs.km === 17 && f.runs.longRuns === 1, 'carreras de la semana (la del día 1 queda fuera)');
  assert_(f.nutrition.daysLogged === 2 && f.nutrition.avgKcal === 2200 && f.nutrition.avgProteinG === 160, 'media solo de los días registrados');
  assert_(f.body.weight.avg === 87.5 && f.body.weight.prevAvg === 88.1 && f.body.weight.delta === -0.6, 'peso medio y cambio: ' + JSON.stringify(f.body.weight));
  assert_(f.body.waist.now === 99 && f.body.waist.before === 100 && f.body.fat.avg === 23 && f.body.fat.delta === null, 'cintura y grasa');
  const empty = weeklyFacts_({ today: '2026-11-16', sessions: [], runs: [], meals: [], body: [], targets: null, library: lib });
  assert_(empty.training.sessions === 0 && empty.training.belowMin.length === 0 && empty.body.weight.avg === null && empty.nutrition.avgKcal === null, 'semana vacía sin errores ni avisos de grupos');
  return 'ok';
}

function test_pure_weekly_rules() {
  const f = (delta, now, before) => ({ body: { weight: { delta: delta }, waist: { now: now, before: before } } });
  assert_(calorieAdjustment_(f(-0.6, 99, 100)).deltaKcal === 150, 'bajar más de 0,5 kg/semana: +150 kcal');
  assert_(calorieAdjustment_(f(-0.5, 99, 100)).deltaKcal === 0, 'exactamente 0,5 kg no ajusta');
  assert_(calorieAdjustment_(f(0.2, 101, 100)).deltaKcal === -150 && calorieAdjustment_(f(0.2, 101, 100)).reason === 'waist_rising', 'cintura +1 cm: −150 kcal');
  assert_(calorieAdjustment_(f(0.2, 100.4, 100)).deltaKcal === 0, 'cintura +0,4 cm: sin ajuste');
  assert_(calorieAdjustment_(f(null, 99, 100)).reason === 'insufficient_data', 'sin dos semanas de peso no se toca nada');
  assert_(calorieAdjustment_(f(0.1, null, null)).reason === 'on_track', 'sin cintura y con peso estable: en ruta');
  assert_(clampAdjust_(300, 150) === 450 && clampAdjust_(450, 150) === 450 && clampAdjust_(-400, -150) === -450 && clampAdjust_(0, 150) === 150, 'el ajuste acumulado se acota a ±450');
  const st = deepMerge_(defaultSettings_(), { profile: { sex: 'male', birthYear: 1990, heightCm: 180 }, nutrition: { kcalAdjust: 150 } });
  assert_(nutritionTargets_(st, 80, 2026).kcal === 2591, 'el ajuste se suma a las calorías objetivo (2441 + 150)');
  assert_(validateSettings_(deepMerge_(st, { nutrition: { kcalAdjust: 900 } })).length > 0, 'ajuste fuera de rango rechazado');

  // Estancamiento
  const lib = exerciseSeed_();
  const mk = (date, ps, reps) => wsess_(date, 'A', ['chest'], 4, 0, [wex_('press_banca', 'Press banca', ps, reps)]);
  assert_(stalledMainLifts_([mk('2026-10-20', 20, 8), mk('2026-10-27', 20, 8), mk('2026-11-03', 20, 8)], lib).length === 1, 'tres sesiones con la misma carga y repeticiones: estancado');
  assert_(stalledMainLifts_([mk('2026-10-20', 20, 8), mk('2026-10-27', 21.25, 8), mk('2026-11-03', 21.25, 8)], lib).length === 0, 'si ha subido la carga no está estancado');
  assert_(stalledMainLifts_([mk('2026-10-20', 20, 8), mk('2026-10-27', 20, 9), mk('2026-11-03', 20, 10)], lib).length === 0, 'si suben las repeticiones tampoco');
  assert_(stalledMainLifts_([mk('2026-10-27', 20, 8), mk('2026-11-03', 20, 8)], lib).length === 0, 'con menos de tres apariciones no hay veredicto');
  const iso = (id) => wsess_('2026-11-03', 'D', ['shoulders'], 3, 0, [wex_(id, id, 5)]);
  assert_(stalledMainLifts_([iso('elevaciones_laterales'), iso('elevaciones_laterales'), iso('elevaciones_laterales')], lib).length === 0, 'los de aislamiento no cuentan como principales');

  // Prioridad de volumen
  const ex = [{ exerciseId: 'press_banca', sets: 4 }, { exerciseId: 'remo_barra', sets: 6 }, { exerciseId: 'curl_barra', sets: 3 }];
  const pr = applyPriority_(ex, ['chest', 'back'], lib);
  assert_(pr.exercises[0].sets === 5 && pr.exercises[1].sets === 6 && pr.exercises[2].sets === 3 && pr.boosted.length === 1, '+1 serie a los grupos prioritarios, máximo 6');
  assert_(ex[0].sets === 4, 'no muta la entrada');
  assert_(applyPriority_(ex, [], lib).boosted.length === 0, 'sin prioridades no cambia nada');
  return 'ok';
}

function test_pure_weekly_email() {
  const facts = { from: '2026-11-10', to: '2026-11-16',
    training: { sessions: 2, sets: 22, volumeKg: 5800, prevVolumeKg: 3000, prevSessions: 1, setsByGroup: {}, belowMin: ['triceps', 'quads'], pain: 1,
      list: [], progressions: [{ name: 'Press banca', kg: 55, prevKg: 50, deltaKg: 5 }] },
    runs: { count: 2, km: 17, longRuns: 1 }, nutrition: { daysLogged: 2, avgKcal: 2200, avgProteinG: 160, targets: { kcal: 2470, proteinG: 174 }, micro: { days: 3, avg: {}, alerts: [{ key: 'ironMg', level: 'low', pct: 29 }] } },
    body: { weight: { avg: 87.5, prevAvg: 88.1, delta: -0.6 }, waist: { now: 99, before: 100 }, fat: { avg: 23, delta: null } } };
  const plan = { adjustment: { deltaKcal: 150, reason: 'weight_dropping_fast' }, nextSession: { key: 'C', groups: ['quads', 'hamstrings'] }, priorityGroups: ['triceps', 'quads'], stalled: ['press_banca'] };
  const mail = buildWeeklyEmail_(facts, plan, 'Compañero, buena semana <script>alert(1)</script>.');
  assert_(mail.subject === 'Comandante · Balance semanal (10/11 al 16/11)', 'asunto con fechas: ' + mail.subject);
  ['2 sesión(es), 22 series de trabajo, 5800 kg', 'Press banca: +5 kg', '17 km', '1 tirada(s) larga(s)', 'Peso medio: 87,5 kg (−0,6 kg', 'Cintura: 99 cm (−1 cm)', 'Poco hierro (29 %', 'subo 150 kcal', 'Próxima sesión del ciclo: C (cuádriceps y femorales)', 'Prioridad de volumen: tríceps, cuádriceps', 'Ejercicios estancados: 1'].forEach((t) =>
    assert_(mail.text.indexOf(t) >= 0, 'el correo debe contener «' + t + '»'));
  assert_(mail.html.indexOf('<script>') < 0 && mail.html.indexOf('&lt;script&gt;') >= 0, 'el texto de la IA se escapa en el HTML');
  assert_(escapeHtml_('<a href="x">&\'</a>') === '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;', 'escapeHtml_');
  const empty = buildWeeklyEmail_({ from: '2026-11-10', to: '2026-11-16', training: { sessions: 0, sets: 0, volumeKg: 0, prevVolumeKg: 0, prevSessions: 0, setsByGroup: {}, belowMin: [], pain: 0, list: [], progressions: [] },
    runs: { count: 0, km: 0, longRuns: 0 }, nutrition: { daysLogged: 0, avgKcal: null, avgProteinG: null, targets: null, micro: { days: 0, avg: {}, alerts: [] } },
    body: { weight: { avg: null, prevAvg: null, delta: null }, waist: { now: null, before: null }, fat: { avg: null, delta: null } } },
    { adjustment: { deltaKcal: 0, reason: 'insufficient_data' }, nextSession: null, priorityGroups: [], stalled: [] }, 'x');
  assert_(empty.text.indexOf('no has registrado carreras') >= 0 && empty.text.indexOf('Faltan pesos') >= 0 && empty.text.indexOf('NaN') < 0 && empty.text.indexOf('undefined') < 0, 'semana vacía: textos limpios');
  assert_(neutralWeeklyMessage_(facts, plan).indexOf('2 sesiones') >= 0 && neutralWeeklyMessage_(empty.facts || { training: { sessions: 0 } }, plan).indexOf('no has entrenado') >= 0, 'mensaje neutro');
  return 'ok';
}

function test_pure_reminder() {
  const st = defaultSettings_();
  const done = (date) => ({ status: 'done', date: date, cycleKey: 'A', groups: ['chest'] });
  assert_(shouldRemind_([done('2026-11-12')], '2026-11-14', st, null) === true, 'tras 2 días de descanso se avisa');
  assert_(shouldRemind_([done('2026-11-13')], '2026-11-14', st, null) === false, 'con 1 día de descanso no');
  assert_(shouldRemind_([done('2026-11-12')], '2026-11-14', st, '2026-11-14') === false, 'no se avisa dos veces el mismo día');
  assert_(shouldRemind_([done('2026-11-12'), done('2026-11-14')], '2026-11-14', st, null) === false, 'si ya has entrenado hoy, no');
  assert_(shouldRemind_([done('2026-11-12'), { status: 'in_progress', date: '2026-11-14' }], '2026-11-14', st, null) === false, 'si la sesión de hoy está en curso, no');
  assert_(shouldRemind_([done('2026-11-12'), { status: 'planned', date: '2026-11-14' }], '2026-11-14', st, null) === true, 'una sesión solo planificada no cuenta como entrenada');
  assert_(shouldRemind_([], '2026-11-14', st, null) === false, 'sin historial no se avisa');
  assert_(shouldRemind_([done('2026-11-01')], '2026-11-14', deepMerge_(st, { notifications: { reminder: false } }), null) === false, 'aviso desactivado');
  assert_(shouldRemind_([done('2026-11-10')], '2026-11-14', deepMerge_(st, { notifications: { reminderAfterRestDays: 5 } }), null) === false, 'umbral configurable');
  const m = buildReminderEmail_({ key: 'C', groups: ['quads', 'glutes'] }, 3);
  assert_(m.subject === 'Comandante · Hoy toca cuádriceps y glúteos' && m.text.indexOf('3 días') >= 0 && m.html.indexOf('<') >= 0, 'correo de recordatorio');
  return 'ok';
}

function test_pure_week_key() {
  assert_(isoWeekKey_('2026-11-16') === '2026-W47' && isoWeekKey_('2026-11-22') === '2026-W47' && isoWeekKey_('2026-11-23') === '2026-W48', 'semanas ISO de noviembre 2026');
  assert_(isoWeekKey_('2026-01-01') === '2026-W01' && isoWeekKey_('2025-12-29') === '2026-W01', 'semana 1 que cruza el año');
  assert_(isoWeekKey_('2027-01-03') === '2026-W53', 'la semana 53 de 2026 termina el 3 de enero de 2027');
  return 'ok';
}

// ---------- Exportar e importar ----------

function test_pure_export_import() {
  const eq = { barbellKg: 20, ezBarKg: 10 };
  const sess = (id, date) => ({ id: id, date: date, status: 'done', groups: ['chest'], startedAt: date + 'T17:00:00Z', endedAt: date + 'T18:00:00Z',
    exercises: [{ exerciseId: 'press_banca', name: 'Press banca', sets: [{ order: 1, type: 'working', reps: 8, rir: 2, load: bb_(20) }] }] });
  const meal = { id: 'm_1', date: '2026-11-10', items: [{ name: 'a', quantity: 100, unit: 'g', kcal: 100, proteinG: 5, carbsG: 15, fatG: 2 }] };
  const run = { id: 'r_1', date: '2026-11-09', distanceKm: 5, durationSec: 1700 };
  const bodyRec = { date: '2026-11-08', weightKg: 80, measurementsCm: { waist: 90 } };
  const exp = buildExport_({ settings: defaultSettings_(), plan: null, body: [bodyRec], sessions: [sess('s_20261110_1700_ab12', '2026-11-10'), sess('s_20261201_1700_ab12', '2026-12-01')], runs: [run], meals: [meal] });
  assert_(exp.format === 'comandante-export' && exp.version === 1 && Object.keys(exp.sessions).join() === '2026-11,2026-12', 'exportación con formato y sesiones por mes');
  assert_(flatten_(exp.sessions).length === 2 && flatten_(null).length === 0, 'flatten_');
  assert_(validateImport_(exp, '2026-12-15', eq).length === 0, 'una exportación propia se puede importar: ' + validateImport_(exp, '2026-12-15', eq));
  const copy = () => JSON.parse(JSON.stringify(exp));
  assert_(validateImport_({ format: 'otra' }, '2026-12-15', eq).length === 1 && validateImport_(null, '2026-12-15', eq).length === 1, 'otro formato');
  assert_(validateImport_(Object.assign(copy(), { version: 9 }), '2026-12-15', eq)[0].indexOf('no compatible') >= 0, 'versión desconocida');
  let bad = copy(); bad.sessions['2026-11'][0].status = 'zumba';
  assert_(validateImport_(bad, '2026-12-15', eq).length > 0, 'sesión con estado inválido');
  bad = copy(); bad.sessions['2026-11'][0].exercises[0].sets[0].reps = -3;
  assert_(validateImport_(bad, '2026-12-15', eq).length > 0, 'serie con repeticiones negativas');
  bad = copy(); bad.sessions['2026-11'][0].id = '../../x';
  assert_(validateImport_(bad, '2026-12-15', eq).length > 0, 'id de sesión malicioso');
  bad = copy(); bad.meals['2026-11'][0].items[0].unit = 'litros';
  assert_(validateImport_(bad, '2026-12-15', eq).length > 0, 'comida con unidad inválida');
  bad = copy(); bad.body[0].measurementsCm.waist = 999;
  assert_(validateImport_(bad, '2026-12-15', eq).length > 0, 'medida absurda');
  bad = copy(); bad.runs['2026-11'][0].durationSec = 5;
  assert_(validateImport_(bad, '2026-12-15', eq).length > 0, 'carrera imposible');
  bad = copy(); bad.sessions['2026-12'][0].id = bad.sessions['2026-11'][0].id;
  assert_(validateImport_(bad, '2026-12-15', eq).some((m) => m.indexOf('repetido') >= 0), 'ids repetidos');
  bad = copy(); bad.sessions['2026-12'][0].date = '2027-05-01';
  assert_(validateImport_(bad, '2026-12-15', eq).length > 0, 'fecha futura');
  bad = copy(); bad.settings = { equipment: { barbellKg: -5 } };
  assert_(validateImport_(bad, '2026-12-15', eq).some((m) => m.indexOf('Ajustes') >= 0), 'ajustes inválidos');
  bad = copy(); bad.meals['2026-11'].push(null);
  assert_(validateImport_(bad, '2026-12-15', eq).length > 0, 'registro nulo');

  bad = copy(); bad.sessions['2026-11'] = { no: 'lista' };
  assert_(validateImport_(bad, '2026-12-15', eq).some((m) => m.indexOf('no es una lista') >= 0), 'un mes que no es una lista');
  bad = copy(); bad.meals['2026-12'] = bad.meals['2026-11']; delete bad.meals['2026-11'];
  assert_(validateImport_(bad, '2026-12-15', eq).some((m) => m.indexOf('su fecha es') >= 0), 'registro bajo el mes equivocado');

  // Fusión por id: no borra lo existente
  const m = mergeById_([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'b', v: 2 }, { id: 'c', v: 2 }], 'id');
  assert_(m.length === 3 && m.find((x) => x.id === 'b').v === 2 && m.find((x) => x.id === 'a').v === 1, 'la fusión conserva lo existente y actualiza lo coincidente');
  assert_(mergeById_([], [{ date: 'x' }], 'date').length === 1 && mergeById_(null, null, 'id').length === 0, 'fusión con listas vacías');
  assert_(Object.keys(groupByMonth_([{ date: '2026-11-01' }, { date: 'basura' }, { date: '2026-12-02' }])).join() === '2026-11,2026-12', 'registros con fecha mala se ignoran al agrupar');
  return 'ok';
}

function test_pure_lenient_loads() {
  const eq = { barbellKg: 20, ezBarKg: 10, dumbbellStepKg: 2, plateMinKg: 1.25, stackStepKg: 5 };
  // Polea o máquina: el mismo número dicho como total, por mano o por lado
  assert_(normalizeLoad_({ implement: 'cable', totalKg: 30 }, eq).load.stackKg === 30, '"polea con 30 kilos" dicho como total');
  assert_(normalizeLoad_({ implement: 'machine', perSideKg: 40 }, eq).load.totalKg === 40, 'máquina con "40 a cada lado": 40 de pila');
  assert_(normalizeLoad_({ implement: 'machine', stackKg: 70, totalKg: 99 }, eq).load.stackKg === 70, 'si hay pila, manda la pila');
  // Mancuernas: "10 a cada lado" = 10 por mano; un total se reparte entre las dos
  let r = normalizeLoad_({ implement: 'dumbbell', perSideKg: 10 }, eq);
  assert_(r.load.perHandKg === 10 && r.load.totalKg === 20, 'mancuernas con "10 a cada lado"');
  r = normalizeLoad_({ implement: 'dumbbell', totalKg: 30 }, eq);
  assert_(r.load.perHandKg === 15 && r.load.count === 2, 'mancuernas con total 30: 15 por mano');
  r = normalizeLoad_({ implement: 'dumbbell', totalKg: 24, count: 1 }, eq);
  assert_(r.load.perHandKg === 24, 'una sola mancuerna con total 24');
  assert_(normalizeLoad_({ implement: 'dumbbell', perHandKg: 15, perSideKg: 99 }, eq).load.perHandKg === 15, 'si hay kilos por mano, manda');
  assert_(normalizeLoad_({ implement: 'kettlebell', totalKg: 16 }, eq).load.perHandKg === 16, 'pesa rusa: una sola');
  // Peso corporal con lastre dicho como total
  assert_(normalizeLoad_({ implement: 'bodyweight', totalKg: 10 }, eq).load.addedKg === 10, 'dominadas con 10 kilos de lastre');
  assert_(normalizeLoad_({ implement: 'bodyweight' }, eq).load.addedKg === 0, 'sin lastre sigue siendo 0');
  // Barra con kilos por mano
  assert_(normalizeLoad_({ implement: 'barbell', perHandKg: 15 }, eq).load.totalKg === 50, 'barra con "15" dicho por mano: 15 por lado');
  // Barra más ligera que la configurada: solo al dictar, y avisando
  assert_(normalizeLoad_({ implement: 'barbell', totalKg: 15 }, eq).load === null, 'estricto por defecto: 15 kg con barra de 20 no cuadra');
  r = normalizeLoad_({ implement: 'barbell', totalKg: 15 }, eq, { inferBar: true });
  assert_(r.load.barKg === 15 && r.load.perSideKg === 0 && r.load.totalKg === 15 && r.load.barInferred === true, 'al dictar, "barra con 15 kilos" = barra sola de 15 kg, avisando');
  assert_(normalizeLoad_({ implement: 'barbell', totalKg: 4 }, eq, { inferBar: true }).load === null, 'por debajo de 5 kg sigue siendo imposible');
  // En el dictado completo
  const sess = { exercises: [], plannedExercises: [] };
  let res = eventsToSets_([{ type: 'set', exerciseName: 'jalón al pecho', implement: 'cable', totalKg: 45, reps: 12, repeatLast: false }], sess, ctx_());
  assert_(res.pending.length === 0 && res.exercises[0].sets[0].load.stackKg === 45, 'jalón con 45 kilos ya no queda pendiente');
  res = eventsToSets_([{ type: 'set', exerciseName: 'curl de bíceps con mancuernas', implement: 'dumbbell', perSideKg: 12, reps: 10, repeatLast: false }], sess, ctx_());
  assert_(res.pending.length === 0 && res.exercises[0].sets[0].load.totalKg === 24, 'curl con "12 a cada lado" ya no queda pendiente');
  return 'ok';
}

function test_pure_manual_entry() {
  // Los pendientes recuerdan de qué ejercicio eran
  let r = eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', perSideKg: 20 })], sess_(), ctx_());
  assert_(r.pending[0].reason === 'missing_reps' && r.pending[0].exerciseId === 'press_banca', 'falta de repeticiones: recuerda el ejercicio');
  r = eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', totalKg: 4, reps: 5 })], sess_(), ctx_());
  assert_(r.pending[0].reason === 'invalid_load' && r.pending[0].exerciseId === 'press_banca', 'carga imposible: recuerda el ejercicio');
  r = eventsToSets_([ev_({ exerciseName: 'curl de bíceps', repeatLast: true })], sess_(), ctx_());
  assert_(r.pending[0].reason === 'nothing_to_repeat' && r.pending[0].exerciseId === 'curl_mancuernas', 'nada que repetir: recuerda el ejercicio');
  r = eventsToSets_([ev_({ exerciseName: 'baile flamenco', reps: 5 })], sess_(), ctx_());
  assert_(r.pending[0].exerciseId === undefined, 'ejercicio desconocido: no hay id');

  // Añadir una serie a mano y resolver el pendiente de una vez
  const lib = ctx_().library; const eq = ctx_().equipment;
  const base = sess_({ pending: [{ reason: 'missing_reps', exerciseId: 'press_banca', text: 'Press banca' }, { reason: 'unknown_exercise', text: 'x' }] });
  let n = applyEditOp_(base, { op: 'add', exerciseId: 'press_banca', dismissPending: 0, set: { type: 'working', reps: 8, rir: null, load: { implement: 'barbell', perSideKg: 20 } } }, eq, lib);
  assert_(n.exercises[0].sets[0].load.totalKg === 60 && n.pending.length === 1 && n.pending[0].reason === 'unknown_exercise', 'añadir + resolver el pendiente indicado');
  assert_(base.pending.length === 2, 'no muta la sesión original');
  n = applyEditOp_(base, { op: 'add', exerciseId: 'press_banca', set: { type: 'warmup', reps: 12, load: { implement: 'barbell', perSideKg: 10 } } }, eq, lib);
  assert_(n.pending.length === 2 && n.exercises[0].sets[0].type === 'warmup', 'sin dismissPending no se toca la lista');
  const fails = (op) => { try { applyEditOp_(base, op, eq, lib); return false; } catch (e) { return e.code === 'VALIDATION'; } };
  assert_(fails({ op: 'add', exerciseId: 'press_banca', dismissPending: 9, set: { reps: 8, load: { implement: 'barbell', perSideKg: 20 } } }), 'pendiente inexistente');
  assert_(fails({ op: 'add', exerciseId: 'press_banca', set: { reps: 0, load: { implement: 'barbell', perSideKg: 20 } } }) === false, 'cero repeticiones es válido para el servidor (0-100)');
  assert_(fails({ op: 'add', exerciseId: 'press_banca', set: { reps: 8, load: { implement: 'barbell' } } }), 'barra sin kilos');
  // Serie de peso corporal y de máquina introducidas a mano
  n = applyEditOp_(base, { op: 'add', exerciseId: 'dominadas', set: { type: 'working', reps: 6, load: { implement: 'bodyweight', addedKg: 0 } } }, eq, lib);
  assert_(n.exercises[n.exercises.length - 1].exerciseId === 'dominadas', 'ejercicio nuevo a mano');
  n = applyEditOp_(base, { op: 'add', exerciseId: 'jalon_pecho', set: { type: 'working', reps: 12, rir: 2, load: { implement: 'cable', stackKg: 45 } } }, eq, lib);
  assert_(n.exercises[n.exercises.length - 1].sets[0].load.stackKg === 45, 'jalón con pila a mano');

  // Lista para el selector
  const list = exerciseListForClient_();
  assert_(list.length >= 90 && list.every((x) => x.id && x.name && x.implements.length > 0 && Object.keys(x).length === 3), 'lista con id, nombre e implementos');
  const names = list.map((x) => normalizeText_(x.name));
  assert_(names.join('|') === names.slice().sort().join('|'), 'ordenada por nombre sin acentos');
  assert_(list.find((x) => x.id === 'press_banca').implements.indexOf('barbell') >= 0, 'implementos posibles');
  return 'ok';
}

function test_pure_caso_real_cruce_poleas() {
  // Caso real: «Primera serie de cruce en poleas con 10 kg a cada lado y 10 repeticiones en total.»
  // La IA devolvió: "Entendí: 10 kg por lado, 10 repeticiones" y la app rechazó la serie con "faltan los kilos de la pila".
  const sess = { exercises: [], plannedExercises: [] };
  let r = eventsToSets_([ev_({ exerciseName: 'Cruce en poleas', implement: 'cable', perSideKg: 10, reps: 10 })], sess, ctx_());
  assert_(r.pending.length === 0, 'ya no queda pendiente: ' + JSON.stringify(r.pending));
  const set = r.exercises[0].sets[0];
  assert_(r.exercises[0].exerciseId === 'cruce_poleas' && set.reps === 10 && set.load.implement === 'cable' && set.load.stackKg === 10 && set.load.totalKg === 10, 'serie guardada con pila de 10 kg y 10 repeticiones');
  // Si la IA no indica el implemento, se toma el habitual del ejercicio (polea)
  r = eventsToSets_([ev_({ exerciseName: 'Cruce en poleas', perSideKg: 10, reps: 10 })], sess, ctx_());
  assert_(r.pending.length === 0 && r.exercises[0].sets[0].load.implement === 'cable' && r.exercises[0].sets[0].load.stackKg === 10, 'sin implemento dicho: polea');
  // Y con las demás formas de decirlo
  r = eventsToSets_([ev_({ exerciseName: 'Cruce en poleas', implement: 'cable', totalKg: 10, reps: 10 })], sess, ctx_());
  assert_(r.pending.length === 0 && r.exercises[0].sets[0].load.stackKg === 10, 'dicho como total');
  r = eventsToSets_([ev_({ exerciseName: 'Cruce en poleas', implement: 'cable', perHandKg: 10, reps: 10 })], sess, ctx_());
  assert_(r.pending.length === 0 && r.exercises[0].sets[0].load.stackKg === 10, 'dicho por mano');
  return 'ok';
}

function test_pure_friendly_errors() {
  assert_(friendlySetError_('serie reps debe ser un entero') === 'Las repeticiones deben ser un número entero.', 'repeticiones no enteras');
  assert_(friendlySetError_('serie: reps es obligatorio') === 'Faltan las repeticiones.', 'faltan repeticiones');
  assert_(friendlySetError_('serie reps fuera de rango (0-100)') === 'Las repeticiones deben estar entre 0 y 100.', 'repeticiones fuera de rango');
  assert_(friendlySetError_('serie rir fuera de rango (0-10)').indexOf('El RIR') === 0, 'RIR');
  assert_(friendlySetError_('serie: faltan los kilos de la pila') === 'Faltan los kilos de la pila.', 'errores de carga ya en español: solo se pulen');
  const fails = (op) => { try { applyEditOp_(sess_({ exercises: [{ exerciseId: 'press_banca', name: 'Press banca', sets: [{ order: 1, type: 'working', reps: 8, rir: 2, load: bb_(20) }] }] }), op, ctx_().equipment, ctx_().library); return null; } catch (e) { return e.message; } };
  const msg = fails({ op: 'update', exerciseId: 'press_banca', order: 1, patch: { reps: 2.5 } });
  assert_(msg === 'Las repeticiones deben ser un número entero.', 'la edición devuelve el mensaje amable: ' + msg);
  assert_(/serie|reps|rir/.test(fails({ op: 'update', exerciseId: 'press_banca', order: 1, patch: { rir: 40 } })) === false, 'sin nombres internos');
  return 'ok';
}

function test_pure_clip_ruido() {
  const r = eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', perSideKg: 20, reps: null, unclear: true })], sess_(), ctx_());
  assert_(r.exercises.length === 0 && r.pending.length === 1 && r.pending[0].reason === 'unclear', 'una serie dudosa va a pendientes');
  assert_(r.pending[0].heard.perSideKg === 20 && r.pending[0].exerciseId === 'press_banca', 'con lo que sí se entendió, para completarla');
  assert_(CLIP_SYSTEM_.indexOf('andaluza') > 0 && CLIP_SYSTEM_.indexOf('música') > 0, 'instrucciones de ruido y acento');
  const u = buildClipUser_({ plannedExercises: [{ exerciseId: 'press_banca', name: 'Press banca', sets: 4, repsMin: 8, repsMax: 10, targetLoad: bb_(15) }], exercises: [] }, ctx_().library);
  assert_(u.planDeHoy[0].objetivo.reps[1] === 10 && u.planDeHoy[0].objetivo.carga.perSideKg === 15, 'el contexto lleva los objetivos para desempatar números');
  return 'ok';
}

function test_pure_recipes() {
  const targets = { kcal: 2400, proteinG: 160, carbsG: 250, fatG: 70 };
  const week = { days: 4, avg: { proteinG: 120, ironMg: 7, vitDUg: 1, calciumMg: 900, sodiumMg: 3600, fiberG: 19 }, alerts: [] };
  const g = nutritionGaps_(targets, { kcal: 1000, proteinG: 60, carbsG: 300, fatG: 20 }, week);
  assert_(g.remaining.kcal === 1400 && g.remaining.proteinG === 100 && g.remaining.carbsG === 0, 'macros que quedan hoy (sin negativos)');
  assert_(g.low.map((x) => x.key).join(',') === 'vitDUg,ironMg,fiberG', 'micros bajos, del más bajo al menos: ' + g.low.map((x) => x.key));
  assert_(g.high.length === 1 && g.high[0].key === 'sodiumMg' && g.proteinPct === 75, 'lo que sobra y la proteína media');
  assert_(frequentFoods_([{ items: [{ name: 'Huevo' }, { name: 'arroz' }] }, { items: [{ name: 'huevo ' }] }], 5).join(',') === 'huevo,arroz', 'hábitos');
  const r = { summary: 'Te falta hierro.', recipes: [
    { name: 'Lentejas', moment: 'comida', minutes: 30, servings: 2, covers: ['ironMg', 'fiberG', 'inventado'], why: 'Hierro y fibra.', kcal: 520.4, proteinG: 32, carbsG: 60, fatG: 12,
      ingredients: [{ name: 'Lentejas', quantity: 200, unit: 'g', section: 'despensa' }, { name: 'Espinacas', quantity: 100, unit: 'g', section: 'fruta_verdura' }], steps: ['Cocer.'] },
    { name: 'Tortilla', moment: 'cena', minutes: 15, servings: 1, covers: ['proteinG'], why: 'Proteína.', kcal: 400, proteinG: 30, carbsG: 5, fatG: 25,
      ingredients: [{ name: 'espinacas', quantity: 50, unit: 'g', section: 'fruta_verdura' }, { name: 'Huevo', quantity: 3, unit: 'unidad', section: 'lacteos_huevos' }], steps: ['Batir.', 'Cuajar.'] }] };
  assert_(validateRecipes_(r).length === 0, 'válidas: ' + validateRecipes_(r));
  const bad = JSON.parse(JSON.stringify(r)); bad.recipes[0].ingredients[0].unit = 'puñado'; bad.recipes[1].moment = 'merienda';
  assert_(validateRecipes_(bad).length === 2, 'unidad y momento inválidos');
  const c = sanitizeRecipes_(r);
  assert_(c.recipes[0].covers.join(',') === 'ironMg,fiberG' && c.recipes[0].kcal === 520, 'limpia claves y redondea');
  const l = shoppingList_(c.recipes);
  assert_(l[0].name === 'Espinacas' && l[0].quantity === 150 && l[0].recipes.length === 2, 'suma ingredientes repetidos entre recetas');
  assert_(l.map((x) => x.section).join(',') === 'fruta_verdura,lacteos_huevos,despensa', 'ordenada por sección del súper');
  return 'ok';
}

function test_pure_debrief() {
  const ai = { transcript: 'Bien, con fuerza, un poco de molestia en el hombro derecho. La próxima subo banca.', summary: 'Buena sesión.',
    energy: 4, feeling: 'fuerte', pains: ['hombro derecho', '  '], nextTime: 'Subir el press banca.' };
  assert_(validateDebrief_(ai).length === 0, 'válido');
  assert_(validateDebrief_(Object.assign({}, ai, { energy: 9 })).length === 1, 'energía fuera de rango');
  const d = buildDebrief_(ai, '2026-11-18T19:00:00Z');
  assert_(d.pains.length === 1 && d.pains[0] === 'hombro derecho' && d.energy === 4 && d.nextTime === 'Subir el press banca.', 'limpio');
  assert_(buildDebrief_(Object.assign({}, ai, { energy: 2.5, feeling: '' }), 'x').energy === null, 'energía no entera: null');
  return 'ok';
}

function test_pure_meal_inputs() {
  const img = { mime: 'image/jpeg', data: 'A'.repeat(400) };
  const aud = { mime: 'audio/mp4', data: 'B'.repeat(400) };
  let r = mealInputs_({ text: 'un plato de lentejas', images: [img] });
  assert_(r.parts.length === 1 && r.user.descripcion === 'un plato de lentejas' && r.user.fotos === 1, 'foto y texto juntos');
  r = mealInputs_({ audio: aud, images: [img, img] });
  assert_(r.parts.length === 3 && r.user.audio === true && !('descripcion' in r.user), 'audio y dos fotos');
  r = mealInputs_({ kind: 'audio', mime: 'audio/mp4', data: aud.data });
  assert_(r.parts.length === 1, 'formato antiguo de audio');
  r = mealInputs_({ kind: 'text', text: 'dos huevos' });
  assert_(r.parts.length === 0 && r.user.descripcion === 'dos huevos', 'formato antiguo de texto');
  const falla = (p) => { try { mealInputs_(p); return null; } catch (e) { return e.code; } };
  assert_(falla({ text: '   ' }) === 'VALIDATION', 'nada que estimar');
  assert_(falla({ images: [img, img, img, img] }) === 'VALIDATION', 'más de 3 fotos');
  assert_(falla({ images: [{ mime: 'application/pdf', data: img.data }] }) === 'VALIDATION', 'tipo de archivo');
  assert_(MEAL_SYSTEM_.indexOf('fotos') > 0, 'instrucciones para fotos');
  assert_(mealInputs_({ images: [img], shared: true }).user.repartoAparte === true, 'reparto aparte: la IA estima el plato entero');
  assert_(!('repartoAparte' in mealInputs_({ images: [img] }).user), 'sin reparto, como siempre');
  assert_(MEAL_SYSTEM_.indexOf('repartoAparte') > 0, 'instrucción de reparto');
  return 'ok';
}

function test_pure_supplements() {
  assert_(mondayOf_('2026-11-21') === '2026-11-16' && mondayOf_('2026-11-16') === '2026-11-16' && mondayOf_('2026-11-22') === '2026-11-16', 'lunes de la semana');
  const ai = { name: 'Sideral Forte', dose: 1, unit: 'cápsula', known: true, ironMg: 30, vitCMg: 70, kcal: 0, b12Ug: null, inventado: 5, notes: 'Tómalo lejos del café.' };
  const sup = supFromAi_(ai, 'sup_abc123def4');
  assert_(sup.nutrients.ironMg === 30 && sup.nutrients.vitCMg === 70 && !('b12Ug' in sup.nutrients) && !('kcal' in sup.nutrients) && !('inventado' in sup.nutrients), 'solo nutrientes con valor');
  assert_(validateSupplements_([sup]).length === 0, 'válido: ' + validateSupplements_([sup]));
  assert_(validateSupplements_([Object.assign({}, sup, { unit: 'puñado' })]).length === 1, 'unidad');
  assert_(validateSupplements_([sup, sup]).length === 1, 'id repetido');
  assert_(validateSupplements_([Object.assign({}, sup, { nutrients: { veneno: 1 } })]).length === 1, 'nutriente desconocido');
  const m = supMeal_(sup, '2026-11-20');
  assert_(m.id === 'p_20261120_abc123def4' && m.mealType === 'supplement' && m.supplementId === sup.id, 'id fijo por día y suplemento');
  assert_(m.items[0].ironMg === 30 && m.items[0].proteinG === 0 && m.items[0].unit === 'cápsula', 'la toma como alimento');
  assert_(validateMeal_(m, '2026-11-21').length === 0, 'pasa la validación de comidas: ' + validateMeal_(m, '2026-11-21'));
  // Un día con solo suplementos no cuenta para la media de 7 días.
  const comida = (date, kcal) => ({ date: date, mealType: 'lunch', items: [{ kcal: kcal, proteinG: 10, carbsG: 10, fatG: 10, ironMg: 2 }] });
  const toma = (date) => ({ date: date, mealType: 'supplement', items: [{ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, ironMg: 30 }] });
  const w = weekNutrition_([comida('2026-11-20', 2000), toma('2026-11-20'), toma('2026-11-19'), comida('2026-11-18', 1800)], '2026-11-21');
  assert_(w.days === 2 && w.avg.kcal === 1900 && w.avg.ironMg === 17, 'media sin el día de solo suplementos: ' + JSON.stringify(w.avg));
  return 'ok';
}

function test_pure_op_once() {
  const op = { op: 'add', opId: 'o_20261116_1800_ab12', exerciseId: 'press_banca', set: { reps: 8, rir: 2, load: { implement: 'barbell', perSideKg: 20 } } };
  let s = applyOpOnce_(sess_(), JSON.parse(JSON.stringify(op)), ctx_().equipment, ctx_().library);
  s = applyOpOnce_(s, JSON.parse(JSON.stringify(op)), ctx_().equipment, ctx_().library);
  assert_(s.exercises[0].sets.length === 1, 'la misma edición dos veces añade una sola serie');
  assert_(s.appliedOps.length === 1, 'se anota');
  s = applyOpOnce_(s, { op: 'add', exerciseId: 'press_banca', set: op.set }, ctx_().equipment, ctx_().library);
  assert_(s.exercises[0].sets.length === 2, 'sin opId se aplica siempre (compatibilidad)');
  let err = null; try { applyOpOnce_(s, Object.assign({}, op, { opId: '../x' }), ctx_().equipment, ctx_().library); } catch (e) { err = e; }
  assert_(err && err.code === 'VALIDATION', 'id raro rechazado');
  return 'ok';
}

function test_pure_set_time() {
  const now = Date.parse('2026-11-16T18:00:00Z');
  assert_(setTime_('2026-11-16T17:58:30.000Z', now) === '2026-11-16T17:58:30.000Z', 'hora del móvil');
  assert_(setTime_('2020-01-01T00:00:00Z', now) === '2026-11-16T18:00:00.000Z', 'demasiado lejos: hora del servidor');
  assert_(setTime_('mañana', now) === '2026-11-16T18:00:00.000Z' && setTime_(undefined, now) === '2026-11-16T18:00:00.000Z', 'sin dato');
  const s = applyEditOp_(sess_(), { op: 'add', exerciseId: 'press_banca', at: new Date().toISOString(), set: { reps: 8, rir: 2, load: { implement: 'barbell', perSideKg: 20 } } }, ctx_().equipment, ctx_().library);
  assert_(typeof s.exercises[0].sets[0].at === 'string', 'la serie a mano lleva hora');
  const r = eventsToSets_([ev_({ exerciseName: 'press banca', implement: 'barbell', perSideKg: 20, reps: 8, rir: 2 })], sess_(), Object.assign({}, ctx_(), { at: '2026-11-16T17:58:30.000Z' }));
  assert_(r.exercises[0].sets[0].at === '2026-11-16T17:58:30.000Z', 'la serie dictada lleva la hora del clip');
  return 'ok';
}

function test_pure_session_summary() {
  const s = { id: 's1', date: '2026-11-10', status: 'done', groups: ['chest'], metrics: { workingSets: 3, totalVolumeKg: 900 }, painFlags: [{ text: 'hombro' }],
    clips: [{ id: 'c1', transcript: 'mucho texto' }],
    exercises: [{ exerciseId: 'press_banca', name: 'Press banca', sets: [
      { order: 1, type: 'warmup', reps: 5, load: bb_(30) },
      { order: 2, type: 'working', reps: 8, rir: 2, load: bb_(20) },
      { order: 3, type: 'working', reps: 15, rir: 1, load: bb_(30) }] },
      { exerciseId: 'dominadas', name: 'Dominadas', sets: [{ order: 1, type: 'working', reps: 8, load: { implement: 'bodyweight', addedKg: 0, totalKg: 0 } }] }] };
  const r = sessionSummary_(s);
  assert_(!('clips' in r) && !r.exercises[0].sets.length, 'sin clips ni series');
  assert_(r.exercises[0].sets === 3 && r.pain === 1 && r.metrics.workingSets === 3, 'cuentas');
  assert_(r.exercises[0].e1rm === epley_(60, 8), 'mejor 1RM sin calentamiento ni series de más de 12: ' + r.exercises[0].e1rm);
  assert_(r.exercises[1].e1rm === null, 'peso corporal sin 1RM');
  assert_(JSON.stringify(r).length < 600, 'ligero');
  return 'ok';
}

function test_all() {
  const results = [];
  [test_pure_validators, test_pure_metrics, test_pure_helpers, test_pure_auth_lockout,
    test_pure_limits, test_pure_gemini, test_pure_loads, test_pure_exercises, test_pure_rotation, test_pure_progression,
    test_pure_plan_rules, test_pure_settings, test_pure_plan_from_history, test_pure_ai_plan,
    test_pure_prompts, test_pure_dictation, test_pure_clip_validation, test_pure_edit_ops, test_pure_ids,
    test_pure_review, test_pure_save_validation, test_pure_bar_inference, test_pure_measurements, test_pure_body_extraction, test_pure_scale, test_pure_nutrition_targets, test_pure_meal_extraction, test_pure_meal_totals,
    test_pure_runs, test_pure_weekly_facts, test_pure_weekly_rules, test_pure_weekly_email, test_pure_reminder, test_pure_week_key, test_pure_export_import, test_pure_lenient_loads, test_pure_manual_entry, test_pure_caso_real_cruce_poleas, test_pure_friendly_errors, test_pure_session_summary, test_pure_set_time, test_pure_op_once, test_pure_clip_ruido, test_pure_recipes, test_pure_debrief, test_pure_meal_inputs, test_pure_supplements,
    test_commit_roundtrip].forEach((fn) => {
    try {
      results.push(fn.name + ': ' + fn());
    } catch (err) {
      results.push(fn.name + ': ' + err.message);
    }
  });
  Logger.log(results.join('\n'));
  return results;
}

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

function test_all() {
  const results = [];
  [test_pure_validators, test_pure_metrics, test_pure_helpers, test_pure_auth_lockout,
    test_pure_limits, test_pure_gemini, test_pure_loads, test_pure_exercises, test_commit_roundtrip].forEach((fn) => {
    try {
      results.push(fn.name + ': ' + fn());
    } catch (err) {
      results.push(fn.name + ': ' + err.message);
    }
  });
  Logger.log(results.join('\n'));
  return results;
}

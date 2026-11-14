/**
 * Generación de la sesión (PLAN 7 y 8). Parte pura: construcción de planes a partir del
 * historial, validación de lo que propone la IA y textos del entrenador. Sin Drive ni red.
 */

const GROUP_ES_ = { chest: 'pecho', back: 'espalda', shoulders: 'hombros', biceps: 'bíceps', triceps: 'tríceps',
  quads: 'cuádriceps', hamstrings: 'femorales', glutes: 'glúteos', calves: 'gemelos', core: 'core' };

function exerciseById_(id, library) { return (library || exerciseSeed_()).find((e) => e.id === id) || null; }

function defaultRx_(def) {
  return def && def.kind === 'compound' ? { repsMin: 6, repsMax: 10, targetRir: 2 } : { repsMin: 10, repsMax: 15, targetRir: 2 };
}
function defaultRest_(def) { return def && def.kind === 'compound' ? 120 : 75; }

/** Sesiones hechas que contienen el ejercicio, de la más antigua a la más reciente (últimas n). */
function exerciseHistory_(sessions, exerciseId, n) {
  const out = [];
  sortDone_(sessions).forEach((s) => {
    (s.exercises || []).forEach((ex) => {
      if (ex.exerciseId === exerciseId && workingOnly_(ex.sets).length) out.push({ date: s.date, sets: ex.sets });
    });
  });
  return out.slice(-n);
}

/** Última carga conocida de cada ejercicio (la serie de trabajo más pesada de su última sesión). */
function lastLoads_(sessions) {
  const out = {};
  sortDone_(sessions).forEach((s) => {
    (s.exercises || []).forEach((ex) => {
      const l = topLoad_(ex.sets);
      if (l) out[ex.exerciseId] = l;
    });
  });
  return out;
}

function lastSessionOfKey_(sessions, key) {
  const list = sortDone_(sessions).filter((s) => s.cycleKey === key);
  return list.length ? list[list.length - 1] : null;
}

/**
 * Plan determinista cuando ya se hizo esta sesión del ciclo: mismos ejercicios y rangos,
 * cargas decididas por la progresión. La IA solo redacta el mensaje.
 */
function planFromHistory_(prev, sessions, library, eq) {
  const source = (prev.plannedExercises && prev.plannedExercises.length)
    ? prev.plannedExercises
    : (prev.exercises || []).map((ex) => {
        const def = exerciseById_(ex.exerciseId, library);
        return Object.assign({ exerciseId: ex.exerciseId, sets: Math.max(1, workingOnly_(ex.sets).length),
          targetLoad: topLoad_(ex.sets), restSec: defaultRest_(def) }, defaultRx_(def));
      });
  return source.map((p) => {
    const def = exerciseById_(p.exerciseId, library);
    const rx = { repsMin: p.repsMin, repsMax: p.repsMax, targetRir: p.targetRir };
    const prog = nextProgression_(exerciseHistory_(sessions, p.exerciseId, 2), rx, eq);
    return { exerciseId: p.exerciseId, name: def ? def.name : p.name, sets: p.sets, repsMin: p.repsMin, repsMax: p.repsMax,
      targetLoad: prog.load || p.targetLoad || null, targetRir: p.targetRir, restSec: p.restSec || defaultRest_(def),
      progression: prog.action, suggestVariant: prog.suggestVariant };
  });
}

// ---------- Propuesta de la IA ----------

const SESSION_PLAN_SCHEMA_ = { type: 'OBJECT', properties: { exercises: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
  exerciseId: { type: 'STRING' }, implement: { type: 'STRING' }, sets: { type: 'INTEGER' }, repsMin: { type: 'INTEGER' },
  repsMax: { type: 'INTEGER' }, estimated10RmTotalKg: { type: 'NUMBER' }, restSec: { type: 'INTEGER' } },
  required: ['exerciseId', 'implement', 'sets', 'repsMin', 'repsMax', 'estimated10RmTotalKg', 'restSec'] } } }, required: ['exercises'] };

const CYCLE_SCHEMA_ = { type: 'OBJECT', properties: { sessions: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
  key: { type: 'STRING' }, groups: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['key', 'groups'] } },
  rationale: { type: 'STRING' } }, required: ['sessions', 'rationale'] };

const MESSAGE_SCHEMA_ = { type: 'OBJECT', properties: { message: { type: 'STRING' } }, required: ['message'] };

/** Errores de un plan de sesión propuesto por la IA. */
function validateAiPlan_(ai, groups, library) {
  const e = [];
  if (!ai || !Array.isArray(ai.exercises)) return ['falta la lista de ejercicios'];
  if (ai.exercises.length < 3 || ai.exercises.length > 8) e.push('debe haber entre 3 y 8 ejercicios');
  const seen = {};
  let totalSets = 0;
  ai.exercises.forEach((x, i) => {
    const label = 'ejercicio ' + (i + 1);
    const def = exerciseById_(x.exerciseId, library);
    if (!def) { e.push(label + ': id desconocido ' + x.exerciseId); return; }
    if (seen[def.id]) e.push(label + ': repetido ' + def.id);
    seen[def.id] = 1;
    if (!def.primary.some((g) => groups.indexOf(g) >= 0)) e.push(label + ': ' + def.id + ' no trabaja los grupos de hoy');
    if (def.implements.indexOf(x.implement) < 0) e.push(label + ': implemento no válido para ' + def.id);
    if (!Number.isInteger(x.sets) || x.sets < 2 || x.sets > 6) e.push(label + ': series entre 2 y 6');
    else totalSets += x.sets;
    if (!Number.isInteger(x.repsMin) || !Number.isInteger(x.repsMax) || x.repsMin < 3 || x.repsMax > 30 || x.repsMin > x.repsMax) e.push(label + ': rango de repeticiones inválido');
    if (!isNum_(x.estimated10RmTotalKg) || x.estimated10RmTotalKg < 0 || x.estimated10RmTotalKg > 500) e.push(label + ': estimación de carga inválida');
    if (!Number.isInteger(x.restSec) || x.restSec < 30 || x.restSec > 300) e.push(label + ': descanso entre 30 y 300 s');
  });
  if (totalSets > 26) e.push('demasiadas series en total (' + totalSets + ')');
  return e;
}

/** Convierte la propuesta validada en ejercicios planificados: cargas conservadoras y RIR 3. */
function buildPlannedFromAi_(ai, library, eq) {
  return ai.exercises.map((x) => {
    const def = exerciseById_(x.exerciseId, library);
    return { exerciseId: def.id, name: def.name, sets: x.sets, repsMin: x.repsMin, repsMax: x.repsMax,
      targetLoad: conservativeStart_(x.implement, x.estimated10RmTotalKg, eq), targetRir: 3, restSec: x.restSec,
      progression: 'start', suggestVariant: false };
  });
}

// ---------- Instrucciones y datos para Gemini (el texto del usuario nunca va en las instrucciones) ----------

const CYCLE_SYSTEM_ = 'Eres un entrenador personal de fuerza. Diseña un ciclo rotativo de sesiones de pesas. ' +
  'Reglas: entre 4 y 5 sesiones con claves A, B, C, D (y E si hace falta); cada sesión trabaja 1 o 2 grupos musculares ' +
  '(todo el tren inferior cuenta como un solo grupo); entre todas deben cubrir chest, back, shoulders, biceps, triceps, quads, ' +
  'hamstrings, glutes, calves y core. Usa solo esos identificadores de grupo. No uses días de la semana. ' +
  'Responde solo con el JSON pedido; "rationale" son 1 o 2 frases en español.';

const SESSION_SYSTEM_ = 'Eres un entrenador personal de fuerza. Diseña los ejercicios de una sesión de pesas. ' +
  'Usa solo ids de la lista "ejerciciosPermitidos" y un implemento de los suyos. Entre 4 y 7 ejercicios, compuestos primero, ' +
  'sin repetir. Series entre 2 y 5 (máximo 22 series en total); compuestos 6-10 repeticiones, aislamiento 10-15. ' +
  'Para cada ejercicio estima en "estimated10RmTotalKg" el peso TOTAL en kg (barra incluida) con el que esta persona haría 10 ' +
  'repeticiones llegando al fallo, partiendo de su referencia de fuerza. Para peso corporal pon 0. Para mancuernas, el total es ' +
  'la suma de las dos. No escribas ningún otro peso. Responde solo con el JSON pedido.';

function buildCycleUser_(settings) {
  return { objetivo: 'recomposición corporal', experiencia: settings.strength.experience === 'advanced' ? 'avanzado' : 'intermedio',
    diasDePesasPorSemana: settings.training.daysPerWeek, gruposPorSesion: settings.training.groupsPerSession,
    minutosPorSesion: settings.training.sessionMinutes };
}

function buildSessionUser_(groups, settings, library) {
  const allowed = library.filter((x) => x.primary.some((g) => groups.indexOf(g) >= 0))
    .map((x) => ({ id: x.id, nombre: x.name, implementos: x.implements, tipo: x.kind }));
  return { gruposDeHoy: groups, minutosDisponibles: settings.training.sessionMinutes,
    referenciaDeFuerza: { ejercicio: settings.strength.referenceExerciseId, repeticiones: settings.strength.referenceReps,
      pesoTotalKg: settings.strength.referenceTotalKg },
    ejerciciosPermitidos: allowed };
}

// ---------- Mensaje del entrenador (PLAN 7.4) ----------

const INTENSITY_TEXT_ = { baja: 'Tono templado: cercano y sereno, con poca arenga.',
  media: 'Tono firme: arenga moderada.', alta: 'Tono enérgico y combativo: arenga intensa, siempre respetuosa.' };

/** Instrucciones del entrenador. `persona` viene de las Propiedades del script; vacía = tono neutro. */
function buildCoachSystem_(persona, intensity) {
  const base = 'Eres el entrenador personal del usuario. Escribes en español, directo, en 1 o 2 frases, sin rayas largas. ' +
    'No cambies ni inventes cargas, series, repeticiones ni RIR: esos datos ya están decididos. ' +
    'Si hay dolor o lesión, recomienda parar o ajustar, por encima de cualquier personaje. ' +
    'Habla "al estilo de" la personalidad indicada, sin afirmar ser una persona real ni atribuirle citas.';
  const p = String(persona || '').trim();
  if (!p) return base + ' Usa un tono neutro y directo.';
  return base + '\n' + (INTENSITY_TEXT_[intensity] || INTENSITY_TEXT_.alta) + '\nPersonalidad:\n' + p;
}

function groupsEs_(groups) { return (groups || []).map((g) => GROUP_ES_[g] || g).join(' y '); }

/** Texto de respaldo cuando Gemini bloquea o falla. */
function neutralCoachMessage_(groups, notes) {
  const n = notes || [];
  let msg = 'Hoy toca ' + groupsEs_(groups) + '. Calienta bien, cuida la técnica y respeta el RIR.';
  if (n.indexOf('first_session') >= 0) msg += ' Es tu primera sesión de este bloque: revisa las cargas y corrígelas si no encajan.';
  if (n.indexOf('layoff') >= 0) msg += ' Vuelves tras varios días parado: hoy, menos carga y una serie menos.';
  if (n.indexOf('deload') >= 0) msg += ' Semana de descarga: menos volumen y más técnica.';
  return msg;
}

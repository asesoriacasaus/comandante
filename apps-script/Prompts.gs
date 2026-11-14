/**
 * System prompt y few-shots del parser NLP.
 * El texto del usuario va SIEMPRE en el mensaje user, nunca en el system prompt.
 */

const SYSTEM_PROMPT_ = [
  'Eres el parser de una app de fitness. Convierte el texto del usuario en JSON.',
  'Responde SIEMPRE con un único objeto JSON válido, sin markdown, sin texto extra.',
  '',
  'Reglas:',
  '1. No inventes datos. Si un campo numérico no aparece, usa null y añádelo a missing_fields.',
  '2. Unidades: normaliza SIEMPRE a kg, metros, segundos. "kilos", "kg" → kg; "libras", "lb" → kg (×0.4536).',
  '3. Fechas relativas ("ayer", "el lunes") se resuelven con el contexto.fechaActual y contexto.timezone.',
  '4. Para comidas, estima macros por 100 g con tablas estándar y multiplica por la cantidad. Marca confidence por ítem (0-1). Si el alimento es ambiguo, baja la confianza a ≤0.6 y añade un warning.',
  '5. Para cardio, si no hay distancia pero hay duración y ritmo, calcula la distancia. Si no hay FC, usa null.',
  '6. Para peso corporal, distingue "flexiones" (bodyweight) de "press banca" (strength). Los isométricos llevan durationSec y reps null.',
  '7. Si el texto contiene varias entidades distintas (p. ej. comida y peso), elige la dominante y añade warning "multi_entidad".',
  '8. Si el texto es una pregunta ("¿cuánto levanté el lunes?"), usa intent "query" y data.query con el filtro.',
  '9. Si no puedes interpretarlo, intent "unknown", confidence < 0.4, clarification con una pregunta corta.',
  '',
  'Formato de salida:',
  '{"intent": string, "confidence": number 0-1, "data": object, "missing_fields": string[], "clarification": string|null, "warnings": string[]}',
  'intent ∈ log_strength | log_bodyweight | log_cardio | log_meal | log_body | query | plan_request | recommend | unknown.',
  '',
  'Esquemas de data:',
  '- log_strength / log_bodyweight → data = { date, exercises: [ { exerciseName, exerciseId|null, sets: [ { reps, weightKg, rir, type, restSec, durationSec } ], bodyweightKg, addedWeightKg } ], notes }',
  '- log_cardio → data = { date, cardio: [ { exerciseName, exerciseId|null, durationSec, distanceM, avgHr, zone, rpe } ], notes }',
  '- log_meal → data = { date, time, mealType, items: [ { name, quantity, unit, kcal, proteinG, carbsG, fatG, fiberG, confidence } ], notes }',
  '- log_body → data = { date, weightKg, bodyFatPct, muscleMassKg, measurementsCm, notes }',
  '- query → data = { query: { entity, from, to, metric, exerciseName } }',
  '- plan_request → data = { goal, daysPerWeek, experience, equipment, focus }',
  '- recommend → data = { question }',
  '',
  'Valores de mealType: breakfast | lunch | dinner | snack | pre_workout | post_workout o null.',
  'Valores de unit: g | ml | unidad | ración | cucharada | taza.',
  '',
  'Responde ahora en JSON.'
].join('\n');

/** Few-shots: pares usuario/asistente. Se validan en test_pure_parse. */
const FEWSHOTS_ = [
  {
    user: 'Contexto: fechaActual=2026-11-11, timezone=Europe/Madrid\nTexto: "press banca cuatro series de ocho con ochenta kilos y luego tres de diez a setenta y cinco"',
    assistant: '{"intent":"log_strength","confidence":0.95,"data":{"date":"2026-11-11","exercises":[{"exerciseName":"press banca","exerciseId":"press_banca","sets":[{"reps":8,"weightKg":80,"type":"working"},{"reps":8,"weightKg":80,"type":"working"},{"reps":8,"weightKg":80,"type":"working"},{"reps":8,"weightKg":80,"type":"working"},{"reps":10,"weightKg":75,"type":"working"},{"reps":10,"weightKg":75,"type":"working"},{"reps":10,"weightKg":75,"type":"working"}]}],"notes":""},"missing_fields":[],"clarification":null,"warnings":[]}'
  },
  {
    user: 'Contexto: fechaActual=2026-11-11, timezone=Europe/Madrid\nTexto: "ayer corrí media hora a cinco kilómetros, pulso medio ciento cincuenta"',
    assistant: '{"intent":"log_cardio","confidence":0.92,"data":{"date":"2026-11-10","cardio":[{"exerciseName":"correr","exerciseId":"running_outdoor","durationSec":1800,"distanceM":5000,"avgHr":150,"zone":"zone2","rpe":null}],"notes":""},"missing_fields":[],"clarification":null,"warnings":[]}'
  },
  {
    user: 'Contexto: fechaActual=2026-11-11, timezone=Europe/Madrid\nTexto: "comí doscientos gramos de pollo a la plancha y cien de arroz"',
    assistant: '{"intent":"log_meal","confidence":0.9,"data":{"date":"2026-11-11","time":null,"mealType":null,"items":[{"name":"pollo a la plancha","quantity":200,"unit":"g","kcal":330,"proteinG":62,"carbsG":0,"fatG":7.2,"fiberG":0,"confidence":0.9},{"name":"arroz cocido","quantity":100,"unit":"g","kcal":130,"proteinG":2.7,"carbsG":28,"fatG":0.3,"fiberG":0.3,"confidence":0.9}],"notes":""},"missing_fields":["mealType"],"clarification":null,"warnings":[]}'
  },
  {
    user: 'Contexto: fechaActual=2026-11-11, timezone=Europe/Madrid\nTexto: "hice cuatro series de dominadas con diez kilos de lastre a seis repeticiones"',
    assistant: '{"intent":"log_bodyweight","confidence":0.93,"data":{"date":"2026-11-11","exercises":[{"exerciseName":"dominadas","exerciseId":"dominadas","addedWeightKg":10,"sets":[{"reps":6,"type":"working"},{"reps":6,"type":"working"},{"reps":6,"type":"working"},{"reps":6,"type":"working"}]}],"notes":""},"missing_fields":[],"clarification":null,"warnings":[]}'
  }
];

/** Construye el array de mensajes: system, few-shots y el mensaje real. */
function buildParseMessages_(userMessage) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT_ }];
  FEWSHOTS_.forEach((ex) => {
    messages.push({ role: 'user', content: ex.user });
    messages.push({ role: 'assistant', content: ex.assistant });
  });
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

/** Mensaje de reparación según el contrato de §6.5. */
function buildRepairPrompt_(errors) {
  return 'Tu respuesta anterior no cumplió el esquema. Error: ' + errors.join('; ') + '.\n' +
    'Devuelve SOLO el JSON corregido, con los mismos datos.';
}

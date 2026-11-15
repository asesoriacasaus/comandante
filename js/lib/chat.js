// Historial del chat con el Comandante. Funciones puras; el almacenamiento se inyecta.
export const MAX_HISTORY = 30;      // mensajes que se guardan
export const MAX_SENT = 10;         // mensajes que se envían como contexto
export const MAX_USER_CHARS = 600;
export const KEY = 'comandante.chat';

export const QUICK_PROMPTS = [
  '¿Qué me toca hoy?',
  '¿Cómo voy esta semana?',
  'No tengo ganas de entrenar',
  '¿Qué como después de entrenar?',
  '¿Voy bien con mi objetivo?'
];

const valid = (m) => m && (m.role === 'user' || m.role === 'coach') && typeof m.text === 'string' && m.text.trim();

export function loadHistory(storage) {
  try {
    const arr = JSON.parse(storage.getItem(KEY) || '[]');
    return Array.isArray(arr) ? arr.filter(valid).map((m) => ({ role: m.role, text: m.text })).slice(-MAX_HISTORY) : [];
  } catch (_) { return []; }
}

export function saveHistory(storage, msgs) {
  try { storage.setItem(KEY, JSON.stringify(msgs.slice(-MAX_HISTORY))); } catch (_) { /* sin almacenamiento */ }
}

/** Turnos para el servidor: el contexto reciente, empezando por un mensaje del usuario, más el mensaje nuevo (si es de texto). */
export function turnsFor(history, newText) {
  let ctx = history.filter(valid).slice(-MAX_SENT);
  while (ctx.length && ctx[0].role === 'coach') ctx = ctx.slice(1);
  // Alternancia: si el historial acaba en un mensaje del usuario (respuesta que no llegó), se omite ese hueco.
  const clean = [];
  for (const m of ctx) {
    if (clean.length && clean[clean.length - 1].role === m.role) clean.pop();
    clean.push({ role: m.role, text: m.text });
  }
  if (newText !== undefined && clean.length && clean[clean.length - 1].role === 'user') clean.pop();
  if (newText !== undefined) clean.push({ role: 'user', text: newText });
  return clean;
}

/** Para un audio, el historial debe terminar en el Comandante. */
export function turnsForAudio(history) {
  const t = turnsFor(history);
  while (t.length && t[t.length - 1].role === 'user') t.pop();
  return t;
}

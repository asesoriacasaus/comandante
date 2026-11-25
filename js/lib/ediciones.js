// Ediciones de la sesión hechas sin conexión: se guardan en el móvil, se ven al instante sobre la copia local
// y se envían en orden al volver la red. El servidor las aplica una sola vez gracias a su opId.

const CLAVE = 'comandante.ediciones';
const RED = new Set(['NETWORK', 'TIMEOUT']);

/** ¿El fallo es de conexión (se puede reintentar) y no un rechazo del servidor? */
export const esFalloDeRed = (err) => !!err && RED.has(err.code);

/** Total aproximado para enseñar una serie aún no confirmada (el servidor calcula el definitivo). */
export function totalAproximado(load) {
  const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  if (!load) return 0;
  switch (load.implement) {
    case 'barbell': case 'ezbar': case 'smith': return n(load.barKg ?? 20) + 2 * n(load.perSideKg);
    case 'dumbbell': case 'kettlebell': return n(load.perHandKg) * (load.count === 1 ? 1 : 2);
    case 'cable': case 'machine': return n(load.stackKg);
    case 'bodyweight': return n(load.addedKg);
    default: return n(load.totalKg);
  }
}

const clonar = (o) => JSON.parse(JSON.stringify(o));
const reordenar = (x) => x.sets.forEach((s, i) => { s.order = i + 1; });

/** Aplica una edición a una copia de la sesión, como lo haría el servidor (sin validar). Pura. */
export function aplicarOpLocal(session, op, nombres = {}) {
  const s = clonar(session);
  s.exercises = s.exercises || [];
  const ex = () => s.exercises.find((x) => x.exerciseId === op.exerciseId);
  if (op.op === 'add') {
    let x = ex();
    if (!x) { x = { exerciseId: op.exerciseId, name: nombres[op.exerciseId] || op.exerciseId, sets: [] }; s.exercises.push(x); }
    const load = Object.assign({}, (op.set && op.set.load) || {});
    if (typeof load.totalKg !== 'number') load.totalKg = totalAproximado(load);
    x.sets.push({ order: x.sets.length + 1, type: (op.set && op.set.type) || 'working', reps: op.set && op.set.reps,
      rir: op.set && op.set.rir !== undefined ? op.set.rir : null, load, at: op.at || null, clipId: null, flags: [], local: true });
    if (Number.isInteger(op.dismissPending) && s.pending) s.pending.splice(op.dismissPending, 1);
  } else if (op.op === 'update') {
    const set = ex() && ex().sets.find((q) => q.order === op.order);
    if (set) {
      const p = op.patch || {};
      ['reps', 'rir', 'type'].forEach((k) => { if (p[k] !== undefined) set[k] = p[k]; });
      if (p.load) { set.load = Object.assign({}, set.load, p.load); set.load.totalKg = totalAproximado(set.load); }
      set.flags = []; set.local = true;
    }
  } else if (op.op === 'delete') {
    const x = ex();
    if (x) {
      x.sets = x.sets.filter((q) => q.order !== op.order); reordenar(x);
      if (!x.sets.length) s.exercises = s.exercises.filter((q) => q !== x);
    }
  } else if (op.op === 'swap') {
    cambiarLocal(s, op, nombres);
  } else if (op.op === 'dismiss_pending') {
    if (s.pending && Number.isInteger(op.index)) s.pending.splice(op.index, 1);
  }
  return s;
}

/** Igual que swapExercise_ del servidor, salvo la carga del plan (sin la biblioteca, se quita si cambia el ejercicio). */
function cambiarLocal(s, op, nombres) {
  const nombre = nombres[op.to] || op.toName || op.to;
  s.plannedExercises = s.plannedExercises || [];
  const i = s.plannedExercises.findIndex((p) => p.exerciseId === op.from);
  const yaEsta = s.plannedExercises.some((p) => p.exerciseId === op.to);
  if (i >= 0 && yaEsta) s.plannedExercises.splice(i, 1);
  else if (i >= 0) s.plannedExercises[i] = Object.assign({}, s.plannedExercises[i], { exerciseId: op.to, name: nombre, targetLoad: op.keepLoad ? s.plannedExercises[i].targetLoad : null, swappedFrom: op.from });
  else if (!yaEsta) s.plannedExercises.push({ exerciseId: op.to, name: nombre, sets: 3, repsMin: 8, repsMax: 12, targetRir: 2, restSec: 90, targetLoad: null, swappedFrom: op.from });
  if (op.moveSets) {
    const x = s.exercises.find((q) => q.exerciseId === op.from);
    if (x) {
      let y = s.exercises.find((q) => q.exerciseId === op.to);
      if (!y) { y = { exerciseId: op.to, name: nombre, sets: [] }; s.exercises.splice(s.exercises.indexOf(x), 0, y); }
      y.sets = y.sets.concat(x.sets).sort((m, n) => String(m.at || '').localeCompare(String(n.at || '')));
      reordenar(y);
      s.exercises = s.exercises.filter((q) => q !== x);
    }
  }
}

/** La sesión tal como la verá el usuario: la del servidor más las ediciones que aún no se han enviado. */
export function vistaLocal(session, ops, nombres) {
  return (ops || []).reduce((s, op) => aplicarOpLocal(s, op, nombres), session);
}

export function crearColaEdiciones(storage) {
  const leer = () => { try { const a = JSON.parse(storage.getItem(CLAVE) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
  const escribir = (a) => { try { storage.setItem(CLAVE, JSON.stringify(a)); } catch (_) { /* sin almacenamiento */ } };
  return {
    pendientes: (sessionId) => leer().filter((e) => e.sessionId === sessionId).map((e) => e.op),
    poner: (sessionId, op) => { const a = leer(); a.push({ sessionId, op }); escribir(a); },
    quitar: (opId) => escribir(leer().filter((e) => e.op.opId !== opId)),
    vaciar: (sessionId) => escribir(leer().filter((e) => e.sessionId !== sessionId)),
    /**
     * Envía en orden las de una sesión. enviar(op) → sesión del servidor. Se para en el primer fallo de red;
     * una edición rechazada por el servidor se quita y se informa con onRechazo(op, err).
     */
    async enviar(sessionId, enviar, onRechazo) {
      let ultima = null;
      for (const op of leer().filter((e) => e.sessionId === sessionId).map((e) => e.op)) {
        try { ultima = await enviar(op); this.quitar(op.opId); }
        catch (err) {
          if (esFalloDeRed(err)) return { sesion: ultima, parado: true };
          this.quitar(op.opId); if (onRechazo) onRechazo(op, err);
        }
      }
      return { sesion: ultima, parado: false };
    }
  };
}

function almacen() {
  try { return localStorage; } catch (_) { return { getItem: () => null, setItem: () => {} }; }
}
export const ediciones = crearColaEdiciones(almacen());

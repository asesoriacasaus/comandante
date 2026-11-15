// Cola de clips pendientes. Un clip nunca se borra hasta que el servidor confirma que lo procesó.
// Se procesa en orden (el significado de "otra igual" depende de la serie anterior).
const PERMANENT = ['VALIDATION', 'TOO_LARGE', 'NOT_FOUND'];   // reintentar no ayuda
const BLOCKING = ['AUTH', 'LOCKED', 'CONFIG'];                // hay que arreglar el acceso; el clip se conserva

export function backoffMs(attempts) { return Math.min(60000, 2000 * 2 ** Math.max(0, attempts - 1)); }

/**
 * store: { put(clip), all(), remove(id), update(id, patch) }, todo asíncrono.
 * send(clip): resuelve con el resultado o lanza un error con `code`.
 * onChange(evento): { type: 'sent' | 'retry' | 'error' | 'blocked' | 'queued', clip, result?, error? }
 */
export function createQueue({ store, send, onChange = () => {}, now = () => Date.now() }) {
  let running = false;

  async function flush({ force = false } = {}) {
    if (running) return;
    running = true;
    try {
      const all = (await store.all()).sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
      for (const clip of all) {
        if (clip.status === 'error') continue;
        if (clip.status === 'retry' && !force && clip.nextTry > now()) break; // respeta el orden: no se salta un clip en espera
        try {
          const result = await send(clip);
          await store.remove(clip.id);
          onChange({ type: 'sent', clip, result });
        } catch (err) {
          const code = (err && err.code) || 'INTERNAL';
          const message = (err && err.message) || 'Error';
          if (PERMANENT.includes(code)) {
            await store.update(clip.id, { status: 'error', error: message });
            onChange({ type: 'error', clip, error: message });
            continue;
          }
          if (BLOCKING.includes(code)) {
            onChange({ type: 'blocked', clip, error: message });
            break;
          }
          const attempts = (clip.attempts || 0) + 1;
          await store.update(clip.id, { status: 'retry', attempts, nextTry: now() + backoffMs(attempts), error: message });
          onChange({ type: 'retry', clip, error: message });
          break;
        }
      }
    } finally {
      running = false;
    }
  }

  async function enqueue(clip) {
    await store.put(Object.assign({ status: 'pending', attempts: 0 }, clip));
    onChange({ type: 'queued', clip });
    return flush();
  }

  async function retry(id) { await store.update(id, { status: 'pending', error: null, nextTry: 0 }); return flush({ force: true }); }
  async function discard(id) { await store.remove(id); onChange({ type: 'discarded', clip: { id } }); }
  async function counts(sessionId) {
    const all = (await store.all()).filter((c) => !sessionId || c.sessionId === sessionId);
    return { total: all.length, errors: all.filter((c) => c.status === 'error').length, waiting: all.filter((c) => c.status !== 'error').length };
  }

  return { enqueue, flush, retry, discard, counts };
}

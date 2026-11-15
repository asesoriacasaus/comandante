// Caché de lectura "stale-while-revalidate": se enseña al instante lo último que se vio y se actualiza en segundo plano.
// Solo se repinta si el dato nuevo es distinto del que ya está en pantalla (así no se pisa lo que el usuario esté haciendo).
const PREFIX = 'comandante.cache.';
const MAX_CHARS = 300000;

export function crearCache(storage) {
  const k = (key) => PREFIX + key;
  function leer(key) {
    try { const o = JSON.parse(storage.getItem(k(key)) || 'null'); return o && typeof o === 'object' && 'data' in o ? o : null; } catch (_) { return null; }
  }
  function guardar(key, data) {
    try { const s = JSON.stringify({ t: Date.now(), data }); if (s.length <= MAX_CHARS) storage.setItem(k(key), s); } catch (_) { /* sin almacenamiento o lleno */ }
  }
  function borrar(key) { try { storage.removeItem(k(key)); } catch (_) { /* nada */ } }
  function limpiar() {
    try {
      const claves = [];
      for (let i = 0; i < storage.length; i++) { const n = storage.key(i); if (n && n.startsWith(PREFIX)) claves.push(n); }
      claves.forEach((n) => storage.removeItem(n));
    } catch (_) { /* nada */ }
  }

  /**
   * fetcher(): Promise con el dato fresco. onData(dato, deCache): pinta. onSinRed(err): opcional, si falla teniendo caché.
   * valido(dato): descarta una caché que ya no sirve (por ejemplo, la sesión de ayer).
   */
  async function swr(key, fetcher, onData, { valido, onSinRed } = {}) {
    let ultimo = null;
    const pinta = (d, deCache) => { const s = JSON.stringify(d); if (s === ultimo) return; ultimo = s; onData(d, deCache); };
    const hit = leer(key);
    const usable = hit && (!valido || valido(hit.data));
    if (usable) pinta(hit.data, true);
    try {
      const d = await fetcher();
      guardar(key, d);
      pinta(d, false);
    } catch (err) {
      if (usable) { if (onSinRed) onSinRed(err); return; }
      throw err;
    }
  }
  return { leer, guardar, borrar, limpiar, swr };
}

function almacenLocal() {
  try { return localStorage; } catch (_) { return { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 }; }
}
const porDefecto = crearCache(almacenLocal());
export const { leer, guardar, borrar, limpiar: limpiarCache, swr } = porDefecto;

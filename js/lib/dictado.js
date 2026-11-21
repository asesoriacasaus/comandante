// Dictado con el reconocimiento de voz del propio iPhone (Web Speech API de Safari). Gratis: no gasta IA.
// El texto se manda al servidor, que lo interpreta con reglas y solo si no encaja recurre a la IA (con texto, no audio).
// Si el iPhone no lo permite (algunas versiones no lo dejan usar en apps de la pantalla de inicio), se vuelve a grabar audio.

const CLAVE = 'comandante.dictado';   // 'iphone' (por defecto si se puede) o 'audio'

export function reconocedor(win = globalThis) {
  return (win && (win.SpeechRecognition || win.webkitSpeechRecognition)) || null;
}

export function modoDictado(storage = globalThis.localStorage, win = globalThis) {
  let m = null;
  try { m = storage.getItem(CLAVE); } catch (_) { m = null; }
  if (m === 'audio') return 'audio';
  return reconocedor(win) ? 'iphone' : 'audio';
}

export function fijarModoDictado(modo, storage = globalThis.localStorage) {
  try { storage.setItem(CLAVE, modo === 'audio' ? 'audio' : 'iphone'); } catch (_) { /* sin almacenamiento */ }
}

/** Errores del reconocedor que significan "aquí no funciona": se pasa a grabar audio. */
export const ERRORES_GRAVES = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported', 'network']);

/**
 * Una escucha: start() empieza; stop() termina y resuelve con el texto final. onParcial(texto) enseña lo que va oyendo.
 * Acumula los trozos finales (el iPhone corta en frases) y se para solo con stop(), no con los silencios.
 */
export function crearDictado({ onParcial = () => {}, onError = () => {}, win = globalThis, lang = 'es-ES' } = {}) {
  const R = reconocedor(win);
  if (!R) return null;
  let rec = null; let finales = []; let parcial = ''; let parado = true; let error = null; let resolver = null; let vivo = false;

  const texto = () => (finales.join(' ') + ' ' + parcial).trim();
  function nuevo() {
    rec = new R();
    rec.lang = lang; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      parcial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finales.push(t.trim()); else parcial += t;
      }
      onParcial((finales.join(' ') + ' ' + parcial).trim());
    };
    rec.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') { error = e.error; if (ERRORES_GRAVES.has(e.error)) onError(e.error); } };
    // iOS corta la escucha tras un silencio: si aún no se ha pulsado Parar, se reanuda.
    rec.onend = () => {
      vivo = false;
      if (!parado && !error) { try { nuevo(); rec.start(); vivo = true; return; } catch (_) { /* iOS no deja reanudar: se queda lo oído */ } }
      if (resolver) { const r = resolver; resolver = null; r({ texto: texto(), error }); }
    };
  }

  return {
    start() { finales = []; parcial = ''; error = null; parado = false; nuevo(); rec.start(); vivo = true; },
    stop() {
      parado = true;
      return new Promise((resolve) => {
        if (!vivo) { resolve({ texto: texto(), error }); return; }   // ya se había cerrado solo
        resolver = resolve;
        // Salida garantizada: si el iPhone no avisa del cierre, se resuelve con lo oído.
        setTimeout(() => { if (resolver === resolve) { resolver = null; resolve({ texto: texto(), error }); } }, 1500);
        try { rec.stop(); } catch (_) { resolver = null; resolve({ texto: texto(), error }); }
      });
    },
    get error() { return error; }
  };
}

// Ondas de audio mientras se graba: barras que siguen la voz. Con el dictado del iPhone (que no deja leer el micrófono)
// las barras se mueven solas, solo para indicar que se está escuchando. Se dibuja en un <canvas> (sin estilos en línea).

const BARRAS = 28;

/**
 * Pura: agrupa el espectro (0-255) en `n` barras de 0 a 1, en espejo desde el centro: los graves (donde está la voz)
 * en medio y los agudos hacia los lados, para que la onda se vea equilibrada.
 */
export function alturasBarras(datos, n = BARRAS) {
  const mitad = Math.ceil(n / 2);
  const bandas = bandasEspectro(datos, mitad);
  const out = [];
  for (let i = 0; i < n; i++) { const d = Math.abs(i - (n - 1) / 2); out.push(bandas[Math.min(mitad - 1, Math.floor(d))]); }
  return out;
}

function bandasEspectro(datos, n) {
  const out = new Array(n).fill(0);
  if (!datos || !datos.length) return out;
  const util = Math.max(n, Math.floor(datos.length * 0.7));   // lo más agudo casi nunca tiene voz
  const ancho = util / n;
  for (let i = 0; i < n; i++) {
    let suma = 0; let c = 0;
    for (let j = Math.floor(i * ancho); j < Math.floor((i + 1) * ancho) && j < datos.length; j++) { suma += datos[j]; c++; }
    out[i] = c ? Math.min(1, Math.pow(suma / c / 255, 0.8) * 1.25) : 0;
  }
  return out;
}

/** Pura: barras sin micrófono, una onda suave que avanza con el tiempo (ms). */
export function barrasSinteticas(ms, n = BARRAS) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(0.35 + 0.18 * Math.sin(ms / 260 + i * 0.55) + 0.1 * Math.sin(ms / 170 - i * 0.9));
  return out;
}

/**
 * Crea las ondas. `leer()` devuelve el espectro o null. Devuelve { nodo, iniciar, parar }.
 * El bucle se para solo si el lienzo sale de la página.
 */
export function crearOndas(leer, { clase = '' } = {}) {
  const nodo = document.createElement('canvas');
  nodo.className = 'ondas ' + clase;
  nodo.setAttribute('aria-hidden', 'true');
  let raf = 0; let previas = new Array(BARRAS).fill(0); let vivo = false;
  const quieto = globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ultimo = 0;

  function dibujar(ms) {
    if (!vivo) return;
    if (!nodo.isConnected && ultimo) { parar(); return; }
    raf = requestAnimationFrame(dibujar);
    if (quieto && ms - ultimo < 250) return;   // con "reducir movimiento", pocas actualizaciones
    ultimo = ms || 1;
    const dpr = globalThis.devicePixelRatio || 1;
    const w = nodo.clientWidth || 240; const hgt = nodo.clientHeight || 40;
    if (nodo.width !== Math.round(w * dpr)) { nodo.width = Math.round(w * dpr); nodo.height = Math.round(hgt * dpr); }
    const datos = leer();
    const obj = datos ? alturasBarras(datos) : barrasSinteticas(ms);
    previas = previas.map((p, i) => p + (obj[i] - p) * 0.35);   // suaviza el movimiento
    const g = nodo.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);
    g.fillStyle = getComputedStyle(nodo).color;
    const paso = w / BARRAS; const anchoB = Math.max(2, paso * 0.55);
    previas.forEach((v, i) => {
      const alto = Math.max(3, v * (hgt - 4));
      const x = i * paso + (paso - anchoB) / 2; const y = (hgt - alto) / 2;
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, anchoB, alto, anchoB / 2); else g.rect(x, y, anchoB, alto);
      g.fill();
    });
  }
  function iniciar() { if (vivo) return; vivo = true; ultimo = 0; raf = requestAnimationFrame(dibujar); }
  function parar() { vivo = false; cancelAnimationFrame(raf); previas = new Array(BARRAS).fill(0); const g = nodo.getContext && nodo.getContext('2d'); if (g) g.clearRect(0, 0, nodo.width, nodo.height); }
  return { nodo, iniciar, parar };
}

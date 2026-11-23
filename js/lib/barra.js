// Barra de acción flotante y avisos breves. Viven FUERA de #view: la animación de entrada de las pantallas pone `transform`
// en sus hijos y eso rompería el `position: fixed`.

/** Pone el contenido de la barra de acción (o la quita con null). Se limpia sola al cambiar de pantalla (app.js). */
export function ponerBarra(contenido) {
  const el = document.getElementById('barra-accion');
  if (!el) return;
  el.replaceChildren();
  const hay = contenido instanceof Node;
  if (hay) el.append(contenido);
  el.hidden = !hay;
  document.body.classList.toggle('con-barra', hay);
}

let temporizador = null;
/** Aviso breve que no bloquea nada ("Sesión guardada ✓"). */
export function avisar(texto, ms = 3500) {
  const el = document.getElementById('aviso-flotante');
  if (!el) return;
  el.textContent = texto;
  el.hidden = false;
  el.classList.add('visible');
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { el.classList.remove('visible'); el.hidden = true; }, ms);
}

/**
 * Pura: ¿está abierto el teclado? El área visible (visualViewport) se encoge bastante respecto a la ventana.
 * Así la barra solo se esconde cuando de verdad estorbaría, y vuelve sola al cerrarse el teclado.
 */
export function tecladoAbierto(altoVisible, altoVentana) {
  return typeof altoVisible === 'number' && typeof altoVentana === 'number' && altoVentana > 0 && altoVisible < altoVentana * 0.8;
}

/** ¿Hay un campo de texto con el foco dentro de la pantalla? (no se mueve la vista ni se tapa con la barra mientras se escribe) */
export function escribiendo(raiz = document.getElementById('view')) {
  const a = document.activeElement;
  return !!(a && raiz && raiz.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}

let ultimoToque = 0;
if (typeof window !== 'undefined') {
  ['touchstart', 'touchmove', 'wheel'].forEach((t) => window.addEventListener(t, () => { ultimoToque = Date.now(); }, { passive: true }));
}
/** ¿El usuario está tocando o desplazando la pantalla ahora mismo? (menos de 1 s) */
export function desplazando(ahora = Date.now()) { return ahora - ultimoToque < 1000; }

/** Lleva la vista a un elemento con desplazamiento suave (instantáneo si el usuario pidió reducir el movimiento). */
export function irA(nodo) {
  if (!nodo || !nodo.scrollIntoView) return;
  const quieto = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  nodo.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'center' });
}

/**
 * Pura: ¿hay que llevar la vista al ejercicio activo? Solo si han subido las series, no se está escribiendo
 * y el usuario no está tocando la pantalla.
 */
export function debeIrAlActivo({ antes, ahora, escribiendo: esc, desplazando: desp }) {
  return antes !== undefined && ahora > antes && !esc && !desp;
}

/** Pura: el cursor de un campo de texto va al final del contenido en la primera vez que se enfoca. */
export function esCampoDeTexto(el) {
  if (!el || !el.tagName) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return !['number', 'date', 'time', 'file', 'checkbox', 'radio', 'range', 'color', 'button', 'submit', 'datetime-local', 'month', 'week'].includes((el.type || 'text').toLowerCase());
}

/** Al enfocar un campo, el cursor se pone al final (iOS lo coloca después del foco, por eso se repite). Un toque posterior dentro del campo es libre. */
export function cursorAlFinal(doc = document) {
  doc.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!esCampoDeTexto(t)) return;
    const poner = () => {
      if (doc.activeElement !== t) return;
      try { const n = t.value.length; t.setSelectionRange(n, n); } catch (_) { /* tipo sin selección */ }
    };
    setTimeout(poner, 0);
    setTimeout(poner, 60);
  });
}

// Constructor de nodos DOM. Todo texto entra por textContent: nunca se interpreta como HTML.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

/** Esqueleto de carga: reserva el sitio del contenido (sin saltos al llegar los datos) y anuncia la espera. */
export function cargando(texto = 'Cargando…') {
  const n = h('div', { class: 'esqueleto', role: 'status', 'aria-label': texto }, h('span', {}), h('span', {}), h('span', {}), h('span', {}));
  return n;
}

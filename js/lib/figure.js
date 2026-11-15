// Figura humana esquemática con la cinta dibujada. SVG construido con el DOM (compatible con la CSP).
import { TAPE } from './measures.js';

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

export function figureSvg(part, { size = 150 } = {}) {
  const svg = el('svg', { viewBox: '0 0 200 410', width: size, height: Math.round(size * 410 / 200), role: 'img', 'aria-label': 'Figura con la cinta colocada', class: 'figura' });
  const seg = (x1, y1, x2, y2, w) => el('line', { x1, y1, x2, y2, 'stroke-width': w, 'stroke-linecap': 'round', class: 'fig-cuerpo' });
  const parts = [
    el('circle', { cx: 100, cy: 28, r: 18, class: 'fig-relleno' }),
    seg(100, 46, 100, 68, 14),
    el('polygon', { points: '64,74 136,74 132,130 126,205 74,205 68,130', class: 'fig-relleno' }),
    seg(56, 82, 48, 135, 16), seg(48, 135, 42, 190, 13),
    seg(144, 82, 152, 135, 16), seg(152, 135, 158, 190, 13),
    seg(82, 210, 80, 300, 28), seg(80, 300, 80, 392, 20),
    seg(118, 210, 120, 300, 28), seg(120, 300, 120, 392, 20)
  ];
  parts.forEach((p) => svg.append(p));
  const t = TAPE[part];
  if (t) {
    const ring = (cx) => el('ellipse', { cx, cy: t.cy, rx: t.rx, ry: t.ry, class: 'fig-cinta' });
    svg.append(ring(t.cx));
    if (t.pair) svg.append(ring(200 - t.cx));
  }
  const label = (x, txt) => { const n = el('text', { x, y: 408, 'text-anchor': 'middle', class: 'fig-texto' }); n.textContent = txt; return n; };
  svg.append(label(82, 'D'), label(118, 'I'));
  return svg;
}

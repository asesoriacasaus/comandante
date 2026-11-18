// Figura de frente y de espaldas con los grupos musculares trabajados en rojo. SVG construido con el DOM (compatible con la CSP).
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

// Silueta común (cabeza, cuello, tronco, brazos y piernas) y zonas de cada grupo, en un lienzo de 120 × 250.
const SILUETA = [
  ['circle', { cx: 60, cy: 18, r: 13 }],
  ['rect', { x: 54, y: 30, width: 12, height: 10, rx: 3 }],
  ['path', { d: 'M36 44 Q60 36 84 44 L90 60 L86 132 L80 142 L40 142 L34 132 L30 60 Z' }],
  ['path', { d: 'M30 50 Q20 54 19 70 L14 120 Q13 128 18 130 Q23 130 24 122 L31 76 Z' }],
  ['path', { d: 'M90 50 Q100 54 101 70 L106 120 Q107 128 102 130 Q97 130 96 122 L89 76 Z' }],
  ['path', { d: 'M40 138 L59 140 L58 236 Q52 242 46 236 L38 176 Z' }],
  ['path', { d: 'M80 138 L61 140 L62 236 Q68 242 74 236 L82 176 Z' }]
];

const ZONAS = {
  frente: {
    shoulders: [['ellipse', { cx: 33, cy: 55, rx: 8, ry: 9 }], ['ellipse', { cx: 87, cy: 55, rx: 8, ry: 9 }]],
    chest: [['path', { d: 'M41 52 Q50 48 59 52 L59 74 Q50 78 41 72 Z' }], ['path', { d: 'M79 52 Q70 48 61 52 L61 74 Q70 78 79 72 Z' }]],
    biceps: [['ellipse', { cx: 25, cy: 82, rx: 5, ry: 12 }], ['ellipse', { cx: 95, cy: 82, rx: 5, ry: 12 }]],
    core: [['rect', { x: 48, y: 80, width: 24, height: 50, rx: 6 }]],
    quads: [['path', { d: 'M42 148 L57 150 L56 196 Q50 200 45 194 Z' }], ['path', { d: 'M78 148 L63 150 L64 196 Q70 200 75 194 Z' }]]
  },
  espalda: {
    shoulders: [['ellipse', { cx: 33, cy: 55, rx: 8, ry: 9 }], ['ellipse', { cx: 87, cy: 55, rx: 8, ry: 9 }]],
    back: [['path', { d: 'M44 46 Q60 40 76 46 L82 66 L72 110 L60 116 L48 110 L38 66 Z' }]],
    triceps: [['ellipse', { cx: 25, cy: 82, rx: 5, ry: 12 }], ['ellipse', { cx: 95, cy: 82, rx: 5, ry: 12 }]],
    glutes: [['ellipse', { cx: 50, cy: 134, rx: 10, ry: 9 }], ['ellipse', { cx: 70, cy: 134, rx: 10, ry: 9 }]],
    hamstrings: [['path', { d: 'M42 150 L57 152 L56 192 Q50 196 45 190 Z' }], ['path', { d: 'M78 150 L63 152 L64 192 Q70 196 75 190 Z' }]],
    calves: [['ellipse', { cx: 50, cy: 212, rx: 6, ry: 14 }], ['ellipse', { cx: 70, cy: 212, rx: 6, ry: 14 }]]
  }
};

function figura(lado, activos, ancho) {
  const svg = el('svg', { viewBox: '0 0 120 250', width: ancho, height: Math.round(ancho * 250 / 120), 'aria-hidden': 'true', class: 'musculos-fig' });
  SILUETA.forEach(([t, a]) => svg.append(el(t, Object.assign({ class: 'mus-silueta' }, a))));
  for (const [grupo, formas] of Object.entries(ZONAS[lado])) {
    formas.forEach(([t, a]) => svg.append(el(t, Object.assign({ class: 'mus-zona' + (activos.has(grupo) ? ' activo' : '') }, a))));
  }
  const pie = el('text', { x: 60, y: 249, 'text-anchor': 'middle', class: 'mus-pie' });
  pie.textContent = lado === 'frente' ? 'FRENTE' : 'ESPALDA';
  svg.append(pie);
  return svg;
}

/** Grupos que se dibujan (para los tests y para decidir si merece la pena enseñar la figura). */
export const GRUPOS_DIBUJADOS = new Set([...Object.keys(ZONAS.frente), ...Object.keys(ZONAS.espalda)]);

/** Frente y espalda lado a lado. `grupos`: claves como 'chest', 'triceps'… */
export function figuraMusculos(grupos, { ancho = 110, etiqueta } = {}) {
  const activos = new Set(grupos || []);
  const caja = document.createElement('div');
  caja.className = 'musculos';
  caja.setAttribute('role', 'img');
  caja.setAttribute('aria-label', etiqueta || 'Músculos trabajados');
  caja.append(figura('frente', activos, ancho), figura('espalda', activos, ancho));
  return caja;
}

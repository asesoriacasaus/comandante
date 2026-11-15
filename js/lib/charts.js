// Series temporales y progreso hacia el objetivo. Las cuentas son puras; el SVG se construye con el DOM.

const dayNum = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000;
export const daysBetween = (a, b) => Math.round(dayNum(b) - dayNum(a));

/** Serie [{ date, value }] de un campo numérico de los registros, ordenada por fecha. `pick` extrae el valor. */
export function seriesOf(records, pick) {
  return records.map((r) => ({ date: r.date, value: pick(r) })).filter((p) => typeof p.value === 'number')
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Media de los valores de los últimos `days` días (incluido el propio día) para cada punto. */
export function movingAverage(points, days = 7) {
  return points.map((p, i) => {
    const win = points.slice(0, i + 1).filter((q) => daysBetween(q.date, p.date) < days);
    return { date: p.date, value: Math.round(win.reduce((a, q) => a + q.value, 0) / win.length * 100) / 100 };
  });
}

/** Avance de `start` a `target` (en %). Puede pasar de 100 o ser negativo si se va en dirección contraria. */
export function goalProgress(start, current, target) {
  if ([start, current, target].some((v) => typeof v !== 'number')) return null;
  if (target === start) return { pct: 100, remaining: 0 };
  return { pct: Math.round((current - start) / (target - start) * 100), remaining: Math.round((target - current) * 10) / 10 };
}

/** Día del plan y días que faltan hasta la fecha objetivo. */
export function timeline(startDate, targetDate, todayIso) {
  if (!startDate || !targetDate) return null;
  const total = daysBetween(startDate, targetDate);
  const elapsed = Math.max(0, Math.min(total, daysBetween(startDate, todayIso)));
  return { total, elapsed, left: Math.max(0, daysBetween(todayIso, targetDate)), pct: total > 0 ? Math.round(elapsed / total * 100) : 100 };
}

/** Coordenadas de una serie dentro de un rectángulo, con un margen vertical del 10 %. */
export function scalePoints(points, { width, height, pad = 8, min, max } = {}) {
  if (!points.length) return [];
  const vals = points.map((p) => p.value);
  let lo = min ?? Math.min(...vals); let hi = max ?? Math.max(...vals);
  if (hi === lo) { lo -= 1; hi += 1; }
  const span = hi - lo; lo -= span * 0.1; hi += span * 0.1;
  const t0 = dayNum(points[0].date); const t1 = dayNum(points[points.length - 1].date);
  return points.map((p) => ({
    x: Math.round((t1 === t0 ? width / 2 : pad + (dayNum(p.date) - t0) / (t1 - t0) * (width - 2 * pad)) * 10) / 10,
    y: Math.round((pad + (hi - p.value) / (hi - lo) * (height - 2 * pad)) * 10) / 10
  }));
}

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };

/** Gráfica con puntos sueltos y, si se da, la línea de la media. */
export function lineChart(raw, avg, { width = 320, height = 130, label = '' } = {}) {
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', role: 'img', 'aria-label': label, class: 'grafica' });
  if (raw.length < 2) { const t = el('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'fig-texto' }); t.textContent = 'Hacen falta al menos dos registros'; svg.append(t); return svg; }
  const all = raw.concat(avg || []);
  const lo = Math.min(...all.map((p) => p.value)); const hi = Math.max(...all.map((p) => p.value));
  const sc = (pts) => scalePoints(pts, { width, height, min: lo, max: hi });
  const aP = avg ? sc(avg) : [];
  sc(raw).forEach((p) => svg.append(el('circle', { cx: p.x, cy: p.y, r: 2.6, class: 'gr-punto' })));
  if (aP.length > 1) svg.append(el('polyline', { points: aP.map((p) => p.x + ',' + p.y).join(' '), class: 'gr-linea', fill: 'none' }));
  const txt = (x, y, s, anchor) => { const t = el('text', { x, y, 'text-anchor': anchor, class: 'fig-texto' }); t.textContent = s; return t; };
  svg.append(txt(2, 12, String(hi).replace('.', ','), 'start'), txt(2, height - 4, String(lo).replace('.', ','), 'start'));
  return svg;
}

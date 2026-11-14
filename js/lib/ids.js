// Identificadores con el formato del plan: <prefijo>_<yyyyMMdd>_<hhmm>_<rand4>.
const pad = (n) => String(n).padStart(2, '0');

export function newId(prefix, now = new Date(), rand = Math.random) {
  const r = rand().toString(36).slice(2, 6).padEnd(4, '0');
  return prefix + '_' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes()) + '_' + r;
}

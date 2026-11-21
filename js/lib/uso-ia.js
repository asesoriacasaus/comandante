// Resumen del uso de la IA del mes: lo que cuenta el servidor y lo que se ahorra en el propio móvil. Funciones puras.
const VIAS = { cache: 'Peticiones repetidas (caché)', frases: 'Mensajes del Comandante (banco de frases)', suplementos: 'Suplementos conocidos',
  dictado: 'Series del dictado del iPhone entendidas sin IA', comidas: 'Comidas con alimentos conocidos', repetir: 'Comidas repetidas («Lo de siempre»)' };
const MODELOS = { FAST: 'Modelo rápido', SMART: 'Modelo avanzado', CLIP: 'Dictado (audio)' };

export function resumenUso(servidor, local, mes) {
  const u = servidor && servidor.mes === mes ? servidor : { llamadas: {}, ahorros: {} };
  const l = local && local.mes === mes ? local.vias : {};
  const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
  const ahorros = Object.assign({}, u.ahorros);
  Object.entries(l || {}).forEach(([k, v]) => { ahorros[k] = (ahorros[k] || 0) + v; });
  const llamadas = sum(u.llamadas); const ahorradas = sum(ahorros);
  return {
    llamadas, ahorradas,
    pct: llamadas + ahorradas ? Math.round(ahorradas / (llamadas + ahorradas) * 100) : 0,
    modelos: Object.entries(u.llamadas || {}).map(([k, v]) => [MODELOS[k] || k, v]).sort((a, b) => b[1] - a[1]),
    vias: Object.entries(ahorros).map(([k, v]) => [VIAS[k] || k, v]).sort((a, b) => b[1] - a[1])
  };
}

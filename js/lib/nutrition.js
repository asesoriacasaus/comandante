// Utilidades de nutrición del cliente. Funciones puras.
export const MACRO_KEYS = ['kcal', 'proteinG', 'carbsG', 'fatG'];
export const MEAL_TYPES_ES = { breakfast: 'Desayuno', lunch: 'Comida', dinner: 'Cena', snack: 'Snack', pre_workout: 'Antes de entrenar', post_workout: 'Después de entrenar', supplement: 'Suplementos' };
export const UNITS = ['g', 'ml', 'unidad', 'ración', 'cucharada', 'taza', 'cápsula', 'comprimido', 'sobre', 'cacito', 'gota'];

const NUMERIC = ['kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'saturatedFatG', 'sodiumMg', 'potassiumMg', 'calciumMg', 'ironMg', 'magnesiumMg',
  'zincMg', 'vitAUg', 'vitCMg', 'vitDUg', 'vitEMg', 'vitKUg', 'b1Mg', 'b2Mg', 'b3Mg', 'b6Mg', 'folateUg', 'b12Ug', 'omega3G'];

/** Reescala todos los nutrientes de un alimento cuando cambia la cantidad (la IA estima el total de lo comido). */
export function scaleItem(item, newQuantity) {
  if (!(item.quantity > 0) || !(newQuantity > 0)) return item;
  const f = newQuantity / item.quantity;
  const out = Object.assign({}, item, { quantity: newQuantity });
  for (const k of NUMERIC) if (typeof item[k] === 'number') out[k] = Math.round(item[k] * f * 100) / 100;
  out.kcal = Math.round(out.kcal);
  return out;
}

export function pct(value, target) {
  if (typeof value !== 'number' || !(target > 0)) return 0;
  return Math.round(value / target * 100);
}

export function warningText(flag) {
  return ({
    kcal_fixed: 'las calorías no cuadraban con los macros y se han recalculado',
    kcal_from_macros: 'las calorías se han calculado a partir de los macros',
    low_confidence: 'estimación poco fiable: revisa la cantidad'
  })[flag] || '';
}

/** Suma de macros de una lista de alimentos. */
export function sumItems(items) {
  const out = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const it of items) for (const k of MACRO_KEYS) out[k] += typeof it[k] === 'number' ? it[k] : 0;
  return out;
}

export const fmtInt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const fmtDec = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

// ---------- Micronutrientes: estado frente a la referencia ----------

/** Alimentos de supermercado español ricos en cada nutriente (orientativo, para el consejo rápido). */
export const FUENTES = {
  fiberG: 'legumbres, avena, fruta con piel, verduras',
  potassiumMg: 'plátano, patata, legumbres, tomate',
  calciumMg: 'lácteos, sardinas en lata, almendras, brócoli',
  ironMg: 'lentejas, carne roja, almejas, espinacas',
  magnesiumMg: 'frutos secos, cacao puro, legumbres, integrales',
  zincMg: 'carne, marisco, huevos, pipas de calabaza',
  vitAUg: 'zanahoria, boniato, espinacas, huevo',
  vitCMg: 'pimiento, naranja, kiwi, fresas',
  vitDUg: 'pescado azul, huevo, sol al mediodía',
  vitEMg: 'aceite de oliva, almendras, pipas de girasol',
  vitKUg: 'espinacas, brócoli, lechuga, acelgas',
  b1Mg: 'cerdo, legumbres, integrales',
  b2Mg: 'lácteos, huevo, almendras',
  b3Mg: 'pollo, atún, cacahuetes',
  b6Mg: 'pollo, plátano, garbanzos',
  folateUg: 'legumbres, espinacas, espárragos',
  b12Ug: 'carne, pescado, huevo, lácteos',
  omega3G: 'sardinas, caballa, salmón, nueces'
};

/** Clasifica cada micronutriente: 'bajo' (<80 % de lo que conviene llegar), 'alto' (>110 % de un máximo), 'ok' o 'sin_dato'. */
export function estadoMicros(micros, valores) {
  return (micros || []).map((m) => {
    const v = valores ? valores[m.key] : undefined;
    if (typeof v !== 'number') return Object.assign({}, m, { value: null, pct: null, estado: 'sin_dato' });
    const p = pct(v, m.ref);
    const estado = m.kind === 'max' ? (p > 110 ? 'alto' : 'ok') : (p < 80 ? 'bajo' : 'ok');
    return Object.assign({}, m, { value: v, pct: p, estado });
  });
}

/** Agrupa para la pantalla: lo que falta (del más bajo al menos), lo que sobra, lo cubierto y lo que no tiene dato. */
export function agruparMicros(lista) {
  const por = (e) => lista.filter((m) => m.estado === e);
  return { bajos: por('bajo').sort((a, b) => a.pct - b.pct), altos: por('alto').sort((a, b) => b.pct - a.pct), ok: por('ok'), sinDato: por('sin_dato') };
}

export const SECCIONES_ES = { fruta_verdura: 'Fruta y verdura', carne_pescado: 'Carne y pescado', lacteos_huevos: 'Lácteos y huevos',
  panaderia: 'Panadería', despensa: 'Despensa', congelados: 'Congelados', otros: 'Otros' };
export const MOMENTOS_ES = { desayuno: 'Desayuno', comida: 'Comida', cena: 'Cena', snack: 'Snack', post_entreno: 'Después de entrenar' };

/** Lista de la compra en texto, para copiar o compartir. */
export function listaEnTexto(lista, marcados = new Set()) {
  const lineas = [];
  let seccion = null;
  for (const it of lista || []) {
    if (marcados.has(claveCompra(it))) continue;
    if (it.section !== seccion) { seccion = it.section; lineas.push((lineas.length ? '\n' : '') + (SECCIONES_ES[seccion] || 'Otros') + ':'); }
    lineas.push('- ' + it.name + ' (' + fmtDec(it.quantity) + ' ' + it.unit + ')');
  }
  return lineas.join('\n');
}
export const claveCompra = (it) => it.name.toLowerCase() + '|' + it.unit;

/** Tramos de la escala de un micronutriente (0 a 150 % de la referencia) y posición de la marca, en %. */
export function escalaMicro(m) {
  const tramos = m.kind === 'max'
    ? [{ hasta: 100, clase: 'bien' }, { hasta: 130, clase: 'alto' }, { hasta: 150, clase: 'muy-alto' }]
    : [{ hasta: 50, clase: 'muy-bajo' }, { hasta: 80, clase: 'bajo' }, { hasta: 150, clase: 'bien' }];
  let desde = 0;
  const zonas = tramos.map((t) => { const z = { ancho: Math.round((t.hasta - desde) / 150 * 1000) / 10, clase: t.clase }; desde = t.hasta; return z; });
  const marca = Math.round(Math.min(Math.max(m.pct || 0, 0), 150) / 150 * 1000) / 10;
  return { zonas, marca, extremos: m.kind === 'max' ? ['Bien', 'Excesivo'] : ['Bajo', 'Bien'] };
}

/** Longitud de trazo de un anillo de progreso (circunferencia y parte llena), con el progreso entre 0 y 1. */
export function anillo(valor, objetivo, radio) {
  const c = 2 * Math.PI * radio;
  const f = objetivo > 0 && typeof valor === 'number' ? Math.min(Math.max(valor / objetivo, 0), 1) : 0;
  return { circunferencia: Math.round(c * 100) / 100, lleno: Math.round(c * f * 100) / 100 };
}

// ---------- Semana: días apuntados y huecos ----------

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const sumar = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

/** Los 7 días (lunes a domingo) desde `start`, con si tienen comidas y si son futuros. */
export function diasSemana(start, today, logged) {
  const hay = new Set(logged || []);
  return Array.from({ length: 7 }, (_, i) => {
    const date = sumar(start, i);
    return { date, letra: LETRAS[i], num: Number(date.slice(8)), apuntado: hay.has(date), futuro: date > today };
  });
}

/**
 * Días recientes (hasta `n` antes de hoy) sin nada apuntado, del más antiguo al más reciente. Solo se miran los días
 * de la semana que se conoce (de `start` a `start + 6`): de los demás no se sabe nada.
 */
export function huecosRecientes(start, today, logged, n = 3) {
  const hay = new Set(logged || []);
  const fin = sumar(start, 6);
  const out = [];
  for (let i = n; i >= 1; i--) { const d = sumar(today, -i); if (d >= start && d <= fin && !hay.has(d)) out.push(d); }
  return out;
}

/** Tipos de comida que el usuario elige al guardar (los suplementos se marcan aparte). */
export const TIPOS_ELEGIBLES = Object.keys(MEAL_TYPES_ES).filter((k) => k !== 'supplement');

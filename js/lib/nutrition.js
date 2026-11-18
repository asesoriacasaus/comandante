// Utilidades de nutrición del cliente. Funciones puras.
export const MACRO_KEYS = ['kcal', 'proteinG', 'carbsG', 'fatG'];
export const MEAL_TYPES_ES = { breakfast: 'Desayuno', lunch: 'Comida', dinner: 'Cena', snack: 'Snack', pre_workout: 'Antes de entrenar', post_workout: 'Después de entrenar' };
export const UNITS = ['g', 'ml', 'unidad', 'ración', 'cucharada', 'taza'];

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

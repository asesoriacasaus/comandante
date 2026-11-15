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

/**
 * Aportes que no vienen de las comidas registradas (PLAN 17.4, 17.7 y 17.8). Se calculan aquí, en UN solo sitio, y se suman al total
 * del día y a la media de 7 días ANTES de valorar si un nutriente va bajo; el desglose se devuelve aparte para enseñarlo.
 *  - Niacina (B3): el cuerpo fabrica niacina con el triptófano de la proteína (60 mg de triptófano = 1 mg de niacina).
 *    `b3Mg` de las comidas es solo la niacina ya formada; esto añade la fabricada.
 *  - Vitamina D: la mayor parte se fabrica en la piel con el sol. Estimación MUY gruesa (ver sunVitDUg_). El sol a través de un
 *    cristal (coche, oficina) no cuenta: el vidrio bloquea casi toda la radiación UVB.
 *  - Calcio y magnesio del agua que se bebe.
 * Todo es orientativo y se marca como estimado. Ninguno de estos datos sale del servidor del usuario.
 */
const TRP_MG_PER_G_PROTEIN_ = 12;   // triptófano medio de una dieta mixta: del orden de 10 a 13 mg por g de proteína (a contrastar con el dietista)
const TRP_PER_NIACIN_MG_ = 60;
const SUN_BASE_UG_PER_MIN_ = 0.6;   // µg de vitamina D por minuto con UVI 7, el 25 % de la piel al descubierto y sin protector
const SUN_MAX_UG_DAY_ = 20;         // la producción en la piel se satura: tope diario
const SUN_SKIN_ = { face: 0.10, arms: 0.20, legs: 0.35 };   // fracción de piel al descubierto: cara y manos / brazos / brazos y piernas
const SUN_LATITUDES_ = { norte: 43, centro: 40, sur: 37, canarias: 28 };

/** Pura: niacina (mg) que el cuerpo fabrica con el triptófano de la proteína. */
function niacinFromProtein_(proteinG) {
  if (!isNum_(proteinG) || proteinG <= 0) return 0;
  return Math.round(proteinG * TRP_MG_PER_G_PROTEIN_ / TRP_PER_NIACIN_MG_ * 10) / 10;
}

/** Pura: índice UV estimado a mediodía solar con cielo despejado, a partir de la latitud y la fecha. */
function uvMediodia_(lat, isoDate) {
  const d = new Date(isoDate + 'T12:00:00Z');
  const doy = Math.floor((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 0))) / 86400000);
  const decl = 23.44 * Math.sin(2 * Math.PI * (284 + doy) / 365);
  const zenit = Math.abs(lat - decl);
  if (zenit >= 90) return 0;
  return 11 * Math.pow(Math.cos(zenit * Math.PI / 180), 2.4);
}

/**
 * Pura: µg de vitamina D que la piel produce en un día, o 0. `sun` = { minutes, skin, midday, spf, lat }.
 * Por debajo de un índice UV de unos 3 la producción es prácticamente nula (de noviembre a febrero en España, casi cero).
 */
function sunVitDUg_(sun, isoDate) {
  if (!sun || !isNum_(sun.minutes) || sun.minutes <= 0) return 0;
  const uvi = uvMediodia_(isNum_(sun.lat) ? sun.lat : SUN_LATITUDES_.centro, isoDate);
  const efectivo = Math.min(1.5, Math.max(0, (uvi - 2.5) / 4.5));
  const area = (SUN_SKIN_[sun.skin] || SUN_SKIN_.face) / 0.25;
  const ug = sun.minutes * SUN_BASE_UG_PER_MIN_ * area * efectivo * (sun.midday === false ? 0.5 : 1) * (sun.spf ? 0.2 : 1);
  return Math.round(Math.min(SUN_MAX_UG_DAY_, ug) * 10) / 10;
}

/** Pura: calcio y magnesio (mg) que aporta el agua bebida al día. */
function waterMinerals_(water) {
  if (!water || !isNum_(water.litersPerDay) || water.litersPerDay <= 0) return { calciumMg: 0, magnesiumMg: 0 };
  return { calciumMg: Math.round((water.calciumMgL || 0) * water.litersPerDay), magnesiumMg: Math.round((water.magnesiumMgL || 0) * water.litersPerDay) };
}

/** Pura: los aportes extra de UN día, solo los que son mayores que cero. `totals` = sumMeals_ de ese día. */
function extrasDia_(nutrition, totals, isoDate) {
  const n = nutrition || {};
  const out = {};
  const put = (k, v) => { if (isNum_(v) && v > 0) out[k] = v; };
  put('b3Mg', niacinFromProtein_((totals || {}).proteinG));
  put('vitDUg', sunVitDUg_(n.sun, isoDate));
  const agua = waterMinerals_(n.water);
  put('calciumMg', agua.calciumMg);
  put('magnesiumMg', agua.magnesiumMg);
  return out;
}

/** Pura: suma el desglose al total de un día (sin modificar el original). */
function conExtras_(totals, extras) {
  const out = Object.assign({}, totals);
  Object.keys(extras || {}).forEach((k) => { out[k] = Math.round(((out[k] || 0) + extras[k]) * 100) / 100; });
  return out;
}

/** Perfil de sol y agua válido (validación de los ajustes). */
function validateExtrasSettings_(n) {
  const e = [];
  const sun = n && n.sun;
  if (sun !== undefined && sun !== null) {
    if (typeof sun !== 'object') e.push('nutrition.sun inválido');
    else {
      pushIf_(e, checkNum_(sun.minutes, 'nutrition.sun.minutes', 0, 600, false));
      pushIf_(e, checkNum_(sun.lat, 'nutrition.sun.lat', 10, 70, false));
      if (sun.skin !== undefined && !SUN_SKIN_[sun.skin]) e.push('nutrition.sun.skin inválido');
      ['midday', 'spf'].forEach((k) => { if (sun[k] !== undefined && typeof sun[k] !== 'boolean') e.push('nutrition.sun.' + k + ' debe ser sí o no'); });
    }
  }
  const w = n && n.water;
  if (w !== undefined && w !== null) {
    if (typeof w !== 'object') e.push('nutrition.water inválido');
    else {
      pushIf_(e, checkNum_(w.calciumMgL, 'nutrition.water.calciumMgL', 0, 600, false));
      pushIf_(e, checkNum_(w.magnesiumMgL, 'nutrition.water.magnesiumMgL', 0, 200, false));
      pushIf_(e, checkNum_(w.litersPerDay, 'nutrition.water.litersPerDay', 0, 8, false));
    }
  }
  return e;
}

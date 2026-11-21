/**
 * Dictado del iPhone (PLAN 7.5): el móvil transcribe con el reconocimiento de voz del sistema (gratis) y aquí se interpreta
 * la serie con reglas. Solo se acepta si TODO el texto encaja con seguridad; si queda algo sin entender (un número suelto,
 * una palabra que no es un ejercicio conocido, una molestia, un dropset…), se devuelve null y lo interpreta la IA, que
 * con texto en lugar de audio gasta bastante menos.
 */

const NUM_PALABRAS_ = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, do: 2, tres: 3, tre: 3, cuatro: 4, cinco: 5, seis: 6, sei: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10, die: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100 };

/** Pura: minúsculas, sin tildes, números escritos con letras pasados a cifras ("doce y medio" → "12.5"). */
function textoSerie_(t) {
  let s = sinTildes_(t).replace(/(\d),(\d)/g, '$1.$2').replace(/[^a-z0-9. ]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.split(' ').map((w) => (Object.prototype.hasOwnProperty.call(NUM_PALABRAS_, w) ? String(NUM_PALABRAS_[w]) : w)).join(' ');
  s = s.replace(/\b(\d+) y (\d)\b/g, (m, a, b) => (Number(a) >= 20 && Number(a) % 10 === 0 ? String(Number(a) + Number(b)) : m));   // "treinta y dos"
  s = s.replace(/\b(\d+) y medio\b/g, (m, a) => String(Number(a) + 0.5)).replace(/\b(\d+) y cuarto\b/g, (m, a) => String(Number(a) + 0.25));
  return s.replace(/\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim();
}

const N_ = '(\\d+(?:\\.\\d+)?)';
const KG_ = '(?:\\s*(?:kilos?|kg|kilogramos?))?';
const RELLENO_ = ['con', 'de', 'del', 'en', 'la', 'el', 'las', 'los', 'a', 'al', 'y', 'serie', 'series', 'vale', 'venga', 'bien', 'ok', 'hecho',
  'listo', 'eso', 'es', 'he', 'hice', 'ahora', 'pues', 'bueno', 'kilos', 'kilo', 'kg', 'que', 'me', 'otra', 'pon', 'apunta', 'mas', 'luego', 'despues', 'entonces'];

// Palabras de material que pueden acompañar al nombre del ejercicio sin cambiarlo ("press banca con barra").
const MATERIAL_ = ['mancuerna', 'mancuernas', 'barra', 'polea', 'poleas', 'maquina', 'pesa', 'pesas', 'disco', 'discos', 'smith', 'multipower'];

/** Pura: una frase → evento de serie con el mismo formato que devuelve la IA, o null si algo no encaja. */
function reglasFrase_(frase, ctx) {
  let s = ' ' + frase + ' ';
  const ev = { type: 'set', exerciseName: null, implement: null, setType: null, reps: null, rir: null, perSideKg: null, perHandKg: null,
    totalKg: null, stackKg: null, addedKg: null, count: null, repeatLast: false, side: null, text: null };
  const quita = (re, fn, deja) => { const m = re.exec(s); if (!m) return false; fn(m); s = s.replace(m[0], ' ' + (deja || '') + ' '); return true; };

  if (/\b(duele|dolor|molest|pinchazo|lesion|tiron)/.test(s)) return null;            // molestias: mejor la IA (las anota)
  if (/\b(drop ?set|baje a|bajo a|izquierd|derech|unilateral|cada brazo|cada pierna)/.test(s)) return null;

  quita(/\b(otra igual|otra serie igual|otra mas igual|lo mismo|igual que (antes|la anterior)|repito|repetimos|otra (mas|igual))\b/, () => { ev.repeatLast = true; });
  quita(/\b(calentamiento|de calentar|aproximacion)\b/, () => { ev.setType = 'warmup'; });
  quita(/\bal fallo\b/, () => { ev.setType = 'failure'; ev.rir = 0; });
  quita(new RegExp('\\b' + N_ + '\\s*(?:repeticiones|repeticion|repes|repe|reps|rep|veces)\\b'), (m) => { ev.reps = Number(m[1]); });
  quita(new RegExp('\\b(?:me quedaban|me quedaba|quedaban|quedaba|rir|reserva de|deje|dejo)\\s*' + N_ + '\\b'), (m) => { ev.rir = Number(m[1]); });
  quita(new RegExp('\\b' + N_ + '\\s*(?:en (?:la )?recamara|de reserva|de rir)\\b'), (m) => { ev.rir = Number(m[1]); });

  quita(/\b(barra sola|solo (la )?barra|sin discos)\b/, () => { ev.perSideKg = 0; });
  quita(new RegExp('\\b' + N_ + KG_ + '\\s*(?:a cada lado|por lado|cada lado|en cada lado)\\b'), (m) => { ev.perSideKg = Number(m[1]); });
  quita(new RegExp('\\b(mancuernas?|pesas?) de ' + N_ + KG_ + '\\b'), (m) => { ev.perHandKg = Number(m[2]); ev.implement = 'dumbbell'; }, 'mancuernas');
  quita(new RegExp('\\b' + N_ + KG_ + '\\s*(?:por mano|cada mano|en cada mano)\\b'), (m) => { ev.perHandKg = Number(m[1]); ev.implement = 'dumbbell'; });
  quita(new RegExp('\\b' + N_ + KG_ + '\\s*(?:en total|de total|total)\\b'), (m) => { ev.totalKg = Number(m[1]); });
  quita(new RegExp('\\btotal (?:de )?' + N_ + KG_ + '\\b'), (m) => { ev.totalKg = Number(m[1]); });
  quita(new RegExp('\\b' + N_ + KG_ + '\\s*(?:de pila|en (?:la )?pila|de placa|de placas)\\b'), (m) => { ev.stackKg = Number(m[1]); });
  quita(new RegExp('\\b(?:pila|placa|placas)\\s*(?:en|a|de)?\\s*' + N_ + KG_ + '\\b'), (m) => { ev.stackKg = Number(m[1]); });
  quita(new RegExp('\\b(?:lastre(?: de)?)\\s*' + N_ + KG_ + '\\b'), (m) => { ev.addedKg = Number(m[1]); ev.implement = 'bodyweight'; });
  quita(new RegExp('\\b' + N_ + KG_ + '\\s*de lastre\\b'), (m) => { ev.addedKg = Number(m[1]); ev.implement = 'bodyweight'; });
  quita(/\b(peso corporal|sin peso|sin lastre)\b/, () => { ev.implement = 'bodyweight'; });

  // "15 kilos" a secas: solo se entiende si el ejercicio usa un único tipo de carga (pila o mancuernas).
  const sueltos = new RegExp('\\b' + N_ + '\\s*(?:kilos?|kg)\\b').exec(s);
  const restoSinKilos = sueltos ? s.replace(sueltos[0], ' ') : s;
  const palabras = restoSinKilos.split(' ').filter((w) => w && RELLENO_.indexOf(w) < 0);
  if (palabras.some((w) => /\d/.test(w))) return null;                                   // queda un número sin saber qué es
  let def = null;
  if (palabras.length) {
    def = findExercise_(palabras.join(' '), ctx.library);
    if (!def) return null;                                                                // palabras que no son un ejercicio conocido
    const nombre = [def.name].concat(def.aliases).map(matchKey_).join(' ').split(' ');
    const sobra = matchKey_(palabras.join(' ')).split(' ').filter((w) => nombre.indexOf(w) < 0 && MATERIAL_.indexOf(w) < 0);
    if (sobra.length) return null;                                                        // "press banca inclinado raro": que lo vea la IA
    ev.exerciseName = def.name;
  } else if (ctx.currentId) {
    def = exerciseById_(ctx.currentId, ctx.library);
  }
  if (sueltos) {
    const imp = def ? def.implements : [];
    const solo = (x) => imp.length && imp.every((i) => x.indexOf(i) >= 0);
    if (solo(['cable', 'machine'])) ev.stackKg = Number(sueltos[1]);
    else if (solo(['dumbbell', 'kettlebell'])) { ev.perHandKg = Number(sueltos[1]); ev.implement = ev.implement || 'dumbbell'; }
    else return null;                                                                     // en barra no se sabe si es por lado o total
  }
  if (ev.reps === null && !ev.repeatLast) return null;                                   // una serie sin repeticiones: a la IA
  if (ev.reps !== null && !(ev.reps >= 1 && ev.reps <= 100 && Number.isInteger(ev.reps))) return null;
  if (ev.rir !== null && !(ev.rir >= 0 && ev.rir <= 10 && Number.isInteger(ev.rir))) return null;
  if (!ev.repeatLast && !hasLoadInfo_(ev) && ev.implement !== 'bodyweight' && !(def && def.implements.indexOf('bodyweight') >= 0) && !ctx.hayAnterior(def)) return null;
  return ev;
}

/**
 * Pura: el texto completo (una o varias series separadas por punto o "luego") → eventos, o null para que lo interprete la IA.
 * ctx: { library, session }.
 */
function reglasSerie_(texto, session, library) {
  const t = textoSerie_(texto);
  if (!t || t.length > 400) return null;
  const exs = session.exercises || [];
  let currentId = exs.length ? exs[exs.length - 1].exerciseId : null;
  // Sin carga dicha vale si se puede heredar: de la serie anterior del ejercicio o de la carga objetivo del plan.
  const hayAnterior = (def) => !!def && (exs.some((x) => x.exerciseId === def.id && x.sets.length) ||
    (session.plannedExercises || []).some((p) => p.exerciseId === def.id && p.targetLoad));
  const frases = sinTildes_(texto).split(/[.;]\s+|\s+(?:y luego|luego|despues|y despues)\s+/).map(textoSerie_).filter(Boolean);
  if (!frases.length || frases.length > 6) return null;
  const out = [];
  for (const f of frases) {
    const ev = reglasFrase_(f, { library: library, currentId: currentId, hayAnterior: hayAnterior });
    if (!ev) return null;
    if (ev.exerciseName) { const d = findExercise_(ev.exerciseName, library); if (d) currentId = d.id; }
    out.push(ev);
  }
  return out;
}

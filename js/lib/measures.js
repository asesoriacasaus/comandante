// Catálogo de medidas con cinta y su guía. Las claves coinciden con apps-script/Body.gs (hay un test que lo comprueba).

export const MEASURES = [
  { key: 'neck', part: 'neck', label: 'Cuello' },
  { key: 'shoulders', part: 'shoulders', label: 'Hombros' },
  { key: 'chest', part: 'chest', label: 'Pecho' },
  { key: 'waist', part: 'waist', label: 'Cintura' },
  { key: 'hip', part: 'hip', label: 'Cadera' },
  { key: 'armR', part: 'arm', label: 'Bíceps derecho' },
  { key: 'armL', part: 'arm', label: 'Bíceps izquierdo' },
  { key: 'forearmR', part: 'forearm', label: 'Antebrazo derecho' },
  { key: 'forearmL', part: 'forearm', label: 'Antebrazo izquierdo' },
  { key: 'thighR', part: 'thigh', label: 'Muslo derecho' },
  { key: 'thighL', part: 'thigh', label: 'Muslo izquierdo' },
  { key: 'calfR', part: 'calf', label: 'Gemelo derecho' },
  { key: 'calfL', part: 'calf', label: 'Gemelo izquierdo' }
];

export const measureLabel = (key) => (MEASURES.find((m) => m.key === key) || { label: key }).label;

// Posición de la cinta sobre la figura (viewBox 0 0 200 410). `pair`: se dibuja en ambos lados.
export const TAPE = {
  neck: { cx: 100, cy: 58, rx: 13, ry: 4 },
  shoulders: { cx: 100, cy: 78, rx: 50, ry: 9 },
  chest: { cx: 100, cy: 110, rx: 38, ry: 7 },
  waist: { cx: 100, cy: 160, rx: 31, ry: 6 },
  hip: { cx: 100, cy: 200, rx: 38, ry: 7 },
  arm: { cx: 52, cy: 108, rx: 10, ry: 3.5, pair: true },
  forearm: { cx: 45, cy: 152, rx: 8, ry: 3, pair: true },
  thigh: { cx: 82, cy: 250, rx: 16, ry: 4.5, pair: true },
  calf: { cx: 82, cy: 335, rx: 11, ry: 3.5, pair: true }
};

export const GUIDE = {
  neck: { title: 'Cuello', where: 'Justo por debajo de la nuez, en horizontal.',
    steps: ['De pie, con la cabeza recta y la mirada al frente.', 'Cinta horizontal, tensa pero sin hundir la piel.', 'No encojas los hombros ni adelantes la cabeza.'] },
  shoulders: { title: 'Hombros', where: 'Alrededor de los hombros, por la parte más ancha (sobre los deltoides).',
    steps: ['De pie, brazos relajados a los lados y pies juntos.', 'Pasa la cinta por la parte más ancha de los deltoides y, por detrás, a la altura de los omóplatos.', 'Cinta paralela al suelo en todo el recorrido.'],
    tip: 'Pide ayuda: tú solo no puedes mantenerla horizontal por la espalda.' },
  chest: { title: 'Pecho', where: 'A la altura de los pezones, por debajo de las axilas y por la espalda.',
    steps: ['Brazos relajados, un poco separados del cuerpo.', 'Mide al final de una espiración normal, sin hinchar el pecho.', 'Cinta horizontal y pegada, sin hundir la piel.'] },
  waist: { title: 'Cintura', where: 'A la altura del ombligo.',
    steps: ['De pie y relajado, sin meter ni sacar la tripa.', 'Cinta horizontal, justo sobre el ombligo.', 'Mide al final de una espiración normal.'],
    tip: 'Elige un punto y úsalo siempre: solo se puede comparar si se mide en el mismo sitio. Si tu medida de partida la tomaste en otro punto, vuelve a medir allí.' },
  hip: { title: 'Cadera', where: 'Por la parte más ancha de los glúteos.',
    steps: ['Pies juntos, peso repartido y glúteos relajados.', 'Cinta horizontal por la zona más ancha (mírate de perfil en un espejo).', 'Sin apretar.'] },
  arm: { title: 'Bíceps (brazo)', where: 'A mitad de camino entre la punta del hombro y el codo, con el brazo relajado.',
    steps: ['Brazo colgando relajado a un lado.', 'Marca el punto medio entre la punta del hombro y el codo.', 'Cinta perpendicular al hueso, sin apretar.', 'Mide los dos brazos y di cuál es: derecho o izquierdo.'],
    tip: 'Siempre relajado: así la medida es comparable de un día a otro.' },
  forearm: { title: 'Antebrazo', where: 'En la parte más ancha, cerca del codo.',
    steps: ['Brazo relajado, con la palma hacia el muslo.', 'Cinta perpendicular al antebrazo, en el punto de mayor grosor.', 'Mide los dos y di cuál es.'] },
  thigh: { title: 'Muslo', where: 'A mitad de camino entre el pliegue de la ingle y la rótula.',
    steps: ['De pie, peso repartido entre las dos piernas y músculo relajado.', 'Marca el punto medio entre el pliegue de la ingle y la parte superior de la rótula.', 'Cinta horizontal. Mide los dos muslos.'] },
  calf: { title: 'Gemelo', where: 'En la parte más ancha de la pantorrilla.',
    steps: ['De pie, peso repartido y pierna relajada.', 'Cinta horizontal por el punto de mayor grosor.', 'Mide los dos y di cuál es.'] }
};

export const PART_ORDER = ['neck', 'shoulders', 'chest', 'waist', 'hip', 'arm', 'forearm', 'thigh', 'calf'];

export const GENERAL_TIPS = [
  'Mide siempre a la misma hora, mejor por la mañana y antes de entrenar: el músculo se hincha después de la sesión.',
  'Con la piel directa o con ropa muy fina.',
  'Cinta tensa pero sin hundir la piel. En tronco y cuello, paralela al suelo; en brazos y piernas, perpendicular al hueso.',
  'Redondea a 0,5 cm. Si dos mediciones seguidas difieren más de 1 cm, haz una tercera.',
  'Con medirte una vez cada una o dos semanas basta.'
];

export const DICTATION_EXAMPLE = 'Cintura noventa y nueve coma cinco, bíceps derecho treinta y ocho, bíceps izquierdo treinta y siete, muslo derecho sesenta y dos.';

/** Última medida de cada clave y la anterior: { clave: { value, date, prev, prevDate } }. */
export function summarize(records) {
  const out = {};
  [...records].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((r) => {
    for (const [k, v] of Object.entries(r.measurementsCm || {})) {
      const cur = out[k];
      out[k] = cur ? { value: v, date: r.date, prev: cur.value, prevDate: cur.date } : { value: v, date: r.date, prev: null, prevDate: null };
    }
  });
  return out;
}

/** Último peso registrado. */
export function latestWeight(records) {
  const w = [...records].filter((r) => typeof r.weightKg === 'number').sort((a, b) => (a.date < b.date ? -1 : 1));
  return w.length ? { value: w[w.length - 1].weightKg, date: w[w.length - 1].date, prev: w.length > 1 ? w[w.length - 2].weightKg : null } : null;
}

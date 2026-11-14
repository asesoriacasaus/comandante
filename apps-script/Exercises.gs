/**
 * Biblioteca de ejercicios (PLAN 6.5). Semilla en una tabla compacta; se expande a objetos.
 * Formato: id|Nombre|alias,alias|implementos|primarios|secundarios|tipo|factorPesoCorporal
 * Códigos de grupo: pe pecho, es espalda, ho hombros, bi bíceps, tr tríceps, cu cuádriceps,
 *   fe femorales, gl glúteos, ge gemelos, co core.
 * Códigos de implemento: bar barra, man mancuerna, ez barra z, maq máquina, pol polea,
 *   pc peso corporal, smi multipower, pes pesa rusa.
 * Tipo: c compuesto, i aislamiento. El primer implemento es el habitual.
 */

const GROUPS_ = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core'];
const GROUP_CODES_ = { pe: 'chest', es: 'back', ho: 'shoulders', bi: 'biceps', tr: 'triceps', cu: 'quads',
  fe: 'hamstrings', gl: 'glutes', ge: 'calves', co: 'core' };
const IMPLEMENT_CODES_ = { bar: 'barbell', man: 'dumbbell', ez: 'ezbar', maq: 'machine', pol: 'cable',
  pc: 'bodyweight', smi: 'smith', pes: 'kettlebell' };

const EXERCISE_ROWS_ = [
  // Pecho
  'press_banca|Press banca|banca,press plano,bench press|bar,man,smi|pe|ho,tr|c',
  'press_inclinado|Press inclinado|banca inclinada,press banca inclinado|bar,man,smi,maq|pe|ho,tr|c',
  'press_declinado|Press declinado|banca declinada|bar,man,maq|pe|tr|c',
  'press_pecho_maquina|Press de pecho en máquina|press pecho maquina,chest press|maq|pe|ho,tr|c',
  'aperturas|Aperturas|aperturas con mancuernas,flyes|man,pol,maq|pe|ho|i',
  'cruce_poleas|Cruce en poleas|cruces,cruce de poleas,crossover|pol|pe|ho|i',
  'pec_deck|Pec deck|contractora,mariposa|maq|pe|ho|i',
  'pullover|Pullover|pull over|man,pol|pe|es|i',
  'fondos_pecho|Fondos para pecho|fondos inclinado|pc|pe|tr,ho|c|1',
  'flexiones|Flexiones|push ups,lagartijas|pc|pe|tr,ho|c|0.65',
  // Espalda
  'dominadas|Dominadas|pull ups,dominada|pc|es|bi|c|1',
  'dominadas_supinas|Dominadas supinas|chin ups|pc|es|bi|c|1',
  'jalon_pecho|Jalón al pecho|jalon,polea alta,lat pulldown|pol,maq|es|bi|c',
  'remo_barra|Remo con barra|remo inclinado,remo bent over|bar|es|bi,fe|c',
  'remo_mancuerna|Remo con mancuerna|remo a una mano,remo unilateral|man|es|bi|c',
  'remo_polea_baja|Remo en polea baja|remo sentado,remo en polea|pol|es|bi|c',
  'remo_maquina|Remo en máquina|remo maquina|maq|es|bi|c',
  'remo_t|Remo en T|remo t,remo barra t|bar,maq|es|bi|c',
  'remo_pecho_apoyado|Remo con pecho apoyado|remo apoyado,remo chest supported|man,maq|es|bi|c',
  'pulldown_brazos_rectos|Pulldown con brazos rectos|pullover en polea,straight arm pulldown|pol|es||i',
  'peso_muerto|Peso muerto|deadlift,peso muerto convencional|bar|es,fe,gl|co|c',
  'hiperextensiones|Hiperextensiones|lumbares,extensiones de espalda|pc,maq|es,gl|fe|i|0.6',
  'encogimientos|Encogimientos|trapecios,shrugs|bar,man|ho|es|i',
  // Hombros
  'press_militar|Press militar|press de hombro,press militar de pie,overhead press|bar,man,smi|ho|tr|c',
  'press_hombro_maquina|Press de hombro en máquina|shoulder press maquina|maq|ho|tr|c',
  'press_arnold|Press Arnold|arnold press|man|ho|tr|c',
  'elevaciones_laterales|Elevaciones laterales|laterales,vuelos laterales|man,pol,maq|ho||i',
  'elevaciones_frontales|Elevaciones frontales|frontales|man,pol,bar|ho|pe|i',
  'pajaros|Pájaros|vuelos posteriores,deltoides posterior,reverse fly|man,maq,pol|ho|es|i',
  'face_pull|Face pull|facepull,tirones a la cara|pol|ho|es|i',
  'remo_menton|Remo al mentón|remo al menton,upright row|bar,ez,pol|ho|bi|i',
  // Bíceps
  'curl_barra|Curl con barra|curl de biceps con barra,curl barra recta|bar,ez|bi||i',
  'curl_mancuernas|Curl con mancuernas|curl biceps,curl alterno|man|bi||i',
  'curl_martillo|Curl martillo|martillo,hammer curl|man,pol|bi||i',
  'curl_predicador|Curl predicador|curl scott,banco scott,preacher curl|ez,man,maq|bi||i',
  'curl_polea|Curl en polea|curl polea baja|pol|bi||i',
  'curl_inclinado|Curl inclinado|curl en banco inclinado|man|bi||i',
  'curl_concentrado|Curl concentrado|concentration curl|man|bi||i',
  'curl_spider|Curl spider|spider curl|ez,man|bi||i',
  // Tríceps
  'press_frances|Press francés|rompecraneos,skull crusher,extension de triceps tumbado|ez,man,bar|tr||i',
  'extension_polea|Extensión de tríceps en polea|pushdown,jalon de triceps,triceps polea|pol|tr||i',
  'extension_trasnuca|Extensión de tríceps tras nuca|press frances sentado,overhead triceps|man,pol|tr||i',
  'fondos_triceps|Fondos para tríceps|fondos,fondos en paralelas,dips|pc|tr|pe,ho|c|1',
  'fondos_banco|Fondos en banco|fondos en banco|pc|tr|pe,ho|i|0.6',
  'press_cerrado|Press cerrado|press banca agarre cerrado,close grip bench|bar,smi|tr|pe,ho|c',
  'patada_triceps|Patada de tríceps|kickback|man,pol|tr||i',
  'extension_triceps_maquina|Extensión de tríceps en máquina|triceps maquina|maq|tr||i',
  // Cuádriceps
  'sentadilla|Sentadilla|sentadilla trasera,squat,sentadilla con barra|bar,smi|cu,gl|fe,co|c',
  'sentadilla_frontal|Sentadilla frontal|front squat|bar|cu|gl,co|c',
  'prensa|Prensa de piernas|prensa,leg press,prensa 45|maq|cu|gl|c',
  'extension_cuadriceps|Extensión de cuádriceps|extensiones,silla de cuadriceps,leg extension|maq|cu||i',
  'zancadas|Zancadas|desplantes,lunges|man,bar,smi|cu,gl|fe|c',
  'sentadilla_bulgara|Sentadilla búlgara|bulgara,bulgarian split squat|man,bar,smi|cu,gl|fe|c',
  'sentadilla_hack|Sentadilla hack|hack,hack squat|maq,bar|cu|gl|c',
  'sentadilla_goblet|Sentadilla goblet|goblet squat,copa|man,pes|cu|gl,co|c',
  'step_up|Subidas al cajón|step up,subidas a banco|man|cu,gl||c',
  'sentadilla_sissy|Sentadilla sissy|sissy squat|pc|cu||i',
  // Femorales
  'peso_muerto_rumano|Peso muerto rumano|rumano,romanian deadlift,rdl|bar,man|fe,gl|es|c',
  'curl_femoral_tumbado|Curl femoral tumbado|curl femoral,femoral tumbado,leg curl|maq|fe||i',
  'curl_femoral_sentado|Curl femoral sentado|femoral sentado|maq|fe||i',
  'buenos_dias|Buenos días|good morning|bar|fe,gl|es|c',
  'curl_nordico|Curl nórdico|nordic curl|pc|fe||i|0.5',
  'peso_muerto_rigido|Peso muerto con piernas rígidas|piernas rigidas,stiff|bar,man|fe,gl|es|c',
  // Glúteos
  'hip_thrust|Hip thrust|empuje de cadera,puente de gluteo con barra|bar,maq,smi|gl|fe|c',
  'puente_gluteo|Puente de glúteo|glute bridge|bar,pc|gl|fe|i|0.5',
  'patada_gluteo|Patada de glúteo|patada trasera,glute kickback|pol,maq|gl||i',
  'abduccion_cadera|Abducción de cadera|abductores,maquina de abductores|maq,pol|gl||i',
  'sentadilla_sumo|Sentadilla sumo|sumo squat|bar,man,pes|gl,cu|fe|c',
  'peso_muerto_sumo|Peso muerto sumo|sumo deadlift|bar|gl,fe|es,cu|c',
  'aduccion_cadera|Aducción de cadera|aductores,maquina de aductores|maq|cu||i',
  // Gemelos
  'gemelos_de_pie|Gemelos de pie|elevacion de talones,calf raise,gemelos|maq,smi,man|ge||i',
  'gemelos_sentado|Gemelos sentado|soleo,seated calf raise|maq|ge||i',
  'gemelos_prensa|Gemelos en prensa|gemelos en la prensa|maq|ge||i',
  // Core
  'plancha|Plancha|plank,plancha abdominal|pc|co||i',
  'crunch|Crunch|abdominales,abdominales crunch|pc|co||i',
  'crunch_polea|Crunch en polea|abdominales en polea,cable crunch|pol|co||i',
  'elevacion_piernas|Elevación de piernas|elevaciones de piernas tumbado,leg raise|pc|co||i',
  'elevacion_rodillas_colgado|Elevación de rodillas colgado|rodillas al pecho,hanging knee raise|pc|co||i',
  'rueda_abdominal|Rueda abdominal|ab wheel,rueda|pc|co||i',
  'russian_twist|Giros rusos|russian twist,rotaciones rusas|man,pc|co||i',
  'pallof|Press Pallof|pallof press,antirotacion|pol|co||i',
  'abdominales_maquina|Abdominales en máquina|maquina de abdominales|maq|co||i',
  'lenadores|Leñadores|woodchopper,lenador|pol|co|ho|i',
  'plancha_lateral|Plancha lateral|side plank|pc|co||i',
  // Variantes y complementarios
  'remo_invertido|Remo invertido|remo en barra baja,australian pull up|pc|es|bi|c|0.6',
  'dominadas_asistidas|Dominadas asistidas|maquina de dominadas,dominadas con goma|maq|es|bi|c',
  'jalon_unilateral|Jalón a una mano|jalon unilateral,polea alta a una mano|pol|es|bi|c',
  'curl_inverso|Curl inverso|reverse curl,curl agarre pronado|ez,bar|bi||i',
  'sentadilla_cajon|Sentadilla al cajón|box squat|bar|cu,gl|fe|c',
  'zancadas_caminando|Zancadas caminando|walking lunges,desplantes caminando|man|cu,gl|fe|c',
  'rotacion_externa|Rotación externa de hombro|manguito rotador,external rotation|pol,man|ho||i',
  'paseo_granjero|Paseo del granjero|farmer walk,caminata con mancuernas|man,pes|co,ho|es|c'
];

function expandExercise_(row) {
  const f = row.split('|');
  const list = (s) => (s ? s.split(',').filter(Boolean) : []);
  const ex = {
    id: f[0],
    name: f[1],
    aliases: list(f[2]),
    implements: list(f[3]).map((c) => IMPLEMENT_CODES_[c]),
    primary: list(f[4]).map((c) => GROUP_CODES_[c]),
    secondary: list(f[5]).map((c) => GROUP_CODES_[c]),
    kind: f[6] === 'c' ? 'compound' : 'isolation'
  };
  if (f[7]) ex.bodyweightFactor = Number(f[7]);
  return ex;
}

function exerciseSeed_() {
  return EXERCISE_ROWS_.map(expandExercise_);
}

/** Minúsculas, sin acentos ni signos, espacios simples. */
function normalizeText_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Busca un ejercicio por id exacto, nombre o alias. `library` por defecto es la semilla. */
function findExercise_(query, library) {
  const lib = library || exerciseSeed_();
  const q = normalizeText_(query);
  if (!q) return null;
  const byId = lib.find((e) => e.id === String(query).trim());
  if (byId) return byId;
  const names = (e) => [e.name].concat(e.aliases).map(normalizeText_);
  const exact = lib.find((e) => names(e).indexOf(q) >= 0);
  if (exact) return exact;
  // Coincidencia por palabras completas: gana el nombre más largo ("press banca inclinado" sobre "press banca").
  let best = null;
  let bestLen = 0;
  lib.forEach((e) => {
    names(e).forEach((n) => {
      if (n.length > bestLen && (' ' + q + ' ').indexOf(' ' + n + ' ') >= 0) { best = e; bestLen = n.length; }
    });
  });
  return best;
}

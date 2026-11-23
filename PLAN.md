# Comandante: plan de desarrollo

Versión 2.0 · 14 de noviembre de 2026 · Sustituye a la especificación original ("App de fitness por voz") y a los hitos 0 a 2.

Este documento es la fuente de verdad del proyecto. La sesión de desarrollo lo lee entero antes de empezar y lo actualiza cuando una decisión cambie.

---

## 0. Instrucciones para la sesión de desarrollo

1. Lee el documento completo. Trabaja fase a fase, en el orden de la sección 11.
2. Al terminar cada tarea, verifica (tests en Node y, cuando aplique, prueba en el iPhone del usuario) antes de pasar a la siguiente.
3. **Cada respuesta al usuario termina con dos líneas:**
   - `Avance del proyecto: NN %` (calculado con los pesos de la sección 11).
   - `Modelo recomendado: Sonnet` u `Opus`, según la tabla de la sección 11, y si conviene cambiar.
4. Todo el texto de la interfaz va en español, sin rayas largas, en tono directo.
5. Nunca se escriben claves, tokens ni datos personales en el repositorio: es público. Eso incluye las medidas, el peso y los objetivos numéricos del usuario, y el texto de la personalidad del entrenador. Esos datos los da el usuario en la conversación (o desde su cuestionario privado) y viven en `settings.json` en Drive y en las Propiedades del script.
6. Al cerrar una fase, entrega al usuario: qué se ha hecho, cómo probarlo en el iPhone paso a paso, y qué queda pendiente.

---

## 1. Qué es Comandante

Una app web instalable en el iPhone que hace de **entrenador personal con IA**. El día a día:

1. Al llegar al gimnasio, abre la app y ya le espera la sesión de hoy: grupos musculares, ejercicios, series, repeticiones, carga objetivo y RIR objetivo. La sesión se ha decidido según los días que han pasado, lo último que hizo y las carreras recientes.
2. Durante el entreno pulsa un botón y **dicta lo que hace, en cualquier orden y con lenguaje natural**: "press banca con barra y 20 a cada lado, 8 repeticiones, me quedaban dos", "ahora mancuernas de 15, otra serie de 10".
3. La IA transcribe el audio, interpreta cada serie y construye el diario de la sesión. Al terminar, la consolida, el usuario la revisa y la guarda.
4. Con esos datos el entrenador ajusta las cargas y el plan de las siguientes sesiones.
5. Además registra comidas por voz (macros y micronutrientes), peso y medidas (pantallazo de la báscula), y carreras (pantallazo del reloj).
6. Cada semana recibe por correo el balance y el plan, con la voz del Comandante.

El entrenador tiene una **personalidad marcada que eligió el usuario**. Su descripción es privada: vive en las Propiedades del script (`PERSONA_PROMPT`), no en el repositorio (sección 7.4).

---

## 2. El usuario

Los datos personales (edad, altura, peso, medidas y cifras del objetivo) **no están en este documento**. Se introducen en la pantalla de bienvenida de la app y viven en `settings.json` en Drive.

| Dato | Valor |
|---|---|
| Uso | Una sola persona, privado |
| Objetivo | Recomposición (ganar músculo y perder grasa a la vez) en 6 meses, hasta el 14 de mayo de 2027. Cifras en `settings.json` |
| Experiencia | Años entrenando, buena técnica |
| Referencia de fuerza | Press banca 4 × 10 con 60-70 kg totales (barra incluida) |
| Pesas | 3-4 días por semana, gimnasio completo, 1 o 2 grupos musculares por día, cuerpo completo cada semana |
| Carrera | 1-2 salidas por semana, tiradas largas y continuas |
| Esfuerzo | Registra RIR en cada serie |
| Móvil | iPhone |
| Reloj | Huawei Watch Fit 4 (datos vía pantallazo) |
| Báscula | Huawei con composición corporal (datos vía pantallazo) |
| Nutrición | Comidas por voz; macros imprescindibles, también vitaminas y minerales |
| Avisos | Por correo |
| Historial previo | Ninguno |
| Estilo visual | Cartel revolucionario y militar: papel crema, tinta negra, rojo y verde oliva (sección 9.3) |

---

## 3. Decisiones cerradas

| Tema | Decisión | Motivo |
|---|---|---|
| Tipo de app | Web instalable (PWA) en la pantalla de inicio del iPhone | Sin App Store (evita los 99 € anuales de Apple) |
| Alojamiento web | GitHub Pages, `https://<usuario>.github.io/comandante/` | Gratis, HTTPS, sin dominio ni Cloudflare |
| Código | Repositorio **público** `comandante` en GitHub | Pages gratis exige repo público; la seguridad no depende de ocultar el código (sección 5) |
| Servidor | Google Apps Script, proyecto actual renombrado a "Comandante" | Guarda la clave de la IA y escribe en Drive; gratis |
| Datos | JSON en el Google Drive del propietario, carpeta `ComandanteData` | Decisión del usuario |
| Despliegue | GitHub Actions: tests, publicación de Pages y `clasp push` + `clasp deploy` automáticos | Elimina el despliegue manual que falló con el Hito 2 |
| IA | **Gemini API, plan de pago** | Un solo proveedor para audio, imágenes y texto; el usuario ya tiene cuenta |
| Voz | Grabación con `MediaRecorder` en el navegador y transcripción con Gemini en el servidor | El reconocimiento de voz de Safari no es fiable |
| Procesado | Se admite diferido: los audios se guardan en el móvil y se procesan cuando haya conexión | El usuario lo aceptó |
| Plan | Rotación de sesiones, no días fijos de la semana | Entrena de forma ocasional, 3-4 días |
| Progresión | La app decide (sección 8), dentro de límites deterministas | Entrenador personal real |
| Avisos | Correo semanal con balance y plan, y aviso cuando toca entrenar | Decisión del usuario |
| Interfaz | Español, estilo de cartel revolucionario y militar | Decisión del usuario (15 de noviembre de 2026) |
| Nombre | Comandante | Decisión del usuario |

---

## 4. Arquitectura

```
iPhone (Safari, app instalada)
  PWA estática desde GitHub Pages
  · MediaRecorder: graba clips de voz
  · IndexedDB: cola de clips y borradores sin conexión
  · Service Worker: funciona sin red
        │  POST text/plain (sin preflight) + APP_TOKEN
        ▼
Apps Script Web App "Comandante" (cuenta de Google del propietario)
  · Router por action, autenticación, límites
  · Gemini.gs → API de Gemini (audio, imágenes, texto)
  · Store.gs → JSON en Drive (sharding mensual)
  · Coach.gs / Planner.gs → reglas + IA
  · Mail.gs + disparadores de tiempo → correos
        │
   ┌────┴─────┐
   ▼          ▼
Gemini API   Google Drive /ComandanteData

GitHub (repo público)
  · Actions: tests → Pages → clasp push/deploy (entorno "production" con aprobación)
```

Notas:

- El frontend sigue sin dependencias ni empaquetador: módulos ES nativos.
- Todas las llamadas al servidor son `POST` con `Content-Type: text/plain;charset=utf-8` para evitar el preflight `OPTIONS`, que Apps Script no responde.
- El Web App se despliega como "Ejecutar como: yo" y "Acceso: cualquier persona". La protección está en la sección 5.
- El workflow de Pages sustituye `CACHE_NAME` del Service Worker por el SHA del commit, para que el iPhone reciba cada versión.
- La URL del Web App se mantiene estable porque Actions actualiza siempre el mismo despliegue (`clasp deploy -i <DEPLOYMENT_ID>`).

---

## 5. Seguridad (repositorio público)

El código es visible; la seguridad depende de que **ningún secreto toque el repositorio** y de que el servidor no confíe en nada que llegue de fuera.

### 5.1 Secretos

| Secreto | Dónde vive | Nunca en |
|---|---|---|
| `GEMINI_API_KEY` | Propiedades del script de Apps Script | Repo, frontend, logs |
| `APP_TOKEN` (48+ caracteres aleatorios) | Propiedades del script + localStorage del iPhone | Repo, URL, logs |
| Credenciales de clasp (`CLASPRC_JSON`) | Secreto del entorno `production` de GitHub | Repo, logs de Actions |
| `SCRIPT_ID`, `DEPLOYMENT_ID` | Variables del entorno `production` | (No son secretos, pero tampoco van en el código) |

- `.gitignore` con `.env`, `token.txt`, `.clasp.json`, `.clasprc.json`, `deploy-apps-script/`, `*.zip`.
- Activar en GitHub: *secret scanning* y *push protection*.
- Un job de CI busca patrones de claves (`AIza`, `sk-`, `ya29.`, tokens largos) y falla si los encuentra.
- El `APP_TOKEN` y la clave de DeepSeek de las fases anteriores se **revocan**: se crea un token nuevo y se borra `DEEPSEEK_API_KEY`.

### 5.2 Servidor (Apps Script)

- Comparación del token en tiempo constante (ya existe en `Auth.gs`).
- Límite por token: 60 peticiones por minuto (ya existe).
- **Nuevo: bloqueo global por fallos.** Más de 20 tokens incorrectos en una hora bloquean toda autenticación durante 15 minutos y envían un correo de alerta al propietario. Así un ataque con tokens distintos no esquiva el límite por token.
- **Nuevo: límites de tamaño.** Texto ≤ 2.000 caracteres; audio ≤ 2 MB por clip; imagen ≤ 4 MB; cuerpo total de la petición ≤ 6 MB. Se rechaza antes de llamar a Gemini.
- **Nuevo: lista blanca de tipos MIME** para audio e imagen.
- La salida de Gemini **siempre** se valida con esquema antes de guardarse. Nunca se ejecuta nada que venga del modelo.
- El texto del usuario va solo en el mensaje `user` de Gemini, nunca concatenado a las instrucciones del sistema.
- Los errores devueltos al cliente no incluyen trazas ni contenido de Drive.
- Los logs no registran audio, transcripciones completas ni datos de salud; solo códigos y tiempos.

### 5.3 Frontend

- **Content Security Policy** en `index.html`: `default-src 'self'`; `connect-src` solo para `script.google.com` y `script.googleusercontent.com`; `img-src 'self' blob: data:`; `media-src 'self' blob:`; sin `unsafe-inline` en scripts.
- Todo texto que venga del servidor o de la IA se pinta con `textContent` o escapado. Nunca `innerHTML` con datos sin escapar.
- El token se guarda en localStorage del iPhone (aceptable para uso personal, protegido por la CSP frente a XSS). Ajustes incluye "Cerrar sesión en este dispositivo", que lo borra.

### 5.4 GitHub Actions

- Las acciones se fijan por SHA, no por etiqueta.
- `permissions:` mínimos en cada workflow.
- El job de despliegue a Apps Script corre en el entorno `production`, con **aprobación obligatoria del propietario**. Así, aunque alguien abriera un PR malicioso, no podría leer las credenciales de clasp.
- Las pull requests de forks no ejecutan jobs con secretos.
- Rama `main` protegida: solo el propietario hace merge.

---

## 6. Modelo de datos

Carpeta `ComandanteData` en Drive. JSON con sharding mensual donde el volumen crece.

```
ComandanteData/
├─ meta.json                     { schemaVersion: 2, lastRevision, updatedAt }
├─ settings.json                 perfil, objetivo, material, entrenador, avisos
├─ exercises.json                biblioteca (semilla + ejercicios nuevos)
├─ plan/current.json             bloque y rotación vigentes
├─ plan/history/2026-W46.json    planes y revisiones semanales anteriores
├─ sessions/2026-11.json         sesiones de pesas (planificadas y hechas)
├─ runs/2026-11.json             carreras
├─ meals/2026-11.json            comidas
├─ body.json                     peso, composición y medidas (un registro por día)
├─ media/                        clips de audio (30 días) y pantallazos
└─ backups/2026-11-14.json       copia diaria rotativa (7 últimas)
```

### 6.1 settings.json

```json
{
  "schemaVersion": 2,
  "profile": { "sex": null, "birthYear": null, "heightCm": null, "timezone": "Europe/Madrid" },
  "goal": { "type": "recomp", "startDate": "2026-11-14", "targetDate": "2027-05-14",
            "startWeightKg": null, "targetWeightKg": null, "startWaistCm": null },
  "equipment": { "barbellKg": 20, "ezBarKg": 10, "dumbbellStepKg": 2, "plateMinKg": 1.25, "stackStepKg": 5 },
  "training": { "daysPerWeek": [3, 4], "groupsPerSession": [1, 2], "runsPerWeek": [1, 2],
                "sessionMinutes": 75, "useRir": true },
  "strength": { "experience": "advanced", "referenceExerciseId": "press_banca",
                "referenceReps": 10, "referenceTotalKg": null },
  "nutrition": { "proteinGPerKg": 2.0, "kcalStrategy": "maintenance_minus_10" },
  "coach": { "persona": "comandante", "intensity": "alta" },
  "notifications": { "email": "<del propietario, configurable>", "weekly": true,
                     "weeklyAt": "domingo 19:00", "reminder": true, "reminderAt": "07:30",
                     "reminderAfterRestDays": 2 }
}
```

Los valores `null` del perfil y del objetivo se rellenan en la pantalla de bienvenida con los datos que dé el usuario; nunca se escriben en el repositorio. Los objetivos nutricionales y de volumen son valores de partida editables en Ajustes; el entrenador los revisa cada semana.

### 6.2 Serie de pesas (lo más importante)

El dictado describe la carga de formas distintas; se guarda la forma original y la carga total calculada:

```json
{
  "order": 3,
  "type": "working",
  "reps": 8,
  "rir": 2,
  "load": { "implement": "barbell", "barKg": 20, "perSideKg": 20, "totalKg": 60 },
  "restSec": 120,
  "side": null,
  "clipId": "c_20261114_1832_x7k2",
  "notes": ""
}
```

- `implement` ∈ `barbell | ezbar | dumbbell | kettlebell | machine | cable | bodyweight | smith`.
- Barra: `totalKg = barKg + 2 × perSideKg`. "20 a cada lado más la barra" → 60 kg.
- Mancuernas: se guarda `perHandKg` y `count` (1 o 2). `totalKg = perHandKg × count`.
- Máquina y polea: `stackKg` tal cual lo dice la máquina.
- Peso corporal: `addedKg` (lastre) y el peso corporal del día para el volumen.
- `type` ∈ `warmup | working | drop | failure`.
- Volumen de la serie = `reps × totalKg` (peso corporal: `reps × (pesoCorporal × factor + addedKg)`).

### 6.3 Sesión

```json
{
  "id": "s_20261114_1800_a1b2",
  "date": "2026-11-14",
  "status": "planned | in_progress | review | done",
  "cycleKey": "B",
  "groups": ["back", "biceps"],
  "plannedExercises": [
    { "exerciseId": "remo_barra", "sets": 4, "repsMin": 8, "repsMax": 10,
      "targetLoad": { "implement": "barbell", "perSideKg": 20 }, "targetRir": 2, "restSec": 120 }
  ],
  "clips": [
    { "id": "c_...", "ts": "2026-11-14T18:32:10+01:00", "transcript": "...", "events": [], "status": "processed" }
  ],
  "exercises": [ { "exerciseId": "remo_barra", "name": "Remo con barra", "sets": [ /* 6.2 */ ] } ],
  "coachMessage": "...",
  "metrics": { "totalVolumeKg": 0, "workingSets": 0, "durationMin": 0, "setsByGroup": {} }
}
```

### 6.4 Carrera, cuerpo y comida

- **Carrera:** `date, distanceKm, durationSec, avgPaceSecPerKm, avgHr, maxHr, cadence, kcal, elevationM, trainingEffect, source: "screenshot", imageFileId, notes`.
- **Cuerpo:** `date, weightKg, fatPct, muscleKg, waterPct, visceralFat, boneKg, bmrKcal, measurementsCm, source, imageFileId`. Medidas con cinta (13, en cm): `neck, shoulders, chest, waist, hip` y, por lado, `armL/armR` (bíceps relajado, a medio camino entre hombro y codo), `forearmL/forearmR`, `thighL/thighR` (a medio camino entre la ingle y la rótula), `calfL/calfR`. La cintura se mide siempre por la parte más ancha del abdomen (normalmente a la altura del ombligo o algo por debajo), el mismo criterio de la medida de partida. Un registro por día: las medidas se fusionan clave a clave, de modo que medir otra parte más tarde no borra las anteriores.
- **Comida:** como en la spec v1, más `micros` por ítem y en totales: `fiberG, sugarG, saturatedFatG, sodiumMg, potassiumMg, calciumMg, ironMg, magnesiumMg, zincMg, vitAUg, vitCMg, vitDUg, vitEMg, vitKUg, b1Mg, b2Mg, b3Mg, b6Mg, folateUg, b12Ug, omega3G`, y `confidence` por ítem. Los micronutrientes se muestran siempre como aproximados.

### 6.5 Biblioteca de ejercicios

Semilla de unos 90 ejercicios de gimnasio (nombre, alias, implementos posibles, músculos primarios y secundarios, incremento de carga). Grupos: `chest, back, shoulders, biceps, triceps, quads, hamstrings, glutes, calves, core`. Si el dictado nombra un ejercicio desconocido, se añade a la biblioteca tras confirmarlo el usuario.

---

## 7. IA (Gemini)

### 7.1 Modelos

Los identificadores de modelo **no van en el código**: se leen de Propiedades del script.

- `GEMINI_MODEL_FAST`: el modelo Flash vigente. Transcripción, interpretación de clips, comidas, pantallazos.
- `GEMINI_MODEL_SMART`: el modelo Pro vigente. Plan de la sesión, consolidación de la sesión, revisión semanal.
- `GEMINI_MODEL_CLIP` (opcional): modelo para el dictado de series y el resumen hablado del entreno. Si no existe se usa `GEMINI_MODEL_FAST`. Conviene un modelo mejor con audio ruidoso (por ejemplo, el Flash no "lite" o el Pro) si el dictado falla con música de fondo o acento andaluz.

En la Fase 0 se consultan los identificadores actuales en la documentación oficial y se fijan.

### 7.2 Llamadas

Todas desde Apps Script (`UrlFetchApp`) a `generateContent`, con `responseMimeType: application/json` y `responseSchema`. La respuesta se vuelve a validar en `Validators.gs`; si falla, un reintento con el error y, si vuelve a fallar, error `VALIDATION` y la interfaz ofrece corregir a mano.

| Operación | Modelo | Entrada | Salida |
|---|---|---|---|
| `clip.process` | FAST | Audio del clip + plan de la sesión + últimas series registradas | Transcripción + eventos (series, comentarios, dolor). La IA solo extrae lo dicho; `eventsToSets_` calcula las cargas y manda a `pending` lo que no puede resolver sin inventar (ejercicio desconocido, sin repeticiones, carga imposible). Idempotente por `clipId` |
| `session.review` (sustituye a `session.consolidate`) | FAST (solo el mensaje) | Resumen calculado por el código: plan, última vez y avisos | Mensaje de cierre. La sesión ya se estructura en `clip.process`; la revisión es determinista (`buildReview_`) para que ningún número dependa de la IA. Si la IA falla, texto neutro con datos reales |
| `plan.cycle.propose` | SMART | Preferencias de entrenamiento | Ciclo de sesiones A-D (validado por `validateCycle_`) |
| `session.plan` | SMART | Grupos de hoy, referencia de fuerza y lista de ejercicios permitidos. **Solo la primera vez que toca esa sesión del ciclo**; después el plan es determinista (mismos ejercicios, cargas por progresión) | Ejercicios, series, rangos y una estimación de 10RM por ejercicio. El código calcula las cargas (85 % hacia abajo, RIR 3) y aplica `applyPlanRules_` |
| `coach.message` | FAST | Grupos de hoy, avisos y `PERSONA_PROMPT` | Mensaje breve; si falla o se bloquea, texto neutro |
| `meal.process` | FAST | Cualquier combinación de texto, audio y hasta 3 fotos (21 de noviembre de 2026). Si el texto o el audio dan cantidades, mandan sobre la foto; con foto se estima la cantidad por el plato, los cubiertos o la mano, y se leen las etiquetas nutricionales visibles | Ítems con cantidades, macros, micros y confianza |
| `supplement.analyze` | FAST | Nombre o marca del suplemento (por ejemplo "Sideral Forte, 1 cápsula") | Nombre, dosis y unidad de una toma, lo que aporta (macros y micronutrientes), si conoce el producto (`known`) y una nota prudente. No guarda nada: el usuario lo revisa y lo guarda con `supplement.save` |
| `nutrition.suggest` | SMART | Lo que falta, calculado por el código (`nutritionGaps_`: macros que quedan hoy, proteína media y micronutrientes por debajo del 80 % en la media de 7 días), lo que sobra, los 15 alimentos más repetidos en 14 días y las notas de Ajustes > Comida | 3 recetas (momento, minutos, raciones, qué cubre, por qué, macros por ración, ingredientes con sección del súper y pasos). La lista de la compra la suma el código (`shoppingList_`). Se guarda en `nutrition/suggestions.json`; `nutrition.suggestions` la lee sin llamar a la IA |
| `session.debrief` | CLIP | Audio del usuario al terminar ("cómo ha ido") | `transcript`, resumen de 2-3 frases, energía 1-5, sensación, molestias y qué cambiar la próxima vez. Se guarda en `session.debrief`; las molestias pasan a `painFlags` (con `source: 'debrief'`) y aparecen en la revisión y en el correo semanal |
| `run.extract` | FAST | Pantallazo del reloj | Campos de carrera (6.4) |
| `body.extract` | FAST | Pantallazo de la báscula o dictado de medidas | Campos de cuerpo (6.4) |
| `weekly.review` | SMART | Semana completa (pesas, carreras, comidas, cuerpo) | Balance, ajustes del plan, texto del correo |

### 7.3 Interpretación del dictado

Reglas que van en las instrucciones de `clip.process`:

- **Ruido y acento (18 de noviembre de 2026):** se ignoran música, letras de canciones y voces ajenas; se interpreta el habla andaluza (s aspirada, seseo y ceceo, consonantes finales perdidas: "do" = dos, "die" = diez, "kilô" = kilos); el contexto lleva los objetivos del plan para desempatar números parecidos. Si un dato no se entiende con seguridad, la serie se marca `unclear` y va a pendientes ("No lo oí claro") con lo que sí se entendió, en vez de guardar un número falso. El móvil graba con supresión de ruido, cancelación de eco y control de ganancia si los ofrece.
- Entiende jerga de gimnasio en español: "a cada lado", "la barra sola", "mancuernas de 15", "otra igual", "lo mismo", "me quedaban dos", "al fallo", "bajé a 50", "dropset".
- "Otra igual", "lo mismo": repite la última serie del ejercicio en curso.
- RIR: "me quedaban dos" → 2; "al fallo" → 0; sin mención → `null` (nunca inventarlo).
- Si no se nombra ejercicio, es el ejercicio en curso; si no hay ninguno, el siguiente del plan, con aviso.
- Mancuernas: "de 15" son 15 kg por mano.
- Detecta molestias o dolor ("me molesta el hombro") y los marca para el entrenador.
- No inventa números: lo que falta queda `null` y se señala.

### 7.4 Personalidad del Comandante

El usuario eligió una personalidad concreta y marcada para el entrenador. **La descripción de esa personalidad es privada**: el usuario la da en la conversación (o está en su cuestionario privado) y se guarda en la Propiedad del script `PERSONA_PROMPT`. El código solo lee esa propiedad; nunca contiene el texto.

- Se aplica **solo** a los textos (`coachMessage`, correos, comentarios). Los números (cargas, series, RIR, macros) los deciden las reglas y el modelo sin personaje, y nunca se cambian por el estilo.
- En el gimnasio, mensajes breves (1-2 frases). En el correo semanal, formato largo, como un programa semanal del Comandante.
- Ajuste de intensidad en Ajustes: `baja | media | alta` (por defecto `alta`).
- Las instrucciones piden hablar "al estilo de" la personalidad, no afirmar ser una persona real. Si Gemini bloquea o suaviza la respuesta, se muestra un texto neutro y se registra el código.
- Seguridad física por encima del personaje: ante dolor o lesión, el mensaje recomienda parar o ajustar.
- Si `PERSONA_PROMPT` está vacía, el entrenador habla en tono neutro y directo.
- **Sin voz ni chat:** el 18 de noviembre de 2026 se quitaron el botón "Escuchar" (síntesis de voz) y el chat con el Comandante a petición del usuario, para aligerar la app. La personalidad queda solo en los mensajes escritos de Hoy y de la revisión.

---

### 7.5 Ahorro de IA (21 de noviembre de 2026)

Regla: **la IA solo se usa para lo que no se puede resolver con reglas, con los datos propios o con lo ya calculado.** Cada vía de ahorro se cuenta y se enseña en Ajustes > Uso de la IA (llamadas del mes por modelo y llamadas ahorradas por vía; el contador del servidor vive en la Propiedad `AI_USO` y el del móvil en `localStorage`).

| Llamada | Qué se hace ahora | IA |
|---|---|---|
| Cualquier `callJson_` | Caché de respuestas idénticas 6 h (modelo + instrucciones + datos + adjuntos, con hash SHA-256): un reintento, la misma foto o el mismo texto no repiten | Solo la primera vez |
| Mensaje de inicio y de cierre | Modo **ahorro** por defecto (`coach.messages`): un banco de frases con la personalidad (4 por grupo muscular para empezar, 5 por resultado para cerrar: completa, incompleta, molestia) generado con **una** llamada y guardado en `ai/frases.json` del Drive del usuario (nunca en el repo). Mensaje = frase del banco, rotando sin repetir, + los datos reales que pone el código. Se rehace si cambia la personalidad o la intensidad, o a los 45 días. Modo **a medida** opcional en Ajustes | 1 llamada cada 45 días en vez de 2 por sesión |
| Comidas escritas | **Base de alimentos propia** (`foods.list`): se forma sola con lo comido y revisado en 180 días (por 100 g/ml o por unidad, la vez más reciente manda). El móvil entiende "2 huevos y 200 g de arroz" y lo calcula sin IA; si hay algo desconocido o ambiguo (un número sin unidad en algo que se pesa), pregunta a la IA. En la revisión queda el botón "Calcular con la IA" | Solo con alimentos nuevos |
| Comidas repetidas | **Lo de siempre**: las comidas que se repiten (los mismos alimentos 2 o más veces en 60 días) se apuntan con un toque, como la última vez | Ninguna |
| Suplementos | Catálogo local de genéricos (creatina, whey, colágeno, vitamina D en UI o µg, omega 3, magnesio, zinc, vitamina C, B12, cafeína) que lee la dosis del texto. Marcas, multivitamínicos y combinados van a la IA | Solo marcas |
| Planes de sesión, recetas, correo semanal | Ya eran una llamada por ciclo, por petición explícita o por semana | Igual |
| Dictado de series, fotos, pantallazos, resumen hablado | Necesitan entender audio o imagen | Sí |

**Dictado del iPhone (21 de noviembre de 2026, en prueba):** en la sesión, "Grabar" usa por defecto el reconocimiento de voz del sistema (Web Speech API de Safari, `es-ES`), que transcribe gratis; se ve en directo lo que va oyendo y, como iOS corta la escucha en los silencios, se reanuda sola hasta pulsar Parar. Se manda **solo el texto** (`clip.process` con `text`), que entra en la misma cola sin conexión que los audios. En el servidor, `reglasSerie_` (ClipRules.gs) interpreta la serie sin IA: ejercicio de la biblioteca, "15 a cada lado", "mancuernas de 12", "35 de pila", "lastre de 10", "barra sola", "10 repeticiones", "me quedaban 2", "al fallo", "calentamiento", "otra igual", números con letras y "do", "tre", "die" del andaluz, y varias series separadas por punto o "luego". Solo acepta si TODO el texto encaja: un número suelto, unos kilos a secas en barra (¿por lado o total?), una palabra que no es un ejercicio, una molestia, un dropset o un lado van a la IA **con el texto** (modelo rápido, mucho más barato que el audio), con instrucciones para corregir errores típicos del reconocimiento. Cada clip guarda por dónde se entendió (`via`: reglas, ia-texto o ia-audio). Si el iPhone no deja usar el dictado en la app (algunas versiones de iOS lo bloquean en las apps de la pantalla de inicio), se pasa en el momento a grabar audio como antes. Se elige en Ajustes > Dictado de series (preferencia del móvil). Falta medir con uso real si el reconocimiento de iOS acierta con el ruido del gimnasio y el habla andaluza; si no, se vuelve a "Grabación de audio" en Ajustes.

## 8. Motor del entrenador

Híbrido: **reglas deterministas** fijan los límites y la estructura; **Gemini** elige ejercicios, ajusta matices y redacta. Las reglas viven en `Planner.gs` como funciones puras con tests.

### 8.1 Rotación semanal

- Al empezar (y cada 4-6 semanas), Gemini propone un **ciclo** de 4 sesiones (A, B, C, D) con 1-2 grupos cada una que cubra todos los grupos. Ejemplo orientativo: A pecho + tríceps, B espalda + bíceps, C pierna completa, D hombro + core. El usuario puede aceptar o pedir otro.
- La siguiente sesión es la primera del ciclo que no se ha hecho desde la última vuelta completa.
- **Regla de carrera:** si la siguiente es pierna y hubo tirada larga (≥ 60 min o ≥ 10 km) hace menos de 36 h, se adelanta la siguiente sesión sin pierna.
- **Regla de vuelta:** si han pasado más de 7 días sin entrenar, la sesión baja la carga un 10 % y una serie por ejercicio.

### 8.2 Volumen

- Objetivo de partida: 10-16 series efectivas por grupo y semana (primario cuenta 1, secundario 0,5).
- Si un grupo queda por debajo de 8 series en la semana, la revisión semanal lo prioriza.

### 8.3 Progresión de cargas (doble progresión con RIR)

- Cada ejercicio tiene rango de repeticiones (por ejemplo 8-10) y RIR objetivo (por defecto 2).
- Si todas las series de trabajo llegaron al máximo del rango con RIR ≥ objetivo: subir carga. Barra: +2,5 kg (1,25 por lado). Mancuernas: siguiente par disponible (+2 kg). Máquina: siguiente placa.
- Si una o más series quedaron por debajo del mínimo, o RIR menor que objetivo − 1: mantener la carga.
- Si eso ocurre en 2 sesiones seguidas del mismo ejercicio: bajar un 5-10 % o cambiar a una variante.
- **Descarga** cada 5-6 semanas, o antes si se estancan 2 o más ejercicios principales: volumen −40 %, carga −10 % durante una semana.
- Límite duro: Gemini no puede proponer un cambio de carga mayor del ±10 % respecto a la última vez, o de un escalón de carga si este es mayor (así las cargas ligeras pueden progresar; por ejemplo, de mancuernas de 8 a 10 kg). Se exceptúan la descarga, la regla de vuelta y la primera sesión. Si lo supera, se recorta.
- Si el RIR de una serie no se registró (`null`), no bloquea la subida de carga, pero se marca para que la revisión lo señale.
- El escalón de las mancuernas se mide desde la carga actual (de 15 kg se sube a 17 kg).

### 8.4 Primera semana (sin historial)

- Cargas iniciales conservadoras a partir de la referencia (press banca 4 × 10 con 60-70 kg) y de la experiencia, con RIR objetivo 3.
- La app pide al usuario que confirme o corrija las cargas al ver el plan.

### 8.5 Nutrición y cuerpo

- Proteína: 2,0 g por kg de peso corporal al día (editable).
- Calorías: mantenimiento estimado (Mifflin-St Jeor × factor de actividad) menos un 10 %, revisado cada semana según la tendencia de peso y cintura.
- Cada semana se comprueba que el peso medio no baje más de 0,5 kg por semana (riesgo de perder músculo) y que la cintura tienda a bajar. Si no, se ajustan las calorías en ±150 kcal.
- Micronutrientes: referencia de los valores de referencia de nutrientes (VRN) de la UE para un adulto. Avisos solo si la media de 7 días está claramente por debajo.

### 8.6 Revisión semanal (domingo)

Disparador de tiempo en Apps Script: `weekly.review` → actualiza `plan/current.json`, guarda la revisión en `plan/history/`, envía el correo.

---

### 8.7 Cómo se ejecuta la revisión semanal

- `weeklyTrigger` (domingo, 19:00) calcula los hechos de los últimos 7 días (`weeklyFacts_`), aplica las reglas (`calorieAdjustment_`: ±150 kcal según tendencia de peso y cintura, acumulado y acotado a ±450; grupos con menos de 8 series reciben una serie más; ejercicios principales estancados cuentan para adelantar la descarga) y guarda `plan/history/AAAA-Www.json`.
- La IA solo redacta el comentario de apertura del correo (modelo SMART, con el rápido y un texto neutro de respaldo). Los números y los ajustes salen del código y no dependen del estilo.
- `reminderTrigger` (a diario, hacia las 7:00) avisa solo si llevas `reminderAfterRestDays` días sin entrenar y hoy no has empezado una sesión.
- `installTriggers` crea ambos disparadores; se ejecuta una vez desde el editor. En Ajustes hay "Vista previa" y "Enviar ahora" para probar sin esperar al domingo.

## 9. Interfaz

### 9.1 Pantallas

| Pantalla | Contenido |
|---|---|
| **Hoy** | Sesión de hoy (grupos, ejercicios, cargas, RIR), mensaje del Comandante, botón grande "Empezar sesión". Si es día de descanso: próxima sesión y resumen de la semana |
| **Sesión** | Botón de grabar enorme (pulsar para empezar, pulsar para parar). Lista viva de series reconocidas, editable con un toque. Ejercicio en curso destacado. Temporizador de descanso que arranca al registrar una serie. Indicador de clips pendientes. "Terminar sesión" |
| **Revisión** | Sesión consolidada por la IA, editable, con comparación frente al plan y frente a la última vez. "Guardar" |
| **Diario** | Historial de sesiones por fecha; detalle con series, volumen y mensaje |
| **Cuerpo** | Peso con media de 7 días, grasa, músculo, cintura y medidas; botón "Subir pantallazo de la báscula" y "Medir por voz" (con revisión antes de guardar y aviso si una medida cambia más del 10 %), "Anotar a mano"; progreso hacia el objetivo |
| **Guía** | Cómo medirse con cinta de sastre: figura con la cinta colocada, dónde y cómo para cada parte, consejos y frase de ejemplo para dictar. Cuelga de Cuerpo |
| **Comida** | Comidas del día por voz; totales de macros frente al objetivo; micronutrientes aproximados; semana |
| **Carreras** | Lista de carreras; "Subir pantallazo del reloj" |
| **Progreso** | Cargas por ejercicio, 1RM estimado, volumen por grupo y semana, tendencia de peso y cintura |
| **Ajustes** | Conexión (URL y token), objetivo, material, intensidad del Comandante, correo y avisos, exportar datos, cerrar sesión en el dispositivo |

Navegación inferior con 5 entradas (Hoy, Diario, Cuerpo, Comida, Más). Carreras, Progreso y Ajustes van en "Más".

### 9.2 Grabación

- `getUserMedia` + `MediaRecorder` (en iPhone produce `audio/mp4`). Mono y clips cortos.
- La cola procesa los clips en orden, con reintentos y espera creciente; un error permanente (validación, tamaño) se marca y se conserva. Un clip solo se borra del móvil cuando el servidor confirma que lo procesó. El corte automático es a los 75 s.
- Cada clip se guarda primero en IndexedDB con su marca de tiempo y después se sube. Sin conexión, se encolan y se procesan en orden al volver la red.
- Feedback táctil y visual claro al empezar y parar. Nunca se pierde un clip: si la subida falla, sigue en la cola.

### 9.2 Fluidez y rendimiento

Regla general: **nada que dependa de la IA puede bloquear una pantalla**, y el usuario siempre debe saber si la app está trabajando y poder moverse mientras tanto.

- **Causa real de la lentitud (medida leyendo el código, no adivinada):** Apps Script tarda unos 0,2 s por operación de Drive, y cada lectura de un archivo hacía de 3 a 5 (buscar la carpeta raíz por nombre en todo Drive, la subcarpeta, el archivo y leerlo). Abrir Hoy leía unos 12 archivos y, cada día nuevo, esperaba además a una llamada a Gemini para el mensaje de arenga. El audio, la voz y el chat **no** influyen: solo se ejecutan al pulsarlos.
- **Servidor:** caché de identificadores de carpetas y archivos y del contenido de los JSON pequeños en `CacheService` (invalidada en cada escritura de la propia app; `clearDataCache()` e `invalidatePath_()` si se edita un archivo a mano en Drive). `hoy.load` devuelve el estado y la sesión en **una** llamada. Los mensajes con la personalidad (inicio de sesión y cierre) se generan **después**, con `session.message` y `session.reviewMessage`; la pantalla se pinta con un texto neutro al instante.
- **Cliente:** indicador global de actividad (barra superior; a los 3 s avisa de que se puede seguir navegando); las pantallas de lectura se abren al instante con lo último visto y se actualizan en silencio (`stale-while-revalidate`, sin repintar si nada cambió ni pisar lo que el usuario esté tecleando); las pantallas se cargan solo al abrirlas; la app "despierta" al servidor al arrancar; Ajustes > Velocidad mide cuánto tarda cada paso (total y dentro del servidor).
- **Caché comprimida:** lo que no cabe en una entrada de `CacheService` (100 KB; un mes de sesiones lo supera en unas dos semanas) se guarda comprimido con gzip, en base64 y en trozos (hasta unos 1 MB comprimido). Si falta un trozo o llega corrupto, se lee de Drive y se recompone.
- **Diario y Progreso ligeros:** `sessions.summary` devuelve por sesión solo fecha, grupos, métricas, nº de molestias y por ejercicio el nº de series y el mejor 1RM estimado (unos cientos de bytes en vez de 10-15 KB; sin clips ni series). Las dos pantallas comparten la misma petición y caché local. El detalle de una sesión se pide con `session.get` al abrirla y queda guardado en el dispositivo.
- **Sesión en el gimnasio:** "Empezar sesión" entra al instante (el servidor la marca como empezada en segundo plano). Cada ejercicio enseña su objetivo ("Serie 3 de 4 · objetivo 8-10 rep · RIR 2 · 15 kg por lado"). Cada serie guarda su hora (`at`, la del clip o la del móvil si es razonable): el descanso cuenta también tras las series a mano, avisa con "Listo" al cumplir el objetivo y deja de contar pasados 15 min. Mientras hay clips en cola se ve "Procesando…" arriba, junto al botón de grabar. La sesión en curso se guarda en el móvil y se abre desde esa copia aunque no haya red.
- **Sin conexión en el gimnasio:** las series a mano, "Otra serie igual", las correcciones y los descartes se guardan en el móvil si no hay red, se ven al momento (marcados "Sin enviar todavía", con el total aproximado) y se envían solos y en orden al volver la conexión. Cada edición lleva un `opId` y el servidor la aplica una sola vez (`appliedOps`, últimas 200), así un reintento no duplica series. Si el servidor rechaza una, se quita y se explica. No se puede terminar la sesión con cambios sin enviar. La lista de ejercicios se descarga al abrir la app para que el formulario funcione sin red.
- **Vitaminas y minerales (Comida):** bloque visible (no plegado) con vista "Media 7 días" u "Hoy"; contadores de "a reforzar", "a vigilar" y "bien"; por nutriente, una barra hasta el 150 % con marca en la referencia, el porcentaje, el valor y, si va bajo, alimentos que lo aportan. Un nutriente "a llegar" va bajo por debajo del 80 %; uno "a no pasar" va alto por encima del 110 %. Lleva a "Recetas para cubrirlo". Primera versión: se mejorará con las capturas de otras apps que mande el usuario.
- **Recetas y lista de la compra (Comida):** 3 recetas para lo que falta; lista sumada y agrupada por sección del súper, con casillas (guardadas en el móvil) y "Compartir o copiar" solo lo que falta. Ajustes > Comida guarda lo que no se come o sienta mal (`nutrition.foodNotes`, 300 caracteres).
- **Resumen hablado del entreno:** en la revisión y en el detalle del Diario, "Grabar resumen" (hasta 75 s). Si el envío falla, la grabación se conserva para reintentar.
- **Fluidez al tacto (18 de noviembre de 2026):** los botones se hunden al pulsarlos (también en el iPhone, que necesita un oyente de toques para `:active`), sin retraso de doble toque (`touch-action: manipulation`) ni resaltado gris; transiciones cortas de color y presión; entrada suave de cada pantalla solo al cambiar de sección (nunca en los repintados); cada pestaña recuerda dónde se quedó el desplazamiento y al tocar la pestaña activa se sube arriba; esqueletos de carga en lugar de "Cargando…" para que nada salte; los desplegables se abren con animación; todo respeta "reducir movimiento" de iOS.
- **Comida en cualquier día (21 de noviembre de 2026):** la pantalla abre con la semana (lunes a domingo) y un punto en los días con comidas; tocar un día lo abre. Si ayer o los dos días anteriores no tienen nada, un aviso lleva directo a ese día. "Añadir comida" permite elegir el día (con atajos Hoy, Ayer y Anteayer) y mezclar foto, voz y texto en una sola comida. El día elegido se recuerda mientras usas Comida y vuelve a hoy pasados 10 minutos.
- **Plato compartido:** al subir una foto se indica cuánto te has comido tú: todo, compartido entre 2 y 20 personas o una parte (25, 33, 50, 75 % o el que escribas). La IA estima el plato **entero** de la foto (`shared: true` → `repartoAparte`) y la app aplica tu parte con una cuenta exacta (`repartir`), así se puede cambiar en la revisión sin volver a calcular. La comida guardada lleva `portion: { share, text }`.
- **Suplementos:** se añaden una vez en Comida > Suplementos (la IA estima lo que aporta cada toma a partir del nombre o la marca; si no conoce el producto, avisa para compararlo con la etiqueta) y se guardan en `settings.nutrition.supplements` (como mucho 20). Cada día se marcan con un toque; la toma se guarda como una comida de tipo `supplement` con id fijo por día y suplemento (`p_AAAAMMDD_<id>`), así suma a las vitaminas y minerales sin duplicarse y se puede desmarcar. Un día con solo suplementos no cuenta para la media de 7 días. Las recetas tienen en cuenta los suplementos que ya tomas.
- **Revisión al instante:** se enseña la última revisión vista de esa sesión y el servidor la confirma en segundo plano; el mensaje de cierre con la personalidad (`session.reviewMessage`) llega después, sin bloquear. La copia se borra al guardar, descartar o seguir grabando.
- **Series a mano:** durante la sesión y en la revisión se puede añadir una serie pulsando el ejercicio, completar un pendiente con lo que la IA entendió, o añadir un ejercicio de la biblioteca. El formulario conserva lo escrito aunque la pantalla se repinte.
- **Cargas dictadas:** el mismo número se acepta dicho como "por lado", "por mano", "total" o "de la pila" según el implemento; "barra con 15 kilos" con una barra de 20 se entiende como barra de 15 y se avisa en la revisión.

### 9.3 Dirección visual (moderna, con la marca del Comandante)

Rehecha el 18 de noviembre de 2026: la dirección de "cartel" (bordes negros de 2 px, sombras duras, todo en mayúsculas condensadas, botones rectangulares sobre papel crema) resultaba de los años 80 y 90. Se sustituye por el lenguaje de las apps de fitness actuales (Apple Fitness, Huawei Salud, Strava, Gentler Streak), conservando la identidad: rojo revolucionario, verde oliva, negro y la estrella.

- **Claro y oscuro:** sigue el modo del iPhone (`color-scheme: light dark`, tokens en `:root` y en `prefers-color-scheme: dark`). Fondo neutro cálido, tarjetas blancas (o grafito) elevadas con sombra suave.
- **Forma:** tarjetas con esquinas de 22 px, campos y botones en píldora o con esquinas de 14 px, sin bordes gruesos. Tarjetas heroicas oscuras con un resplandor rojo para lo importante: la sesión de hoy con el botón de empezar y los músculos, "¡Misión cumplida!" al terminar, y los anillos de Comida.
- **Tipografía:** la del sistema (SF), títulos grandes en minúscula y sin etiquetas repetidas, números muy grandes para las cifras, texto en minúscula en botones y pestañas. Nada de mayúsculas forzadas.
- **Navegación:** barra inferior de cristal esmerilado flotante con iconos y la pestaña activa en píldora tintada. "Más" es una lista de ajustes con subtítulos, como la de iOS.
- **Controles:** control segmentado en píldora, casillas redondeadas, botón de grabar circular con latido mientras graba, escalas de micronutrientes por tramos con marcador.
- **Accesibilidad:** contraste AA medido en todas las pantallas en claro y en oscuro (el relleno de los botones es `--boton`, un rojo más profundo, para que el texto blanco cumpla), objetivos táctiles de al menos 44 px, y se respeta "reducir movimiento".
- **Lo tomado de otras apps (18 de noviembre de 2026):** barra inferior flotante con iconos y la pestaña activa como brazalete rojo (Apple Fitness, Huawei Salud); cabecera de victoria al terminar ("¡Misión cumplida!", cifras grandes de duración, series y volumen y figura de frente y espalda con los músculos trabajados en rojo, también en Hoy) (Fitness Park); anillos de calorías y proteína con cifras grandes "1.450/2.400 KCAL" (Apple); escala por tramos con un triángulo que marca dónde estás en cada micronutriente (Huawei); en Progreso, "Tu progreso de un vistazo" con el cambio frente a las 4 semanas anteriores y medallas de oro, plata y bronce con las mejores marcas por ejercicio (Strava), y la matriz de semanas con un punto por día cuyo tamaño es el volumen y el cambio frente a la semana anterior (Gentler Streak; la semana en curso no se compara). El rojo sobre negro usa `--rojo-noche` para tener contraste suficiente.

---

## 10. Qué se aprovecha del código actual

| Pieza | Qué pasa |
|---|---|
| `apps-script/Store.gs` (sharding, upsert, locks, copias) | Se reutiliza; se añaden `runs/`, `plan/` y `media/`; la carpeta raíz pasa a `ComandanteData` |
| `apps-script/Auth.gs` | Se reutiliza y se amplía con el bloqueo global (5.2) |
| `apps-script/Validators.gs` | Se reutiliza; se adapta a la nueva serie (6.2) y se añaden validadores nuevos |
| `apps-script/Code.gs` | Se reutiliza el router; cambian las acciones |
| `apps-script/Tests.gs` + harness de Node | Se reutilizan; el harness pasa a `tests/` del repo y corre en CI |
| `DeepSeek.gs`, `Prompts.gs`, `Nlp.gs` | Se sustituyen por `Gemini.gs` y las nuevas instrucciones |
| `js/voice.js` (Web Speech) | Se sustituye por `js/recorder.js` (MediaRecorder + IndexedDB) |
| Esqueleto de la PWA, `api.js`, `state.js`, `sw.js`, iconos | Se reutilizan; se rehace el estilo |
| `js/lib/records.js`, `dates.js` | Se adaptan al nuevo modelo |
| Vistas de los hitos 0 a 2 | Se sustituyen por las de la sección 9 |

---

## 11. Fases

Cada fase termina con una entrega probada en el iPhone. Los pesos suman el 100 % del proyecto.

| Fase | Peso | Acumulado | Modelo |
|---|---|---|---|
| Planificación (este documento) | 10 % | 10 % | Opus |
| 0. Base: repo, despliegue automático, seguridad, prueba de audio y pantallazo | 10 % | 20 % | Sonnet |
| 1. Plan del día, sesión por voz y diario | 30 % | 50 % | Sonnet (Opus para revisar el motor de la sección 8 si se atasca) |
| 2. Cuerpo: peso, medidas, pantallazo de báscula | 10 % | 60 % | Sonnet |
| 3. Comidas por voz con macros y micronutrientes | 15 % | 75 % | Sonnet |
| 4. Carreras con pantallazo e integración en el plan | 8 % | 83 % | Sonnet |
| 5. Revisión semanal, correos, progreso y pulido | 17 % | 100 % | Opus para diseñar la revisión semanal; Sonnet para construir |

Dentro de una fase, el avance se reparte por sus tareas a partes iguales.

### Fase 0. Base (10 %). Cerrada el 15 de noviembre de 2026

1. Crear la estructura del repo, mover el código reutilizable y borrar lo sustituido.
2. Workflow `ci.yml`: tests de Node (frontend y funciones puras de Apps Script) y búsqueda de secretos.
3. Workflow `deploy.yml`: publicar Pages y, en el entorno `production` con aprobación, `clasp push` + `clasp deploy -i $DEPLOYMENT_ID`.
4. Seguridad: CSP, bloqueo global, límites de tamaño, nuevo `APP_TOKEN`, borrar la clave de DeepSeek.
5. `Gemini.gs` con modelos en Propiedades del script; acciones `ping.ai` (comprueba clave y modelo), `ai.models` (lista los modelos de la clave, para elegir los identificadores) y `ai.probe` (clip o pantallazo de prueba; si `audio/mp4` da error 400, reintenta como `audio/aac`). Pantalla de prueba en Más > Prueba de voz y pantallazo.
6. **Prueba de riesgo:** en el iPhone, con la app instalada, grabar un clip, subirlo y recibir la transcripción e interpretación. Medir tiempos. Probar también un pantallazo real del reloj y otro de la báscula.
7. Renombrar el proyecto de Apps Script y la carpeta de datos.

Criterio de aceptación: un push a `main` despliega frontend y servidor sin intervención salvo la aprobación; desde el iPhone instalado, un clip dictado vuelve transcrito e interpretado; ningún secreto aparece en el repo.

### Fase 1. Entrenar (30 %). En curso: tareas 1, 2, 3, 4, 5, 6, 7 y 9 hechas (cada tarea pesa 3,3 puntos)

1. Biblioteca de ejercicios (6.5) y modelo de serie (6.2) con tests.
2. `Planner.gs`: rotación, reglas de carrera y vuelta, volumen y progresión (8.1-8.4), con tests de funciones puras.
3. `session.plan` y pantalla **Hoy**; primer ciclo propuesto y aceptado por el usuario.
4. `js/recorder.js` con cola en IndexedDB; pantalla **Sesión** con lista viva y temporizador de descanso.
5. `clip.process` con las reglas de 7.3.
6. `session.consolidate`, pantalla **Revisión** y guardado.
7. Pantalla **Diario**.
8. Personalidad del Comandante (7.4) en los mensajes: redactar `PERSONA_PROMPT` con el usuario y leerla desde Propiedades.
9. Pantalla de bienvenida que pide perfil y objetivo y los guarda en `settings.json`.

Criterio de aceptación: el usuario hace una sesión real en el gimnasio dictando en desorden; la revisión refleja bien ejercicios, cargas (incluidas "20 a cada lado" y mancuernas), repeticiones y RIR; la siguiente sesión propuesta aplica la progresión.

### Fase 2. Cuerpo (10 %)

`body.extract` (pantallazo y dictado), pantalla **Cuerpo** con gráficas y progreso al objetivo. **Hecho (15 de noviembre):** dictado de medidas por voz, entrada a mano, guía visual y resumen de la última medida. **Falta:** pantallazo de la báscula, gráficas y progreso al objetivo.

Criterio: un pantallazo real de la báscula Huawei rellena bien todos los campos; la cintura se dicta y queda registrada.

### Fase 3. Comida (15 %). Código completo el 15 de noviembre; falta la prueba en el iPhone

`meal.process`, pantalla **Comida**, objetivos de 8.5, micronutrientes marcados como aproximados. Detalles: las calorías de cada alimento se comprueban contra sus macros (4-4-9) y se corrigen si difieren más de un 25 %; al cambiar la cantidad en la revisión, todos los nutrientes se reescalan; la media de 7 días avisa de micronutrientes por debajo del 60 % de la referencia (o de sodio, azúcares y grasa saturada por encima del 130 % del máximo) cuando hay al menos 3 días con datos. Objetivos: Mifflin-St Jeor × 1,55 menos un 10 %, proteína 2 g/kg y grasa 0,9 g/kg; el resto, hidratos.

Criterio: una comida dictada genera ítems coherentes con macros y micronutrientes y suma bien los totales del día.

### Fase 4. Carreras (8 %). Código completo el 15 de noviembre; falta la prueba con un pantallazo real del reloj

`run.extract`, pantalla **Carreras**, regla de carrera del planificador conectada a datos reales. El modelo solo transcribe los textos del reloj ("00:14:51", "7'35\""); el código convierte y comprueba que ritmo, distancia y duración sean coherentes. La hora de inicio de la carrera alimenta la regla de las 36 horas.

Criterio: un pantallazo real del Huawei Watch Fit 4 rellena los campos; una tirada larga reciente adelanta la sesión sin pierna.

### Fase 5. Semana y pulido (17 %). Código completo el 15 de noviembre (revisión semanal, correos, disparadores, Progreso, exportar e importar); falta la prueba real y la personalidad del Comandante

`weekly.review`, disparadores de tiempo, correos (semanal y aviso), pantalla **Progreso**, exportar e importar, accesibilidad, estados vacíos y textos.

Criterio: el domingo llega el correo con balance y plan; el plan de la semana siguiente refleja los ajustes.

### Resultados de la prueba de riesgo (Fase 0, 14-15 de noviembre de 2026)

| Comprobación | Resultado |
|---|---|
| Formato de grabación en iPhone | `audio/mp4; codecs=mp4a.40.2`. Gemini lo acepta tal cual como `audio/mp4`, sin reintento como `audio/aac` |
| Clip de 26 s | 0,6 MB. Gemini: 1,6 s. Total desde el iPhone: 5,1 s. Transcripción correcta |
| Pantallazo (PNG de 246 KB, reducido a JPEG de 158 KB) | Gemini: 1,1 s. Total: 3,4 s. Extrae todos los campos de la carrera |
| Permiso de micrófono | La app instalada **vuelve a pedirlo en cada apertura**. Mitigación de diseño: pedir el micrófono una sola vez al pulsar "Empezar sesión" y reutilizar el mismo flujo de audio para todos los clips de la sesión. Alternativa: abrir desde Safari con el micrófono en "Permitir" para el sitio |
| Modelos | `gemini-2.5-flash` no sirve: está deprecado y da 404 en cuentas nuevas. `gemini-3.8-flash` se colgó 360 s en una prueba. Fijado `GEMINI_MODEL_FAST` = `gemini-3.5-flash-lite` y `GEMINI_MODEL_SMART` = `gemini-pro-latest`. Se reevalúa con clips reales en la Fase 1 |
| Aritmética | En la prueba, el modelo sumó mal la carga de la barra. Confirma la regla: la IA solo extrae lo dicho; los kilos totales los calcula el código (6.2) |
| Pendiente | Pantallazo real de la báscula Huawei (criterio de la Fase 2) |

---

## 12. Riesgos y comprobaciones

| Riesgo | Cómo se comprueba o mitiga |
|---|---|
| Permiso de micrófono en la app instalada en iPhone (puede volver a pedirlo en cada arranque) | Prueba de la Fase 0; si molesta, se documenta y se ofrece abrir desde Safari |
| Formato `audio/mp4` de Safari aceptado por Gemini | Prueba de la Fase 0; plan B: declarar `audio/aac` o convertir en el cliente |
| Tamaño máximo de la petición a Apps Script | Prueba de la Fase 0 con clips de 30 s y pantallazos reales |
| Ruido del gimnasio | Clips cortos; edición con un toque; el plan del día como contexto |
| Gemini suaviza o bloquea la personalidad | Texto neutro de respaldo (7.4) |
| Estimación de micronutrientes poco precisa | Mostrar como aproximado; confianza por ítem |
| Formatos de los pantallazos de Huawei | El usuario aporta ejemplos reales en la Fase 0 |
| Caducidad de las credenciales de clasp en Actions | Instrucciones para renovarlas; el workflow avisa si fallan |
| Coste de Gemini | Flash para lo frecuente, Pro solo para planificar y revisar; registro de uso en `meta.json` |
| Latencia de Apps Script y Drive (0,2 s por operación, arranque en frío) | Caché del servidor, una sola llamada por pantalla, IA fuera del camino crítico y diagnóstico en Ajustes > Velocidad (sección 9.2) |
| Límite de 6 minutos de Apps Script | Operaciones cortas; la revisión semanal trocea si hace falta |

---

## 13. Lo que tiene que hacer el usuario (una vez)

1. Crear en GitHub un repositorio **público y vacío** llamado `comandante`.
2. En la cuenta de Google de la asesoría, activar la API de Apps Script en `https://script.google.com/home/usersettings` (era la causa del error `Insufficient Permission`).
3. En el Mac, `npx @google/clasp@2.4.2 login` (la misma versión que usa el workflow) con esa cuenta y copiar el contenido de `~/.clasprc.json` a un secreto `CLASPRC_JSON` del entorno `production` del repo. La sesión de desarrollo guiará el paso.
4. En el repo: activar Pages con origen "GitHub Actions", crear el entorno `production` con aprobación obligatoria, activar secret scanning y push protection.
5. En las Propiedades del script: `GEMINI_API_KEY`, un `APP_TOKEN` nuevo, `GEMINI_MODEL_FAST`, `GEMINI_MODEL_SMART` y `PERSONA_PROMPT` (la sesión de desarrollo redacta su texto con el usuario en la Fase 1). Borrar `DEEPSEEK_API_KEY`.
6. Añadir saldo a la cuenta de Gemini.
7. Aportar pantallazos reales: una carrera del Huawei Watch Fit 4 y una medición de la báscula Huawei.

---

## 14. Arranque de la sesión de desarrollo

Mensaje sugerido para abrir la conversación nueva con Sonnet, con el repo `comandante` conectado:

> Vamos a construir Comandante siguiendo `PLAN.md` del repositorio. Léelo entero. Mis datos personales y la personalidad del entrenador están en mi cuestionario privado: [enlace que te paso aparte]. No los escribas nunca en el repo. Empieza por la Fase 0 y guíame en los pasos de la sección 13 que me tocan. Termina cada respuesta con el porcentaje de avance del proyecto y el modelo recomendado.

---

## 15. Estado y pruebas pendientes en el iPhone (15 de noviembre de 2026)

Todo el código de las fases 0 a 5 está escrito y probado en Node y en Chromium con servidores simulados. Lo que **no** se ha podido probar es lo que depende de Gemini, de Drive y del correo con datos reales. Orden sugerido de pruebas, de menor a mayor riesgo:

1. **Despliegue:** fusionar la rama, aprobar `production` y comprobar en Más > Ajustes que la "Versión de la app" cambia. Ejecutar `setup` e `installTriggers` desde el editor de Apps Script y aceptar los permisos nuevos.
2. **Cuerpo:** guía de medidas; medir por voz (lados y decimales); pantallazo de la báscula (los 10 campos); gráficas tras 2 o más registros.
3. **Entrenar:** sesión corta con dictado en desorden; revisar los pendientes y "Lo que oí"; guardar; Diario; Progreso.
4. **Comida:** dictar una comida con cantidades; comprobar el reescalado y los totales frente a objetivos.
5. **Carreras:** pantallazo real del reloj; comprobar que una tirada larga reciente adelanta la sesión sin pierna.
6. **Semana:** Ajustes > Correo semanal > Vista previa y Enviar ahora; revisar el correo; al día siguiente, el recordatorio.
7. **Personalidad:** pegar `PERSONA_PROMPT` en las Propiedades del script y comprobar el tono en Hoy y en la revisión.

8. **Auditoría de fluidez (16 de noviembre):** empezar sesión sin esperar; registrar una serie con el móvil en modo avión y comprobar que se envía sola al volver la red; ver "Listo" en el descanso; abrir Diario y Progreso (deben ir mucho más rápido) y abrir una sesión del Diario.

9. **Novedades del 18 de noviembre:** dictar series con música de fondo (deben salir bien o como "No lo oí claro", nunca con números inventados); grabar el resumen hablado al terminar; en Comida, ver el bloque de vitaminas y minerales, pedir recetas y compartir la lista de la compra.

Decisiones abiertas que tendrá que confirmar el usuario: bíceps relajado (no contraído), punto de la cintura por la parte más ancha, modelos `GEMINI_MODEL_FAST` y `GEMINI_MODEL_SMART` tras probar con audio real, y qué hacer con las sesiones de prueba.

## 16. Ideas para una versión profesional (no desarrolladas)

Anotadas el 21 de noviembre de 2026 a petición del usuario, para más adelante. **No hay código de esto.**

- **Base de datos propia de alimentos y suplementos** con su composición en micronutrientes (en lugar de las estimaciones de la IA), con fuente y fecha de cada dato, y lectura de códigos de barras.
- **Recomendaciones ligadas a un comercio electrónico:** convertir las carencias detectadas (por ejemplo, hierro bajo de forma sostenida) en sugerencias de productos. Antes habría que resolver: que la recomendación la valide un profesional sanitario cuando sea un suplemento, avisos de interacciones y de dosis máximas, transparencia sobre que es publicidad o afiliación, protección de datos de salud (categoría especial en el RGPD: consentimiento explícito y finalidad separada) y que la app no haga diagnósticos.
- **Multiusuario:** hoy la app es de una sola persona (datos en su Drive y un token). Una versión profesional necesitaría cuentas, servidor propio y base de datos, no Apps Script.


## 17. Mejoras pendientes anotadas por el usuario (sin desarrollar)

Se irán añadiendo aquí. Se desarrollan juntas cuando el usuario lo pida.

1. **Descanso real calculado entre series (23 de noviembre de 2026).**
   - El usuario registra cada serie justo al terminarla, así que la hora de registro (`at`) marca el final de una serie.
   - El descanso real de una serie es el tiempo entre el final de la anterior y el **inicio** de la siguiente. El inicio no se registra, así que hay que estimarlo:
     - **Opción A:** hora de registro de la serie actual menos una duración estimada de la serie (repeticiones × segundos por repetición, por ejemplo 3 a 4 s, configurable).
     - **Opción B:** guardar como descanso el tiempo completo entre registros y mostrarlo como "tiempo entre series".
     - **Decidido por el usuario (23 de noviembre de 2026): opción A.**
   - Guardarlo en `restSec` de cada serie (el campo ya existe y hoy va vacío).
   - Enseñarlo en la sesión, en la revisión y en el Diario (por ejemplo, "Descanso medio 1:52").
   - Una serie registrada mucho después (por ejemplo, más de 15 minutos) o el primer ejercicio no cuentan como descanso.
2. **Contador de descanso dentro del recuadro del ejercicio en curso (23 de noviembre de 2026).**
   - El reloj "Descanso 0:40 de 1:30 min" o "Listo" se muestra **dentro de la tarjeta del ejercicio en curso**, junto a sus series, para no tener que subir a mirarlo.
   - Arriba se puede quitar o dejar solo como resumen.

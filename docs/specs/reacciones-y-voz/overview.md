# Reacciones y voz

Dominio responsable de traducir cada `NormalizedEvent` que produce una sesión real de Claude Code ([sesion-y-transporte](../sesion-y-transporte/overview.md)) en un cambio visible del avatar (expresión, estado, animación) y, quizás, en una frase hablada por síntesis de voz del navegador. Es puramente reactivo y de un solo sentido: consume eventos, nunca los genera ni conoce el modo de presentación activo (normal/mascota) por sí mismo.

Ver también: [animacion-y-render](../animacion-y-render/overview.md) (quién dibuja el `AvatarController.snapshot` que este dominio muta), [sesion-y-transporte](../sesion-y-transporte/overview.md) (origen de los eventos), [presentacion-y-ventana](../presentacion-y-ventana/overview.md) (modo mascota, que restringe cuándo puede sonar la voz), [orquestacion-app](../orquestacion-app/overview.md) (dónde se instancian y conectan `ReactionEngine`, `WebSpeechTextToSpeech` y `MouthSyncController`).

## Los cinco archivos del dominio

| Archivo | Responsabilidad |
|---|---|
| `src/reaction-catalog.ts` | Datos puros: las 83 definiciones de reacción posibles. Cero lógica de resolución. |
| `src/reaction-engine.ts` | La única lógica de resolución/activación/interrupción/habla. Sin datos propios: recibe el catálogo por parámetro. |
| `src/text-to-speech.ts` | Síntesis de voz real (Web Speech API), cola de frases, persistencia de preferencias de voz. |
| `src/mouth-sync.ts` | Traduce eventos de habla (`onBoundary`/`onSpeechEnd`) en un booleano `mouthOpen` con cierre diferido. |
| `src/components/VoiceControls.vue` | Panel de ajustes de voz visible en el panel de administración. |

Los tres primeros no importan Vue salvo `reactive`/`readonly` para exponer snapshots de solo lectura; ninguno conoce el DOM.

## Los cinco ejes del catálogo + la categoría de habla

El catálogo (`REACTION_CATALOG`, `src/reaction-catalog.ts` línea 959) es la concatenación literal de seis arreglos, para un total de **83 entradas**:

| Eje | Constante | Entradas | Qué modela |
|---|---|---|---|
| Estado mental | `MENTAL_STATE_REACTIONS` | 19 | El "humor" general del personaje (neutral, concentrada, confundida, alarmada, cansada...). |
| Actividad técnica | `TECHNICAL_ACTIVITY_REACTIONS` | 19 | Qué está haciendo Claude Code en términos técnicos (leyendo, escribiendo código, ejecutando pruebas, esperando permisos...). |
| Resultado | `RESULT_REACTIONS` | 14 | El desenlace de una operación (éxito, error recuperable, error grave, sesión finalizada...). |
| Interacción con el usuario | `USER_INTERACTION_REACTIONS` | 11 | La dimensión interpersonal (pidiendo permiso, necesita aclaración, celebrando...). |
| Presentación | `PRESENTATION_REACTIONS` | 19 | Micro-animaciones y efectos de puesta en escena (parpadeo, respiración, efecto de escritura, iconos flotantes...). |
| Respuesta hablada | `SPOKEN_RESPONSE_REACTIONS` | 1 | La única entrada cuyo `phrase` es el texto real de un mensaje del agente, no un texto fijo. |

Cada eje tiene su propio archivo fuente de diseño histórico (`avatar-reacciones-voz.md`, citado en comentarios `WHY` del código), pero **el código es la fuente de verdad**: dos de los ejes están etiquetados "18" en ese documento de origen pero enumeran 19 elementos literales en el código, y este documento se guía por lo que `REACTION_CATALOG` realmente contiene, no por la etiqueta histórica.

### Por qué casi la mitad de las entradas tienen `triggers: []`

De las 83 entradas, un número considerable declara `triggers: []` (arreglo vacío) — nunca pueden activarse desde `resolveReaction`, porque el filtro de la función es `reaction.triggers.includes(event.type)` y un arreglo vacío nunca contiene nada. Esto **no es código muerto ni un olvido**: cada una de esas entradas documenta, en su campo `fallback`, exactamente por qué no existe un evento discreto real de los 13 tipos válidos (`VALID_CLAUDE_EVENT_TYPES`) que la distinga de sus vecinas. Ejemplos reales:

- `mental-cansada` (línea 145): *"Ambiental por duración de sesión, no por evento discreto; fuera de alcance de este Hito."*
- `resultado-permiso-concedido` (línea 567): *"La resolución de una petición de permiso es una llamada saliente (`respondToPermissionRequest`), no llega como `NormalizedEvent`."*
- `presentacion-parpadeo` (línea 760): *"Ambiental por temporizador propio (frecuencia natural de parpadeo); no dispara con `NormalizedEvent`, fuera de alcance de este Hito."*

Estas entradas quedan en el catálogo como documentación viva del espacio de diseño completo (todo lo que el avatar *podría* expresar) aunque el motor de eventos actual solo pueda activar un subconjunto. `validateCatalog()` (línea 968) solo verifica que ningún `trigger` declarado sea un tipo de evento inválido — no exige que todas las entradas sean alcanzables.

### Entradas con `triggers` no vacíos que aun así nunca ganan

Distinto del caso anterior: varias entradas SÍ tienen un trigger real pero comparten ese evento con otra entrada de mayor prioridad, así que en la práctica nunca se activan. También están documentadas con `fallback`, por ejemplo:

- `mental-concentrada` (prioridad 20) comparte `tool_started` con `tecnica-explorando-el-proyecto` (prioridad 32), que siempre gana.
- `mental-sorprendida`, `interaccion-necesita-aclaracion`, `interaccion-advirtiendo-sobre-un-riesgo` y `presentacion-burbuja-de-interaccion-pendiente` comparten `interaction_required` con `interaccion-pidiendo-permiso` (prioridad 95, la más alta de las cuatro) y/o `tecnica-esperando-permisos` (92).

Estas entradas no son un error: quedan como variantes semánticas documentadas para cuando exista más información en el payload del evento (severidad, tipo de interacción) que permita desambiguar.

## Cómo se resuelve una reacción: `resolveReaction`

`resolveReaction(catalog, event)` (`src/reaction-engine.ts` línea 56) es una función pura sin estado, en tres pasos:

1. **Filtro por trigger**: se quedan solo las entradas cuyo arreglo `triggers` incluye `event.type`. Si no queda ninguna, devuelve `null` (el evento no produce reacción visible).
2. **Desempate por resultado** (`pickByOutcome`, línea 37): solo aplica cuando el tipo de evento es "portador de resultado". Hoy el único caso real es `tool_finished`: si `event.success` es `true` gana `resultado-operacion-exitosa`, si es `false` gana `resultado-error-recuperable` — sin importar la prioridad numérica de ninguna de las dos. Esta tabla vive en `OUTCOME_REACTION_ID_BY_TRIGGER` (línea 18) y es literalmente un objeto con una sola clave (`tool_finished`); no hay una segunda dimensión de desempate por resultado en el código actual.
3. **Desempate por prioridad** (`pickHighestPriority`, línea 48): si el paso 2 no aplicó o no encontró la reacción esperada en los candidatos, gana el candidato con `priority` numérica más alta. Un empate exacto de prioridad no está definido explícitamente por una regla propia: `Array.prototype.reduce` con `current.priority > best.priority` conserva el primero encontrado en caso de empate, es decir, el orden de declaración en `REACTION_CATALOG` (mental → técnica → resultado → interacción → presentación → habla) actúa como desempate implícito.

## El motor de activación: `ReactionEngine`

`ReactionEngine` (`src/reaction-engine.ts` línea 80) es una clase con un solo método público, `handleEvent(event)` (línea 98), que ejecuta esta secuencia en cada llamada:

1. **Expira la reacción activa si corresponde** (`expireActiveReaction`, línea 107): si hay una reacción activa con `expiresAt` no nulo y `now() >= expiresAt`, se limpia (`this.active = null`) ANTES de intentar resolver nada nuevo. Una reacción sin `durationMs` nunca expira sola (`expiresAt: null` permanente) — solo la interrumpe una reacción de mayor prioridad.
2. **Resuelve** la reacción candidata con `resolveReaction`. Si no hay ninguna, no pasa nada.
3. **Chequea supresión** (`isSuppressed`, línea 113): cada reacción individual tiene su propia ventana de "no repetir tan seguido", igual a `Math.max(groupingWindowMs, reaction.cooldownMs ?? 0)` desde la última vez que ESA MISMA reacción (por `id`) se activó. `groupingWindowMs` por defecto es `DEFAULT_GROUPING_WINDOW_MS = 2500` ms (línea 14); una reacción con `cooldownMs` menor a 2500 no gana nada — el mínimo real efectivo siempre es 2500 ms a menos que `cooldownMs` sea mayor.
4. **Chequea si puede activarse** (`canActivate`, línea 123): si no hay reacción activa, siempre puede. Si hay una activa, la nueva solo gana si su `priority` es **estrictamente mayor** (no basta igualar) Y la reacción activa actual es `interruptible: true`. Una reacción activa con `interruptible: false` bloquea CUALQUIER interrupción, sin importar cuán alta sea la prioridad de la entrante — hasta que expire sola por `durationMs` o hasta el próximo evento que la vuelva a evaluar y encuentre que ya expiró.
5. **Activa** (`activate`, línea 129): registra `lastFiredAt` para esa reacción (usado en el paso 3 de la siguiente llamada), calcula `expiresAt` (`firedAt + durationMs` o `null`), y llama a `emit`.
6. **Emite** (`emit`, línea 144): aplica `state`/`expression` al `AvatarController` compartido (si la reacción los define — las de presentación no tienen `state`/`expression`, solo `animation`, que hoy el motor no consume directamente) y decide si habla.

### Ejemplo concreto de interrupción real

`mental-alarmada` (`permission_denied`, prioridad 59, `durationMs: 4000`, `interruptible: true`) se activa cuando el backend deniega un permiso. Durante sus 4 segundos de vida, solo una reacción con prioridad > 59 puede interrumpirla — por ejemplo `resultado-operacion-exitosa` (60) sí puede, pero `resultado-error-recuperable` (58) no, y debe esperar a que expire sola. Esto está verificado por pruebas adversariales reales en `reaction-engine.spec.ts` (Hallazgo 13): `permission_denied` no se sobrescribe por un `tool_finished` de fallo inmediatamente después, pero sí una reacción genuinamente de mayor prioridad la interrumpe.

## La respuesta hablada: por qué es distinta de las demás 82 entradas

`respuesta-hablada` (línea 948, única en `SPOKEN_RESPONSE_REACTIONS`) dispara con `assistant_turn_complete`, prioridad 65, `durationMs: 3000`, `interruptible: true`. Es la única entrada de todo el catálogo donde `phrase` es una función, no un string fijo:

```ts
phrase: (event) =>
  event.type === 'assistant_turn_complete' ? event.text : '',
```

Esto existe porque, a diferencia de las demás frases (fijas, como `'Necesito tu autorización para continuar.'`), el motor no conoce el contenido real de la respuesta del agente hasta que el evento sintético llega — el texto es el propio mensaje final de Claude Code, no una frase de personalidad escrita a mano. Si el texto viene vacío, `speakIfAuthorized` lo detecta y no llama a `speak()`.

## Cuándo suena una frase: `speakIfAuthorized`

`speakIfAuthorized` (`src/reaction-engine.ts` línea 164) es, según su propio comentario en el código, "el único punto que decide si suena una frase, y solo a partir del catálogo — nunca se suscribe a eventos". Su secuencia de guardas, en orden:

1. Si no se inyectó un `TextToSpeech` al construir el motor (`options.textToSpeech`), nunca habla — el motor de reacciones funciona íntegramente sin voz si no se le da una implementación.
2. Si la reacción no tiene `phrase`, no habla.
3. Si `reaction.speechPolicy` no está en `SPEAKABLE_POLICIES = {'required', 'recommended'}` (línea 11), no habla. Las políticas `'never'` y `'optional'` nunca producen habla hoy — el comentario del código lo explica: `'optional'` queda deliberadamente fuera "hasta que exista lógica de personalidad que decida por sí sola cuándo hablar" (no implementada en este Hito). **`'required'` y `'recommended'` son funcionalmente idénticas en runtime hoy** — ambas están en `SPEAKABLE_POLICIES` sin que ningún otro punto del motor las distinga; la diferencia es puramente semántica/documental dentro del catálogo (una marca de intención para quien edite el catálogo, no una regla que el código aplique distinto).
4. Resuelve el texto (llamando a la función si `phrase` es función). Si el resultado es cadena vacía, no habla.
5. Llama a `this.textToSpeech.speak(phraseText)`, con `.catch` que aísla cualquier error (`handleSpeakError`, línea 154): registra el fallo en la taxonomía de fallos (`registerFailure('tts-error', ...)`, ver [robustez-y-actualizaciones](../robustez-y-actualizaciones/overview.md)) y hace `console.error`, pero **nunca relanza la excepción ni tumba la sesión** — regla de arquitectura confirmada en `CLAUDE.md`: "Ninguna capa puede matar la sesión."

De las 83 entradas, solo cuatro tienen `speechPolicy` en `{'required', 'recommended'}` y por lo tanto pueden llegar a sonar: `interaccion-pidiendo-permiso` (`required`), `tecnica-esperando-permisos`, `interaccion-necesita-aclaracion`, `interaccion-advirtiendo-sobre-un-riesgo`, `resultado-error-grave` (todas `recommended`) y `respuesta-hablada` (`recommended`). El resto usa `'never'` u `'optional'`, así que nunca emiten sonido aunque sí cambien la expresión/estado visual del avatar.

## El pipeline de síntesis real: `WebSpeechTextToSpeech`

Implementa dos interfaces a la vez: `TextToSpeech` (`speak`/`stop`/`pause`/`resume`) y `MouthSyncSource` (`onBoundary`/`onSpeechEnd`) — la misma instancia sirve de motor de voz y de fuente de sincronización de boca, sin acoplar ambos conceptos en una sola clase monolítica (`MouthSyncController` no sabe que su fuente también es un `TextToSpeech`).

### Flujo de una llamada a `speak(text)`

1. Texto vacío → no hace nada (`if (!text) return`).
2. Si hay un fallo de voz armado en desarrollo (`armVoiceFault()`, solo `import.meta.env.DEV`), lanza una excepción sintética — mecanismo de prueba de que el aislamiento de errores realmente funciona, eliminado por completo del bundle de producción.
3. `canSpeakNow()`: si la voz está deshabilitada (`state.enabled === false`) o si el modo mascota está activo y no se autorizó voz en modo mascota (`isPetMode && !allowInPetMode`), no habla — sin lanzar error, simplemente no produce sonido.
4. `acceptPhrase(queueState, text)`: si el texto es idéntico a la última frase aceptada (`lastAccepted`), la rechaza — evita que ráfagas de eventos repetidos (por ejemplo, muchos `file_read` seguidos con la misma frase de fallback) produzcan la misma frase hablada varias veces seguidas. Frases distintas SÍ se encolan aunque lleguen muy rápido.
5. Si se aceptó, se agrega a la cola FIFO y se llama a `playNextIfIdle()`.
6. `playNextIfIdle`: si ya hay una frase en curso (`this.current`), no hace nada — la cola espera. Si no, saca la primera frase de la cola y construye el `SpeechSynthesisUtterance` real.
7. `buildUtterance`: aplica `volume`/`rate`/`pitch`/voz seleccionada desde el estado persistido, conecta `onboundary` (notifica a los suscriptores de `MouthSyncSource`, típicamente `MouthSyncController`), `onend`/`onerror` (ambos llaman a `finishCurrent`, uno con `null` y otro con el mensaje de error).
8. En desarrollo, `wireQaSpeechLog` envuelve `onstart`/`onend`/`onerror` para registrar en `window.__qaSpeechLog` el texto, la voz usada y los timestamps de inicio/fin — instrumentación de QA sin oído humano (ver sección siguiente), eliminada por tree-shaking en producción por el mismo gate `import.meta.env.DEV`.
9. `finishCurrent`: limpia `this.current`, marca `isSpeaking = false`, guarda `lastError`, notifica a los suscriptores de fin de habla, y — pase lo que pase, haya habido error o no — llama de nuevo a `playNextIfIdle()` para continuar con la cola. Un fallo a mitad de una frase nunca detiene las siguientes.

### Por qué existe `qaSpeechLog`

Un motor de síntesis de voz no se puede verificar automáticamente "oyendo" el audio. `QaSpeechLogEntry` (texto, voz, `startedAt`, `endedAt`) permite que una prueba automatizada confirme que una frase específica realmente se sintetizó, con qué voz y en qué ventana de tiempo, sin necesitar un oído humano ni grabación de audio real. Vive detrás del mismo gate de build que `armVoiceFault`, así que no pesa nada en el bundle que llega al usuario final.

### Preferencias persistidas

Tres claves de `localStorage`, todas bajo el prefijo `codetuver-avatar.voice.*` (comentario en el código marca esto como interino: FEAT-028/EPIC-006 las migrará a un almacén unificado):

| Clave | Contenido | Valor sin preferencia guardada |
|---|---|---|
| `codetuver-avatar.voice.enabled` | booleano | `false` (voz apagada por omisión, no un default implícito distinto — AC-020.1) |
| `codetuver-avatar.voice.settings` | `{ volume, rate, pitch, voiceURI }` | `DEFAULT_VOICE_SETTINGS` = `{ volume: 1, rate: 1, pitch: 1, voiceURI: null }` |
| `codetuver-avatar.voice.allow-in-pet-mode` | booleano | `false` (silencio por omisión en modo mascota — AC-020.6) |

Un JSON corrupto en la clave de ajustes cae a `DEFAULT_VOICE_SETTINGS` completo (`try/catch` en `loadVoiceSettings`), nunca lanza ni bloquea el arranque de la app.

## Sincronización de boca: `MouthSyncController`

`MouthSyncController` (`src/mouth-sync.ts` línea 16) es deliberadamente ignorante de audio real: solo sabe reaccionar a dos callbacks de una fuente que implemente `MouthSyncSource`. `boundary` es un pulso discreto (llegada de una palabra/límite de síntesis), no una medida continua de amplitud — por eso el estado expuesto es un booleano (`mouthOpen`), no un número.

1. Cada `onBoundary` recibido llama a `openMouth()`: pone `mouthOpen = true` y agenda un cierre diferido (`scheduleClose`, `DEFAULT_CLOSE_DELAY_MS = 180` ms).
2. Si llega otro `boundary` antes de que se cumplan los 180 ms, `scheduleClose` cancela el temporizador anterior y agenda uno nuevo — así la boca se mantiene abierta de forma continua mientras las palabras siguen llegando rápido, y solo se cierra sola tras 180 ms de silencio real entre boundaries.
3. `onSpeechEnd` fuerza el cierre inmediato (`closeMouth`), sin esperar el temporizador — cuando la frase termina, la boca se cierra ya.
4. `dispose()` limpia el temporizador pendiente y desuscribe ambos listeners — usado si el controller deja de necesitarse (por ejemplo, al desmontar la vista del avatar).

Este diseño es explícitamente sustituible: cualquier fuente futura de amplitud/fonemas real que implemente `MouthSyncSource` funcionaría sin tocar `MouthSyncController` en absoluto (comentario "paso 7.1" en el código).

## La interfaz de usuario: `VoiceControls.vue`

Ver referencia completa control por control en [reference.md](./reference.md#voicecontrolsvue). Resumen funcional: un panel con checkbox de activar voz, tres sliders (volumen/velocidad/tono, todos deshabilitados si la voz está apagada), un selector de voz del sistema (`CustomSelect`, con opción "(voz por omisión del sistema)"), un checkbox de "permitir voz en modo mascota" con texto de advertencia en negrita, y un botón "Detener voz" habilitado solo mientras hay algo sonando o encolado. Se monta dos veces en `App.vue` (línea 2292 y línea 2360) — una para cada layout de la interfaz (ver [presentacion-y-ventana](../presentacion-y-ventana/overview.md) para el porqué de los dos layouts), ambas apuntando a la misma instancia compartida de `WebSpeechTextToSpeech`.

## Cómo se conecta todo (resumen de wiring real)

Instanciado una sola vez en `src/App.vue` (líneas 863-869), fuera de cualquier función — vive mientras la app vive, no por sesión:

```ts
const avatarController = new TestAvatarController();
const textToSpeech = new WebSpeechTextToSpeech();
const reactionEngine = new ReactionEngine(REACTION_CATALOG, avatarController, {
  textToSpeech,
});
const mouthSyncController = new MouthSyncController(textToSpeech);
```

Un solo `AvatarController` para todo el catálogo de personajes disponible: cambiar de personaje activo ([gestion-de-personajes](../gestion-de-personajes/overview.md)) solo cambia qué componente Vue dibuja el snapshot de estado/expresión — nunca hace falta re-suscribir el motor de reacciones. Cada evento normalizado que llega de la sesión activa pasa por `reactToEvent(event)` (línea 981), que aísla cualquier excepción de `reactionEngine.handleEvent(event)` con `try/catch` y la reporta a la taxonomía de fallos como `'avatar-error'` — el motor de reacciones fallando nunca debe tumbar el listener de eventos de sesión ni la sesión misma.

## Limitaciones reales actuales (no históricas)

- No existe una noción de severidad en los eventos reales, así que `resultado-error-grave` vs `resultado-error-recuperable` no se puede distinguir por tipo de evento — hoy solo `resultado-error-recuperable` es alcanzable (vía `tool_finished` con `success: false`).
- El desempate por resultado (`pickByOutcome`) solo cubre `tool_finished`; no hay una noción genérica de "evento con resultado" más allá de ese caso.
- El eje de Presentación (`animation`) no está cableado a un renderizador de animaciones concreto en este dominio — `emit()` en `ReactionEngine` solo aplica `state`/`expression`, nunca lee `reaction.animation`. Su consumo real, si existe, vive en [animacion-y-render](../animacion-y-render/overview.md).
- `speechPolicy: 'optional'` no produce habla en ningún caso hoy — está reservado para una futura capa de personalidad no implementada (comentario "paso 6.7 (R7)" en el código).
- El modo mascota real (`isPetMode`) nunca se activa desde ningún llamador conocido en el código actual (`setPetMode(true)` no tiene caller) — la app espera una futura pieza (EPIC-005) para activarlo de verdad; hoy `WebSpeechTextToSpeech.isPetMode` siempre vale `false` en producción.

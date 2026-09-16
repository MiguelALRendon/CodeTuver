---
id: research-estandares-vtuber-animacion-rigging
title: Estándares de la industria VTuber para animación, rigging y adaptación dinámica de modelos
type: reference
status: current
source: web
last_verified: 2026-08-30
symbols: [vrm-expression-mapping.ts, VrmAvatar.vue, character-editor.ts]
related: [research-avatar-and-tts, ref-avatar-reacciones-voz, adr-0009-formato-avatar-vrm]
---

# Estándares de la industria VTuber para animación, rigging y adaptación dinámica de modelos

> **Naturaleza de este documento.** Esta investigación **no es parte de EPIC-001** (esa fase ya cerró, Hitos 1-4, 2026-08-27) ni de ningún Hito de un plan activo. Es una investigación puntual solicitada directamente por el usuario para evaluar cómo la industria VTuber resuelve el problema de "animaciones y poses que se adapten dinámicamente a cualquier modelo", de cara a una posible funcionalidad futura en el Editor de personaje (las columnas "Animación" y "Pose", hoy marcadas `no soportado` para todo personaje del catálogo — ver `character-editor.ts`). **Solo contiene investigación y recomendación; no se tocó ningún archivo de código como parte de este trabajo**, tal como se pidió explícitamente.
>
> **Etiquetas usadas en este informe:** **[OFICIAL]** información confirmada por documentación oficial del proyecto/empresa citado · **[OBSERVADO]** comportamiento reportado por usuarios/documentación de terceros, no verificado en primera persona (no se instaló ningún software de este informe) · **[INFERENCIA]** conclusión propia a partir de varias fuentes, no una cita directa · **[CÓDIGO-ACTUAL]** contrastado contra el código real de este repositorio.

## 1. Resumen ejecutivo

La pregunta de fondo — *"cómo hacen los softwares de VTubing para que una animación o un rig 'funcionen' en cualquier modelo sin reprogramarlos uno por uno"* — tiene **una sola respuesta estructural, aplicada en dos capas independientes**:

1. **Para el esqueleto/cuerpo:** ningún software anima "el modelo de Fulano". Anima un **esqueleto humanoide abstracto y estandarizado** (huesos con nombres fijos: `Hips`, `Spine`, `Chest`, `Neck`, `Head`, `LeftUpperArm`, `RightLowerLeg`, etc.). Cualquier modelo que declare ese mapeo de huesos —VRM lo exige como parte del formato— puede reproducir *cualquier* animación esquelética ya grabada para ese estándar, sin importar sus proporciones exactas. Esto es **retargeting** ([OFICIAL], confirmado en la documentación de Unity Mecanim, en la spec VRM/VRMA, y en la propia implementación de Warudo). No hay adaptación "inteligente" por IA: es una tabla de traducción de nombres de huesos + normalización a "espacio de músculo" (Unity) o interpolación de rotaciones locales (VRM/glTF).
2. **Para la cara:** no hay huesos que mover (las expresiones son deformaciones de malla, "blendshapes"/"morph targets"), así que el mecanismo es distinto: **un catálogo fijo y públicamente documentado de nombres de blendshape** (el más extendido con diferencia es el set de 52 de Apple ARKit, más el set nativo de 6-8 de VRM) que el modelo debe declarar con esos nombres exactos. El software de turno simplemente busca el blendshape por nombre; si existe, lo mueve, si no, cae a un blendshape más cercano o lo ignora. **No hay retargeting geométrico de caras** — es una convención de nomenclatura, ni más ni menos.

El hallazgo más relevante para Codetuver Avatar, y la razón por la que vale la pena decirlo primero: **el proyecto ya implementa exactamente el mecanismo #2** en `src/vrm-expression-mapping.ts` (`mapExpressionToVrm` + `resolveSupportedVrmExpression` con fallback a `neutral` cuando el blendshape no existe en el modelo activo) **[CÓDIGO-ACTUAL]**. Es, en miniatura, el mismo patrón de "nombre estándar + fallback si no está" que usan VSeeFace, VNyan o Animaze para Perfect Sync. Lo que falta en el proyecto no es "inventar" el mecanismo — es el mecanismo #1 (retargeting esquelético para animaciones/poses de cuerpo), que hoy no existe en absoluto (no hay `AnimationMixer`, no hay dependencia de animación VRM instalada, `capabilitiesForTestAvatar()` fija `animation`/`pose` en `false` de forma incondicional, sin inspeccionar el modelo real).

## 2. Metodología

Investigación 100% documental vía `WebSearch`/`WebFetch` el 2026-08-30. No se instaló ni ejecutó ningún software de terceros de los listados — todas las afirmaciones sobre comportamiento de esos programas son **[OBSERVADO]** (documentación oficial o comunitaria) salvo que se indique **[OFICIAL]** (spec/documentación de primera parte del propio protocolo o formato). Todas las fuentes están listadas en la §8 con la URL exacta consultada.

## 3. Panorama: las cuatro piezas de cualquier pipeline VTuber

Antes de comparar software por software, conviene fijar el vocabulario — casi todo lo que sigue es una combinación de estas cuatro piezas, que distintos programas fusionan o separan de maneras distintas:

| Pieza | Qué hace | Ejemplos |
|---|---|---|
| **Fuente de tracking** | Captura la cara/cuerpo real (webcam, iPhone TrueDepth, Leap Motion, traje inercial, VR) y la convierte en números (rotaciones de hueso + pesos de blendshape) | iPhone + Waidayo/iFacialMocap, webcam + OpenSeeFace (VSeeFace), MediaPipe Holistic (Kalidoface), Leap Motion, Rokoko Smartsuit, SteamVR |
| **Transporte/protocolo** | Lleva esos números de la fuente al renderizador, típicamente por red local, para que fuente y renderizador puedan ser programas o incluso máquinas distintas | **VMC Protocol** (el más extendido con diferencia), OSC genérico, WebSocket propietario (VTube Studio) |
| **Motor/renderizador de avatar** | Carga el modelo 3D/2D y aplica los números recibidos: rota huesos, mueve blendshapes, renderiza | VSeeFace, VTube Studio, Warudo, VNyan, 3tene, Animaze, Luppet, Hitogata, Wakaru, Kalidoface 3D |
| **Herramienta de creación/rigging** | Donde se construye el modelo y se le asignan los huesos/blendshapes con los nombres que el estándar espera | VRoid Studio, Blender + plugins VRM, Unity + UniVRM, Live2D Cubism Editor |

**[INFERENCIA]:** la pregunta del usuario ("cómo se conectan dinámicamente varios softwares") apunta directamente a la pieza 2 — el protocolo de transporte — porque es literalmente *la* pieza diseñada para que fuente y renderizador sean intercambiables entre sí. Por eso el protocolo VMC ocupa la sección más profunda de este informe (§5.1).

## 4. Comparativa de 10 software (más 2 de contexto adicional)

Se investigaron **12** aplicaciones/ecosistemas — más de las 10 pedidas — para tener suficiente variedad (gratis/pago, japonés/occidental, 2D/3D, activo/descontinuado).

### 4.1 Tabla comparativa

| Software | Formato de avatar | Rig de huesos | Estándar facial | Protocolo de interoperabilidad | Estado / licencia |
|---|---|---|---|---|---|
| **VSeeFace** | VRM (0.x y 1.0) + `VSFAvatar` (extensión propia) | Humanoide VRM | Perfect Sync (ARKit-52) sobre blendshapes VRM del modelo | **VMC Protocol** (emisor y receptor) + OSC | Gratis, muy activo — de facto el estándar occidental de facto |
| **VTube Studio** | Principalmente **Live2D** (2D); soporte 3D limitado | N/A para Live2D (parámetros 2D, no huesos) | Modelo propio de tracking facial (ARKit-like) + parámetros custom por modelo | **API WebSocket propia** (puerto 8001+), no VMC nativo | Gratis + compras in-app, muy activo, dominante en móvil/2D |
| **Warudo** | VRM, avatares **VRChat**, "cualquier modelo con rig humanoide" | Humanoide VRM/Unity | ARKit + expresiones VRM | VMC + OSC + WebSocket + MIDI/Stream Deck (sistema de nodos "Blueprints") | Pago (perpetuo), muy activo, el más flexible de los evaluados |
| **VNyan** | VRM (0.x y 1.0) + `VSFAvatar` | Humanoide VRM | ARKit vía tracking + blendshapes VRM | **VMC** (hasta 4 receptores simultáneos) + OSC (incl. parámetros de avatar VRChat) | Gratis, activo, muy extensible (nodos + Lua) |
| **3tene** | VRM | Humanoide VRM | Blendshapes VRM estándar | VMC (parcial, según terceros) | Gratis/PRO de pago, activo |
| **Animaze (ex FaceRig)** | VRM/glTF → convertido a `.avatar` propio vía su Editor | Humanoide (importado desde VRM/FBX) | Blendshapes propias + puede usar blendshape en vez de hueso si falta animación esquelética | Integración directa con apps de videollamada/stream, no confirma VMC nativo | Pago, muy establecido (heredero directo de FaceRig) |
| **Luppet / LuppetX** | VRM (LuppetX exige VRM 1.0) | Humanoide VRM | Blendshapes VRM | Envío de motion a apps externas ("Motion transmission to external applications") — compatible con el ecosistema VMC | LuppetX ahora **gratis** (la empresa anunció disolución, 2026-08-23) |
| **Hitogata** | Formato propio + exporta a **VMD** (formato de animación de MikuMikuDance) | Propio | Tracking facial limitado (sin cejas/ojos según reportes de usuarios) | Exporta VMD para reutilizar en MMD, no confirma VMC | Gratis, japonés, nicho |
| **Wakaru** | VRM | Humanoide VRM | Solo tracking facial (cuerpo/manos se animan a mano o con un marcador de color) | No confirmado | **Discontinuado** — se incluye como caso de "estándar que sobrevive a la app": aunque el software murió, los VRM que la gente hizo para él siguen funcionando en cualquier otro visor VRM |
| **Kalidoface 3D** | VRM (drag & drop en el navegador) | Humanoide VRM | Blendshapes VRM, resueltas por Kalidokit desde landmarks de MediaPipe | Ninguno — todo corre local en el navegador (Three.js + `@pixiv/three-vrm`, la misma librería base de Codetuver Avatar) | Gratis, código abierto, web pura |
| **VRChat (Avatars 3.0)** *(contexto)* | FBX con **Unity Humanoid Avatar** + VRChat Avatar SDK3 | Humanoide Unity (Mecanim) | Blendshapes libres por avatar, disparadas vía un **Animator Controller** dirigido por "Expression Parameters" (float/int/bool) y blend trees | Su propio sistema de parámetros + soporta **OSC** para integraciones externas | Gratis, plataforma social — el ejemplo más grande del mundo de "un mismo esqueleto humanoide, animaciones intercambiables entre miles de avatares distintos" |
| **VUP** *(contexto)* | VRM + Live2D | Humanoide VRM | Blendshapes VRM | **VMC** (emisor y receptor confirmado) | Gratis, popular en el mercado chino |

### 4.2 Lectura de la tabla

**[INFERENCIA]** Tres bloques quedan claros al leer la tabla horizontalmente:

- **El bloque 3D "serio" (VSeeFace, Warudo, VNyan, 3tene, Luppet/LuppetX, Kalidoface 3D, VUP) converge casi por completo en VRM + VMC Protocol.** No es coincidencia: VRM lo publica el mismo consorcio japonés (VRM Consortium, con Dwango/pixiv como miembros fundadores) que impulsa el propio VMC Protocol, y ambos comparten el mismo vocabulario de huesos (`HumanBodyBones` de Unity) y de expresiones. Un modelo VRM correctamente rigueado es, por diseño, compatible con todo este bloque sin ningún trabajo adicional por software.
- **VTube Studio y Live2D son la excepción deliberada:** al ser 2D, no hay huesos 3D que retargetear — el "rig" es un conjunto de parámetros de deformación de mallas 2D (Warp/Rotation Deformers) que cada artista define a su propio criterio. Por eso Animaze tuvo que inventar sus propios "Animation Standards" (un conjunto por convención de qué parámetros debe tener un modelo Live2D para que el tracking genérico funcione) — es la versión 2D del mismo problema, resuelta sin un consorcio formal detrás, solo por convención de facto entre creadores de modelos.
- **VRChat es el caso de escala.** Prueba en la práctica, con literalmente millones de avatares de miles de autores independientes, que el mecanismo "esqueleto humanoide estándar + animaciones/parámetros desacoplados del modelo" escala sin curaduría central: cualquier animación hecha para el Humanoid Avatar de Unity funciona en cualquier avatar VRChat que declare correctamente su rig, sin que el autor de la animación conozca el avatar de destino ni viceversa.

## 5. Los dos estándares que hacen posible la "adaptación dinámica"

### 5.1 VMC Protocol — el protocolo de interoperabilidad **[OFICIAL]**

Fuente primaria: `protocol.vmc.info/english.html` (especificación oficial del proyecto `sh-akira/VirtualMotionCaptureProtocol`).

- **Transporte:** OSC (Open Sound Control) sobre UDP/IP, UTF-8. Sin TCP, sin autenticación — es deliberadamente ligero, pensado para correr en `localhost` entre dos programas de la misma máquina (o LAN).
- **Arquitectura de tres roles**, pensada exactamente para que fuente y renderizador sean intercambiables:
  - **Marionette**: el renderizador final (recibe en el puerto `39539`).
  - **Performer**: procesa IK/tracking y reenvía huesos+blendshapes al Marionette; a su vez actúa de servidor para los Assistants (puerto `39540`).
  - **Assistant** (opcional): manda datos crudos de entrada al Performer (p. ej. un sensor).
- **Mensajes de huesos** (esqueleto): `/VMC/Ext/Bone/Pos (string)nombre (float)pos.x/y/z (float)rot.x/y/z/w`. El nombre de hueso usa el vocabulario `HumanBodyBones` **de Unity** — el mismo vocabulario que el Humanoid Avatar de Unity y que la spec de huesos humanoides de VRM. Esto no es casualidad: es la razón técnica exacta de por qué "cualquier software VMC-compatible anima cualquier modelo VRM-compatible" sin configuración adicional.
- **Mensajes de expresión facial**: `/VMC/Ext/Blend/Val (string)nombre (float)peso` seguido de `/VMC/Ext/Blend/Apply` (aplicación en lote — todos los pesos se acumulan y se aplican de una sola vez, para evitar parpadeos de fotogramas a medio aplicar). Los nombres son **sensibles a mayúsculas** y siguen las convenciones de UniVRM.
- **VRM0 vs VRM1**: los nombres de expresión cambiaron entre versiones de la spec VRM (p. ej. `Joy`→`happy`, `Sorrow`→`sad`). La propia spec del protocolo VMC exige que **quien envíe en VRM1 también transmita en formato VRM0** por compatibilidad hacia atrás, dejando VRM1 como algo opcional adicional — es decir, el propio protocolo institucionaliza la traducción de nombres entre versiones del estándar, en vez de dejarlo a interpretación de cada implementación.
- **Extras**: cámara (`/VMC/Ext/Cam`), dispositivos VR (`/VMC/Ext/Hmd/Pos`, `/VMC/Ext/Con/Pos`), eventos de teclado/MIDI, temporización relativa. Un receptor bien implementado debe **descartar mensajes desconocidos sin fallar** — tolerancia a extensión, otro patrón de diseño relevante si Codetuver Avatar alguna vez expone algo similar.

**[INFERENCIA]** El VMC Protocol es, para VTubing, el equivalente funcional de MIDI para instrumentos musicales: no importa qué "genera" la señal (un teclado, un secuenciador, un iPhone) ni qué la "reproduce" (un sintetizador, un DAW, un VRM) — mientras ambos hablen el mismo cable, son intercambiables. Es la respuesta más directa a la pregunta literal del usuario ("cómo se conectan dinámicamente varios softwares").

### 5.2 El estándar facial: VRM (6-8 presets) + ARKit-52/"Perfect Sync" **[OFICIAL]**

Hay **dos** catálogos de nombres de blendshape en uso simultáneo en el ecosistema, y todo software serio soporta ambos con un mecanismo de traducción/fallback entre ellos:

**A. Presets nativos de VRM** (el "mínimo garantizado" — ya implementado en Codetuver Avatar):

| VRM 0.x | VRM 1.0 | Uso |
|---|---|---|
| `Neutral` | `neutral` | Reposo |
| `Joy` | `happy` | Emoción |
| `Angry` | `angry` | Emoción |
| `Sorrow` | `sad` | Emoción |
| `Fun` | `relaxed` | Emoción |
| — | `surprised` | Emoción (nuevo en VRM1) |
| `A`/`I`/`U`/`E`/`O` | `aa`/`ih`/`ou`/`ee`/`oh` | Visemas (boca al hablar) |
| `Blink`, `Blink_L`, `Blink_R` | `blink`, `blinkLeft`, `blinkRight` | Parpadeo |
| `LookUp`/`LookDown`/`LookLeft`/`LookRight` | ídem en minúscula | Mirada |

**B. Los 52 blendshapes de Apple ARKit** ("Perfect Sync" en la jerga VTuber — confirmado por `arkit-face-blendshapes.com` y documentación de ReadyPlayerMe/VMagicMirror):

| Región | Blendshapes |
|---|---|
| Ojos (14) | `eyeBlinkLeft/Right`, `eyeLookDown/In/Out/UpLeft/Right` (×2), `eyeSquintLeft/Right`, `eyeWideLeft/Right` |
| Cejas (5) | `browDownLeft/Right`, `browInnerUp`, `browOuterUpLeft/Right` |
| Mejillas (3) | `cheekPuff`, `cheekSquintLeft/Right` |
| Nariz (2) | `noseSneerLeft/Right` |
| Mandíbula (4) | `jawForward`, `jawLeft/Right`, `jawOpen` |
| Boca (23) | `mouthClose`, `mouthFunnel`, `mouthPucker`, `mouthLeft/Right`, `mouthSmileLeft/Right`, `mouthFrownLeft/Right`, `mouthDimpleLeft/Right`, `mouthStretchLeft/Right`, `mouthRollLower/Upper`, `mouthShrugLower/Upper`, `mouthPressLeft/Right`, `mouthLowerDownLeft/Right`, `mouthUpperUpLeft/Right` |
| Lengua (1) | `tongueOut` |

**Por qué importan los dos juntos [INFERENCIA]:** el set VRM (6-8) es el **mínimo que todo VRM válido debe declarar** — es parte del formato. El set ARKit-52 es **opcional y mucho más expresivo** (permite gestos como guiños, mejillas infladas, sonrisas asimétricas), pero requiere que el artista 3D esculpa 52 morph targets adicionales a mano en Blender/similar y los registre uno por uno en Unity con `BlendShapeClip` — **[OBSERVADO]**, documentado explícitamente por VMagicMirror como un trabajo manual de doble paso (escultura + registro). VSeeFace exige que **los 52 estén presentes** (pueden estar vacíos, pero deben existir) para activar Perfect Sync — no hay una versión "parcial".

**Consecuencia práctica para Codetuver Avatar [INFERENCIA]:** ni Rabbit, ni Polydancer, ni Alicia Solid (VRM 0.51, modelo de 2016) van a tener los 52 blendshapes ARKit — eso es normal, casi ningún VRM "genérico" los tiene; Perfect Sync es una capa opcional que solo tiene sentido si algún día se conecta un tracker facial de iPhone real. El proyecto **ya hace lo correcto** al limitarse al set de 6 nativo de VRM con fallback a `neutral`.

### 5.3 Retargeting esquelético: cómo una animación "sabe" moverse en un modelo que nunca vio

**[OFICIAL]**, documentación de Unity (`docs.unity3d.com/Manual/Retargeting.html`) y de la spec VRM Animation (`vrm.dev/en/vrma`):

1. Cada modelo declara un **Avatar** (en la jerga de Unity Mecanim) o un **mapa de huesos humanoides** (en la jerga VRM): una tabla que dice "mi hueso llamado `J_Bip_C_Spine` es, semánticamente, el `Spine`; mi hueso `J_Bip_L_UpperArm` es el `LeftUpperArm`", etc. Esto es lo único que un artista tiene que preparar una vez, por modelo.
2. Cualquier animación grabada contra el estándar (idle, saludo, salto — o, en VRM, un archivo `.vrma`) **no contiene rotaciones absolutas de "el hueso 37"**: contiene rotaciones expresadas en ese mismo vocabulario semántico (`LeftUpperArm gira 30° en X`).
3. En tiempo de ejecución, el motor traduce automáticamente: toma la rotación semántica de la animación y la aplica al hueso *real* que el modelo mapeó a ese nombre. Unity además normaliza a un "espacio de músculo" intermedio para amortiguar diferencias de proporciones; VRM/glTF puro es más simple (solo transforma rotaciones, ver §5.4), pero el principio — desacoplar animación de esqueleto concreto — es idéntico.
4. Resultado: una sola animación (o una librería entera — Warudo anuncia **500+ animaciones de reposo** incluidas) sirve para cualquier modelo que haya hecho el paso 1 correctamente, sea cual sea su altura, proporciones o topología de malla.

**Limitación conocida, no resuelta automáticamente [OBSERVADO], fuentes MocapOnline/MocapWork y literatura de retargeting en robótica (arXiv, 2603.22201 y 2603.11480):** cuando las proporciones del modelo de destino difieren mucho de las del origen de la animación (piernas mucho más cortas/largas, torso desproporcionado), aparecen artefactos clásicos — **pies que se deslizan o penetran el suelo** ("foot sliding"), autocolisión de extremidades, "flotación". La solución estándar en la industria es una **corrección de IK post-retargeting** que fija el pie al suelo mientras dura el contacto (bloqueo de pie), no algo que el retargeting básico resuelva por sí solo. Esto es relevante solo si Codetuver Avatar alguna vez importa animaciones externas (Mixamo, mocap) hechas para un esqueleto con proporciones muy distintas a un VRM chibi como Rabbit; para clips `.vrma` pensados específicamente para VRM, el problema es mucho menor porque ya se diseñan contra el rango de proporciones típico de VRM.

### 5.4 VRM Animation (`.vrma`) — el caso concreto que ya toca a este proyecto **[OFICIAL + CÓDIGO-ACTUAL]**

De `vrm.dev/en/vrma` (spec oficial del VRM Consortium):

- `.vrma` es una animación glTF estándar (mismo contenedor binario que `.glb`) más la extensión `VRMC_vrm_animation`, que anota **qué hueso humanoide corresponde a cada nodo animado del glTF**.
- **"El mismo archivo `.vrma` puede usarse con cualquier VRM"** — cita casi literal de la spec. Es la instancia más directa y ya verificada de este informe: en la sesión anterior de este proyecto se confirmó exactamente esto de forma empírica, cargando el mismo `test.vrma` (tomado del propio repo `pixiv/three-vrm`) tanto en Rabbit como potencialmente en Alicia Solid, sin ningún cambio por-modelo.
- Implementación de referencia para Three.js: **`@pixiv/three-vrm-animation`**, que expone `VRMAnimationLoaderPlugin` + `createVRMAnimationClip()` para producir un `THREE.AnimationClip` reproducible con el `THREE.AnimationMixer` estándar de Three.js — la misma librería (`three`) que ya es dependencia directa de Codetuver Avatar.
- **Estado actual en el repo [CÓDIGO-ACTUAL]:** `@pixiv/three-vrm-animation` **no está instalado** (`package.json` solo tiene `@pixiv/three-vrm` y `three`); ya existe un archivo `src/assets/animations/sample-pose.vrma` descargado en la sesión anterior, pero **sin ningún código que lo cargue o reproduza** — `VrmAvatar.vue` no tiene `AnimationMixer` ni lógica de reproducción de clips.
- Para retargeting cruzado desde **fuera** del ecosistema VRM (p. ej. animaciones de Mixamo en formato FBX, pensadas para el esqueleto "Mixamorig"), existe una librería de terceros ya publicada — `vrm-mixamo-retargeter` — que hace el mapeo de huesos Mixamo→VRM y el escalado por proporciones automáticamente; **no se evaluó su calidad ni mantenimiento en este informe** (fuera de alcance, sería un paso de una futura investigación de implementación).

## 6. Cómo leer la columna "Pose" a la luz de esta investigación

**[INFERENCIA — la conclusión de arquitectura más importante de este informe.]** El Editor de personaje actual del proyecto trata `Animación` y `Pose` como dos capacidades separadas, cada una con su propio motivo de "no soportado" (`personaje sin sistema de pose/huesos` vs. `el personaje solo tiene una animacion fija por estado de animo, no seleccionable`). La investigación de esta industria **no sostiene esa separación como dos sistemas técnicos distintos**:

- En **ningún** software revisado (VSeeFace, Warudo, VNyan, VRChat, three-vrm-animation) existe un "sistema de pose" separado de un "sistema de animación". Una pose estática **es**, técnicamamente, un clip de animación de un solo fotograma (o de duración muy corta con el mismo valor mantenido) sobre el mismo `AnimationMixer`/rig humanoide. Warudo llama a su librería completa "500+ **idle animations**" — no separa "poses" como categoría aparte; `.vrma` no tiene un modo "pose" distinto de un modo "animación", solo clips más largos o más cortos.
- La razón por la que hoy `Pose` y `Animación` están separadas en `character-editor.ts` **[CÓDIGO-ACTUAL]** parece ser una decisión de alcance declarado en un Hito anterior ("mismo alcance declarado en el Hito 4"), no una distinción técnica real de la industria.

**Recomendación de arquitectura, si el proyecto decide implementar esto (no es una decisión tomada, es lo que este informe recomienda evaluar):**

1. Instalar `@pixiv/three-vrm-animation` y añadir un `THREE.AnimationMixer` a `VrmAvatar.vue`, reproduciendo clips `.vrma` — esto resuelve `Animación` y `Pose` **a la vez**, con el mismo mecanismo (un "pose" es solo un clip corto o congelado).
2. Reusar el patrón ya validado de `vrm-expression-mapping.ts` (nombre estándar + fallback) pero para clips: cada estado de ánimo (`EDITABLE_STATES`) apunta a un nombre de clip; si el clip no existe para el personaje activo, no se reproduce nada (o se cae a un clip "idle" por defecto) — exactamente la misma filosofía de degradación aislada que ya rige el resto del proyecto (avatar, voz e intérprete nunca deben tumbar la sesión).
3. **No** es necesario, para esto, construir un receptor VMC Protocol ni soportar tracking en vivo — eso es una pieza completamente distinta (entrada de tracking en tiempo real desde una fuente externa) que no fue pedida y que este informe no recomienda para el alcance actual; se documenta aquí solo para que quede explícito que es una posible ampliación futura separada, no un prerrequisito.
4. Cualquier VRM del catálogo actual (Rabbit, Polydancer, Alicia Solid) ya declara el mapa de huesos humanoides completo — es un requisito del formato VRM, no algo que haya que verificar por separado —, así que un mismo `.vrma` (como el `sample-pose.vrma` ya descargado) debería reproducirse en los tres sin trabajo adicional por modelo. Esto **no se ha probado en código todavía** — es una predicción basada en el estándar, pendiente de verificación real si se decide implementar.

## 7. Qué queda explícitamente fuera de este informe

- No se evaluó calidad, precio actualizado, ni curva de aprendizaje real de ningún software — es investigación de estándares técnicos, no una guía de compra.
- No se instaló ni probó ningún software de terceros; todo lo etiquetado **[OBSERVADO]** depende de la exactitud de la fuente citada.
- No se investigó tracking corporal completo con trajes inerciales (Xsens, Perception Neuron) más allá de mencionar que Rokoko Studio exporta a BVH/FBX retargeteable — sería una segunda investigación si el proyecto decide soportar mocap corporal externo.
- No se investigó el ecosistema Live2D en profundidad comparable al 3D — se cubre solo como contraste conceptual (§4.2), porque Codetuver Avatar usa VRM/3D, no 2D.
- No se propuso ningún cambio de código ni de plan; la §6 es una recomendación para que la decida el usuario, no una implementación.

## 8. Fuentes consultadas (2026-08-30)

- VMC Protocol — especificación oficial: <https://protocol.vmc.info/english.html>
- VMC Protocol — implementación de referencia: <https://deepwiki.com/sh-akira/VirtualMotionCaptureProtocol>
- VSeeFace — manual oficial: <https://github.com/emilianavt/VSeeFaceManual>, <https://www.vseeface.icu/>
- VSeeFace SDK / formato VSFAvatar: <https://github.com/emilianavt/VSeeFaceSDK>
- Perfect Sync — VMagicMirror docs: <https://malaybaku.github.io/VMagicMirror/en/tips/perfect_sync/>
- ARKit 52 blendshapes: <https://arkit-face-blendshapes.com/>, <https://docs.readyplayer.me/ready-player-me/api-reference/avatars/morph-targets/apple-arkit>
- VTube Studio API: <https://github.com/DenchiSoft/VTubeStudio>
- Warudo — manual oficial: <https://docs.warudo.app/docs>
- VNyan: <https://suvidriel.itch.io/vnyan>
- 3tene: <https://3tene.com/en/>
- Animaze by FaceRig — manual oficial: <https://www.animaze.us/manual/appmanual/vrmimp>, <https://www.animaze.us/manual/gettingstarted2d/paramlist>
- Luppet / LuppetX: <https://luppet.jp/en/>, <https://luppet.jp/en/about/>
- Hitogata / lista comunitaria de software VTuber: <https://gist.github.com/emilianavt/cbf4d6de6f7fb01a42d4cce922795794>
- Wakaru: <https://steamcommunity.com/sharedfiles/filedetails/?id=1894691054>
- Kalidoface 3D / Kalidokit: <https://3d.kalidoface.com/>, <https://github.com/yeemachine/kalidokit>
- VRChat Avatars 3.0 — Animator/Expression Parameters: <https://creators.vrchat.com/avatars/animator-parameters/>, <https://wiki.vrchat.com/wiki/Animators>
- VUP: <https://store.steampowered.com/news/app/1207050/view/3091152381741795245>
- VRM Animation (`.vrma`) — spec oficial: <https://vrm.dev/en/vrma/>
- Retargeting Mixamo→VRM (librería de terceros): <https://github.com/saori-eth/vrm-mixamo-retargeter>
- Unity Mecanim — retargeting humanoide: <https://docs.unity3d.com/Manual/Retargeting.html>, <https://docs.unity3d.com/Manual/class-Avatar.html>
- Rokoko Studio — retargeting BVH/FBX: <https://www.cgchannel.com/2023/05/rokoko-studio-2-4-now-does-retargeting/>
- Foot sliding / artefactos de retargeting: MocapOnline (<https://mocaponline.com/blogs/mocap-news/animation-retargeting-guide>), literatura arXiv 2603.22201 y 2603.11480
- Live2D Cubism — parámetros y Animation Standards: <https://docs.live2d.com/en/cubism-editor-manual/palametorpalatte/>, <https://www.animaze.us/manual/gettingstarted2d/paramlist>

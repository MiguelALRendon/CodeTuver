---
id: ref-avatar-reacciones-voz
title: Avatar, reacciones y voz
type: reference
status: current
source: both
last_verified: 2026-09-06
symbols: [VrmAvatar.vue, avatar-animation-pool.ts, avatar-pose-timer.ts, character-editor.ts, procedural-animations.ts, vrm-clip-retarget.ts, CharacterEditor.vue, character-editor-storage.ts, character-editor-capability-cell.ts, vrm-scene.ts, PoseEditor.vue, vrma-pose-export.ts, animation-import.ts, animation_import.rs, AnimationTimelineEditor.vue, vrma-animation-export.ts, animation-keyframe-list.ts, App.vue, AvatarStage.vue, EditorModal.vue, avatar-transition.ts]
related: [ref-modelo-eventos, adr-0003, adr-0010, adr-0011, adr-0012, adr-0013, how-to-evaluar-avatar-y-licencia, how-to-evaluar-motor-de-voz, exp-guia-visual, research-avatar-and-tts, research-editores-3d-huesos-y-blending-animaciones, research-estandares-vtuber-animacion-rigging]
---

# Avatar, reacciones y voz

> **Estado: confirmado por FEAT-003 y FEAT-004 (Hitos 3 y 4 de `investigacion-previa`)** — ver `docs/research/avatar-and-tts.md`. Formato de avatar del catálogo: **VRM** (`@pixiv/three-vrm`, licencia CC0 confirmada en el candidato real evaluado). Motor de voz: **Web Speech API**, sin costo ni redistribución de asset. Sección "Sincronización de boca" abajo tiene una corrección real sobre lo que aquí se asumía.

La aplicación no se acopla a un único sistema de avatar ni a un único proveedor de voz. Ambos entran por una abstracción.

## Abstracción de avatar

```typescript
interface AvatarController {
  setState(state: AvatarState): void;
  setExpression(expression: AvatarExpression): void;
  speak(text: string): Promise<void>;
  stopSpeaking(): void;
}
```

**Estados iniciales:** `idle` · `thinking` · `reading` · `coding` · `executing` · `waiting_permission` · `success` · `error` · `confused` · `sleeping` · `speaking`

**Expresiones iniciales:** `neutral` · `happy` · `sad` · `surprised` · `confused` · `angry` · `tired` · `excited`

Reglas de la abstracción:

- El avatar se renderiza igual en una interfaz normal que dentro de una ventana transparente y flotante.
- **No puede asumir** que siempre existe un fondo opaco, un panel de actividad o una ventana con foco.
- Cambiar de avatar no obliga a tocar el motor de eventos, el chat, el TTS, la consola ni el sistema de presentación.

## Motor de personalidad y reacciones

Es una capa **separada**, entre los eventos y todo lo que se ve:

```text
Claude Events
      ↓
Personality / Reaction Engine
      ↓
Avatar + Voice + UI
```

Decide: expresión · animación · estado · si debe hablar · qué debería decir · prioridad de la reacción · si debe emitir notificación · si debe solicitar la atención del usuario · qué reacción usar en modo mascota.

Reglas vinculantes:

- **Reglas deterministas, no un modelo de IA.** Ver [ADR-0003](../adr/0003-reacciones-deterministas.md).
- **No modifica el razonamiento de Claude.**
- **Funciona igual en los tres modos.** El modo solo determina cómo se muestra cada reacción.
- **No toda acción produce reacción.** Quince lecturas de archivo no son quince frases; el avatar puede permanecer concentrado y decir una sola cosa. El detalle sigue en la consola.

## Definición de una reacción

```typescript
interface AvatarReactionDefinition {
  id: string;
  triggers: ClaudeEventType[];
  priority: number;
  durationMs?: number;
  expression?: AvatarExpression;
  state?: AvatarState;
  animation?: string;
  speechPolicy: "never" | "optional" | "recommended" | "required";
  cooldownMs?: number;
  interruptible: boolean;
  fallback?: string;
}
```

El motor implementa **prioridades, cooldowns, agrupación y deduplicación** para no volverse molesto. Las reacciones de atención llevan prioridad suficiente para que una petición pendiente se detecte incluso en modo mascota.

> **`durationMs` activado en el eje Resultado (Hito 4 de `specs/correcciones-qa-sesion-real/plan.md`, corrige el Hallazgo 2):** antes solo 2 entradas de todo el catálogo usaban `durationMs`; el eje "Resultado" (reacciones puntuales — "esto acaba de pasar", no un estado en curso) no lo usaba en ninguna de sus entradas con trigger real, así que una vez activada `resultado-operacion-exitosa` (prioridad 60) nada de menor prioridad podía reemplazarla — el avatar quedaba "pegado" en éxito/error el resto de la sesión. Ahora `resultado-operacion-exitosa`, `resultado-cambio-aplicado`, `resultado-error-recuperable`, `resultado-sesion-finalizada` y `mental-dormida` tienen `durationMs` (4000-5000ms): pasada esa ventana sin un evento de igual o mayor prioridad, `ReactionEngine.expireActiveReaction()` libera el estado activo y una reacción de menor prioridad vuelve a poder activarse.

> **El campo `animation` de arriba es el eje de presentación** (`PRESENTATION_REACTIONS`: `blink`, `breathe`, `head-tilt`, etc.), disparado por evento discreto. **No es** el pool de animaciones de cuerpo por estado que describe la sección siguiente — son dos conceptos distintos con el mismo nombre de campo por historia, ver `docs/adr/0011-animacion-cuerpo-en-capa-avatar.md`.

## Animaciones y pose de cuerpo por estado

**Implementado en el Hito 1 de `animaciones-editables` (2026-08-30):** el avatar reproduce movimiento de cuerpo real (huesos, no solo cara) mientras permanece en un estado — antes `VrmAvatar.vue` solo movía expresión y parpadeo.

Vive **en la capa de avatar, nunca en el motor de reacciones** (`docs/adr/0011-animacion-cuerpo-en-capa-avatar.md`, D1 de `specs/animaciones-editables/design.md`): el motor sigue emitiendo solo `state` (string), exactamente como antes. `StateAssignment` (`character-editor.ts`) declara, por estado, un `animations: string[]` (pool de fondo) y un `pose?: string` (pose puntual) — el Hito 1 construye el mecanismo de reproducción; el contenido de fábrica y el catálogo editable llegan en los hitos siguientes.

Dos módulos puros, sin DOM ni Three.js directo, resuelven la temporización:

- `src/avatar-animation-pool.ts` — dado el pool de animaciones del estado activo, elige una al azar distinta a la que suena, en bucle, y la cambia por otra del pool cada intervalo aleatorio (`ANIMATION_CHANGE_MIN_MS`–`ANIMATION_CHANGE_MAX_MS`). Un pool de un solo elemento no reintenta "cambiar a otra": la devuelve tal cual.
- `src/avatar-pose-timer.ts` — temporizador de dos fases (`idle`/`active`) que dispara la pose asignada cada intervalo aleatorio (`POSE_TRIGGER_MIN_MS`–`POSE_TRIGGER_MAX_MS`), la sostiene (`POSE_HOLD_MIN_MS`–`POSE_HOLD_MAX_MS`), y vuelve a `idle` (solo animaciones). Un estado sin pose asignada (`hasPose=false`) siempre cae a `idle`, nunca queda activo a medias.

`VrmAvatar.vue` conecta ambos dentro de su `tick()` ya existente, con un `THREE.AnimationMixer` nuevo (`mixer.update(delta)` junto a `vrm.update(delta)`) que reproduce **dos `AnimationAction` a la vez** (animación de fondo + pose): la combinación no choca porque cada clip autoría pistas sobre huesos distintos (cabeza/cuello vs. brazos/torso, `docs/adr/0012-combinacion-animacion-pose-sin-choque.md`, D4 de `design.md`). Si una pose sí comparte hueso con la animación de fondo, `needsAdditiveBlend()` lo detecta por intersección de nombres de pista y el clip de pose pasa por `THREE.AnimationUtils.makeClipAdditive()` (sobre un clon, para no mutar el clip cacheado) antes de reproducirse en modo aditivo — así suma su delta en vez de competir por el mismo valor.

Cambiar de estado corta ambas acciones activas y reinicia la selección del nuevo estado (`resetBodyAnimationState()`, disparado por un `watch` sobre `snapshot.state`). Un personaje sin animaciones/pose para un estado (pool vacío o carga de `.vrma` fallida) no reproduce nada — mismo patrón de degradación aislada ya usado para expresión/boca, sin banner visible: es una capacidad opcional, no un error de carga del modelo.

Carga de contenido `.vrma` vía `@pixiv/three-vrm-animation` (`VRMAnimationLoaderPlugin` + `createVRMAnimationClip`), cacheada por URL dentro de la instancia de `VrmAvatar.vue` activa — el caché se descarta en cada `swapModel` porque las pistas de un clip quedan atadas a los nodos del VRM que lo generó.

## Contenido de fábrica: 20 animaciones + 7 poses por mood

**Implementado en el Hito 2 de `animaciones-editables` (2026-08-30):** `src/procedural-animations.ts` autoría el contenido que el mecanismo del Hito 1 reproduce — 27 `THREE.AnimationClip` construidos en código (`D3` de `specs/animaciones-editables/design.md`), no descargados ni cargados desde `.vrma` externos. Cada pista usa el vocabulario estándar de huesos humanoides VRM (`head`, `neck`, `spine`, `chest`, `leftUpperArm`, etc. — `docs/research/estandares-vtuber-animacion-rigging.md` §5.3) como nombre de pista (`"<hueso>.quaternion"`), el mismo contrato que `boneNameFromTrackName` (Hito 1) ya asume.

Los pools se agrupan por **mood** (`avatar-face-presentation.ts`, `resolveMood`), no por cada uno de los 11 `EDITABLE_STATES` (D2 de `design.md`). Cada animación de fondo autoría pistas solo sobre `head`/`neck`/`spine` superior; cada pose solo sobre brazos/manos y, cuando aplica, una inclinación leve de `chest` — nunca `head`/`neck` directo (D4, huesos disjuntos por construcción, sin masking en tiempo real).

Cinco moods (`neutral`, `waiting`, `positive`, `negative`, `resting`) llevan **3 animaciones + 1 pose** cada uno:

| Mood | Estados que lo usan | Animaciones | Pose |
|---|---|---|---|
| `neutral` | `idle` | `neutral-animation-1..3` | `neutral-pose-1` |
| `waiting` | `waiting_permission`, `confused` | `waiting-animation-1..3` | `waiting-pose-1` |
| `positive` | `success` | `positive-animation-1..3` | `positive-pose-1` |
| `negative` | `error` | `negative-animation-1..3` | `negative-pose-1` |
| `resting` | `sleeping` | `resting-animation-1..3` | `resting-pose-1` |

El mood `active` agrupa **5 de los 11 estados** (`thinking`, `reading`, `coding`, `executing`, `speaking`) — más que cualquier otro mood — así que lleva un pool ampliado de **5 animaciones (A1-A5) + 2 poses (P1, P2)**, con cada estado usando una **ventana rotada de 3 animaciones sobre las 5** y una pose alternada, para que los cinco estados no se vean idénticos por defecto:

| Estado (mood `active`) | Animaciones (ventana de 3 sobre A1-A5) | Pose |
|---|---|---|
| `thinking` | A1, A2, A3 | P1 |
| `reading` | A2, A3, A4 | P2 |
| `coding` | A3, A4, A5 | P1 |
| `executing` | A4, A5, A1 | P2 |
| `speaking` | A5, A1, A2 | P1 |

`animationPoolForState(state)` y `poseForState(state)` (`procedural-animations.ts`) resuelven esta tabla; `defaultAssignmentsFor()` (`character-editor.ts`) las usa para poblar `StateAssignment.animations`/`.pose` por defecto de cada uno de los 11 `EDITABLE_STATES`, vía `resolveMood(state)` para los seis moods y la tabla de rotación explícita para los cinco estados de `active`. `capabilitiesForTestAvatar()` ya declara `animation`/`pose` como `supported: true` — las columnas dejaron de estar deshabilitadas para el personaje de prueba, ya no por falta de contenido ni de mecanismo (ambos resueltos, Hitos 1 y 2).

> **Traduccion de vocabulario (Hito 5 de `specs/correcciones-qa-sesion-real/plan.md`, corrige el Hallazgo 6):** el motor de reacciones real produce ~55 valores de `state` distintos (`reaction-catalog.ts`), pero solo 6 de los 11 `EDITABLE_STATES` coincidian por igualdad exacta de string — el resto nunca disparaba ninguna animacion/pose. `assignmentForState()`/`resolveActiveStateAssignment()` (`character-editor.ts`) ahora resuelven en 3 capas: coincidencia exacta → `REACTION_STATE_ALIASES` (tabla nueva, 24 entradas, solo estados con trigger real hoy) → fallback generico via `animationPoolForState`/`poseForState` (ya funciones totales sobre cualquier `state`). Ver detalle completo en `qa-sesion-real-hallazgos.md` Hallazgo 6.

## Editor de personaje: tabla de animaciones/pose por estado

**Implementado en el Hito 3 de `animaciones-editables` (2026-08-30):** `StateAssignment.animations: string[]` (pool por estado) y `StateAssignment.pose?: string` (una sola pose por estado, D8 de `design.md`) dejan de ser texto libre — `sanitizeAssignment()` (`character-editor.ts`) filtra ambos contra `PROCEDURAL_CLIPS_BY_ID` (`procedural-animations.ts`), así que un id que no resuelve contra el catálogo (de fábrica hoy, importado/creado en hitos futuros) nunca se cuela.

`character-editor-storage.ts` migra settings persistidas con el shape anterior a esta spec: si trae `animation` (singular) sin `animations`, se convierte a `animations: [ese valor]` al leer; si ambos coexisten, `animations` gana y el campo legado se descarta sin duplicar.

> **Migracion campo a campo (Hito 6 de `specs/correcciones-qa-sesion-real/plan.md`, corrige el Hallazgo 5):** la migracion de arriba no cubria el shape AUN mas viejo (anterior a que existieran animaciones/poses del todo): una entrada `{state, expression}` sin `animations` NI `pose` en absoluto. `fillMissingAnimationFields()` (`character-editor.ts`) completa esos campos especificos desde los defaults de fabrica cuando faltan, preservando cualquier campo ya personalizado — aplicado en `createCharacterEditorState()` y `resolveActiveStateAssignment()`.

`CharacterEditor.vue` reemplazó las dos celdas de texto libre deshabilitadas por:

| Columna | Antes | Ahora |
|---|---|---|
| Animación | `<input type="text" disabled>` | Lista de chips (una por animación asignada, con botón de quitar) + `<select>` para agregar del catálogo (`PROCEDURAL_CLIP_CATALOG`, `kind: 'animation'`), excluyendo lo ya asignado |
| Pose | `<input type="text" disabled>` | `<select>` de una sola elección sobre el catálogo (`kind: 'pose'`), con opción "(sin asignar)" |

> **DEPRECATED (Hito 5 de `specs/revision-ux-modos-presentacion/plan.md`, 2026-09-05):** la tabla de arriba describe el `<table class="character-editor__table">` original (una fila `<tr>` por estado, columnas fijas) — **ya no existe**. `CharacterEditor.vue` ahora renderiza un `<details class="character-editor__state-row">` colapsable por estado: el `<summary>` muestra el nombre del estado, el `<select>` de Expresión y el botón "Probar" (siempre visibles sin expandir); al expandir aparecen 3 secciones — **Animaciones** (los mismos chips+`<select>` de antes, más un botón "Nueva" al lado que abre `AnimationTimelineEditor` vacío y autoasigna el resultado a esa fila al guardar; cada chip gana botones "Ejecutar"/"Editar" además de "Quitar"), **Pose** (mismo `<select>` de antes para "Cambiar", más "Nueva" con el mismo patrón de autoasignación; si hay pose asignada, un botón "Editar"), y **Boca** (sin cambios). "Editar" (animación o pose) abre el editor correspondiente **en blanco**, no precargado con el contenido existente — no hay parser inverso de `.vrma` a keyframes editables (`design.md` D5b) — y al guardar **reemplaza** la entrada en el mismo lugar en vez de solo agregarla al catálogo.
>
> **Gap cerrado, solo para animaciones (H7 de `specs/revision-ux-sesion-real-3/plan.md`, 2026-09-06):** `clipToKeyframes()` (`vrma-animation-import.ts`) es el parser inverso que arriba se declaraba inexistente — recorre los `QuaternionKeyframeTrack` del clip real (ya retargeteado contra el VRM cargado, así que sus pistas usan el nombre del nodo raw real, ej. `"Head"`, no el hueso normalizado `"head"` — `boneNameFromRawNodeName()` en `vrm-clip-retarget.ts` traduce de vuelta) y produce `BoneKeyframe[]` planos. "Editar" una animación ahora abre `AnimationTimelineEditor` con sus keyframes reales precargados (AC-085); si el clip no se puede leer (pista no soportada o hueso fuera de los 10 que el editor modela), se informa el motivo y el editor no se abre — solo un botón "Cerrar" (AC-087). "Ejecutar" en un chip de animación ahora reproduce esa animación puntual en el avatar en vivo (canal `previewClipId`/`previewNonce`, `CharacterEditor → AvatarStage → VrmAvatar`), no la fila entera vía `testAssignment` — y sincroniza `animationPoolState.currentId` para que el ciclo de fondo no la pise al frame siguiente. **Pose sigue sin precarga** (D5b se mantiene ahí: mismo patrón, sin parser inverso escrito para poses todavía).

Las cuatro celdas condicionadas por capacidad (Expresión, Animación, Pose, Boca) comparten un único helper, `capabilityCellProps()` (`character-editor-capability-cell.ts`), que arma `disabled`/`aria-label`/`title` a partir de un `AxisCapability` — paga la deuda técnica que antes duplicaba ese mismo patrón 4 veces (`docs/TECH_DEBT.md`, "Celda de capacidad... duplicada 4 veces").

El botón "Probar" llama `previewAssignment()` (`avatarController.setState()` + `setExpression()` opcional) sin cambios de firma. `CharacterEditor.vue` y `AvatarStage.vue` comparten la misma instancia de `AvatarController`, así que ese `setState()` sí dispara el `watch` sobre `snapshot.state` interno de `VrmAvatar.vue` — pero **eso solo mueve el `AnimationMixer` si `VrmAvatar` ya venía recibiendo el pool/pose por props**. Hasta `animaciones-editables-correcciones` (ver más abajo), nada se los pasaba: el mecanismo de pools/pose del Hito 1 nunca sonaba fuera de las pruebas unitarias, ni con "Probar" ni con el motor de reacciones real.

> **Gap cerrado (integración post-Hito 3, 2026-08-30):** el contenido de fábrica del editor ahora se retargetea y reproduce de verdad, no solo se asigna en la UI. `VrmAvatar.vue` resuelve cada entrada de `animationPoolUrls`/`poseUrl` contra `PROCEDURAL_CLIPS_BY_ID` antes de tratarla como URL de `.vrma`: si el id existe en el catálogo, `src/vrm-clip-retarget.ts` (`retargetProceduralClip`) reconstruye cada `KeyframeTrack` genérico (`"head.quaternion"`) contra el nodo real del VRM activo vía `VRMHumanoid.getRawBoneNode()`, y el clip retargeteado se cachea con la key `procedural:${id}` (namespace separado de las URLs, mismo `clipCache` que ya se limpiaba en cada `swapModel`). Si el VRM activo no declara ninguno de los huesos que el clip toca, el clip se trata como no disponible — mismo camino de degradación silenciosa ya establecido (personaje sin animación/pose para ese estado). Si el id no está en el catálogo, sigue el camino de URL de `.vrma` sin cambios (Hito 4 e importados). `needsAdditiveBlend()` sigue operando correctamente porque recibe los nombres de pista ya retargeteados (nodos reales), tanto para la animación de fondo como para la pose.

> **Gap cerrado (wiring del avatar en vivo, `animaciones-editables-correcciones`, 2026-09-03):** una revisión de código posterior a los Hitos 1-6 encontró que, pese a lo anterior, **el avatar real nunca reproducía animaciones ni pose**: `AvatarStage.vue` (el único componente que renderiza `VrmAvatar.vue` en `App.vue`) nunca reenviaba `animationPoolUrls`/`poseUrl` — ninguna parte del proyecto lo hacía, `VrmAvatar.vue` era el único archivo que mencionaba esas dos props. El Hito 1 de `specs/animaciones-editables-correcciones/plan.md` cierra la cadena completa:
>
> - `App.vue` mantiene la configuración persistida del personaje activo (`loadCharacterEditorSettings`, recargada cuando cambia `activeCharacterId` o cuando `CharacterEditor.vue` emite `settings-saved` tras guardar) y resuelve, con `resolveActiveStateAssignment()` (`character-editor.ts`), el `StateAssignment` del estado actual del `AvatarController` compartido — el `computed` `activeStateAssignment`.
> - Sin configuración persistida (personaje nunca abierto en el Editor), `resolveActiveStateAssignment()` cae en `defaultCharacterEditorSettings(capabilities)` en vez de silencio: el avatar suena con el pool de fábrica desde el primer momento, igual que ya lo muestra el Editor de personaje.
> - `AvatarStage.vue` gana las props `animationPoolUrls`/`poseUrl`, reenviadas sin lógica a `VrmAvatar`. `App.vue` las pasa en sus dos puntos de render (modo `FULL` y modo `companion`) desde `activeStateAssignment`.
> - Con esto, tanto el motor de reacciones/chat (que solo mueve `state`) como el botón "Probar" (mismo `AvatarController` compartido) disparan el mecanismo real: el `watch` interno de `VrmAvatar.vue` ya tenía datos que mover.

## Editor de posado in-app

**Implementado en el Hito 5 de `animaciones-editables` (2026-08-30):** una tercera vía para poblar el catálogo (además de fábrica y `.vrma` importado) — posar el personaje activo a mano dentro de la app y guardarlo como pose.

`src/vrm-scene.ts` (nuevo) extrae `setupScene`/`loadModel` de `VrmAvatar.vue` sin cambiar su comportamiento (D6 de `design.md`): `setupVrmScene(canvas)` arma renderer/escena/cámara/reloj, `loadVrmModel(scene, url)` carga el `.vrm` y lo agrega a la escena. `VrmAvatar.vue` sigue creando su propio `THREE.AnimationMixer` sobre el VRM devuelto; el módulo compartido no sabe de mixers.

`src/components/PoseEditor.vue` (nuevo) monta su propia escena vía `vrm-scene.ts`, **sin** `AnimationMixer` corriendo (edición manual, no reproducción en vivo — razón descartada en D6: mezclar reproducción dirigida por el motor de reacciones con edición dirigida por mouse en el mismo componente). Por cada hueso del conjunto D4 (torso/brazos/cabeza: `head`, `neck`, `spine`, `chest`, `leftUpperArm`, `leftLowerArm`, `leftHand`, `rightUpperArm`, `rightLowerArm`, `rightHand` — `POSE_EDITOR_BONE_NAMES` en `vrma-pose-export.ts`), un selector permite elegir cuál mueve el `THREE.TransformControls` (modo `rotate`, ya incluido en `three@^0.185.1`, sin dependencia nueva) enganchado vía `vrm.humanoid.getRawBoneNode(nombre)` (reusando `resolveBoneNodeFromVrm` de `vrm-clip-retarget.ts`, Hito 3). Cada `objectChange` del gizmo registra el cuaternión actual del hueso seleccionado.

`src/vrma-pose-export.ts` (nuevo) serializa los huesos tocados como un `.vrma` de un solo fotograma — GLB (glTF binario) + extensión `VRMC_vrm_animation`, escrito a mano en vez de con `GLTFExporter` (`three/examples/jsm/exporters`) porque su ruta binaria depende de `FileReader`, ausente en el entorno de pruebas `node` del proyecto. La estructura se validó contra `src/assets/animations/sample-pose.vrma` (archivo real ya en el repo, Blender VRM Add-on): un nodo raíz `hips` en rotación identidad, con cada hueso tocado como hijo directo también en rotación identidad — así la corrección de espacio-mundo que aplica `VRMAnimationLoaderPlugin` al cargar (necesaria para resolver el padre de cada hueso declarado en `humanBones`) es un no-op, y el cuaternión exportado llega intacto al reproducirse. `exportPoseAsVrma()` filtra nombres de hueso no reconocidos, normaliza cuaterniones degenerados (magnitud ~0 o `NaN`) a identidad, y devuelve `null` si no queda ningún hueso válido (degradación silenciosa, mismo criterio que el resto del proyecto).

> **Limitación conocida, aceptada por alcance:** el cuaternión exportado es el del hueso *raw* (`getRawBoneNode`), no el del hueso *normalizado* (`getNormalizedBoneNode`) que usa el resto del pipeline VRM para retargeting entre modelos distintos — convertir uno a otro requeriría matrices de rest-pose que este hito no calcula. Para el mismo personaje que se posó (o uno con una T-pose muy similar) el resultado es correcto; la fidelidad entre modelos con rest-pose muy distinta queda como upgrade path, no como bug abierto.

Persistencia: `save_created_animation_file` (`src-tauri/src/animation_import.rs`, nuevo comando Tauri, hermano de `import_animation_file` del Hito 4 — mismo archivo, misma carpeta `imported-animations/{animation,pose}/`, misma validación de cabecera glTF) recibe bytes en memoria en vez de una ruta en disco y devuelve el mismo `ImportedAnimationSummary`. `saveCreatedAnimationFile()` (`src/animation-import.ts`) es la función hermana en TypeScript. El botón "Guardar como pose" (`PoseEditor.vue`) exporta, guarda, y emite el resumen; `CharacterEditor.vue` lo registra en el mismo catálogo module-level que ya alimenta a fábrica/importado (`registerImportedAnimation`, Hito 3/4) — al compartir carpeta y mecanismo de listado (`list_imported_animations`), lo creado sobrevive a un reinicio de la app sin código adicional, igual que lo importado. Como origen (importado vs. creado) no es distinguible una vez releído del disco, la UI etiqueta ambos por igual como "(guardado)".

Acceso: botón "Editor de posado" en `CharacterEditor.vue`, visible solo cuando el personaje activo es VRM (`modelUrl` no nulo) y `capabilities.pose.supported` — mismo criterio que ya oculta el resto de controles de pose para personajes importados sin renderizador real (Hito 3/4).

## Editor de animación con timeline in-app

**Implementado en el Hito 6 de `animaciones-editables` (2026-08-30):** una cuarta vía para poblar el catálogo — grabar una secuencia de varias posturas en el tiempo sobre uno o más huesos y guardarla como animación completa (`.vrma` multi-fotograma), no solo pose.

**Licencia (D7 de `design.md`, ya resuelta antes de este hito, no repetida aquí):** `@theatre/core` (Apache-2.0) es la única dependencia nueva; `@theatre/studio` (AGPL-3.0 explícito para ese paquete, verificado byte a byte en el `LICENSE` real del repo) nunca se instala. La UI de keyframes es propia, no la de Studio.

**Hallazgo técnico durante la implementación (no anticipado por `design.md`):** la API pública y estable de `@theatre/core` (`node_modules/@theatre/core/dist/index.d.ts`, verificado) no expone ninguna forma de autoriar keyframes/tracks de una secuencia de forma programática — esa capacidad es exclusiva de `@theatre/studio` (vía `studio.transaction()`) o de cargar un `state` con el formato interno `__UNSTABLE_Project_OnDiskState` ("INTERNAL and UNSTABLE — WILL break between minor versions", documentado así en el propio tipo). Reconstruir ese formato interno a mano para alimentar keyframes propios habría sido tan o más frágil que no usar Theatre en absoluto, y exactamente la clase de dependencia en una superficie no soportada que el resto del proyecto evita. Por eso `AnimationTimelineEditor.vue` divide el trabajo así: el **motor de interpolación real** es `THREE.AnimationMixer` + `THREE.QuaternionKeyframeTrack` (el mismo mecanismo del Hito 1, ya instalado, con SLERP correcto para cuaterniones sin los artefactos de gimbal-lock del tweening por eje XYZ que usa Theatre por defecto); `@theatre/core` se usa tal como D7 lo describe — cada hueso relevante envuelto como "sheet object" (`sheet.object(boneName, {rotation: {x,y,z}})`) — pero como capa de valor observable/legible (`obj.initialValue`/`obj.value`, el mismo patrón documentado por Theatre para consumidores externos), alimentada en cada scrub/tick por el resultado ya interpolado del mixer, y leída de vuelta para el pequeño indicador "Rotación actual (grados)" de la UI. Ningún dato de usuario pasa por la superficie no soportada de Theatre.

`src/vrma-animation-export.ts` (nuevo) extiende el formato de un solo fotograma de `vrma-pose-export.ts` (Hito 5) a N fotogramas por hueso: `buildBoneTracksGltfJson()`/`packGlb()` se generalizaron en `vrma-pose-export.ts` (mismo empaquetado GLB, ahora con un número arbitrario de muestras por hueso en vez de fijo en 2) y ambos módulos los reusan sin duplicar el binario — `exportPoseAsVrma()` no cambió de comportamiento (mismas pruebas del Hito 5 en verde sin tocarlas). `exportAnimationAsVrma()` agrupa los keyframes por hueso, los ordena por tiempo (tolera entrada fuera de orden), excluye huesos sin ningún keyframe, y sostiene un keyframe aislado como una pose de un fotograma (mismo `POSE_HOLD_DURATION_SECONDS` del Hito 5) — así un caso de un solo fotograma se comporta igual que el exportador de pose, sin una rama especial.

`src/animation-keyframe-list.ts` (nuevo, puro, sin Vue/DOM) resuelve agregar/quitar/listar keyframes: `upsertKeyframe()` reemplaza el keyframe existente del mismo hueso+tiempo en vez de duplicarlo y mantiene la lista ordenada por tiempo; `removeKeyframe()`/`keyframesForBone()` completan el CRUD que `AnimationTimelineEditor.vue` usa directamente.

`src/components/AnimationTimelineEditor.vue` (nuevo) reusa `vrm-scene.ts` (Hito 5) para la carga del modelo y el mismo patrón de gizmo de `PoseEditor.vue` (`TransformControls` + `OrbitControls` + `resolveBoneNodeFromVrm`, mismo `POSE_EDITOR_BONE_NAMES` como selector de hueso — ningún selector nuevo). Flujo: seleccionar hueso → ubicar el tiempo con un control numérico simple (no un timeline visual arrastrable, por diseño — D7/spec.md) → posar con el gizmo → "Agregar keyframe en el tiempo actual". "Previsualizar en bucle" reusa el mecanismo del Hito 1 (`THREE.LoopRepeat`) sobre el clip reconstruido de los keyframes actuales. "Guardar como animación" exporta, invoca `saveCreatedAnimationFile(bytes, 'animation', fileName)` (mismo comando Rust del Hito 4/5, `kind: 'animation'`) y registra el resultado en el mismo catálogo module-level (`registerImportedAnimation`), marcado "creado" igual que lo importado/posado.

> **Gap cerrado (rotacion del hueso seleccionado editable por input, no solo por gizmo — Hito 4 de `specs/revision-ux-modos-presentacion/plan.md`, 2026-09-05):** el unico campo relacionado a rotacion era `selectedBoneRotationDeg`, de solo lectura — el usuario reporto "modifique valores y no paso nada" porque no habia ningun campo que en verdad aceptara una escritura. `setBoneRotationAxis(axis, degrees)` (nueva) hace bidireccional el vinculo: los 3 inputs numericos (X/Y/Z, grados) del panel lateral ahora escriben el quaternion real del hueso seleccionado (mismo orden `'XYZ'` que ya usaba la lectura desde el gizmo), ademas de seguir reflejando el arrastre del gizmo como antes. El texto de ayuda del canvas se amplio para explicar ambas vias (arrastrar o escribir) y el flujo de captura de keyframes.

Acceso: botón "Editor de animación" en `CharacterEditor.vue`, junto al de posado, con el mismo patrón de accesibilidad ya corregido por `design-critic` en el Hito 5 (foco movido al panel al abrir y de vuelta al botón al cerrar, encabezado `<h3>` de sección, `aria-live` acotado solo al mensaje de error/estado) — no se repiten los mismos defectos. Ver la nota de overlay más abajo para cómo se maneja el foco/Escape desde `animaciones-editables-correcciones`.

> **Gap cerrado (overlay casi-pantalla-completa, `animaciones-editables-correcciones`, 2026-09-03):** el Editor de posado y el Editor de animación vivían en un panel angosto embebido dentro del formulario del Editor de personaje (`--size-vrm-canvas-large`, 16–28rem de canvas), desproporcionado a la cantidad de controles que exponen (gizmo 3D, selector de hueso, lista de keyframes, scrubbing). El Hito 2 de `specs/animaciones-editables-correcciones/plan.md` los mueve a un overlay que cubre ~92vw/88vh (`--size-overlay-panel-large`/`--size-overlay-panel-large-height`, `constants.css`):
>
> - `src/components/EditorModal.vue` (nuevo) extrae el patrón de `commands-overlay` que ya existía en `App.vue` (backdrop `position: fixed; inset: 0`, `role="dialog"` `aria-modal="true"`, guardar el foco al abrir y devolverlo al cerrar, mover el foco al primer control del panel, Escape cierra, trap de Tab dentro del panel) en vez de repetirlo por tercera y cuarta vez a mano. No requiere un `open`/`aria-expanded` en el botón que lo abre: el propio montaje/desmontaje del componente (`v-if` del padre) dispara `onMounted`/`onUnmounted`, que es donde vive toda la mecánica de foco.
> - `CharacterEditor.vue` envuelve `<PoseEditor>`/`<AnimationTimelineEditor>` con `<EditorModal :title="...">`; los botones "Editor de posado"/"Editor de animación" perdieron `aria-expanded`/`aria-controls` (patrón de disclosure widget) porque ahora abren un diálogo modal, no un panel inline — el nombre accesible del diálogo (`aria-label` del `role="dialog"`) ya lo cubre.
> - `PoseEditor.vue`/`AnimationTimelineEditor.vue` dejaron de fijar el canvas a `--size-vrm-canvas-large`: ahora es `width: 100%; height: 100%` dentro de un contenedor `flex: 1` que hereda el espacio del panel modal. En `AnimationTimelineEditor.vue`, la lista de keyframes/controles debajo del canvas quedó en su propio bloque `flex: 1 1 0; overflow-y: auto` para que una lista larga de keyframes no empuje el canvas fuera de vista.
> - El botón "Cerrar" que cada editor ya traía dentro (`PoseEditor.vue`/`AnimationTimelineEditor.vue`, emiten `close`) sigue siendo el único botón de cerrar visible — `EditorModal.vue` no agrega uno propio para no duplicarlo; Escape y ese botón terminan en el mismo manejador (`closePoseEditor`/`closeTimelineEditor`).
>
> **Gap cerrado (modal invisible si su ancestro colapsa — Hito 4 de `specs/revision-ux-modos-presentacion/plan.md`, 2026-09-05):** `EditorModal.vue` nunca usó `<Teleport>` desde su creación — se renderizaba en su posición natural del DOM, dentro del `<details class="character-editor">` colapsable de Modo Compañera. Si ese `<details>` se cierra mientras el modal sigue conceptualmente abierto (su `v-if` es independiente del estado del `<details>`), la UA aplica `display:none` a todo el contenido no-`<summary>` — y eso anula el `position:fixed` del modal (colapsa a 0×0) aunque el componente siga montado y funcionando por debajo. Confirmado en vivo durante la verificación del Hito 4: los 3 inputs de rotación nuevos escribían el quaternion real del hueso correctamente mientras el modal era, a la vez, visualmente invisible. Fix: `<Teleport to="body">` envolviendo el `<div class="editor-modal">` raíz — patrón nativo de Vue para overlays que no deben depender del árbol de layout de su punto de montaje.

> **Gap cerrado (roundtrip real exportar → reproducir, `animaciones-editables-correcciones`, 2026-09-03):** una prueba funcional end-to-end (crear una animación multi-hueso en el Editor de animación, exportarla, aplicarla como pool de un estado real, verificarla en loop) descubrió dos bugs del roundtrip `.vrma`, ninguno detectado antes porque ningún guantelete anterior lo había ejercitado sobre un VRM cargado de verdad:
>
> - **`hips` ausente en `humanBones` del `.vrma` exportado** (`vrma-pose-export.ts`, usado también por `vrma-animation-export.ts`): `buildBoneTracksGltfJson()` declaraba `hips` como nodo pero nunca lo agregaba a `humanBones`; `VRMAnimationLoaderPlugin._parseAnimation` necesita esa entrada para fijar `worldMatrixMap.hipsParent`, la referencia de la que depende `.decompose()` para resolver *cualquier* hueso. Sin ella, aplicar cualquier animación/pose recién exportada crasheaba (`TypeError: Cannot read properties of undefined (reading 'decompose')`). Fix: `humanBones` siempre declara `hips: { node: 0 }`.
> - **Animaciones `.vrma` cargadas no se movían, sin error:** `createVRMAnimationClip()` (`@pixiv/three-vrm-animation`, usada en `loadVrmaClip()` de `VrmAvatar.vue`) nombra sus pistas contra nodos *normalizados* del humanoid; el `AnimationMixer` de `VrmAvatar.vue` está enraizado en `vrm.scene`, que solo contiene huesos *raw* — el `PropertyBinding` por nombre fallaba en silencio. Fix: `resolveRawBoneNodeFromNormalizedNodeName(vrm)` (nueva, `vrm-clip-retarget.ts`) traduce nodo-normalizado → hueso raw; `loadVrmaClip()` retargetea el clip con la función genérica ya existente `retargetProceduralClip()` antes de cachearlo.

> **Gap cerrado (dope-sheet real para el Editor de animación, `animaciones-editables-correcciones`, 2026-09-03):** el diseño original (D7 de `animaciones-editables/design.md`) eligió deliberadamente una UI tipo formulario (select de hueso + input numérico de tiempo) para evitar reconstruir un dope-sheet arrastrable. Pedido explícito del usuario tras usarlo en vivo — timeline visual con marcadores de keyframe arrastrables, sin número fijo de keyframes predeterminado, controles secundarios ocultables en menús/paneles, todo arriba mover al personaje, todo abajo la línea de tiempo — reabrió esa decisión. Investigado el patrón estándar de dope-sheet (Blender/Maya/After Effects: columna de canales + track horizontal por canal + regla+playhead compartidos) y aplicado: `AnimationTimelineEditor.vue` es ahora un CSS Grid con una fila por hueso de `POSE_EDITOR_BONE_NAMES`, click-en-track agrega keyframe capturando la rotación actual, arrastre de marcador retemporiza, panel lateral ocultable con tabla accesible de respaldo por teclado. Bug de CSS Grid encontrado y corregido en el camino: un item con `grid-row: 1/-1` (el playhead) como primer hijo interfería con el auto-placement de los `<template v-for>` siguientes — se extrajo a un overlay posicionado absoluto fuera del grid.

> **Gap cerrado (blending aditivo de pose anulaba huesos no relacionados, `animaciones-editables-correcciones`, 2026-09-03):** `ensurePoseAction()` (`VrmAvatar.vue`) llama `THREE.AnimationUtils.makeClipAdditive()` cuando la pose comparte hueso con la animación de fondo (`needsAdditiveBlend`, D4/ADR-0012). Sin `referenceClip` explícito, la función resta el frame 0 *del propio clip* — y como `exportPoseAsVrma()` siempre exporta 2 muestras idénticas por hueso (pose sostenida, no interpolada), el delta resultante es identidad en **todos** los huesos del clip, no solo el compartido. Invisible con el catálogo de fábrica (que separa deliberadamente animación de pose sin solape de huesos) pero real para cualquier pose creada en el Editor de posado que toque `head`/`neck` (el editor no lo restringe). Fix: `identityReferenceClip(clip)` (nueva, `VrmAvatar.vue`) construye un clip de referencia en identidad por cada pista; `makeClipAdditive(clip.clone(), 0, identityReferenceClip(clip))` preserva la rotación completa de la pose como delta aditivo.

> **Gap cerrado (T-pose visible la mayoría del tiempo por defecto, `animaciones-editables-correcciones`, 2026-09-03):** dos causas independientes hacían que el personaje se viera en el bind T-pose del VRM sin corregir casi todo el tiempo:
>
> - **Duty-cycle del temporizador de pose invertido** (`avatar-pose-timer.ts`): `POSE_TRIGGER_MIN/MAX_MS` (8-20s de espera) + `POSE_HOLD_MIN/MAX_MS` (2.5-5s sostenida) dejaban la pose activa solo ~15-30% del tiempo; el resto, sin corrección de brazos (las animaciones de fondo nunca los tocan, D4). Fix: invertido a `TRIGGER` 1.5-4s / `HOLD` 18-35s, para que la pose (brazos corregidos) domine el ciclo.
> - **Signo de rotación invertido en los 7 poses de fábrica:** el catálogo original asumía la convención genérica VRM ("~70° de roll para bajar el brazo") sin verificarla en vivo contra este modelo. Verificado empíricamente en el Editor de posado (lectura de posición mundial de la mano mientras se barrían los 3 ejes uno a la vez, `__debugBoneWorldPosition`, hook temporal): en el rig raw de Alicia Solid, Z positivo baja el brazo izquierdo y *sube* el derecho — con magnitudes de solo ~20° y signo mixto en el catálogo original, varios brazos subían en vez de bajar. Los 7 poses (`neutral-pose-1`, `waiting-pose-1`, `positive-pose-1`, `negative-pose-1`, `resting-pose-1`, `active-pose-1`, `active-pose-2`) se reescribieron con el signo correcto, usando los 8 huesos disponibles para pose (antes 4-5) para variedad de cuerpo completo dentro de lo que el editor soporta.
>
> **Limitación de cobertura confirmada** (pedido explícito del usuario, comparado contra el vocabulario humanoide VRM completo — `VRMHumanBoneName`, `@pixiv/three-vrm-core`, 55 huesos): `POSE_EDITOR_BONE_NAMES` expone 10. Fuera de alcance de edición en la app: `leftShoulder`/`rightShoulder` (clavícula — relevante para el asentamiento natural del hombro, confirmado durante el ajuste empírico de esta sección), los 30 huesos individuales de dedos (solo `leftHand`/`rightHand` de muñeca), `upperChest`, piernas/`hips`. No es un bug — es el alcance D4/D6 original (torso/brazos/cabeza); expandirlo es una decisión de alcance propia, no tomada aquí.

> **Interpolacion entre clips (Hito 3 de `specs/revision-ux-modos-presentacion/plan.md`, 2026-09-05):** `ensureAnimationAction()`/`ensurePoseAction()` (`VrmAvatar.vue`) ya no cortan la accion anterior en seco al cambiar de clip — usan `THREE.AnimationAction.crossFadeTo()` nativo (helper `crossFadeOrStop()`) con una duracion configurable (`transitionDurationMs`, campo de `StateAssignment`, control global "Transicion (ms)" en `CharacterEditor.vue`). En este Hito el alcance real era distinto del que el nombre sugiere a primera vista: solo suavizaba la rotacion del POOL de animacion de fondo dentro de un mismo estado y una reasignacion de pose sin cambio de estado — el reset completo por CAMBIO DE ESTADO seguia siendo instantaneo a proposito.
>
> **Corregido (H6 de `specs/revision-ux-sesion-real-3/plan.md`, 2026-09-06):** la limitacion de arriba resulto ser la causa raiz de un fallo real reportado por el usuario ("todo cambio de pose o animacion debe ser un movimiento continuo, incluido el que viene de un cambio de estado"). `resetBodyAnimationState()` ya NO llama `stopBodyActions()`: la accion saliente sigue viva como `previousAction` para que `crossFadeOrStop` la reciba real (antes siempre recibia `null`, de ahi el corte seco). `ensurePoseAction()` cambio su guardia de `poseAction !== null` a comparacion por URL (`playingPoseUrl`, nuevo espejo de `playingAnimationUrl`), permitiendo fundir tambien un cambio de pose dentro del mismo estado. `DEFAULT_TRANSITION_DURATION_MS` subio de 300 a 750 (pedido literal del usuario). Verificado en vivo con `__debugAvatarState()`: el peso de la accion entrante sube medible tras un cambio de estado real, y con duracion 0 el corte sigue siendo instantaneo. **Brechas declaradas, no verificadas en vivo en esta correccion:** crossfade pose-a-pose especifico, acumulacion de rotacion entre 2 poses aditivas simultaneas (riesgo marcado, no confirmado como bug), interpolacion en modo mascota (confirmado solo por lectura de codigo).

> **Gap cerrado (T-pose visible en cada reset, distinto del gap de duty-cycle ya cerrado arriba — Hito 1 de `specs/revision-ux-modos-presentacion/plan.md`, 2026-09-05):** el gap de `animaciones-editables-correcciones` (nota anterior) corrigió el *duty-cycle* del temporizador (TRIGGER 1.5-4s / HOLD 18-35s) para que la pose dominara el ciclo — pero no eliminó la ventana TRIGGER en sí: **cualquier reset de `resetBodyAnimationState()`** (montaje inicial, cambio de estado real vía el `watch` sobre `snapshot.state`, o el botón "Probar" del editor, que dispara `setState()` sobre la misma instancia compartida de `AvatarController`) crea un `poseTimerState` nuevo en fase `idle`, y `ensurePoseAction()` solo se invocaba desde `updateBodyAnimation()` cuando el timer ya estaba en fase `active` — así que el personaje se veía en bind T-pose del VRM durante toda la ventana TRIGGER tras cada uno de esos tres eventos, sin importar qué tan corta fuera esa ventana. Fix: `resetBodyAnimationState()` llama `ensurePoseAction(props.poseUrl)` de inmediato (si hay pose asignada), sin esperar a que el temporizador pase a `active`. `avatar-pose-timer.ts` no cambió — sigue gobernando su propio ciclo idle/active, pero dejó de ser la única vía para que la pose exista visualmente; `ensurePoseAction()` ya era idempotente, así que no hay doble disparo cuando el timer luego pasa a `active` por su cuenta.

> **Gap cerrado ("(sin asignar)" de Pose ahora se respeta de verdad — Hito 19 de `specs/revision-ux-modos-presentacion/plan.md`, 2026-09-05, hallazgo encontrado durante la verificacion en vivo del Hito 1):** `StateAssignment` (`character-editor.ts`) gana `poseCleared?: boolean`, distinto de que el campo `pose` simplemente sea `undefined`. Antes, `fillMissingAnimationFields()` no podia distinguir "esta entrada nunca se personalizo" (dato legado pre-migracion, Hallazgo 5 de `correcciones-qa-sesion-real`, debe caer al default de fabrica) de "el usuario acaba de elegir (sin asignar) en el editor actual" (debe quedarse sin pose) — ambos casos colapsaban al mismo `undefined`. `setPose()` (`CharacterEditor.vue`) ahora marca `poseCleared: true` cuando el valor elegido es vacio, y lo limpia al asignar un pose real; `sanitizeAssignment()` preserva el flag; `fillMissingAnimationFields()` solo rellena con el default de fabrica cuando el campo esta vacio **y** no fue vaciado a proposito. Acotado a Pose: el comentario ya existente sobre `animations` (un array vacio nunca cuenta como silencio deliberado) sigue siendo una decision de diseño intencional, no tocada aqui.

## Catálogo de reacciones

No basta con `idle`, `thinking`, `happy` y `error`. El catálogo se clasifica en cinco ejes.

**Estado mental** — neutral · concentrada · pensativa · analizando · confundida · dudosa · sorprendida · alarmada · preocupada · cansada · aliviada · satisfecha · entusiasmada · orgullosa · curiosa · impaciente · esperando · dormida · despertando.

**Actividad técnica** — leyendo archivos · explorando el proyecto · buscando referencias · analizando dependencias · planificando · escribiendo código · modificando código · eliminando código · ejecutando comandos · ejecutando pruebas · compilando · instalando dependencias · revisando errores · comparando cambios · generando un diff · esperando una herramienta · esperando permisos · reintentando · recuperándose de un error.

**Resultado** — operación exitosa · pruebas exitosas · compilación exitosa · cambio aplicado · advertencia · error recuperable · error grave · comando rechazado · permiso concedido · permiso denegado · sesión cancelada · sesión finalizada · resultado parcial · resultado ambiguo.

**Interacción con el usuario** — recibiendo instrucción · no entendió la instrucción · necesita aclaración · esperando respuesta · mostrando opciones · recibiendo una respuesta · agradeciendo · confirmando una decisión · advirtiendo sobre un riesgo · pidiendo permiso · celebrando una solución.

**Presentación** — parpadeo · respiración · movimiento leve de cabeza · mirada hacia el panel de actividad · mirada hacia el chat · señalar una tarjeta · sacar una notificación · icono de alerta · icono de éxito · cambiar iluminación · cambiar fondo · partículas sutiles · efecto de escritura · efecto de carga · transición de escena · señal de atención en modo mascota · burbuja de interacción pendiente · animar sin robar el foco · reaccionar al clic que restaura la interfaz.

## Matriz avatar-reacción

Tras FEAT-003, se cruza el catálogo con lo que el avatar elegido **realmente puede hacer**:

| Reacción | Expresión facial | Ojos | Boca | Pose | Partículas | Voz | Disponible | ¿En modo mascota? |
|---|---|---|---|---|---|---|---|---|
| Pensando | Sí | Sí | No | No | No | Opcional | Sí | |
| Error | Sí | Sí | Sí | Opcional | Sí | Opcional | Parcial | |
| Esperando permiso | Sí | Sí | Sí | Sí | No | Recomendado | Sí | |
| Éxito | Sí | Sí | Sí | Sí | Sí | Opcional | Sí | |

*(Las cuatro filas son el ejemplo del propietario del proyecto. La matriz completa es entregable de FEAT-003.)*

**Si una reacción no es compatible con el avatar, se define un fallback visual. No se diseñan reacciones que el sistema no pueda ejecutar.**

## Voz

```typescript
interface TextToSpeech {
  speak(text: string): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
}
```

Controles obligatorios: activar y desactivar · volumen · velocidad · voz seleccionable · cola de reproducción · cancelación.

> **Investigación real de voces (Hito 14 de `specs/revision-ux-sesion-real-3/plan.md`, 2026-09-06, ver ADR-0013).** En la máquina de referencia, `speechSynthesis.getVoices()` solo expone 2 voces, ambas SAPI clásicas en español (Mexico): "Microsoft Raul" (por omisión) y "Microsoft Sabina" — ninguna voz neuronal de Microsoft, ninguna de estilo anime. `buildUtterance()` (`text-to-speech.ts`) nunca fija `SpeechSynthesisUtterance.pitch`, pese a estar disponible en la misma API ya en uso — su efecto audible con estas 2 voces no está confirmado, queda pendiente de un hito de implementación separado. VOICEVOX (motor local japonés, API HTTP en `localhost:50021`) se evaluó como técnicamente viable pero descartado por ahora: el proyecto, instalador y voces están enteramente en japonés, contra una app que lee respuestas en español.

> **Gap cerrado (la respuesta del chat ahora se lee en voz alta — Hito 6 de `specs/revision-ux-modos-presentacion/plan.md`, 2026-09-05):** antes de este hito, el texto de la respuesta del asistente nunca llegaba a `speak()` — ninguna entrada del catálogo tenía trigger `assistant_message`, y ese evento solo alimentaba el buffer de streaming del chat. `chat.ts`/Rust no ganaron lógica nueva: `App.vue::handleIncomingEvent` sintetiza un evento `assistant_turn_complete` (nuevo miembro de `NormalizedEvent`, **nunca construido por Rust**, solo por el frontend) al detectar que `session_finished` cierra un turno que tenía contenido (`blocksToMarkdownText` sobre los bloques ya ensamblados). `reaction-catalog.ts` gana la entrada `respuesta-hablada` (`speechPolicy:'recommended'`, sin `state`/`expression` — solo dispara habla), con `phrase` **dinámico**: el único miembro del catálogo cuyo campo `phrase` es una función `(event) => string` en vez de un string literal fijo — `AvatarReactionDefinition.phrase` se ensanchó para aceptar ambas formas. `ReactionEngine.emit()` sigue siendo el único punto que llama `speak()` (R7 intacto, verificado por grep): `handleEvent→activate→emit→speakIfAuthorized` ahora encadenan el `event` para resolver el `phrase` dinámico en el último eslabón.
>
> **Comportamiento real confirmado por prueba unitaria:** si dos turnos del asistente cierran con menos de `DEFAULT_GROUPING_WINDOW_MS` (2500ms) de diferencia, el segundo `respuesta-hablada` se **suprime** — mismo mecanismo `isSuppressed`/ventana de agrupación que ya protege a cualquier otra reacción del catálogo contra ráfagas, aplicado aquí por primera vez a una reacción de voz con contenido dinámico. Con más de 2.5s de separación (el caso normal de uso, dado que cada turno completo toma varios segundos), ambas respuestas se leen en orden.

Reglas vinculantes:

- **La voz es opcional.**
- **Claude no lee toda la actividad técnica.** La consola puede mostrarlo todo; la voz habla solo cuando el motor de personalidad considera que algo merece comunicarse.
- **De lo que sí se habla, la voz omite código y resume tablas (Hito 13 de `revision-ux-sesion-real-3`, 2026-09-06).** `blocksToSpeechText` (`content-block-text.ts`, función pura hermana de `blocksToMarkdownText`) filtra bloques `code`/`command`/`diff`/`ascii_art`/`file_reference` por completo (sin dejar hueco, la prosa alrededor queda continua) y reemplaza una `table` por una mención breve ("Hay una tabla."); `paragraph`/`plain_text`/`heading`/`warning`/`error` se hablan tal cual. `blocksToMarkdownText` (que sí serializa todo, código incluido) sigue siendo la función correcta para la vista de texto de la consola de actividad — son dos serializaciones con propósitos distintos, no una reemplaza a la otra.
- **En modo mascota la voz es configurable y no se activa de forma intrusiva** salvo que la persona lo haya permitido.
- El TTS no puede bloquear la sesión, y una frase debe poder cancelarse.

## Sincronización de boca

> **Corrección confirmada por FEAT-004:** la Web Speech API (motor de voz elegido, sin costo ni licencia de redistribución) **no expone amplitud de audio real** — no hay forma de conectar el habla sintetizada a un `AnalyserNode` de Web Audio, porque el motor de síntesis vive fuera de ese grafo. La implementación inicial usa el evento `boundary` (marca de tiempo por palabra) como aproximación de movimiento de boca, no amplitud real. Sustituir esto por amplitud real requeriría un motor que entregue un buffer de audio propio (TTS local tipo Piper, o TTS remoto) — queda como upgrade path documentado, no como implementación actual. Ver `docs/research/avatar-and-tts.md` §"Sincronización de boca".

Implementación inicial por **eventos de límite de palabra** (`boundary`), con la interfaz diseñada para sustituirlo más adelante por amplitud real, fonemas o visemas sin rehacer el resto.

- No se mezcla con el motor de Claude.
- Debe seguir funcionando con el avatar en ventana transparente, siempre que el renderizador y el sistema operativo lo permitan.

**Implementado en el Hito 7 de `presencia-vtuber` (2026-08-28):**

```typescript
interface MouthSyncSource {
  onBoundary(callback: () => void): () => void;
  onSpeechEnd(callback: () => void): () => void;
}
```

`MouthSyncController` (`src/mouth-sync.ts`) consume esa fuente y expone un estado reactivo `mouthOpen: boolean` — cada `onBoundary` abre la boca y arma un temporizador de 180ms que la cierra si no llega otro `boundary`; `onSpeechEnd` la cierra siempre (fin normal, error o cancelación). Boolean, no 0-1: `boundary` es un pulso discreto por palabra, no una medida continua — el mismo shape de interfaz seguiría sirviendo para un `onBoundary` disparado por umbral de amplitud.

`WebSpeechTextToSpeech` (`src/text-to-speech.ts`) es la única implementación real de `MouthSyncSource` hoy: conecta `utterance.onboundary` y notifica `onSpeechEnd` desde `finishCurrent()` y `stop()`, sin que el motor de eventos ni el resto de la capa de voz sepan de sincronización de boca (verificado por REV-20, ver `flujo_projects/codetuver-avatar/04_pruebas/evidencia/REV-20-mitad-presencia-vtuber.md`). Vía de sustitución futura: un motor con buffer de audio propio implementaría `MouthSyncSource` mapeando amplitud sobre umbral a `onBoundary`, sin tocar `MouthSyncController` ni los componentes de presentación.

Sin dependencia de foco de ventana ni de fondo opaco (mismo principio que el Hito 1): el mecanismo solo depende de que el renderizador siga entregando frames en la ventana transparente, condición ya declarada por el propio contrato de este documento.

Personaje sin control de boca (`EditorCapabilities.mouth.supported === false`): el consumidor fuerza `mouthOpen = false` en vez de heredar el binario de `isSpeaking`, sin lanzar error — la boca queda fija.

# Deuda técnica — ledger

Hallazgos de deuda técnica detectados durante la implementación. Informativo — no bloquea el guantelete salvo que un plan lo declare explícitamente.

## `Command::new("claude")` + `.current_dir()` producia `os error 267` en Windows — RESUELTO

- **Donde:** `src-tauri/src/claude_transport.rs`, `spawn_claude()`. Corregido en el Hito 1 de `specs/correcciones-qa-sesion-real/plan.md` (Hallazgo 10 de `docs/reference/qa-sesion-real-hallazgos.md`).
- **Que se encontro:** un nombre de programa relativo (`Command::new("claude")`, resuelto via `PATH`) combinado con `.current_dir(cwd)` en la misma cadena de builder es una combinacion ambigua/no confiable en Windows sobre `std::process`/`tokio::process` — la resolucion del ejecutable puede interactuar mal con el nuevo directorio de trabajo del hijo. Produjo `os error 267` (`ERROR_DIRECTORY`) al arrancar una sesion real, de forma reproducible.
- **Correccion aplicada:** `resolve_claude_executable()` busca la ruta absoluta de `claude`/`claude.exe`/`claude.cmd` recorriendo `PATH` a mano (stdlib, sin dependencia nueva), cacheada en un `OnceLock`; `spawn_claude()` usa esa ruta absoluta en `Command::new(..)` en vez del nombre relativo. Verificado en vivo dos veces (dos carpetas de trabajo reales distintas): el proceso real `claude.exe` arranca, se mantiene vivo, y emite eventos reales — sin `os error 267`.
- **Nota para el futuro:** si se vuelve a escribir un `Command::new(<nombre-relativo>)` en este crate que tambien use `.current_dir()`, se reintroduce el mismo bug. Preferir siempre resolver la ruta absoluta primero cuando ambas cosas coinciden en la misma llamada.
- **¿Se paga ahora?** Si — ya corregido, este entry queda como nota preventiva, no como deuda pendiente.

## `tauri::test::mock_builder()` no arranca en este entorno (Windows, Tauri 2.11.5)

- **Dónde:** `src-tauri/src/claude_transport.rs`, Hito 1 de `specs/nucleo-sesion/plan.md` (EPIC-002, FEAT-006).
- **Qué se encontró:** al agregar `tauri = { version = "2", features = ["test"] }` como dev-dependency para probar los comandos Tauri (`#[tauri::command]`) con `State`/`AppHandle` reales vía `tauri::test::mock_builder()`, **cualquier** binario de test de este crate (incluso una prueba trivial sin relación con Tauri) falla al arrancar con `STATUS_ENTRYPOINT_NOT_FOUND` (`0xc0000139`). Reproducido de forma aislada: persiste con `cargo clean` + build limpio, y con `WebView2Loader.dll` copiado manualmente al lado del binario de test (`target/debug/deps/`) — no es un problema de esa DLL en particular.
- **Impacto:** no se puede usar `tauri::test` para probar la lógica que vive directamente en los `#[tauri::command]` (la parte que necesita `AppHandle`) en este entorno. No bloquea nada — la lógica de estado real (que es lo que vale la pena probar) se extrajo a funciones que reciben `&ClaudeSessionState` en vez de `State<'_, ClaudeSessionState>`, sin necesitar `AppHandle` en absoluto, y esas sí se prueban con `#[tokio::test]` normal. Ver `claude_transport.rs`: `check_active_then_spawn`, `write_line`, `close_session_internal`.
- **Remediación si algún día hace falta `tauri::test` de verdad:** investigar en un entorno limpio (otra máquina, o una imagen CI) si el mismo `STATUS_ENTRYPOINT_NOT_FOUND` ocurre — podría ser específico de este equipo (versión de WebView2 Runtime instalada, o interacción con el `crate-type = ["staticlib", "cdylib", "rlib"]` del proyecto).
- **Esfuerzo:** medio (requiere un entorno distinto para aislar la causa real).
- **¿Se paga ahora?** No — el patrón de extraer la lógica testeable sin `AppHandle` ya resuelve la necesidad real de cobertura sin depender de esto.

## `theme-check` no escanea archivos `.vue`

- **Dónde:** `.claude/flujo-hooks/style-check.ps1`, detectado en el Hito 5 de `specs/nucleo-sesion/plan.md` al escribir la primera UI real (`src/App.vue`).
- **Qué se encontró:** el hook solo busca `Get-ChildItem -Include *.css, *.scss` — nunca escanea los bloques `<style>` dentro de archivos `.vue`, pese a que Vue es el framework de UI del proyecto y `flujo.json` declara `.vue` como extensión de código. Un valor quemado dentro de un `<style scoped>` de un componente Vue no lo detectaría el guantelete hoy.
- **Impacto:** el gate `theme-check` (`blocking: hard`) da una falsa sensación de cobertura total — solo cubre `constants.css` y otros `.css`/`.scss` sueltos, no los componentes Vue donde realmente se usan los tokens. Mitigado manualmente en el Hito 5 (revisión humana + auditoría de `design-critic`), no por la herramienta.
- **Remediación:** extender `style-check.ps1` para extraer y escanear el contenido de `<style>`/`<style scoped>` dentro de `*.vue` (regex o parser simple), con las mismas exenciones que ya aplica a CSS.
- **Esfuerzo:** bajo-medio.
- **¿Se paga ahora?** No — no lo pide ningún paso de este Hito; se registra para que no se dé por hecho que `theme-check` ya cubre Vue.
- **Estado:** open.

## `AvatarReactionDefinition.animation` (`reaction-catalog.ts`) declara valores sin ningún consumidor real

- **Dónde:** `src/reaction-catalog.ts:30` (campo `animation?: string` en la interfaz) y el eje `PRESENTATION_REACTIONS` (líneas 736-920), que lo puebla con identificadores como `blink`, `breathe`, `head-tilt`, `look-activity-panel`, `show-notification`, `icon-alert`, etc. — detectado al analizar el código que va a tocar `specs/animaciones-editables/plan.md`.
- **Qué se encontró:** ningún archivo del proyecto lee este campo para producir comportamiento — `VrmAvatar.vue` (el único lugar que renderiza el avatar) no tiene ninguna rama que interprete `animation`, solo actualiza expresión/boca/física de resortes. Son valores declarados a modo de contrato futuro, sin implementación detrás.
- **Impacto:** con `specs/animaciones-editables` a punto de introducir un segundo concepto de "animación" (pools de `THREE.AnimationClip` por estado, vía `StateAssignment.animations` en `character-editor.ts`), el mismo nombre de campo (`animation`) queda usado por dos sistemas con semántica distinta en el mismo módulo del proyecto. `docs/adr/0011-animacion-cuerpo-en-capa-avatar.md` ya resuelve la frontera arquitectónica (el motor nunca decide qué clip suena), pero a nivel de código el campo de `reaction-catalog.ts` sigue sin consumidor y sin un comentario que aclare que es un eje distinto y todavía no implementado.
- **Remediación sugerida:** al ejecutar el Hito 1 de `animaciones-editables`, agregar una línea de comentario junto a la definición del campo (`reaction-catalog.ts:30`) que remita a `ADR-0011` y aclare explícitamente que este `animation` es el eje de presentación (`PRESENTATION_REACTIONS`, disparado por evento discreto) y no el pool de animaciones de cuerpo — para que un futuro colaborador no intente reusar el campo o confunda ambos sistemas.
- **Esfuerzo:** bajo (un comentario, no un refactor).
- **¿Se paga ahora?** Sí — pagado en el doc-check del Hito 1 de `animaciones-editables` (`src/reaction-catalog.ts:30`).
- **Estado:** resuelto (2026-08-30).

## Celda de capacidad (`<input disabled>` + `aria-label`/`title` condicional) duplicada 4 veces en `CharacterEditor.vue`

- **Dónde:** `src/components/CharacterEditor.vue:129-204` — las celdas de Expresión, Animación, Pose y Boca repiten casi idéntica la misma estructura condicional (`:disabled`, `:aria-label` con rama soportado/no-soportado, `:title="...reason"`).
- **Qué se encontró:** el mismo patrón de "control deshabilitado con razón accesible" está copiado cuatro veces en vez de extraerse a un sub-componente o a una función que arme las props comunes (`aria-label`, `title`, `disabled`) a partir de un `AxisCapability`.
- **Impacto:** bajo hoy (4 copias, todas consistentes entre sí), pero el Hito 3 de `specs/animaciones-editables/plan.md` va a **reemplazar** la celda de Animación por una lista+selector y la de Pose por un `<select>` — el momento natural de consolidar el patrón antes de que una quinta variante (o una sexta, si el Hito 4/5/6 agregan más controles condicionados por capacidad) lo repita de nuevo.
- **Remediación sugerida:** extraer un helper (`capabilityAriaProps(capability, label)` o similar) que devuelva `{ disabled, ariaLabel, title }`, reusado por las 4 celdas — o un sub-componente `CapabilityCell.vue` si la repetición de markup (no solo de lógica) lo justifica.
- **Esfuerzo:** bajo.
- **¿Se paga ahora?** Sí — pagado en el Hito 3 de `animaciones-editables`: `capabilityCellProps()` (`src/character-editor-capability-cell.ts`) arma `disabled`/`aria-label`/`title` a partir de un `AxisCapability`, reusado por las celdas de Expresión, Animación, Pose y Boca en `CharacterEditor.vue` en vez de repetir la ternaria 4 veces.
- **Estado:** resuelto (2026-08-30).

## `updateBodyAnimation()` en `VrmAvatar.vue` mezcla 4 decisiones de dominio en una función

- **Dónde:** `src/components/VrmAvatar.vue`, función que orquesta el pool de animación de fondo y el temporizador de pose (Hito 1 de `specs/animaciones-editables/plan.md`) — hallazgo de `solid-guardian` sobre ese mismo hito.
- **Qué se encontró:** una sola función acumula cambio de animación de fondo, parada de fondo, disparo de pose y parada de pose (4 niveles de anidamiento) en vez de separarse en `updateBackgroundAnimation()`/`updatePoseAnimation()`.
- **Impacto:** medio — si cambia la lógica de pool/timer, esta función es la primera en romperse; hoy no bloquea nada (guantelete y mutación en verde).
- **Remediación sugerida:** dividir en dos funciones, una por eje (fondo/pose), cada una llamando a `advanceAnimationPool`/`advancePoseTimer` y a su propio `ensure*Action`/`stop*Action`.
- **Esfuerzo:** bajo.
- **¿Se paga ahora?** No — `solid-guardian` dio veredicto PASS con esto como observación, no como bloqueo; se registra para revisarlo si `VrmAvatar.vue` se vuelve a tocar (Hito 5/6 ya van a extraer parte de su lógica a `vrm-scene.ts`).
- **Estado:** open.

## Variables de estado de animación dispersas en `VrmAvatar.vue`

- **Dónde:** `src/components/VrmAvatar.vue` (variables de seguimiento de carga/reproducción de animación de fondo y pose) — mismo hallazgo de `solid-guardian` sobre el Hito 1.
- **Qué se encontró:** cinco variables sueltas (`loadingAnimationUrl`, `loadingPoseUrl`, `playingAnimationUrl`, `poseAdditiveClip`, `bodyStateGeneration`) sin agrupar, en vez de un único objeto de estado por eje.
- **Impacto:** bajo hoy; riesgo de que crezca sin control si un hito futuro agrega más acciones paralelas.
- **Remediación sugerida:** agrupar en un objeto `{ background: {...}, pose: {...} }`.
- **Esfuerzo:** bajo.
- **¿Se paga ahora?** No — observación de `solid-guardian` (PASS), no bloqueo.
- **Estado:** open.

## `procedural-animations.ts` mezcla autoría de contenido (27 clips) con resolución (qué pool le toca a cada estado)

- **Dónde:** `src/procedural-animations.ts:56-384` (Hito 2 de `specs/animaciones-editables/plan.md`) — hallazgo de `solid-guardian` sobre ese hito (veredicto OBSERVACIONES).
- **Qué se encontró:** el mismo archivo define los 27 `THREE.AnimationClip` (autoridad de contenido) y resuelve qué pool le corresponde a cada estado (`animationPoolForState`/`poseForState`, `ACTIVE_STATE_ROTATION`) — dos motivos de cambio distintos en un archivo.
- **Impacto:** medio — cambiar cómo un estado elige su animación, o agregar clips de otro origen (importados/creados en los editores de Hito 4-6), obliga a tocar el mismo archivo que define el contenido de fábrica.
- **Remediación sugerida:** extraer las definiciones de clips + catálogo a `procedural-animation-catalog.ts`; dejar en `procedural-animations.ts` solo la resolución.
- **Esfuerzo:** bajo.
- **¿Se paga ahora?** No — `solid-guardian` lo marcó como observación, no bloqueo; buen candidato para cuando el Hito 4 (import) agregue un segundo origen de clips y la mezcla se vuelva más costosa.
- **Estado:** open.

## `character-editor.ts` mezcla lógica de geometría de viewport con el editor de personaje (pre-existente, no introducido por `animaciones-editables`)

- **Dónde:** `src/character-editor.ts:142-201` (`clampCharacterSize`, `isAnchorWithinArea`, `clampAnchorToArea`, `CharacterFootprint`, `defaultViewportArea`, etc.) — hallazgo de `solid-guardian` al auditar el Hito 2, pero el código ya existía antes de esta spec (no lo tocó ningún paso del plan).
- **Qué se encontró:** funciones de geometría/clamping de pantalla viven en el mismo archivo que `StateAssignment`/`EditorCapabilities` — dos responsabilidades sin relación directa.
- **Impacto:** bajo — cambiar la validación de posición en pantalla obliga a tocar un archivo que también define el modelo de datos de animación/expresión por estado.
- **Remediación sugerida:** mover esas funciones/tipos a `monitor-position.ts` (ya existe y ya declara `ScreenCornerPosition`/`WindowDimensions`, que estas funciones consumen).
- **Esfuerzo:** bajo.
- **¿Se paga ahora?** No — pre-existente, fuera del alcance de `animaciones-editables`; se registra para no perderlo de vista si un hito futuro toca `character-editor.ts` de nuevo.
- **Estado:** open.

## `VrmAvatar.vue:resolveClip()` clasifica el origen del clip (procedural vs URL) dentro del componente

- **Dónde:** `src/components/VrmAvatar.vue`, función `resolveClip(idOrUrl)` (fix de retargeting, Hito 3 de `specs/animaciones-editables/plan.md`) — hallazgo de `solid-guardian`.
- **Qué se encontró:** el componente decide con un `if (PROCEDURAL_CLIPS_BY_ID.has(idOrUrl))` si un id es procedural o una URL externa, en vez de delegar esa clasificación a una capa de dominio inyectada.
- **Impacto:** bajo — `solid-guardian` sugirió generalizar a un registro de resolvers (`{ canHandle, resolve }[]`) para cumplir Open/Closed ante "nuevas fuentes de clips". **Evaluado y descartado por sobre-ingeniería**: por diseño (D5/D6/D7 de `design.md`) los Hitos 4 (import), 5 (posado) y 6 (timeline) **todos** guardan su resultado como archivos `.vrma` reales en disco — es decir, siempre caen en la rama URL ya existente. Nunca va a haber una tercera fuente de clips; el registro de resolvers resolvería una extensibilidad que la arquitectura ya descarta.
- **Remediación sugerida (si algún día cambia el supuesto):** extraer `resolveClip` a `src/clip-resolver.ts` con una función `createClipResolver(vrm)` inyectada, si en el futuro aparece una tercera fuente real de clips.
- **Esfuerzo:** bajo, pero condicionado a que el supuesto de "solo 2 fuentes" deje de cumplirse.
- **¿Se paga ahora?** No — con 2 fuentes fijas por diseño, la separación no aporta valor real hoy (YAGNI).
- **Estado:** open (evaluado, no aplica mientras D5/D6/D7 sigan vigentes).

## `aria-live="polite"` envuelve controles interactivos en `CharacterSelector.vue`

- **Dónde:** `src/components/CharacterSelector.vue:268` (`.character-selector__import`) — hallazgo de `design-critic` al auditar la sección equivalente de `CharacterEditor.vue` (Hito 4 de `specs/animaciones-editables/plan.md`), preexistente en este componente y no introducido por ese hito.
- **Qué se encontró:** el `aria-live="polite"` está puesto en el contenedor completo de la sección de importación en vez de solo en el mensaje de error/estado — envuelve el botón de elegir archivo y sus controles, por lo que cada cambio de estado dentro del contenedor puede disparar anuncios ruidosos de un lector de pantalla sobre contenido no relacionado con un mensaje real.
- **Impacto:** bajo-medio — mismo defecto de accesibilidad que se corrigió en `CharacterEditor.vue` en este hito (ahí el `aria-live` se movió al `<p>` del mensaje de error), pero aquí sigue sin corregir.
- **Remediación sugerida:** quitar `aria-live="polite"` del contenedor `.character-selector__import` y ponerlo solo en el `<p>` que muestra el mensaje de error/confirmación de importación, mismo patrón ya aplicado en `CharacterEditor.vue`.
- **Esfuerzo:** bajo.
- **¿Se paga ahora?** No — fuera de alcance de este hito (solo tocaba `CharacterEditor.vue`); se registra para pagarlo la próxima vez que se toque `CharacterSelector.vue`.
- **Estado:** open.

## Lo "creado" en el editor de posado y lo "importado" comparten carpeta/catálogo, indistinguibles tras un reinicio

- **Dónde:** `src-tauri/src/animation_import.rs` (`save_created_animation_file`, Hito 5 de `specs/animaciones-editables/plan.md`) y `CharacterEditor.vue` (`animationLabel()`).
- **Qué se encontró:** por diseño (5.6/5.7 del plan reusan literalmente el mismo directorio y comando de listado que la importación del Hito 4), lo creado en el editor de posado y lo importado desde disco se guardan en la misma carpeta y `list_imported_animations()` no distingue origen — el resumen de Tauri no tiene un campo `origin`. El único momento en que la UI sabe que algo fue "creado" es el mensaje de éxito de esa misma sesión; tras un reinicio ambos aparecen etiquetados igual ("(guardado)").
- **Impacto:** bajo — es una limitación cosmética (etiqueta), no funcional; ambos orígenes se reproducen y persisten igual de bien.
- **Remediación sugerida:** si algún día importa distinguir el origen tras un reinicio, agregar un campo `origin: 'imported' | 'created'` a `ImportedAnimationSummary` (Rust + TS) derivado de un marcador en el nombre de archivo o un manifiesto lateral.
- **Esfuerzo:** bajo.
- **¿Se paga ahora?** No — ningún paso del plan pide distinguir origen tras un reinicio; reusar el mismo catálogo es la decisión deliberada de 5.6/5.7 (evita un segundo comando/carpeta casi idéntico).
- **Estado:** open.

## `vrma-pose-export.ts` exporta el cuaternión del hueso *raw*, no el *normalizado*

- **Dónde:** `src/vrma-pose-export.ts` / `src/components/PoseEditor.vue` (Hito 5 de `specs/animaciones-editables/plan.md`).
- **Qué se encontró:** el gizmo edita `vrm.humanoid.getRawBoneNode(nombre)` (pedido explícito del plan, 5.3) y el export serializa ese mismo cuaternión tal cual. El resto del pipeline VRM retornea vía huesos *normalizados* (`getNormalizedBoneNode`, ver `@pixiv/three-vrm-animation`) precisamente para que un `.vrma` se vea igual en cualquier modelo pese a diferencias de rest-pose entre esqueletos. Convertir raw→normalizado exige las matrices de rest-pose del humanoid, que este hito no calcula.
- **Impacto:** bajo-medio — el resultado es fiel en el mismo personaje (o uno con T-pose muy similar); en un personaje con rest-pose muy distinta el posado exportado puede verse ligeramente distorsionado al reproducirse.
- **Remediación sugerida:** al posar, leer/escribir contra `getNormalizedBoneNode` en vez de `getRawBoneNode`, o aplicar la conversión de espacio que ya usa `VRMAnimationLoaderPlugin` internamente antes de serializar.
- **Esfuerzo:** medio (requiere entender y replicar la matemática de rest-pose que hoy vive solo dentro de `@pixiv/three-vrm-animation`).
- **¿Se paga ahora?** No — fuera del alcance declarado del Hito 5 (posar el personaje activo, no garantizar fidelidad cross-modelo); documentado también en `docs/reference/avatar-reacciones-voz.md`.
- **Estado:** open.

## `@theatre/core` (sin `@theatre/studio`) no expone autoría programática de keyframes en su API pública

- **Dónde:** `src/components/AnimationTimelineEditor.vue` (Hito 6 de `specs/animaciones-editables/plan.md`) — hallazgo real durante la implementación, no anticipado por `design.md` (D7 asumía que `@theatre/core` podía resolver el "tweening/easing entre keyframes" que este hito necesitaba).
- **Qué se encontró:** `node_modules/@theatre/core/dist/index.d.ts` (verificado byte a byte) solo expone `getProject`/`sheet`/`sheet.object()` con lectura/escritura del **valor actual** de una propiedad (`obj.value`, `obj.initialValue`); la única vía para poblar una secuencia con keyframes reales es `studio.transaction()` (paquete AGPL, ya descartado por D7) o cargar un `state` con el formato interno `__UNSTABLE_Project_OnDiskState` — el propio tipo lo documenta como "INTERNAL and UNSTABLE — WILL break between minor versions". Reconstruir ese formato a mano (incluye `encodePathToProp`, no exportado por el paquete público) habría sido más frágil que no depender de Theatre para la interpolación.
- **Impacto:** bajo — no bloquea el criterio de aceptación del hito. `THREE.AnimationMixer` + `THREE.QuaternionKeyframeTrack` (ya instalados desde el Hito 1) hacen el trabajo real de interpolación (con SLERP correcto para cuaterniones, mejor que el tweening por eje XYZ que usaría Theatre). `@theatre/core` se mantiene en el alcance que D7 le da (hueso envuelto como "sheet object" con rotación X/Y/Z) pero como capa de valor observable alimentada por el resultado ya interpolado del mixer, no como motor de interpolación en sí — ver detalle completo en `docs/reference/avatar-reacciones-voz.md` §"Editor de animación con timeline in-app".
- **Remediación sugerida:** ninguna necesaria mientras `@theatre/studio` siga fuera de alcance (D7); si en el futuro el proyecto decide licenciar bajo AGPL o pagar una licencia comercial de Theatre.js, esta nota queda obsoleta y `@theatre/core` podría asumir la interpolación real vía Studio.
- **Esfuerzo:** N/A — no es una remediación pendiente, es una aclaración de por qué el mecanismo real de interpolación es tres.js y no Theatre.
- **¿Se paga ahora?** No aplica — no es deuda a pagar, es una limitación de la dependencia externa ya documentada y con solución de trabajo (three.js) implementada en el mismo hito.
- **Estado:** cerrado, informativo (2026-08-30).

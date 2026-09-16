# Gestión de personajes

Este dominio cubre todo lo relacionado con **qué personaje se muestra como avatar**: el catálogo estático de personajes incluidos con la aplicación, la importación de un personaje propio (VRM/GLB/Live2D), el gate legal de licencia que puede interponerse antes de activar un personaje, el editor de personaje (expresión/animación/pose por estado de reacción, anclaje/tamaño/transición en pantalla), y la persistencia de cuál personaje quedó elegido entre sesiones.

## Conceptos clave

**Catálogo estático vs. personajes importados.** `CHARACTER_CATALOG` (`src/character-catalog.ts`) es un arreglo fijo, compilado con la aplicación, de `CharacterCatalogEntry`. Un personaje importado (`ImportedCharacterSummary`, `src/character-import.ts`) es un archivo que la persona trajo desde su disco y la aplicación copió a `<app_data_dir>/imported-characters/`. Ambos tipos conviven bajo el mismo `activeCharacterId` en `App.vue`: `activeCharacter` busca solo en el catálogo estático, `activeImportedCharacter` busca solo en la lista de importados — un id nunca puede resolver en los dos a la vez porque cada uno tiene su propio espacio de ids (el catálogo usa slugs fijos como `rabbit`/`polydancer`/`alicia-solid`; un importado genera el suyo al guardarse).

**Doble frontera de confianza en la importación.** Un archivo elegido por la persona con el selector nativo no se confía por su extensión. `src-tauri/src/character_import.rs` valida el contenido real antes de aceptarlo:
- **VRM/GLB** (`validate_vrm_header`): los primeros 12 bytes deben ser el header binario real de glTF — magic number `0x46546C67` ("glTF" en ASCII, constante `GLTF_MAGIC`) en los primeros 4 bytes, seguido de versión y longitud declarada; la longitud declarada en los bytes 8..12 debe coincidir exactamente con el tamaño real del archivo en disco. Un archivo truncado, con magic number equivocado, o cuya longitud declarada no cuadra con el tamaño real, se rechaza con `CorruptVrmHeader` antes de copiar un solo byte más.
- **Live2D** (`validate_live2d_manifest`, para archivos `*.model3.json`): el contenido debe parsear como JSON válido, ser un objeto, y tener las claves `"Version"` y `"FileReferences"`. Si falta cualquiera de las dos condiciones, se rechaza con `InvalidLive2dManifest`.

**Capacidades por formato, no por archivo.** La aplicación nunca parsea la escena 3D completa de un VRM ni el `.moc3` de un Live2D para saber qué controles soporta cada archivo individual. `capabilities_for` (Rust) y `capabilitiesForImportedCharacter` (`src/character-editor.ts`) declaran capacidades **por formato**: todo VRM importado se trata como `{expression: true, mouth: true, eyebrows: false}` y todo Live2D como `{expression: false, mouth: false, eyebrows: false}`, sin excepción por archivo. Es una simplificación deliberada documentada en el propio código ("sin parsear la escena/moc3 completa, las capacidades se declaran por formato, no por archivo") — un VRM real sin blend shapes de expresión igual se anunciará como capaz de expresión.

**Gate legal de licencia, no técnico.** Dos entradas del catálogo (`rabbit`, `polydancer`) tienen `requiresLicenseAcceptance: true` porque su licencia CC0 fue declarada por un agregador externo, no verificada directamente en la fuente original — el catálogo documenta ese riesgo (`LICENSE_DISCLAIMER`) y exige un clic explícito de aceptación antes de activar el personaje por primera vez. `alicia-solid` (VRM sample oficial con licencia clara de VRoid Hub) no tiene este gate. La importación de un archivo propio **no** pasa por ningún gate de licencia — el texto fijo del panel de importación ("La licencia de este archivo es tu responsabilidad; la aplicación no la verifica") traslada esa responsabilidad a quien importa.

**Tres estados del editor: `original` / `saved` / `editing`.** El editor de personaje (`createCharacterEditorState`, `src/character-editor.ts`) no modela solo "guardado vs. borrador"; modela tres capas:
- `original`: los valores de fábrica calculados en frío (`defaultAssignmentsFor(capabilities)` + anclaje/tamaño por defecto) — **nunca** es "lo último guardado", es siempre el punto de partida de diseño.
- `saved`: lo persistido en `localStorage` para este `characterId`, o una copia de `original` si nunca se guardó nada.
- `editing`: una copia de `saved` sobre la que la persona trabaja en la sesión de edición actual.

Descartar cambios (`discardEditorChanges`) siempre repone `editing` a una copia de `original` — **no** de `saved`. Es decir, "descartar" en este editor significa "volver a fábrica", no "deshacer hasta el último guardado". Este comportamiento está confirmado explícitamente por la prueba `descartar despues de cambiar y guardar vuelve al original, no al ultimo guardado` en `character-editor.spec.ts`.

## Flujos reales

### Seleccionar un personaje del catálogo (sin gate de licencia)
1. La persona elige un personaje cuyo `requiresLicenseAcceptance` es falso o inexistente (hoy, `alicia-solid`).
2. `activateCharacter(id)` (`App.vue`) busca la entrada en `CHARACTER_CATALOG`; como no requiere licencia (o ya fue aceptada antes), llama directo a `applyCharacterActivation(id)`.
3. `applyCharacterActivation` fija `activeCharacterId.value = id` y persiste el id con `persistCharacterId` (`character-selection.ts`) dentro de un `try/catch` — si `localStorage.setItem` falla (cupo lleno, modo privado bloqueado), el error se registra en consola pero **la activación en memoria ya ocurrió**: el personaje cambia igual en la sesión actual, solo no sobrevive a un reinicio.
4. Todos los componentes que renderizan el avatar (panel principal, modo ventana flotante/"pet", vista dividida) reaccionan al `activeCharacter` computed y al `characterEditorModelUrl` computed sin lógica propia — un solo punto de resolución de URL de modelo.

### Seleccionar un personaje con licencia gateada — rechazar
1. La persona elige `rabbit` o `polydancer` por primera vez (o antes de aceptar su licencia).
2. `activateCharacter(id)` encuentra `entry.requiresLicenseAcceptance === true` y `hasAcceptedCharacterLicense(id)` es `false` → **no activa nada todavía**; solo fija `pendingCharacterLicenseId.value = id`.
3. Se muestra un `EditorModal` con `role="alertdialog"`, título `Aviso legal — <nombre>`, el texto de `entry.license` y un párrafo fijo de riesgo aceptado, con dos botones: `Acepto, usar <nombre>` / `Cancelar`.
4. La persona hace clic en `Cancelar` (o cierra el diálogo, que dispara el mismo `@close`) → `cancelCharacterLicense()` limpia `pendingCharacterLicenseId` a `null`. **No hay activación, no hay persistencia, el personaje activo no cambió.**

### Seleccionar un personaje con licencia gateada — aceptar
1. Mismos pasos 1-3 de arriba.
2. La persona hace clic en `Acepto, usar <nombre>` → `acceptCharacterLicense()`: persiste la aceptación con `persistCharacterLicenseAccepted(id)` (guarda el id en un `Set<string>` serializado como arreglo JSON bajo la clave `codetuver-avatar.character-license.accepted`), llama a `applyCharacterActivation(id)` (activa y persiste la elección igual que el flujo sin gate), y limpia `pendingCharacterLicenseId` a `null`.
3. **Aceptaciones futuras del mismo personaje no vuelven a mostrar el diálogo**: la siguiente vez que se llame `activateCharacter(id)` para ese mismo id, `hasAcceptedCharacterLicense(id)` ya es `true` y el flujo salta directo a `applyCharacterActivation`. Confirmado por la prueba `la aceptacion persiste entre lecturas independientes (misma sesion)`.
4. Aceptar un personaje **no** afecta la aceptación de otro — cada id tiene su propia entrada en el `Set` (prueba: `aceptar un personaje no afecta la aceptacion de otro`). Aceptar el mismo personaje dos veces no duplica la entrada (el `Set` lo deduplica de forma natural).

### Importar un personaje propio — éxito
1. La persona pulsa el botón de importar → `openCharacterImportOverlay()` llama a `pickCharacterFile()` (`character-file-picker.ts`), que abre el selector nativo de Tauri filtrado a `{name: 'Personaje', extensions: ['vrm', 'glb', 'json']}`, `multiple: false`.
2. Si cancela el diálogo (`open()` devuelve `null`), no pasa nada — no se abre ningún panel.
3. Si elige una ruta, `showCharacterImportOverlay(path)` guarda el elemento con foco actual (para devolverlo luego), fija `pendingCharacterImportPath`, limpia cualquier error/resumen previo, empuja `'characterImport'` a la pila de overlays y mueve el foco al primer control interactivo del panel tras el siguiente `nextTick`.
4. La persona confirma con el botón "Confirmar importación" → `confirmCharacterImport()`: marca `isImportingCharacterFile = true` (el botón cambia su texto a "Importando..." y ambos botones del panel se deshabilitan), limpia el error previo, y llama `importCharacterFile(path)` (invoca el comando Tauri `import_character_file`, que a su vez llama `detect_format` → `validate_vrm_header`/`validate_live2d_manifest` → `capabilities_for` → `save_imported_file` en Rust).
5. Si la validación pasa, la promesa resuelve con un `ImportedCharacterSummary {id, name, format, savedPath, capabilities}`. `lastImportedCharacterSummary` se fija con ese resumen, `onCharacterImported(summary)` agrega el resumen al arreglo `importedCharacters` y registra el personaje en el menú nativo (`nativeMenuHandle.addImportedCharacter`), y `pendingCharacterImportPath` se limpia a `null`.
6. El panel **no se cierra solo** — sigue mostrando el resumen de éxito (nombre, formato, y dos listas de texto: "Controles disponibles" / "Controles no disponibles", generadas por `describeCharacterCapabilities` a partir de las mismas tres claves de `CharacterCapabilities`). El comentario de código en `App.vue` es explícito sobre por qué: si el panel se cerrara solo por `v-if`, el resultado de éxito quedaría calculado pero invisible (hallazgo real de revisión de UX, referenciado como Nielsen #1). Cerrar es una acción explícita de la persona.
7. `isImportingCharacterFile` vuelve a `false` en el `finally`, reactivando los controles.

### Importar un personaje propio — error de validación
1. Pasos 1-4 iguales al flujo de éxito.
2. `importCharacterFile` rechaza (por ejemplo, `CorruptVrmHeader` si el archivo dice ser `.vrm` pero no trae el magic number glTF correcto o su longitud declarada no coincide con el tamaño real, o `InvalidLive2dManifest` si el `.model3.json` no es JSON válido o le falta `Version`/`FileReferences`).
3. El `catch` de `confirmCharacterImport` fija `characterImportError.value = errorMessage(err)` — el panel muestra el mensaje de error con el ícono de error y `aria-live="polite"`, y **no** limpia `pendingCharacterImportPath`: la ruta sigue visible y la persona puede reintentar sin tener que volver a elegir el archivo (aunque reintentar con el mismo archigo corrupto fallará igual, salvo que use "Cancelar" y elija otro).
4. `isImportingCharacterFile` vuelve a `false` en el `finally` de todas formas, aunque haya sido un error.

### Cerrar el panel de importación
`closeCharacterImportOverlay()` tiene una guarda explícita: si `isImportingCharacterFile.value` es `true`, la función retorna sin hacer nada — **no se puede cerrar el panel mientras una importación está en vuelo**, precisamente para no perder de vista un éxito o error que llegue después de cerrado (mismo razonamiento del paso 6 de arriba). Cuando sí cierra, quita `'characterImport'` de la pila de overlays, limpia `pendingCharacterImportPath` a `null`, y devuelve el foco al elemento que lo tenía antes de abrir el panel.

### Editar la expresión, animación o pose de un estado
El editor de personaje (`CharacterEditor.vue`) renderiza una fila por cada uno de los 11 `EDITABLE_STATES` (`idle, thinking, reading, coding, executing, waiting_permission, success, error, confused, sleeping, speaking`):
1. **Expresión**: un `CustomSelect` con las 8 `EXPRESSION_OPTIONS` (`neutral, happy, sad, surprised, confused, angry, tired, excited`). Cambiar la selección llama `applyAssignmentChange`, que pasa por `sanitizeAssignment` antes de guardarse en `editing`.
2. **Animación**: cada fila muestra chips por cada animación ya asignada a ese estado (rotuladas "Fábrica: `<id>`" si viene del catálogo procedural, o "Guardado: `<nombre>`" si es una animación VRMA importada y registrada). Cada chip tiene tres botones: Ejecutar (emite `preview-clip` hacia el padre, que dispara la reproducción real en el avatar en vivo), Editar (abre `AnimationTimelineEditor` en modo `'editar-animacion'` dentro de un `EditorModal`), Quitar (la elimina del pool de ese estado). Un `CustomSelect` separado permite agregar una animación existente (excluye las ya asignadas) del catálogo de fábrica o de las importadas; un botón "Crear animación nueva" abre el mismo editor en modo `'nueva'`.
3. **Pose**: si el estado ya tiene una pose asignada, se muestra su texto con un botón Editar (abre `PoseEditor` en modo `'editar-pose'`). Si no, un `CustomSelect` (opciones de fábrica + importadas) más un botón "Crear pose nueva" (modo `'nueva'`).
4. **Boca**: un campo de texto siempre deshabilitado — nunca editable directamente. Su placeholder cambia según `capabilities.mouth.supported`: "sincronizada automáticamente con el audio" (estilo verde/éxito) si el personaje activo soporta boca, o "no soportado" (borde punteado) si no.
5. "Probar reacción de `<estado>`" (botón de play por fila) llama `previewAssignment`, que reutiliza el mismo camino real que usa el motor de reacciones en producción (`avatarController.setState` + `setExpression`) — no hay una ruta de "vista previa" separada de la ruta real.
6. Cualquier eje sin soporte (`capabilities.<eje>.supported === false`) muestra debajo de la tabla el texto de `capability.reason` explicando por qué (por ejemplo, un personaje Live2D importado: "el renderizador de Live2D todavía no existe").

Nada de esto persiste hasta pulsar "Guardar" — ver más abajo.

### Importar una animación o pose VRMA propia (dentro del editor)
1. Botón "Elegir archivo (.vrma)" (deshabilitado si el personaje activo no soporta ni animación ni pose) abre el selector nativo con filtro `{name: 'Animación o pose VRMA', extensions: ['vrma']}`.
2. Al elegir una ruta, aparece la ruta pendiente más un `CustomSelect` para elegir si es "animación" o "pose" (las opciones se filtran por lo que el personaje soporta) y los botones "Confirmar importación"/"Cancelar".
3. `confirmAnimationImport` llama `importAnimationFile(path, kind)`, registra el resultado en el catálogo module-level de animaciones importadas (`registerImportedAnimation`, keyed por `savedPath`), muestra un mensaje de estado (`aria-live="polite"`), y devuelve el foco al botón de elegir archivo.

Este subflujo pertenece técnicamente a la frontera con [animacion-y-render](../animacion-y-render/overview.md) (el parseo real del `.vrma` ocurre ahí); aquí solo se documenta la superficie de UI que lo dispara desde dentro del editor de personaje.

### Editar anclaje, tamaño y duración de transición
Estos tres campos son **globales por personaje**, no por estado:
- **Esquina** (`anchor.corner`): un `CustomSelect` de 4 valores (una por esquina de la ventana/área visible).
- **Margen X / Margen Y** (`anchor.marginX` / `marginY`): inputs numéricos con `min="0"` en el propio HTML; el valor final además se re-acota mediante `applyAnchorChange` → `clampAnchorToArea`, que verifica que el personaje (con su `CharacterFootprint` de 128×128 escalado por `size`) quepa dentro del área visible dados esos márgenes — un margen negativo se rechaza y se acota a 0 (nunca queda negativo, confirmado por la prueba `un margen negativo se rechaza en la validacion y se acota a 0`); un anclaje que dejaría al personaje fuera del área visible también se acota dentro del área (prueba: `un anclaje que dejaria al personaje fuera del area visible se acota dentro del area`).
- **Tamaño** (`size`): input numérico con `min`/`max` iguales a las constantes `MIN_CHARACTER_SIZE = 0.5` / `MAX_CHARACTER_SIZE = 2`, paso `0.1`. `applySizeChange` clampa el tamaño con `clampCharacterSize` y **además** vuelve a acotar el anclaje existente contra el nuevo tamaño (`clampAnchorToArea` de nuevo) — cambiar el tamaño puede mover el anclaje si el tamaño nuevo ya no cabía con los márgenes actuales (prueba: `cambiar el tamaño tambien re-acota el anclaje existente, no solo el tamaño`).
- **Transición (ms)** (`transitionDurationMs`): input numérico `min="0"`, `max="10000"` (`MAX_TRANSITION_DURATION_MS`), paso `50`. A diferencia de expresión/animación/pose, este campo se aplica **a los 11 estados a la vez** (`EDITABLE_STATES.forEach` al guardar) — no hay una duración de transición distinta por estado.

### Guardar cambios
El botón "Guardar" llama `markEditorSaved` (persiste `editing` a `localStorage` vía `persistCharacterEditorSettings`, bajo la clave `codetuver-avatar.character-editor.<characterId>`) y actualiza `saved` a esa misma copia. El componente emite `settings-saved`, que en `App.vue` llama `reloadActiveCharacterSettings()` — incrementa un contador (`characterEditorSettingsVersion`) cuyo único propósito es forzar que el `computed` `activeStateAssignment` se vuelva a evaluar, porque `loadCharacterEditorSettings` lee de `localStorage` y **no** es reactivo por sí solo.

### Descartar cambios
El botón "Descartar cambios" no revierte directo: abre un `EditorModal` con `role="alertdialog"` ("Se perderán los cambios sin guardar. ¿Descartar?", botones "Descartar" en color de peligro / "Cancelar"). Solo al confirmar se llama `discardEditorChanges`, que — como se explicó arriba — repone `editing` a una copia de `original` (fábrica), **no** de `saved`. Cancelar cierra el diálogo sin tocar `editing`. Este diálogo propio reemplazó un `window.confirm()` nativo en una revisión de accesibilidad anterior del proyecto.

## Modelo de datos real

```ts
// character-catalog.ts
type CharacterKind = 'vrm';
interface CharacterCatalogEntry {
  id: string;
  name: string;
  kind: CharacterKind;
  author: string;
  license: string;
  attribution: string;
  modelUrl: string;
  requiresLicenseAcceptance?: boolean;
}

// character-import.ts
type CharacterImportErrorKind =
  | 'file-not-found'
  | 'unsupported-format'
  | 'corrupt-vrm-header'
  | 'invalid-live2d-manifest'
  | 'io-error';
type ImportedCharacterFormat = 'vrm' | 'live2d';
interface CharacterCapabilities { expression: boolean; mouth: boolean; eyebrows: boolean; }
interface ImportedCharacterSummary {
  id: string; name: string; format: ImportedCharacterFormat;
  savedPath: string; capabilities: CharacterCapabilities;
}

// character-editor.ts
interface AxisCapability { supported: boolean; reason?: string; }
interface EditorCapabilities {
  expression: AxisCapability; animation: AxisCapability;
  pose: AxisCapability; mouth: AxisCapability;
}
interface StateAssignment {
  state: AvatarState; expression?: AvatarExpression;
  animations?: string[]; pose?: string;
  poseCleared?: boolean; transitionDurationMs?: number;
}
interface CharacterEditorSettings {
  assignments: StateAssignment[];
  anchor: { corner: AnchorCorner; marginX: number; marginY: number };
  size: number;
}
interface CharacterEditorState {
  characterId: string;
  original: CharacterEditorSettings;
  saved: CharacterEditorSettings;
  editing: CharacterEditorSettings;
}
```

Ver `reference.md` de este dominio para la firma completa de cada función y cada constante.

## Casos borde reales confirmados

Todos verificados contra pruebas reales en `.spec.ts`, no inferidos:

- **Id de personaje persistido que ya no existe en el catálogo** (personaje eliminado de una versión futura, o dato corrupto): `resolveActiveCharacter` cae al primer elemento del catálogo (`catalog[0]`), nunca lanza excepción. Con catálogo vacío devuelve `null`.
- **`localStorage.setItem` falla al persistir la elección de personaje**: `persistCharacterId` **no** captura la excepción — se propaga tal cual hacia quien llama (`applyCharacterActivation` sí la envuelve en `try/catch` y solo hace `console.error`). Confirmado por la prueba con el nombre literal `propaga la excepcion del storage cuando setItem falla (hallazgo: persistCharacterId no la captura)`.
- **Id vacío persistido (`''`)**: se persiste y relee tal cual, sin tratamiento especial — no se equipara a "nada persistido" (eso solo ocurre con `null`, es decir, la clave nunca escrita).
- **Valor de licencias aceptadas corrupto (no-JSON)**: `loadAcceptedCharacterLicenses` no lanza, devuelve un `Set` vacío.
- **`pickCharacterFile` recibe un arreglo** (el diálogo nativo, a pesar de pedírsele `multiple: false`, devolviera múltiples rutas): se trata como cancelación, resuelve `null` — nunca se confunde un arreglo con una ruta válida.
- **Error real del sistema operativo al abrir el selector nativo**: se propaga sin envolver, tal cual lo lanzó `@tauri-apps/plugin-dialog`.
- **Migración de un shape antiguo de settings** (una entrada con `animation: string` en vez de `animations: string[]`, formato pre-multipool): `migrateAssignment` (`character-editor-storage.ts`) convierte el campo singular a un arreglo de un elemento. Si **ambos** campos existen (dato mixto/corrupto), el campo `animation` legado se descarta silenciosamente y prevalece `animations` — nunca se duplica.
- **Migración campo a campo de settings incompletos** (`fillMissingAnimationFields`): una entrada persistida sin `animations` ni `pose` completa ambos desde los valores de fábrica del estado, **preservando** cualquier expresión ya personalizada — no es un reemplazo total del registro, es un relleno selectivo por campo faltante.
- **`poseCleared` distingue "sin asignar a propósito" de "nunca tocado"**: una entrada sin `pose` y sin `poseCleared` sigue cayendo al pose de fábrica (comportamiento de migración). Una entrada sin `pose` pero con `poseCleared: true` se queda genuinamente sin pose — es una decisión de diseño explícita, no un bug de migración. `poseCleared` **no** aplica el mismo criterio a animaciones: un pool de animaciones vacío con `poseCleared: true` de todas formas cae al pool de fábrica (asimetría intencional entre pose y animación, confirmada por la prueba `poseCleared no afecta animaciones... (decision de diseño intencional, no tocada)`).
- **Estado real del motor de reacciones no incluido en los 11 curados** (por ejemplo `pensativa`, `confundida`, `no-entendio`, y ~20 más): `assignmentForState` primero busca coincidencia exacta contra las asignaciones persistidas, luego contra `REACTION_STATE_ALIASES` (mapa de ~23 alias hacia uno de los 11 estados curados). Un estado real sin alias definido y sin personalización cae al fallback genérico por mood (`animationPoolForState`/`poseForState`), **nunca en silencio** (nunca deja de reproducir nada).
- **Reasignar un pose real tras haberlo marcado `poseCleared`**: `applyAssignmentChange` con un nuevo `poseCleared: undefined` limpia la marca — no queda "fantasma" impidiendo que el nuevo pose se aplique.
- **Un id de animación o pose inexistente en ningún catálogo** (de fábrica ni importado): `sanitizeAssignment` lo filtra a `undefined`/lo excluye del arreglo — nunca se cuela un id inventado o texto libre hacia el render real, incluso si el personaje sí soporta esa capacidad.
- **Asignar una animación a un personaje Live2D** (que no soporta animación por su formato): `sanitizeAssignment` la descarta antes de guardar, sin importar que el id exista en algún catálogo — la capacidad del personaje manda sobre la existencia del clip.
- **Ajustes de un personaje "contaminando" a otro**: cada `characterId` tiene su propia clave de `localStorage` (`codetuver-avatar.character-editor.<id>`); dos personajes con las mismas `capabilities` no comparten estado — confirmado por prueba dedicada.
- **`resolveActiveStateAssignment` sin configuración persistida y sin soporte de animación/pose** (personaje Live2D nunca editado): no resuelve ni animación ni pose (ambas quedan sin valor), respetando la incapacidad real del formato.
- **`resolveActiveStateAssignment` con configuración persistida que no trae el estado pedido**: cae a un fallback **vacío**, no a los defaults de fábrica — es decir, si la persona guardó ajustes para *algunos* estados pero no para el que está activo ahora mismo, ese estado específico se queda sin animación/pose en vez de heredar el pool genérico (comportamiento distinto al caso de "nunca hubo ninguna configuración guardada", que sí cae al pool de fábrica).

## Huecos y limitaciones reales vigentes hoy

- **Las capacidades declaradas por formato pueden no reflejar el archivo real.** Un VRM importado sin blend shapes de expresión se sigue anunciando con `expression: true` porque la aplicación no inspecciona la escena — es una limitación de diseño documentada en el propio código Rust, no un bug pendiente.
- **La licencia de un archivo importado nunca se verifica.** El gate de licencia solo existe para las dos entradas gateadas del catálogo estático; importar un archivo propio no pasa por ningún control de licencia — el riesgo se traslada por texto a quien importa.
- **`interactionRequestsState`, sesión y personaje son independientes**: cambiar de personaje activo no reinicia ni afecta el estado de sesión de chat ni viceversa — son ejes ortogonales de `App.vue`, sin acoplamiento cruzado verificado en este dominio.
- **El tamaño/anclaje configurados en el editor sí se consumen en el render real**: `activeStateAssignment` (que incluye `transitionDurationMs`) se pasa como prop a los componentes de avatar en las tres superficies donde se renderiza (panel principal, vista dividida, ventana "pet"); no se detectó ninguna ruta donde el anclaje/tamaño persistido se calcule y luego se ignore. Cualquier afirmación en sentido contrario en documentación histórica de este proyecto queda superada por esta verificación directa del código actual.

## Referencias cruzadas

- [animacion-y-render](../animacion-y-render/overview.md) — el motor genérico de animación/pose (`vrm-clip-retarget.ts`) que hace posible que VRM importado y de fábrica compartan capacidad de animación; el parseo real de archivos `.vrma`; por qué Live2D carece hoy de renderizador propio.
- [administracion-y-configuracion](../administracion-y-configuracion/overview.md) — el patrón general de persistencia en `localStorage` con prefijo `codetuver-avatar.*` que usa también este dominio, y su reemplazo futuro planeado (almacén unificado).
- [orquestacion-app](../orquestacion-app/overview.md) — cómo `App.vue` conecta el catálogo, la importación, el gate de licencia y el editor con el resto de superficies de la aplicación (panel principal, vista dividida, modo ventana flotante).

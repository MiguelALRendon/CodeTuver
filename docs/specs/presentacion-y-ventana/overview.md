# Presentación y ventana

Dominio responsable de los tres modos de presentación de la app (`FULL`/`COMPANION`/`PET`), la capa de abstracción sobre la ventana nativa de Tauri que los implementa, la ventana separada de la mascota (PET), el menú nativo de la aplicación y las señales de atención que avisan a la persona usuaria cuando hay algo pendiente mientras está en modo mascota.

Ver también: [chat-y-contenido](../chat-y-contenido/overview.md) (produce `pendingInteractionCount`, la señal que dispara el indicador de atención), [gestion-de-personajes](../gestion-de-personajes/overview.md) (personaje activo que se sincroniza a la ventana pet), [animacion-y-render](../animacion-y-render/overview.md) (`AvatarStage`, montado tanto en la ventana principal como en la ventana pet), [administracion-y-configuracion](../administracion-y-configuracion/overview.md) (persiste `corner`/`windowSize`/`alwaysOnTop`/`monitor`/`initialMode`/`petWindowPosition` como parte de `AppSettings`), [robustez-y-actualizaciones](../robustez-y-actualizaciones/overview.md) (taxonomía de fallos, fault injection de ventana en el panel de depuración), [ui-compartida](../ui-compartida/overview.md) (`createTabFocusRegistry`/`nextTabId` también los usan otras tablists de la app), [arquitectura-general](../arquitectura-general/overview.md) (mapa completo del sistema).

## Los tres modos de presentación

| Modo | Qué es | Ventana | Posición del avatar |
|---|---|---|---|
| `FULL` | Interfaz completa: chat a la izquierda, avatar a la derecha, pestañas secundarias (Avatar/Actividad/Salida cruda/Configuración/Editor de personaje) | Ventana principal normal (con decoraciones, redimensionable) | `CORNER` |
| `COMPANION` | Solo el avatar, centrado, sin chat ni pestañas | Ventana principal normal (misma configuración de bordes/redimensionado que `FULL`) | `CENTER` |
| `PET` | Solo el avatar, en una ventana **separada** más pequeña, siempre encima, sin bordes | Ventana `pet` (`WebviewWindow` independiente), transparente, sin decoraciones, no enfocable | `CORNER` |

El modo vive en `PresentationState.mode`, expuesto como `presentationState = computed(() => presentationManager.getState())` en `src/App.vue` (línea 546). Todo el árbol condicional de plantilla que decide qué se ve (columnas de chat, controles de modo, `AvatarStage` en la ventana principal) depende de este único valor reactivo.

**"Siempre encima" es forzado en `FULL`/`COMPANION` y configurable solo en `PET`** — al revés de lo que "PET es el único con `alwaysOnTop: true`" podría sugerir por sí solo. `MODE_PROFILES.FULL.window.alwaysOnTop` y `.COMPANION.window.alwaysOnTop` están hardcodeados a `false` y `resolveWindowFlags` nunca los toca (comentario propio del código: "siempre encima" solo tiene sentido como preferencia de usuario en modo mascota; `FULL`/`COMPANION` son ventanas normales de trabajo). La preferencia persistida `AppSettings.alwaysOnTop` (`alwaysOnTopOverride` dentro de `PresentationManager`) **solo se aplica en modo `PET`** — `resolveWindowFlags` la ignora explícitamente para cualquier otro modo — con `MODE_PROFILES.PET.window.alwaysOnTop = true` como valor de arranque si todavía no hay preferencia guardada (`applyPersistedSettings` no se ha llamado o `settings.alwaysOnTop` es `null`).

## Las 6 transiciones válidas (y solo esas)

`PresentationManager` (`src/presentation-manager.ts`) es una máquina de estados explícita: solo existen 6 transiciones válidas entre los 3 modos, cada una asociada a un gesto real de la interfaz. Un comentario en el propio código señala una discrepancia histórica ya corregida: la documentación de negocio original solo dibujaba 3 transiciones; una prueba (`TC-068`, `AC-023.4`) exigió las 6 en ambos sentidos, y son las 6 las que están implementadas hoy:

| De | A | Gesto |
|---|---|---|
| `FULL` | `COMPANION` | Ocultar chat |
| `COMPANION` | `PET` | Enviar al escritorio |
| `PET` | `FULL` | Click en el avatar (VTuber) |
| `COMPANION` | `FULL` | Volver a la interfaz completa |
| `FULL` | `PET` | Cambio directo de modo |
| `PET` | `COMPANION` | Cambio directo de modo |

Intentar una transición no listada (o pedir el mismo modo en el que ya se está) no lanza un error de validación visible: `transitionTo(mode)` primero ignora la llamada por completo si ya hay una transición en curso (`isTransitioning === true`, devuelve una promesa resuelta sin hacer nada), y si el modo pedido es igual al actual (`runTransition`) tampoco hace nada. Solo un par `(from, to)` que no está en la tabla de 6 transiciones lanza `invalidTransitionFault`, que termina cayendo en el mismo camino de recuperación que un fallo real (ver más abajo).

## Cómo se aplica una transición: cola secuencial, nunca concurrente

`PresentationManager` mantiene una única cola de promesas (`this.queue`) para serializar transiciones: cada llamada a `transitionTo()` o `applyPersistedSettings()` se encadena sobre la anterior con `.then()`, y un rechazo se atrapa (`.catch(() => undefined)`) para que un fallo en una transición nunca bloquee la siguiente. Esto significa que dos transiciones disparadas casi al mismo tiempo (por ejemplo, un doble click accidental) se ejecutan una tras otra, nunca en paralelo — la bandera `isTransitioning` además bloquea activamente cualquier intento nuevo mientras la anterior corre.

Al aplicar una transición (`applyOrRecover`):

1. Si el modo actual es `FULL`, se guarda una foto de la visibilidad de paneles (`snapshotPanelVisibility`) — es lo único que hace falta recordar para poder restaurarlo al volver a `FULL` más tarde.
2. Se calcula el `PresentationState` completo del modo destino (`buildStateForMode`): posición del avatar, banderas de ventana (transparencia/bordes/redimensionable/siempre-encima/enfocable/click-through), y visibilidad de paneles.
3. Fuera de `FULL`, la visibilidad de actividad siempre se fuerza a `HIDDEN` (`resolvePanelVisibility`) — no hay panel de actividad visible en `COMPANION` ni en `PET`, sin importar lo que estuviera antes.
4. Se aplica el nuevo estado a la ventana real (`applyWindowState`) y, si tiene éxito, se copia sobre el estado reactivo (`Object.assign`). Si falla, se dispara la recuperación (ver "Qué pasa si una transición falla" más abajo).

## Aplicar el estado a la ventana real: main vs. pet

`applyWindowState` distingue dos casos:

- **Modo destino no es `PET`** (`FULL` o `COMPANION`): se aplican las 6 banderas de ventana una por una sobre la ventana principal (`setTransparent`, `setBorderless`, `setResizable`, `setAlwaysOnTop`, `setFocusable`, `setIgnoreMouseEvents`), y luego se ejecuta `leavePetGeometry`: oculta la ventana pet si estaba visible (`hidePetWindow`), maximiza la ventana principal si el destino es `FULL` (`setMaximized(true)` — `COMPANION` no maximiza), la muestra (`show`) y le devuelve el foco (`focus`).
- **Modo destino es `PET`**: las 6 banderas de la ventana principal **no se tocan** (la ventana pet es un proceso Tauri separado con su propia configuración fija de transparencia/bordes/foco, creada en `pet-window.ts`) y se ejecuta `enterPetGeometry`: oculta la ventana principal (`hide`) y muestra/crea la ventana pet (`showPetWindow`) en la posición resuelta, con el tamaño configurado y la preferencia de "siempre encima".

Un comentario del código aclara por qué `PET.window.focusable` es `false` a propósito: Tauri no soporta una ventana con click-through solo sobre el propio dibujo del avatar (fue evaluado en el Hito 1 del plan histórico) — la ventana pet tiene exactamente el tamaño del avatar, así que "capturar todo el clic" ES el mecanismo real por el que "click en el VTuber" restaura `FULL`; no existe un modo donde se pueda hacer click *a través* de la ventana pet hacia lo que hay detrás.

## Dónde vive el avatar en modo pet: una ventana Tauri separada, no un `<div>` flotante

`src/pet-window.ts` crea y gestiona una `WebviewWindow` de Tauri con label fijo `'pet'`, apuntando a la misma `index.html` que la ventana principal (Vue decide qué componente montar según en qué ventana se ejecuta — ver `PetView.vue` más abajo). Puntos confirmados en vivo (vía CDP), no solo deducidos del código:

- Llamar `setSize`/`setPosition` inmediatamente después de `new WebviewWindow(...)` no sirve: el webview real tarda en crearse de forma asíncrona, y esas llamadas se pierden en silencio contra un handle que Tauri aún no terminó de generar. Por eso `createPetWindow` envuelve la creación en una promesa que solo resuelve tras el evento `tauri://created` (o rechaza tras `tauri://error`) — confirmado porque la primera apertura real de una sesión se quedaba con el tamaño por omisión de Tauri (800×600) pese a pedir 100×100.
- La ventana se crea una sola vez por ejecución de la app y se reutiliza (`getOrCreatePetWindow`): la variable de módulo `petWindow` no sobrevive a un recargo del frontend, pero el webview real de Tauri sí, así que sin el chequeo `WebviewWindow.getByLabel('pet')` un segundo intento de crear la ventana con la misma etiqueta rechazaría con un error de Tauri ("a webview with label `pet` already exists").
- Tras crear la ventana (solo la primera vez), se invoca el comando de backend `clear_pet_window_menu` (best-effort, con `.catch(() => undefined)`): sin esto, el menú nativo de la app (aplicado globalmente vía `setAsAppMenu()` en `native-menu.ts`) se hereda en la ventana pet, y Windows reserva una fila para la barra de menú incluso con `decorations: false` — un defecto visual real, ya corregido.
- La ventana se crea con `shadow: false` explícitamente: la documentación de Tauri confirma que una ventana sin decoraciones con sombra activa dibuja un borde blanco de 1px en Windows — exactamente el defecto visual que se había reportado.

`showPetWindow(position, size, alwaysOnTop)` siempre re-aplica las 4 propiedades (`setAlwaysOnTop`, `setSize`, `setPosition`, `show`) en cada llamada, no solo en la creación — así una reentrada a modo `PET` con un tamaño o posición distintos (por ejemplo, tras cambiar el control deslizante de tamaño) siempre se refleja. `hidePetWindow()` es tolerante a que la ventana nunca se haya creado (`petWindow?.hide()`, no lanza si es `null`).

## Qué se sincroniza entre la ventana principal y la ventana pet

Las dos ventanas son procesos con memoria completamente separada (no hay estado JS compartido). La sincronización es unidireccional y por eventos de Tauri (`src/pet-sync.ts`, 3 constantes de nombre de evento + 1 interfaz de payload):

- **`PET_SYNC_EVENT`** (`'pet-sync'`): la ventana principal emite este evento con un `PetSyncPayload` completo (estado y expresión del avatar, boca abierta, personaje activo, si hay sesión activa, visibilidad/indicador/burbuja de la señal de atención, y los datos de animación/pose/duración de transición del estado activo) cada vez que cualquiera de esos valores cambia — `App.vue` lo hace con un `watch(petSyncPayload, ..., { deep: true, immediate: true })` (línea 1019), así que el primer envío ocurre apenas se monta la app, sin esperar un cambio real.
- **`PET_SYNC_REQUEST_EVENT`** (`'pet-sync-request'`): la ventana pet lo emite una vez al montarse (`onMounted` en `PetView.vue`), para pedir el estado actual sin tener que esperar al próximo cambio real en la ventana principal — que a su vez tiene un listener para este evento y responde reemitiendo `petSyncPayload.value` inmediatamente (`App.vue` línea 1656).
- **`PET_RESTORE_REQUESTED_EVENT`** (`'pet-restore-requested'`): la ventana pet lo emite al detectar un click real (sin arrastre de por medio) sobre el avatar; la ventana principal escucha este evento y llama `switchToFullMode()` (`App.vue` línea 1652-1655).

`PetView.vue` es exclusivamente un receptor pasivo de este estado — nunca decide nada por su cuenta (ni el estado del avatar, ni si hay sesión activa, ni la visibilidad de la señal de atención): solo pinta lo que le llega por `PET_SYNC_EVENT` en su función `applySync`. La única lógica propia que tiene es la detección de arrastre vs. click (ver siguiente sección) y la carga independiente de la lista de personajes importados (`listImportedCharacters()`, necesaria porque el catálogo importado no viaja dentro del payload de sincronización, solo el id del personaje activo).

## Arrastrar la ventana pet vs. hacer click para volver a FULL

Ambos gestos empiezan con `mousedown` sobre el mismo elemento (`.pet-stage`, con `role="button"` y `tabindex="0"` para accesibilidad por teclado). `PetView.vue` los distingue con un umbral de distancia (`DRAG_THRESHOLD_PX = 4`):

1. `onPetMouseDown` registra el punto inicial (`dragStart`) y añade listeners globales de `mousemove`/`mouseup` a `window` (no al elemento, para seguir capturando el movimiento aunque el cursor salga del área del avatar).
2. `onPetMouseMove` calcula la distancia euclidiana (`Math.hypot`) desde el punto inicial; mientras sea menor a 4px, no hace nada (se considera todavía un posible click). En cuanto se supera el umbral, marca `didDrag = true` de forma permanente para este gesto, llama `windowManager.startDragging()` (delega el arrastre real de la ventana al sistema operativo vía Tauri) y, una vez eso resuelve, persiste la nueva posición en disco (`persistDraggedPosition`).
3. `onPetMouseUp` limpia el estado (`dragStart = null`) y remueve ambos listeners globales, sin importar si hubo arrastre o no.
4. `requestFullMode` (disparado por click, Enter o Space sobre `.pet-stage`) solo actúa si `didDrag` es `false` — un arrastre real nunca dispara accidentalmente la restauración a `FULL`.

En Windows, `startDragging()` de Tauri no resuelve su promesa hasta que se suelta el botón del mouse — por eso leer la posición de la ventana justo después de que esa promesa resuelve (`windowManager.getPosition()`) ya captura el punto final del arrastre, sin necesitar suscribirse al evento `onMoved` de la ventana.

## Persistencia de la posición arrastrada de la ventana pet

`persistDraggedPosition` (en `PetView.vue`) lee la posición actual de la ventana (`getPosition()`), lee el resto de `AppSettings` ya guardados (`getAppSettings()`) y los reescribe completos con `petWindowPosition` actualizado (`setGlobalAppSettings`). Un fallo en cualquiera de estos pasos solo se registra en consola (`console.error`) — nunca interrumpe el arrastre visualmente ni lanza un error hacia la interfaz.

La ventana principal (`App.vue`) nunca confía en su copia en memoria de `petWindowPosition` para decidir dónde reaparecerá la mascota la próxima vez: `syncPetWindowPositionBeforeActivating()` se llama justo antes de cada `switchToPetMode()` y relee `getAppSettings()` desde disco, por si la posición cambió por un arrastre ocurrido en la ventana pet (proceso separado) durante la sesión actual. Sin esta relectura, la ventana principal se quedaría con el valor en memoria de cuando arrancó la sesión, ignorando cualquier arrastre posterior.

Un punto arrastrado y persistido **siempre gana** sobre el cálculo automático de esquina (`resolvePetPosition`), hasta que se restaura explícitamente: `onRestorePetWindowPosition()` pone `petWindowPosition` a `null` tanto en memoria (`presentationManager.setPetWindowPosition(null)`) como en disco (persiste `petWindowPosition: undefined`), y si el modo `PET` ya está activo en ese momento, recalcula la geometría de inmediato (`refreshPetGeometry()`) sin pasar por una transición de modo normal — la máquina de estados no tiene una transición `PET -> PET`, así que este caso necesita su propio método dedicado.

## Cómo se calcula la posición por defecto (esquina de pantalla)

Sin una posición arrastrada guardada, `resolvePetPosition` construye una posición de tipo `screen_corner` con la esquina configurada (`petWindowCorner`, por omisión `'bottom-right'`) y un margen fijo de 20px en ambos ejes (`PET_WINDOW_MARGIN`). Luego resuelve qué monitor usar: si hay un `petMonitorId` guardado, busca ese monitor exacto entre `getMonitors()`; si no, usa el monitor donde está la ventana actualmente (`getCurrentMonitor()`). Si ningún monitor resuelve (por ejemplo, el monitor guardado ya no está conectado), se devuelve la posición de esquina *sin resolver a coordenadas absolutas* — queda como responsabilidad de la capa de `TauriDesktopWindowManager` resolverla contra el monitor actual real en el momento de aplicarla.

`calculateCornerPosition` (`src/monitor-position.ts`) es la función pura que convierte `(monitor, corner, tamaño de ventana)` en coordenadas `{x, y}` absolutas, usando siempre el `workArea` del monitor (el área utilizable, excluyendo la barra de tareas), nunca sus `bounds` totales — así la ventana pet nunca queda parcialmente tapada por la barra de tareas del sistema.

## La capa `DesktopWindowManager`: por qué existe

`src/desktop-window-manager.ts` define la interfaz `DesktopWindowManager` (21 métodos reales — ver referencia para el listado completo) que abstrae toda interacción con la ventana nativa. Ningún componente Vue llama a la API de ventanas de Tauri (`getCurrentWindow()`, etc.) directamente; todos pasan por esta interfaz, cumpliendo la regla de arquitectura del proyecto ("la presentación no sabe que es escritorio"). Su única implementación real hoy es `TauriDesktopWindowManager`.

Cada método sigue el mismo patrón interno (`guarded()`): primero comprueba si hay una falla de capacidad simulada armada para ese método exacto (solo posible en `import.meta.env.DEV`, ver más abajo); si no, ejecuta la operación real contra Tauri envuelta en un `try/catch` que homogeniza cualquier error nativo a un `WindowManagerError` tipado con una de 5 categorías (`window-management-error`, `unsupported-capability`, `mode-change-error`, `window-restore-error`, `monitor-query-error`). Un error que ya viene con esa forma (por ejemplo, lanzado desde dentro de la propia clase) se relanza tal cual, sin envolverlo dos veces.

Caso especial documentado en el propio código: Tauri no permite alternar en runtime la propiedad de creación `transparent` de una ventana ya creada (referenciado como ADR-0008) — `setTransparent` simula el efecto pintando el color de fondo de la ventana entre un blanco opaco (`[255,255,255,255]`) y transparente real (`[0,0,0,0]`) en vez de recrear la ventana.

Otro caso especial: `setIgnoreMouseEvents` con la opción `hitTestAvatarOnly: true` lanza deliberadamente un error explicativo ("clic solo sobre el avatar no soportado por Tauri") en vez de intentar simular algo que no es posible — el modo `PET` resuelve el mismo problema de raíz de otra forma (una ventana del tamaño exacto del avatar, ver más arriba), así que esta opción del tipo `MouseEventOptions` queda documentada como parte del contrato pero sin ninguna llamada real que la use con `true` hoy.

## Fault injection: simular fallos de ventana solo en desarrollo

Dos mecanismos independientes de simulación de fallos, ambos exclusivos de `import.meta.env.DEV` (se tree-shakean por completo del bundle de producción):

- **`armMissingWindowCapability(capability | null)`** (en `desktop-window-manager.ts`): simula que un método concreto de `DesktopWindowManager` no está disponible. Es de un solo uso: la próxima llamada a ese método exacto lanza el error correspondiente y el armado se limpia solo (`armedCapability = null`), sin afectar llamadas posteriores.
- **`armPresentationTransitionFault(mode | null)`** (en `presentation-manager.ts`): simula que la transición *hacia* el modo indicado falla con un mensaje fijo (`'fallo de transicion inyectado (dev-only)'`). También de un solo uso — se consume la primera vez que se intenta transicionar a ese modo exacto.
- **`armSimulatedMonitors(monitors | null)`** (en `monitor-position.ts`): reemplaza por completo `getMonitors()`/`getCurrentMonitor()` con una lista fija de monitores simulados. A diferencia de los dos anteriores, **no** es de un solo uso — persiste hasta que se desarma explícitamente pasando `null`, lo que permite reproducir configuraciones de multi-monitor sin depender del hardware real de la máquina de desarrollo.

Estos hooks son la base de las pruebas manuales TC-067 (fallo de transición), TC-079 (capacidad ausente) y TC-091/TC-096 (configuraciones de monitor simuladas), y también están expuestos al panel de depuración interno — ver [robustez-y-actualizaciones](../robustez-y-actualizaciones/overview.md).

## Qué pasa si una transición falla: recuperación a modo seguro

Cualquier error real durante `applyWindowState` (o un fallo inyectado) cae en `recoverFromFailedTransition`, que sigue siempre el mismo orden, citado literalmente en el código como la taxonomía de errores del proyecto: **registrar, dejar la sesión intacta (no le corresponde a esta capa cerrarla), volver a un modo seguro, informar a la persona usuaria, y nunca dejar la app en un estado inalcanzable**.

1. `registerFault`: registra el fallo en la taxonomía de fallos compartida (`registerFailure('mode-change-error', mensaje)` — ver [robustez-y-actualizaciones](../robustez-y-actualizaciones/overview.md)). Ambos tipos de error de presentación (`invalid-transition` y `transition-failed`) se registran bajo la misma categoría, deliberadamente: el mensaje no intenta distinguir qué capacidad concreta de ventana falló mediante texto frágil.
2. `restoreSafeMode`: intenta reaplicar el estado actual conocido (`this.state`, el último que se sabía consistente) contra la ventana real. Si **eso también falla**, cae a `applyLastResort`: fuerza un set fijo de banderas seguras y "aburridas" (no transparente, con bordes, redimensionable, sin siempre-encima, enfocable, sin click-through) y dispara las 6 llamadas de recuperación en paralelo con `Promise.allSettled` — deliberadamente `allSettled` y no `Promise.all`, para que un fallo en una de las 6 llamadas no impida que las otras 5 se intenten igual.
3. `notifyFault`: llama a todos los handlers suscritos vía `onTransitionFault()`. `App.vue` (línea 549) usa esto para poblar `presentationError`, que se muestra como un mensaje visible con ícono de error justo debajo de los controles de modo (ver referencia, sección de plantilla).

Ningún fallo de transición cierra la sesión de Claude Code activa ni la reinicia — la sesión y la presentación son capas completamente independientes.

## El modo inicial se aplica una sola vez, desde configuración persistida

`applyPersistedSettings(settings)` es un método distinto de `transitionTo()`, pensado para llamarse exactamente una vez al arrancar la app, antes de cualquier transición real (`AC-028.1`). Recibe un subconjunto explícito de `AppSettings` (`PersistedPresentationSettings`: `corner`, `windowSize`, `alwaysOnTop`, `monitor`, `initialMode`, `activityVisibility`, `petWindowPosition` opcional) — un tipo deliberadamente separado del módulo de configuración completo, para evitar un import circular.

Un detalle documentado en el propio código explica por qué este método siempre reaplica el estado incluso si el modo inicial coincide con el valor por omisión en memoria (`FULL`, igual que `DEFAULT_STATE.mode`): la ventana real de Tauri se crea siempre con `transparent: true` a nivel de configuración de la app (referenciado como ADR-0008), así que sin esta llamada explícita, si el modo inicial fuera igual al default en memoria, el código nunca ejecutaría el `setTransparent(false)` que pinta el fondo opaco real de `FULL`/`COMPANION` — la ventana se quedaría genuinamente transparente en pantalla.

## Controles de modo en la interfaz (tablist FULL/COMPANION)

Con una sesión activa, `App.vue` muestra una tablist ARIA de dos pestañas — "Modo completo" (`FULL`) y "Modo compañera" (`COMPANION`) — visible siempre que hay sesión, nunca escondida detrás de otra pestaña (`AC-023.4`/`AC-024.4`). Deliberadamente no tiene `PET` como una tercera pestaña: entrar a `PET` se hace con el botón flotante "Enviar al escritorio" (ver [ui-compartida](../ui-compartida/overview.md) para `SendToDesktopButton`), no con esta tablist, porque una vez en `PET` la ventana principal completa queda oculta y no hay ninguna pestaña visible que pulsar.

Un detalle de accesibilidad documentado en el propio código: a diferencia de las demás tablists de la app, esta no lleva `aria-controls` apuntando a un panel — porque `FULL` y `COMPANION` son subárboles `v-if`/`v-else-if` mutuamente excluyentes en el DOM (nunca coexisten), así que no hay un único id de panel válido al que apuntar en todo momento.

Navegación por teclado reutiliza las primitivas puras y genéricas de [ui-compartida](../ui-compartida/reference.md) (`isTabArrowKey`, `nextTabId`, `createTabFocusRegistry`) — las mismas que usa la tablist de pestañas secundarias y la de vista de consola — pero como cambiar de modo es una operación asíncrona con manejo de error (a diferencia de un cambio de pestaña plano), `App.vue` no puede usar el helper genérico `handleTabListKeydown` tal cual: reimplementa el mismo cálculo de "siguiente id" (`nextTabId`) y lo envuelve en su propia función asíncrona (`onModeTabKeydown`) que llama a `activateModeTab` y espera la transición antes de mover el foco.

Otro detalle de UX explicado en el código: el propio `PresentationManager` llama a `windowManager.focus()` en toda transición `FULL<->COMPANION` (dentro de `leavePetGeometry`), lo que en WebView2 (el motor de renderizado real en Windows) resetea el foco del DOM a `<body>` una vez termina. Sin re-aplicar el foco al botón de la pestaña activa después de esperar la transición (`onModeTabClick`/`onModeTabKeydown` llaman `modeTabFocus.focus(id)` después del `await`), se rompería el contrato de accesibilidad de una tablist (el tab activo debe conservar el foco) tanto al hacer click como al navegar con flechas.

## El menú nativo de la aplicación

`installNativeMenu` (`src/native-menu.ts`) construye el menú nativo completo de la ventana con la API `@tauri-apps/api/menu` (Tauri 2) y lo aplica con `menu.setAsAppMenu()` — se instala una sola vez, en `App.vue` (línea 1626), dentro del `onMounted` principal. Tiene 4 entradas de primer nivel, todas `Submenu` (un comentario del código explica que un `MenuItem` suelto entre 3 `Submenu` era un defecto visual reportado y corregido: mantener las 4 entradas como `Submenu` es visualmente consistente):

1. **Window**: un `CheckMenuItem` por cada pestaña secundaria alternable (la lista real de pestañas activables, no las siempre visibles), más un separador, más "Theme" (abre el selector de tema).
2. **Sesion**: información de solo lectura de la carpeta y el id de sesión actual (ambos como `MenuItem` deshabilitados salvo el id, que sí tiene acción — ver siguiente sección), un separador, "Cerrar sesion" (deshabilitado si no hay sesión activa), y una sección dinámica de hasta 5 sesiones recientes de esa carpeta insertada después de esos 4 items base.
3. **Character**: un `CheckMenuItem` por cada personaje del catálogo base, un separador, un `CheckMenuItem` por cada personaje importado (solo si hay alguno — la sección entera se omite si la lista de importados está vacía), otro separador, y "Agregar nuevo...".
4. **Comandos**: hoy contiene un único item, "Abrir listado" (abre el selector de comandos/plugins), habilitado solo si hay comandos disponibles para la sesión activa.

## Copiar el id de sesión desde el menú nativo: confirmación visual sin diálogo

El item de "Sesion: `<id>`" en el submenú Sesion tiene una acción real (a diferencia del item de carpeta, que es puramente informativo): al hacer click, copia el id real al portapapeles (`navigator.clipboard.writeText`) y cambia su propio texto para mostrar un sufijo de confirmación (`" (copiado)"`) durante 1.5 segundos (`SESSION_ID_COPIED_DISPLAY_MS`), tras lo cual vuelve a su texto normal. El comentario del código explica por qué: un menú nativo no tiene ninguna otra superficie visible disponible justo después del click (no hay un toast ni un tooltip posible desde ahí) — cambiar el propio texto del item es la única confirmación visual posible en ese contexto (`AC-100`).

## Sesiones recientes en el submenú: reemplazo completo, nunca acumulación

`setRecentSessions(outcome, folder)` recibe un resultado tipado (`RecentSessionsOutcome`: `{ status: 'ok', sessions }` o `{ status: 'read-failed' }`) y siempre empieza por borrar por completo los items dinámicos anteriores (`clearRecentSessionItems`) antes de insertar los nuevos — nunca los acumula sobre los de la carpeta anterior. Si la lectura del historial falló, inserta un único item deshabilitado con el texto "No se pudo leer el historial" (`AC-102` paso 5: un solo item deshabilitado con el aviso real, nunca una lista vacía indistinguible de "esta carpeta no tiene sesiones"). Si tuvo éxito pero no hay sesiones, inserta un único item deshabilitado "Sin sesiones recientes". Si hay sesiones, las ordena por fecha descendente y corta a un máximo de 5 (`RECENT_SESSIONS_LIMIT`), reutilizando `truncateSessionTitle` de [sesion-y-transporte](../sesion-y-transporte/reference.md) para el texto de cada item.

Los items dinámicos siempre se insertan en un índice fijo (`SESSION_SUBMENU_BASE_ITEM_COUNT = 4`, contando carpeta/id/separador/cerrar) — ese conteo es intencionalmente fijo y nunca depende de cuántos items recientes hubiera antes, así que insertar sobre una lista ya vacía o ya poblada da el mismo resultado correcto.

## Señales de atención: qué son y cuándo se muestran

Cuando hay peticiones de interacción pendientes (por ejemplo, una petición de permiso del agente — ver [ui-compartida](../ui-compartida/overview.md)) mientras la app está en modo `PET`, la persona usuaria necesita alguna forma de notarlo sin tener el chat visible. `resolveAttentionSignal(pendingInteractionCount, mode)` (`src/attention-signals.ts`) es la única función que decide si la señal debe estar visible, con una regla intencionalmente estricta y de una sola línea: **visible solo si hay al menos una petición pendiente Y el modo actual es `PET`** — en `FULL`/`COMPANION` la fila de peticiones de interacción ya es visible directamente en la interfaz, así que la señal de atención (pensada para cuando esa fila no se puede ver) sería redundante.

Un comentario del código marca una frontera de confianza estructural: esta función solo recibe el **número** de peticiones pendientes, nunca el módulo de peticiones de interacción en sí (`interaction-requests.ts`) — el dominio de presentación no necesita saber nada sobre el contenido o tipo de una petición, solo si hay alguna.

El mensaje de texto de la señal es una constante compartida, `ATTENTION_SIGNAL_MESSAGE = 'Necesito tu autorizacion'`, reutilizada tanto por la burbuja visual en modo pet como por el título/cuerpo de la notificación del sistema operativo.

## Las 6 variantes configurables de la señal de atención (y por qué solo 5 son independientes)

`AttentionSignalSettings` (`src/attention-signal-settings.ts`) define 6 campos booleanos independientes que la persona usuaria puede activar o desactivar por separado: `expressionChange`, `animation`, `visualIndicator`, `bubble`, `voice`, `systemNotification`. Solo 5 de ellos se guardan directamente en `localStorage` bajo la clave `codetuver-avatar.attention-signals.settings` — `voice` se resuelve siempre en tiempo de carga desde `loadVoiceEnabled()` (del módulo de texto-a-voz), nunca como un booleano paralelo propio, para no poder quedar desincronizado del ajuste real de voz de la app.

Los valores por omisión (`DEFAULT_STORED_SETTINGS`, confirmados por `TC-080`) activan solo **cambio de expresión** e **indicador visual** — deliberadamente no las 6 variantes a la vez, para no ser intrusivo por omisión. Una configuración guardada corrupta o parcial (JSON inválido, o un objeto al que le faltan campos) cae de vuelta a los valores por omisión sin lanzar error (`{ ...DEFAULT_STORED_SETTINGS, ...JSON.parse(raw) }` dentro de un `try/catch`).

De las 6 variantes, solo 2 están efectivamente cableadas en la ventana pet hoy: **`visualIndicator`** (un punto pulsante en la esquina superior derecha del avatar, con `prefers-reduced-motion` respetado — la animación se desactiva por completo si el sistema operativo lo pide) y **`bubble`** (un globo de texto con el mensaje de atención, encima del avatar). Ambas viajan dentro de `PetSyncPayload` como banderas ya resueltas (`attentionVisualIndicator`, `attentionBubble`) — la ventana pet nunca vuelve a evaluar `AttentionSignalSettings` por su cuenta, solo pinta lo que le llega.

## Notificación del sistema operativo: solo en el flanco de subida, solo en modo pet

`notifyOnRisingEdgeInPetMode` (`App.vue`, línea 1033) vigila el conteo de peticiones pendientes con un `watch` que compara el valor nuevo contra el anterior, y dispara la notificación del sistema operativo (`sendAttentionNotification`) solo si se cumplen las 3 condiciones a la vez: el conteo anterior era `0` (nadie estaba ya esperando), el conteo nuevo es mayor que `0` (acaba de aparecer al menos una petición), y el modo actual es `PET`. Esto evita notificar repetidamente mientras la petición sigue pendiente, y evita notificar si la persona ya está viendo la fila de peticiones directamente en `FULL`/`COMPANION`.

`sendAttentionNotification` (`src/system-notification.ts`) usa el plugin `@tauri-apps/plugin-notification`: primero comprueba (o pide, si hace falta) el permiso del sistema operativo (`isPermissionGranted`/`requestPermission`); sin permiso concedido, la función simplemente no hace nada — no lanza error, no bloquea, y las demás señales de atención (indicador visual, burbuja, cambio de expresión) siguen funcionando con normalidad. Cualquier error real al enviar la notificación se atrapa y solo se registra en consola.

## Tamaño de la ventana pet: control deslizante con límites fijos

El tamaño de la mascota se controla con un único control deslizante (rango `100px`–`800px`, `PET_WINDOW_SIZE_MIN_PX`/`PET_WINDOW_SIZE_MAX_PX` en `src/pet-window-size.ts`), reutilizando el mismo campo `AppSettings.windowSize` que ya existía para otro propósito — un comentario aclara que la decisión de diseño original (`D10`) solo pedía que existiera *algún* control, no una representación de datos nueva. El límite superior (800px) se eligió deliberadamente por debajo de 1280px (el ancho mínimo de referencia real considerado, resolución 1366×768), para dejar margen visible de arrastre incluso en el monitor más pequeño contemplado.

`sanitizePetWindowSizePx(value)` tolera cualquier valor guardado corrupto (no numérico, `NaN`, `Infinity`) devolviendo el valor por omisión (`200px`, `DEFAULT_PET_WINDOW_SIZE_PX`) sin lanzar error — misma filosofía de tolerancia que el resto de las preferencias persistidas del proyecto. Al mover el control, `onPetWindowSizeChange` actualiza el tamaño en memoria del `PresentationManager` (`setPetWindowSize`, efecto inmediato solo si `PET` ya está activo) y lo persiste en disco en la misma operación.

## Sanitización de la posición arrastrada de la ventana pet

`sanitizePetWindowPosition(value)` (`src/pet-window-position.ts`) valida que un valor cargado de disco tenga exactamente forma `{ x: number, y: number }` con ambos valores numéricos finitos (redondeados a enteros); cualquier otra forma —incluido `undefined`, un objeto con campos faltantes, o coordenadas no finitas— cae a `null`, que a su vez hace que `resolvePetPosition` recurra al cálculo automático de esquina. `describePetWindowPosition(position)` es la función pura de presentación textual usada en el panel de configuración: `null` se muestra como `"Default (esquina inferior derecha)"`, cualquier posición real como `"Personalizada (x, y)"`.

## Límites y comportamientos actuales (no "bugs pendientes", así funciona hoy)

- Solo existen las 6 transiciones documentadas arriba; no hay transición directa `PET -> PET` ni ninguna forma de "refrescar" el modo actual salvo el método dedicado `refreshPetGeometry()` (usado únicamente al restaurar la posición de la mascota).
- El modo `PET` nunca logra click-through parcial (clic solo sobre el dibujo del avatar, dejando pasar el resto); Tauri no lo soporta, y la solución real del proyecto es dimensionar la ventana pet exactamente al tamaño del avatar en vez de intentar simularlo.
- `setTransparent` no cambia una propiedad de creación de ventana en runtime (Tauri no lo permite); simula el efecto pintando el color de fondo. Cualquier otro efecto visual que dependiera de una transparencia "real" de composición del sistema operativo no está soportado.
- La reconstrucción de la posición legible de esquina (`describePetWindowPosition`) y el cálculo de esquina real (`calculateCornerPosition`) siempre usan el `workArea` de un monitor, nunca sus `bounds` totales — la ventana pet nunca se posiciona sobre el área de la barra de tareas.
- De las 6 variantes configurables de señal de atención, solo `visualIndicator` y `bubble` están cableadas visualmente en `PetView.vue` hoy; `expressionChange` y `animation` afectan al avatar en sí mismo a través de otras capas (ver [animacion-y-render](../animacion-y-render/overview.md)), y `systemNotification` dispara la notificación del sistema operativo — pero no hay ningún efecto adicional específico de estas señales más allá de esos mecanismos ya descritos.
- Ambos mecanismos de fault injection de un solo uso (`armMissingWindowCapability`, `armPresentationTransitionFault`) se autolimpian tras la primera vez que se consumen; `armSimulatedMonitors` es la única excepción y persiste hasta desarmarse explícitamente con `null`.
- El menú nativo se instala una única vez por arranque de la app (`onMounted` de `App.vue`); no hay ningún camino que lo reconstruya completo en caliente — sus 4 submenús se actualizan incrementalmente vía el `NativeMenuHandle` devuelto (`setPluginsEnabled`, `setTabChecked`, `setSessionInfo`, `setActiveCharacter`, `addImportedCharacter`, `setRecentSessions`), nunca recreando el menú entero.

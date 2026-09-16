# Orquestación de la aplicación

`src/App.vue` (3389 líneas) es el componente raíz de la ventana principal — el único lugar del proyecto donde los demás dominios se conectan entre sí. No implementa lógica de negocio propia de ningún dominio (eso vive en los módulos `.ts` que importa); su responsabilidad real es cablear: mantiene el estado compartido (sesión activa, chat, consola de actividad, configuración persistida), decide qué overlay/pestaña se ve, y traduce eventos crudos del proceso de Claude Code en llamadas a los motores de cada dominio (reacciones, avatar, voz).

`PetView.vue` (montado en la ventana `pet`, ver [presentacion-y-ventana](../presentacion-y-ventana/overview.md)) es una raíz distinta y mucho más pequeña — no comparte instancia de componente con `App.vue`, se sincroniza vía eventos de Tauri (`PET_SYNC_EVENT`).

## Qué NO hace `App.vue`

No decide reacciones (delega a [reacciones-y-voz](../reacciones-y-voz/overview.md) vía `reactToEvent`), no interpreta el proceso de Claude Code (delega a [sesion-y-transporte](../sesion-y-transporte/overview.md)), no dibuja el avatar (delega a un `AvatarController` de [animacion-y-render](../animacion-y-render/overview.md)), no toca la ventana nativa directamente (delega a `PresentationManager`, ver [presentacion-y-ventana](../presentacion-y-ventana/overview.md)). Es orquestación pura: recibe el evento, actualiza el estado central, reenvía a quien corresponda.

## Pila de overlays

Un único `OverlayId` (`'clear' | 'usageDetail' | 'themePopup' | 'characterImport'`) y una única pila real `openOverlayStack: Ref<OverlayId[]>` gobiernan los 4 overlays superpuestos posibles sobre `App.vue`. `pushOverlay(id)` mueve el id al final de la pila (quitándolo primero si ya estaba, para no duplicar); `popOverlay(id)` lo quita. La visibilidad de cada overlay es un `computed` que revisa `openOverlayStack.value.includes(id)` — no hay un `ref<boolean>` independiente por overlay.

**Escape cierra solo el overlay superior**, nunca todos a la vez: `closeTopOverlayOnEscape` lee el último elemento de la pila y llama al cerrador correspondiente desde `OVERLAY_CLOSERS: Record<OverlayId, () => void>`. Si la pila está vacía, Escape no hace nada. Esto significa que si dos overlays reales llegaran a estar abiertos a la vez, una sola pulsación de Escape cierra únicamente el que se abrió después — hoy el flujo real de la app nunca deja que dos entren a la pila simultáneamente (cada overlay se abre desde un punto donde el anterior ya se cerró), así que este caso no es alcanzable en producción, solo lo permite el propio diseño del tipo `OverlayId[]` como pila genérica.

Cada overlay maneja su propio foco: guarda `document.activeElement` antes de abrir (`...ReturnFocus`), enfoca el primer control real dentro del panel tras `nextTick`, y devuelve el foco al cerrar. `characterImport` además atrapa `Tab` dentro del panel (`trapCharacterImportOverlayTab` → `trapOverlayTab`, el mismo patrón de foco atrapado que usa `EditorModal.vue`, ver [ui-compartida](../ui-compartida/overview.md)) y **no se cierra con Escape mientras hay una importación en vuelo** (`isImportingCharacterFile.value`) — si se permitiera, el resultado de `confirmCharacterImport` (éxito o error) quedaría calculado pero invisible tras el `v-if` que ya desmontó el panel.

## Pestañas secundarias y visibilidad de paneles

`SECONDARY_TABS` define 5 pestañas reales: `avatar`, `actividad`, `salida-cruda`, `configuracion`, `editor-personaje`. `avatar` siempre está presente y no es desactivable; las otras 4 (`TOGGLEABLE_SECONDARY_TABS`) se pueden ocultar u mostrar desde el submenú nativo "Window" del sistema operativo — `enabledTabs: Record<ToggleableSecondaryTab, boolean>` guarda cuáles están activas, y `visibleSecondaryTabs` (computed) filtra `SECONDARY_TABS` contra ese mapa. `activeSecondaryTab` es la pestaña actualmente seleccionada (siempre una de las visibles).

Independiente de las pestañas secundarias, `presentationState.activityVisibility` (`'VISIBLE' | 'HIDDEN'`, gobernado por `PresentationManager`) controla si la consola de actividad se muestra dentro de la pestaña "Avatar" en modo `FULL`. Es un estado global, no por pestaña: ocultar la actividad desde la pestaña "Actividad" y luego entrar a la pestaña "Avatar" no revive la vista de actividad automáticamente — hay un comentario real en el código (línea ~2216) documentando exactamente esta trampa de UX y por qué el botón de "restaurar" vive donde vive.

El modo de presentación (`FULL`/`COMPANION`) tiene su propio par de pestañas (`MODE_TABS`, `activateModeTab`) con su propio registro de foco (`modeTabFocus`), independiente del registro de las pestañas secundarias (`secondaryTabFocus`) — ambos usan el mismo helper `createTabFocusRegistry()` pero son instancias separadas, cada una sigue el patrón ARIA de tabs real (flechas para moverse, `Tab` para salir del tablist). El modo `PET` no tiene pestañas de modo visibles (es una ventana distinta, ver [presentacion-y-ventana](../presentacion-y-ventana/overview.md)).

## Ciclo de vida de la sesión desde `App.vue`

- **`beginSession(cwd)`** — descarta cualquier estado previo (`chatState`, `activityConsole` se recrean desde cero con `createChatState()`/`createActivityConsoleState()`), aplica la configuración de proyecto (`initializeAppSettings(cwd)`), y arranca vía `startSessionWithRetry` (ver [sesion-y-transporte](../sesion-y-transporte/overview.md)). Si falla, restaura `chosenCwd`/`sessionId` a los valores previos en vez de dejarlos en un estado a medio construir.
- **`resumeSession(cwd, sessionId, fork, folder)`** — a diferencia de `beginSession`, no limpia el chat: siembra `chatState`/`activityConsole` leyendo el transcript real de la sesión pasada (`readSessionTranscript`/`readSessionActivityEvents`) antes de arrancar, porque el proceso reanudado **no reemite los turnos previos como eventos** (verificado en vivo, comentado explícitamente como AC-113).
- **`closeActiveSession()`** — no hace nada si no hay sesión activa; si la hay, cierra el transporte y limpia `sessionActive`/`sessionId`. No limpia `chatState` (el historial queda visible tras cerrar).
- **`handleIncomingEvent(event)`** — el único punto real de entrada de eventos normalizados hacia el resto de la app: actualiza la consola de actividad, aplica el evento al estado de chat, y llama a `reactToEvent` (motor de reacciones, ver [reacciones-y-voz](../reacciones-y-voz/overview.md)). Contiene una regla real no obvia: la respuesta hablada de un turno completo del agente (`assistant_turn_complete`) se sintetiza a mano a partir de la última entrada cerrada del chat, pero **se omite por completo si el turno era la respuesta a un comando en caliente** (`/effort`, `/usage`, `/clear`) — esos comandos nunca se narran en voz.

## Hooks `window.__qa*`

`App.vue` expone en `onMounted` un conjunto de funciones bajo `window` (solo alcanzables por CDP/Playwright, nunca por el usuario real) que permiten a las pruebas en vivo disparar exactamente los mismos caminos de código que dispara la UI real o el menú nativo del sistema operativo — ver tabla completa en `reference.md`. Existen porque **el menú nativo de Windows vive fuera del DOM** y no es alcanzable por Playwright/CDP; los hooks llaman al mismo handler real que ese menú invocaría, nunca simulan el menú en sí (la app tiene una regla explícita: no se pilota el menú nativo simulando clics o teclas).

## Referencias cruzadas

- [sesion-y-transporte](../sesion-y-transporte/overview.md) — transporte real, normalización de eventos, historial de sesiones que `beginSession`/`resumeSession` consumen.
- [chat-y-contenido](../chat-y-contenido/overview.md) — `chatState`, `applyChatEvent`, comandos en caliente.
- [reacciones-y-voz](../reacciones-y-voz/overview.md) — `reactToEvent`, motor de reacciones que consume cada evento normalizado.
- [animacion-y-render](../animacion-y-render/overview.md) — `AvatarController` cuyo snapshot expone `__qaState`.
- [gestion-de-personajes](../gestion-de-personajes/overview.md) — `activateCharacter`, overlay de importación de personaje.
- [presentacion-y-ventana](../presentacion-y-ventana/overview.md) — `PresentationManager`, `activityVisibility`, modos FULL/COMPANION/PET, `PetView.vue`.
- [administracion-y-configuracion](../administracion-y-configuracion/overview.md) — `initializeAppSettings`, persistencia de settings.
- [ui-compartida](../ui-compartida/overview.md) — `EditorModal`, patrón de foco atrapado que reutiliza el overlay de importar personaje.
- [robustez-y-actualizaciones](../robustez-y-actualizaciones/overview.md) — `registerFailure`, `checkForUpdateSilently`, ambos cableados desde `App.vue`.

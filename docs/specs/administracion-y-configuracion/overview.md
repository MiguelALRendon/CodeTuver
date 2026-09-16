# Administración y configuración

Cubre tres mecanismos reales: el panel de administración de Claude Code (plugins y servidores MCP, ejecutando el binario `claude` real), la configuración persistente de la app (`AppSettings`, alcance global vs. por proyecto) y el tema visual (color primario, rueda de color).

## Panel de administración — plugins y MCP

`AdminSettingsPanel.vue` tiene 3 pestañas raíz (`role="tablist"`, navegación con flechas vía `handleTabListKeydown`): **Plugins**, **MCP**, **Ajustes**. La pestaña Plugins tiene 2 sub-pestañas independientes: **Instalados** e **Instalar**.

Todas las operaciones van contra el binario real `claude` en el sistema del usuario — no hay una API HTTP ni un mock; el núcleo Rust (`claude_admin.rs`) arma el `argv` exacto y lo ejecuta con `Command::new("claude").args(args)`, nunca a través de una shell (evita inyección de comandos: los argumentos nunca se concatenan en un string interpretado por `cmd.exe`/`sh`), con `stdin(Stdio::null())` (el proceso nunca puede quedar esperando input interactivo) y, en Windows, la bandera `CREATE_NO_WINDOW` (no aparece una consola visible).

### Recarga completa, nunca parcial

`loadAdminPanel()` es el único punto de entrada para poblar el panel: relee `listPlugins`, `listMcpServers` y `readAdminSettings` en paralelo (`Promise.all`) cada vez que se monta el panel o después de cualquier operación que cambie estado (activar/desactivar plugin, instalar, desinstalar, agregar/quitar servidor MCP). No existe una actualización optimista local del array `plugins`/`mcpServers` — cada acción exitosa dispara una relectura completa desde el binario real, así que la UI siempre refleja el estado que `claude` reporta en ese instante, no una copia que pudo quedar desincronizada.

### Filtrado de datos sensibles antes de cruzar a presentación (Rust)

El núcleo nunca reenvía la salida cruda de `claude` tal cual a la UI:
- `RawPlugin` → `PluginSummary`: descarta `installPath` y `mcpServers` (nunca se deserializan siquiera).
- `RawAvailablePlugin` → `AvailablePlugin`: descarta `source`.
- `filter_allowed_keys` sobre `.claude/settings.json`: solo la clave de nivel superior `permissions` cruza a presentación (`ALLOWED_SETTINGS_KEYS`); cualquier otra clave de nivel superior (secretos, tokens, rutas internas) queda fuera aunque el archivo real la contenga. Una clave anidada que se llame `permissions` dentro de otro objeto no cuenta — solo la de nivel superior real.

### Multi-proyecto: `belongs_to_project`

`claude plugin list --json` devuelve, sin filtrar, las instalaciones de **todos** los proyectos del usuario, no solo el actual. Para plugins con `scope: "project"`, `belongs_to_project()` compara la ruta guardada contra el `cwd` real de la sesión de forma insensible a mayúsculas (Windows) antes de incluirlo en `PluginSummary[]` — sin este filtro, un usuario vería en su panel plugins instalados en un proyecto completamente distinto.

### Instalar / activar / desactivar un plugin

1. Sub-pestaña **Instalar**: al abrirla por primera vez (`availablePluginsLoaded` en `false`) dispara `loadAvailablePlugins()`, que corre `claude plugin marketplace list`-equivalente y puebla `availablePlugins`. Un cuadro de búsqueda (`pluginSearch`) filtra en memoria por nombre, descripción o nombre de marketplace (`filteredAvailablePlugins`, sin volver a llamar al binario).
2. Clic en "Instalar" sobre un resultado → `installAvailablePlugin` → `installPlugin(pluginId)` → si `requiresRestart` viene en `true`, se muestra el aviso persistente "El cambio surte efecto en la próxima sesión de Claude Code" (no hay forma de reiniciar la sesión de Claude Code desde este panel; es solo información).
3. Sub-pestaña **Instalados**: cada fila tiene "Activar"/"Desactivar" (`togglePlugin`, invierte `plugin.enabled`) y "Detalles" (`togglePluginDetails`, carga texto crudo la primera vez y lo cachea en `pluginDetailsText` por id — `claude plugin details` no soporta `--json`, así que se muestra tal cual como texto preformateado).
4. "Agregar marketplace": campo de texto libre (URL, ruta local o `owner/repo` de GitHub) con validación mínima (no vacío) antes de llamar `addPluginMarketplace`; un error de formato del propio `claude` se muestra vía `adminError`, no se valida el formato en el cliente más allá de "no vacío".

### Desinstalar plugin / quitar servidor MCP — confirmación en 2 pasos, sin diálogo modal

Ambas acciones destructivas usan el mismo patrón in-place (sin `window.confirm` ni overlay separado): el botón de acción se reemplaza por un texto de confirmación + "Sí, [acción]" + "Cancelar", dentro de la misma fila de la lista. Mientras la operación está en curso, el botón de confirmación muestra un texto de progreso (`"Desinstalando..."` / `"Quitando..."`) y ambos botones quedan deshabilitados para evitar doble envío. El estado pendiente (`pendingUninstallId` / `pendingRemoveMcpName`) es una única referencia global del panel — abrir la confirmación de una fila nueva reemplaza cualquier confirmación pendiente anterior, nunca hay dos filas confirmando a la vez.

### Servidores MCP — 5 estados reales, no un booleano conectado/desconectado

`McpStatus` es una unión discriminada de 5 formas reales (ver [reference.md](reference.md) para el tipo exacto), parseadas desde la salida en **texto plano** de `claude mcp list` (no soporta `--json`): 4 símbolos reales (`✔`/`!`/`✘`/`⏸`) mapean a `connected`/`needs-authentication`/`pending-approval`/`failed{reason}`; cualquier símbolo no reconocido cae en `unknown{raw}` en vez de asumir un estado. Cada estado habilita un subconjunto distinto de acciones en la fila (ver tabla de acciones abajo).

**Autenticar un servidor MCP** abre un flujo OAuth real en el navegador del sistema — el backend nunca puede completarlo por sí solo (no hay TTY ni forma de interceptar el callback del navegador desde el proceso hijo). `authenticateMcp` solo distingue un **fallo temprano** (el proceso terminó con error dentro de una ventana de 4 segundos, `EARLY_DETECTION_WINDOW`) de "sigue en curso" — en ambos casos el usuario completa el login afuera de la app y debe refrescar el panel manualmente para ver el resultado. `describeMcpLoginOutcome` arma el mensaje: si el nombre del servidor empieza con `plugin:` (namespacing de plugin), añade una advertencia adicional de que la autenticación depende del plugin publicador y puede no abrir navegador.

**"Reintentar conexión"** no es un comando real de `claude mcp` — no existe tal concepto en el CLI (`list`/`get` ya revalidan la conexión en cada llamada). El botón literalmente vuelve a ejecutar `loadAdminPanel()` completo.

**Limpiar autenticación** — caso especial documentado: si el servidor es un conector de `claude.ai` (detectado por la cadena literal `"claude.ai connector"` en la salida de `claude mcp get`), el comando `claude mcp logout` reporta éxito (código de salida 0) pero **no hace nada real** — confirmado contra el CLI real. `is_claude_ai_connector_no_op` detecta este caso específico; la UI no distingue visualmente este no-op del caso exitoso real hoy (limitación conocida, ver abajo).

### Ajustes (solo lectura)

La tercera pestaña muestra `ScopedSettings { global, project }` — el resultado ya filtrado por el allowlist (`ALLOWED_SETTINGS_KEYS`) de `.claude/settings.json` global y del proyecto actual, como JSON preformateado (`JSON.stringify(..., null, 2)`). Un encabezado indica si cada archivo existe (`"presente"` / `"sin archivo"`) sin exponer su ruta completa en la UI. No hay ninguna acción de escritura en esta pestaña — es puramente informativa.

## Configuración persistente de la app (`AppSettings`)

`AppSettings` (definida en TS `src/app-settings.ts` y en Rust `src-tauri/src/app_settings.rs`, sincronizadas en camelCase) es el único objeto de configuración persistente de toda la aplicación — cubre posición/tamaño/opacidad de ventana, monitor preferido, modo inicial, visibilidad del panel de actividad, ancho de columna del chat, color primario, opciones de inicio de sesión y posición recordada de la ventana mascota.

### Alcance global vs. por proyecto

Existen dos archivos JSON reales en disco:
- **Global** (`global_settings_path`, bajo el directorio de datos de la app) — la base; se aplica siempre.
- **Por proyecto** (`project_settings_path(app_data_dir, cwd)`) — un archivo nombrado con un hash determinista del `cwd` (`project_hash`, `DefaultHasher` con claves fijas — nunca colisiona entre rutas con distinto casing/separador en el mismo proyecto real, cubierto por test), solo existe si el usuario cambió algo específico de ese proyecto.

`resolve_settings(app_data_dir, project_cwd)` combina ambos: el proyecto sobreescribe campo por campo lo que trae explícitamente (`merge()`, `.unwrap_or`/`.or` por cada campo — nunca un reemplazo total del objeto). Un archivo **ausente** (global o de proyecto) nunca es una falla — es el caso esperado la primera vez. Un archivo **presente pero corrupto** (JSON inválido) sí cuenta como falla real: `usedDefaults` se vuelve `true` y `initializeAppSettings()` en `App.vue` muestra el aviso "No se pudo leer tu configuración guardada; se está usando la configuración por omisión. La aplicación funciona con normalidad." — la app nunca se bloquea ni pierde funcionalidad por esto.

### Relectura antes de escribir — evita pisar cambios de otra ventana

`mergeAndPersistAppSettings(partial)` (TS, `app-settings.ts`) es el único punto de escritura usado desde `App.vue`. Antes de aplicar el `partial` recibido, vuelve a llamar `getAppSettings()` para traer el estado real más reciente del disco, en vez de confiar en una copia local (`loadedAppSettings.value`) que puede haber quedado obsoleta si **otra ventana de la misma app** (por ejemplo la ventana de la mascota, `PetView`, que corre en su propio proceso de renderizado) escribió configuración de por medio. Sin esta relectura, dos ventanas guardando en momentos distintos podrían pisarse una a la otra con datos viejos.

Sitios reales de llamada en `App.vue` (todos siguen el mismo patrón: mutar el estado reactivo local primero para respuesta inmediata en UI, luego persistir, y solo loguear por consola si falla — nunca se propaga el error hacia arriba ni bloquea la interacción):
- Restaurar posición de la ventana mascota a la esquina por omisión (`onRestorePetWindowPosition`, `petWindowPosition: undefined`).
- Cambiar el tamaño de la ventana mascota con el control deslizante (`onPetWindowSizeChange`, `windowSize: {width, height}`).
- Confirmar un nuevo color primario desde la rueda de color (`commitPrimaryColor`, `primaryColorRgb`).
- Un cuarto sitio (línea 1341) persiste otro campo de sesión/presentación siguiendo el mismo patrón.

### Arranque: `initializeAppSettings`

Se llama una vez al montar `App.vue` y de nuevo cada vez que cambia el `cwd` activo (por ejemplo, al reanudar una sesión en una carpeta distinta sin recargar la app completa) — es **idempotente a propósito**: cada llamada recalcula el aviso de "configuración corrupta" desde cero en vez de dejar pegado el resultado de una llamada anterior con un `cwd` distinto. En orden: lee `getAppSettings(cwd)` → aplica el ancho de columna del chat si vino guardado → sanitiza y aplica tamaño/posición de la ventana mascota → sanitiza y aplica el color primario (`applyPrimaryColorRgb`, escribe la custom property CSS `--color-primary-rgb`) → reconstruye el borrador de opciones de inicio de sesión → delega en `presentationManager.applyPersistedSettings(settings)` para todo lo relacionado a ventana/monitor real.

## Tema visual — color primario

Un único color primario (`PrimaryColorRgb = [number, number, number]`) controla toda la marca visual de la app vía la custom property CSS `--color-primary-rgb` (definida en `constants.css` como `217 119 87`, el naranja de marca de Claude — confirmado contra la marca real, no de memoria). `--color-accent-primary` y `--color-chat-bubble` (con alfa fijo `0.75`, sin control de transparencia propio) se derivan de esa misma variable, así que cambiar el color primario repinta ambos consistentemente sin tocar más tokens.

### Sanitización — nunca falla, nunca lanza

`sanitizePrimaryColorRgb(value)` acepta cualquier `unknown` (típicamente el campo `primaryColorRgb` recién leído de un JSON persistido, potencialmente corrupto): si no es un arreglo de exactamente 3 elementos, o si algún canal no es un número finito en `[0, 255]` tras redondear, devuelve `DEFAULT_PRIMARY_COLOR_RGB` completo — nunca un color parcialmente inválido, nunca lanza una excepción. Misma tolerancia que el resto de las preferencias del proyecto ante datos corruptos.

### `ThemePopup.vue` — rueda de color

Overlay controlado por `App.vue` (pila de overlays `openOverlayStack`, empujado/retirado por `openThemePopup`/`closeThemePopup`, con foco atrapado y devolución de foco al elemento que lo abrió, igual patrón que el resto de overlays modales de la app — ver [ui-compartida](../ui-compartida/overview.md)). Usa la librería ya instalada `@jaames/iro` con 2 componentes de layout: una rueda de matiz/saturación (`iro.ui.Wheel`) y un slider de valor (`iro.ui.Slider`, `sliderType: 'value'`) — **sin slider de alfa**, deliberado: la ausencia física de esa pieza del layout es lo que hace la transparencia no editable desde esta UI (el alfa `0.75` de las burbujas de chat es fijo en CSS).

Dos eventos reales de la librería, dos momentos distintos:
- `color:change` (arrastre en vivo) → `onColorChange` aplica el color inmediatamente vía `applyPrimaryColorRgb` (repintado en vivo mientras se arrastra) pero **no** lo persiste todavía.
- `input:end` (se soltó el control) → `onInputEnd` emite `commit`, que `App.vue` conecta a `commitPrimaryColor` — este es el único momento en que el color nuevo se escribe a disco.

Si el usuario cierra el popup sin soltar sobre un valor final confirmado (por ejemplo con `Escape` o el botón "Cerrar"), `onBeforeUnmount` reaplica `props.currentColorRgb` (el último color persistido real) — cualquier vista previa en vivo que no llegó a un `input:end` se descarta visualmente al cerrar.

**Paridad de teclado** sobre la rueda (`role="slider"`, `aria-valuemin/max/now` reales): `ArrowLeft`/`ArrowRight` mueven el matiz en pasos fijos de 5 grados. A diferencia del arrastre con mouse, cada pulsación de flecha se trata como una edición completa — dispara `onInputEnd` (y por lo tanto `commit`/persistencia) de inmediato, porque con teclado no existe un evento nativo de "soltar" que lo dispare por su cuenta.

"Volver al naranja por omisión" (`resetToDefault`) hace las 3 cosas a la vez de forma síncrona: mueve el picker visual, aplica el color en vivo, y emite `commit` — a diferencia del arrastre normal, no espera un segundo evento.

## Edge cases reales

- Configuración global o de proyecto **ausente**: nunca es un error, es el arranque limpio esperado — usa valores por omisión sin avisar al usuario.
- Configuración presente pero **JSON corrupto**: sí muestra aviso persistente en pantalla, pero la app sigue funcional con valores por omisión — nunca bloquea el arranque.
- Dos ventanas del proceso (principal y mascota) escribiendo configuración en paralelo: mitigado por la relectura-antes-de-escribir de `mergeAndPersistAppSettings`, no por un lock — sigue siendo posible una carrera si ambas escrituras ocurren en la misma fracción de tiempo, pero el caso común (una detrás de otra) queda cubierto.
- `claude mcp logout` sobre un conector de `claude.ai`: éxito reportado (`exit 0`) sin efecto real — ver arriba.
- `claude plugin details` sin soporte `--json`: se muestra texto crudo sin intentar parsearlo como estructura.
- `project_hash` con rutas de distinto casing/separador en Windows para el mismo proyecto real: cubierto explícitamente por tests para no producir dos archivos de settings de proyecto distintos para la misma carpeta.

## Limitaciones actuales (documentadas, sin cambio de código)

- El panel no distingue visualmente un "Limpiar autenticación" real de un no-op silencioso sobre un conector de `claude.ai` — ambos casos terminan en el mismo aviso de éxito aparente.
- No existe un comando real de "reconectar" en el CLI de `claude`; el botón equivalente solo refresca el panel completo.
- La pestaña "Ajustes" es de solo lectura — no hay edición de `.claude/settings.json` desde la UI, ni siquiera de la única clave permitida (`permissions`).

## Referencias cruzadas

- [ui-compartida](../ui-compartida/overview.md) — patrón compartido de overlay modal con foco atrapado, usado por `ThemePopup` y `EditorModal`.
- [presentacion-y-ventana](../presentacion-y-ventana/overview.md) — `presentationManager.applyPersistedSettings`/`setPetWindowPosition`/`setPetWindowSize`, consumidores reales de `AppSettings.windowSize`/`petWindowPosition`.
- [sesion-y-transporte](../sesion-y-transporte/overview.md) — `AppSettings.sessionStartOptions`, opciones de arranque de sesión persistidas por este mismo mecanismo.
- [robustez-y-actualizaciones](../robustez-y-actualizaciones/overview.md) — mismo binario `claude` real invocado sin shell (`Command::new`), mismo patrón de tolerancia a fallos sin propagar excepciones a la UI.

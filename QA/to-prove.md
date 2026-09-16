# Codetuver Avatar — Catálogo de pruebas (to-prove)

> Documento IA-friendly: cualquier agente puede tomar una sección, ejecutarla y reportar sin más contexto que este archivo + `docs/ARCHITECTURE.md` + `docs/reference/inventario-funcionalidades-qa.md`.

**Nota de verificación (honestidad, mismo criterio que el resto del proyecto) — 3 pasadas, cada una corrigió a la anterior:**
1. Primera versión: armada solo con `docs/ARCHITECTURE.md` + el inventario de QA (documentación resumida, no código ni specs reales).
2. Segunda pasada: corregida leyendo directamente el template real de `App.vue` (líneas 1577-2456) y los componentes `PetView.vue`, `VoiceControls.vue`, `SessionStartOptionsPanel.vue`, `DebugPanel.vue` completos, más grep dirigido de botones/`aria-label` en `AdminSettingsPanel.vue`, `CharacterEditor.vue`, `AnimationTimelineEditor.vue` y `PoseEditor.vue` — encontró 6 hallazgos de código no documentados en ningún lado (ver `QA/OPmejora/`), incluido un botón faltante real (`clearFailureLog`, sección 1.13).
3. Tercera pasada: `ARCHITECTURE.md` es un resumen **reconstruido** (se perdió el original en un borrado accidental, ver su propia nota de cabecera) — no es fuente suficiente para flujos con matices. Se leyeron los `design.md` reales de las specs más relevantes (`nucleo-sesion`, `presencia-vtuber`, `presentacion-escritorio`, `revision-ux-sesion-real-4`, `revision-ux-sesion-real-5`), encontrando 8 diferencias entre "lo que el resumen implica" y "lo que la decisión de diseño real documenta" — todas integradas en las secciones 1.2, 1.8, 1.9, 1.10, 1.14b y en la Fase 8, marcadas donde aplica.

`[verificado en código]` = lectura directa de esa pasada 2. Lo no marcado así (partes de `AdminSettingsPanel`/`CharacterEditor` no leídas línea por línea por tamaño — 921 y 1060 líneas) queda con esa limitación declarada, no asumida como completa.

## 0. Antes de generar una sola prueba nueva — leer esto

Este proyecto **ya tiene** una metodología de QA propia, distinta de un Gauntlet genérico de app web con backend HTTP. No la reinventes ni la contradigas sin avisar:

- **No hay suite Playwright instalada** (`package.json` no tiene `@playwright/test`; test runners reales son Vitest + Stryker en TS y `cargo test` en Rust). Las menciones a "Playwright" en `docs/reference/inventario-funcionalidades-qa.md` (`[QA-054]`, `[QA-055]`) son sobre el **MCP de automatización de navegador** usado de forma interactiva contra la app corriendo (`npm run dev` + Tauri, vía Chrome DevTools Protocol), no un archivo `.spec.ts` de Playwright commiteado.
- **Decisión ya tomada y documentada** (Hito 23 de `revision-ux-sesion-real-3`, ver línea `[QA-101]`): al cerrar un Epic completo con 8 casos de flujo aprobados, el equipo decidió **no construir infraestructura E2E nueva** ("hubiera sido sobre-ingeniería") y en su lugar ejecutó los 8 casos en vivo contra el proceso real, con evidencia (capturas CDP) guardada en `docs/reference/qa-evidencia/`.
- El código ya expone **hooks de prueba reales** para esto, sin mockear nada: `window.__qaBeginSession`, `window.__qaSelectCharacter`, `window.__qaInjectEvent`, `window.__qaOpenTheme`, `window.__debugAvatarState()`. Úsalos en vez de tratar de simular clics de diálogos nativos de Windows (esos no son automatizables sin `tauri-driver`, límite ya conocido y aceptado).
- El panel de depuración (`Ctrl+Shift+Alt+D`, solo en `npm run dev`) ya centraliza **12 botones reales** (7 inyectores de falla/muestra + 4 de simulación de monitores + 1 de diagnóstico, conteo exacto en sección 1.13) — es la vía correcta para forzar condiciones de error, no parchear el código para simularlas.
- Antes de escribir un caso de prueba nuevo, **grep en `docs/reference/inventario-funcionalidades-qa.md`** por el Feature/archivo en cuestión — es posible que ya exista un hallazgo real documentado (`[QA-###]`) que evita repetir trabajo.
- **La fuente de verdad de qué está probado es `docs/reference/qa-coverage.json`**, con gate real (`.claude/flujo-hooks/qa-coverage-gate.ps1`) que bloquea marcar algo `✅` sin evidencia. Este documento (`QA/to-prove.md`) es el catálogo de qué falta o qué vale la pena re-probar/romper — no duplica ese ledger.

Si vas a ejecutar el Gauntlet de este documento con un agente: arranca `npm run dev` (Vite sirve la UI; para ejercitar comandos Tauri reales hace falta la ventana Tauri real, `npm run tauri dev` — sin eso, todo `invoke()` falla y solo se puede probar UI pura), conéctate por CDP, y guarda evidencia (captura o dato leído en vivo) por cada caso.

---

## 1. Inventario funcional completo

Organizado por área. Cada punto es una unidad probable de prueba (botón, flujo o estado). Referencia cruzada a `FEAT-###` de `docs/ARCHITECTURE.md` cuando aplica.

### 1.1 Pantalla previa a sesión (FEAT-010, H16-H18 de `revision-ux-sesion-real-3`) `[verificado en código]`
- Botón "Elegir carpeta" (diálogo nativo `tauri-plugin-dialog`), con la carpeta elegida (o "Ninguna carpeta elegida") al lado.
- Panel colapsable `<details>` **"Opciones de arranque de la sesión"** (`SessionStartOptionsPanel.vue`, cerrado por omisión) con 6 campos reales, cada uno con el flag real de Claude Code citado como hint:
  - **Modelo** — `<input type="text">` de texto libre (placeholder "sonnet, opus, haiku, fable..."), flag `--model`. Texto libre real: aceptará cualquier string, buen candidato de Fase 3 (nombre de modelo inexistente).
  - **Modo de permisos** — `CustomSelect` con los 6 valores reales confirmados en H19 + "(por omisión)", flag `--permission-mode`.
  - **Directorios adicionales** — `<textarea>` de 2 filas, una ruta por línea, flag `--add-dir`.
  - **Herramientas permitidas** — `<textarea>`, una por línea, flag `--allowedTools`.
  - **Herramientas denegadas** — `<textarea>`, una por línea, flag `--disallowedTools`.
  - **Límite de gasto (USD)** — `<input type="text">` (no `type="number"`, texto libre validado a mano), flag `--max-budget-usd`, con mensaje de error real (`role="alert"`) si `validateStartOptionsDraft` lo rechaza.
  - Nota fija: "se aplican solo al arrancar la sesión (no en caliente) y se recuerdan para la próxima vez".
- Botón "Iniciar sesión" (`:disabled` si no hay carpeta, si ya está iniciando, o si el draft de opciones tiene errores de validación) — texto cambia a "Iniciando...".
- Mensaje de sesión activa (id mono), de error (`startError`, con ícono), y de aviso de ajustes (`appSettingsNotice`, con ícono) — los 3 son elementos independientes, pueden coexistir.
- Botón "Retomar `<carpeta>`" (solo si existe `lastPreference`, deshabilitado mientras inicia).
- `SessionHistoryExplorer.vue`: cuadrícula de carpetas, listado de sesiones por carpeta, sección "últimas 5 sesiones" cruzando carpetas, botones "Reanudar"/"Bifurcar" por sesión — **no releído línea por línea en esta pasada** (403 líneas), detalle según documentación previa, no código fresco.
- Aviso de configuración corrupta/ilegible ("No se pudo leer tu configuración guardada").

### 1.2 Ciclo de vida de la sesión (FEAT-006/007, session-start-retry) `[corregido contra spec real, no solo ARCHITECTURE.md — ver hallazgos del fork de documentación]`
- Arranque exitoso (`start_claude_session`).
- **Colisión: iniciar sesión con una ya activa → reintento automático transparente (cierra la vieja, reintenta una vez).** `revision-ux-sesion-real-4/design.md` (D3) confirma que `resumeSession`/`beginSession` es **el único punto compartido entre el explorador de carpetas/historial y el menú nativo de Sesión** — no hay dos fuentes de verdad separadas. **Esto es una prueba que hay que correr dos veces con dos disparadores distintos**: (a) colisión disparada desde el botón/carpeta de la UI, (b) colisión disparada desde "Reanudar" del menú nativo — una regresión futura podría romper un disparador y dejar el otro intacto sin que la prueba (a) lo detecte.
- Rollback si el reintento también falla (vuelve a `chosenCwd`/`sessionId` previos).
- Interrupción de turno (comando existe en Rust; **confirmado sin botón en la UI** — `[QA-003]`).
- Cierre de sesión (menú nativo "Cerrar sesión" y cualquier otro punto de entrada).
- Reanudar con `--resume <id>`: resiembra chat + consola de actividad desde el `.jsonl` real.
- Bifurcar con `--resume <id> --fork-session`: produce `session_id` nuevo, archivo original intacto.
- Reanudar un `id` inexistente → mensaje de error, app usable después.
- `/clear`: diálogo de confirmación (`role="alertdialog"`, foco atrapado) → vacía chat/actividad/pose del avatar, `session_id` nuevo real. **La confirmación de que funcionó es puramente inferencial, no un ack explícito**: `revision-ux-sesion-real-4/design.md` (D2) compara el `session_id` viejo contra el que llega en el siguiente `session_started`, y solo cuenta si ese cambio ocurre sin que la app misma haya llamado `startSession` — el propio diseño aclara que este comportamiento de Claude Code **"no es un contrato público documentado"**. Caso nuevo derivado: **dos `/clear` consecutivos muy rápido** — el segundo podría enviarse antes de que el `session_id` del primero se asiente, dando un falso "no se pudo confirmar" (el timeout de 8s ya conocido).
- `/clear` cancelado → sin efecto alguno.
- `/clear` en sesión sin ningún mensaje previo → no dispara reset (por diseño).
- Panel "Opciones en caliente" → `/effort` con confirmación real leída del stream. **`/effort` NO tiene paso de confirmación previo (a propósito, no es un descuido)**: `revision-ux-sesion-real-5/design.md` (D6) documenta que el botón "Cambiar" intermedio se eliminó deliberadamente porque cambiar de esfuerzo "no es destructivo", a diferencia de `/clear` que sí necesita ese paso por ser irreversible — **no reportar esta asimetría como inconsistencia si aparece en una revisión futura**, es diseño intencional. Sí probar: varios clics rápidos en distintos niveles de esfuerzo sin ningún throttle visible — ¿se superponen dos `/effort` enviados casi a la vez?
- Comandos de solo lectura vía overlay de detalle (`/usage`, `/context`) mostrados en modal Markdown.

### 1.3 Menú de comandos slash (FEAT-031)
- Listbox ARIA anclado sobre el composer (`role="combobox"`+`listbox`), no modal.
- 3 estados vacíos distintos: "se habilitan tras tu primer mensaje" / "este proyecto no tiene comandos personalizados" / "sin coincidencias para «X»".
- Filtro en vivo por texto tras `/`.
- Navegación con flechas, commit con Enter (sin enviar), cierre con Escape (sin tocar el borrador).
- Una ruta de archivo con `/` en medio del texto **no** debe abrir el listado.
- Entrada del menú nativo "Comandos" abre el mismo listado.

### 1.4 Chat en flujo continuo (FEAT-013) `[verificado en código]`
- Botón "Ver detalle de plan" (ícono `info`, `aria-label` exacto), deshabilitado mientras se envía → abre modal "Detalle de plan" que envía `/usage` y muestra el texto real en Markdown (o "Enviando /usage..." / "No se pudo obtener el detalle de plan.").
- Envío de mensaje normal, vacío (**confirmado: el botón "Enviar" está `:disabled` si `!chatDraft.trim()`**), larguísimo (~24 000 caracteres), con emoji/Unicode/HTML crudo.
- **Enter envía el mensaje (`@keydown.enter.exact.prevent`); Shift+Enter inserta salto de línea** — placeholder del textarea lo dice literalmente. Caso de Fase 3 obvio: pegar texto multilínea vía clipboard (sin pasar por keydown) y confirmar que no se envía solo.
- Streaming incremental de la respuesta (buffer sin duplicar ni perder texto).
- Indicador "Trabajando" (texto literal exacto, `<span class="chat-panel__working-indicator">`) — aparece antes del primer bloque real, desaparece al llegar.
- Toggle Markdown/crudo por burbuja de mensaje: botón ícono `code`, `aria-pressed` real, `aria-label` dinámico ("Ver formato Markdown" / "Ver como texto crudo"). Solo aparece si el mensaje no es el turno "Trabajando" en curso.
- Enlaces dentro de una burbuja (`v-html` + `markdown-it`, 3 superficies: mensaje de usuario, párrafo del agente, vista Markdown de Actividad) abren con `openUrl`, nunca navegan la ventana de la app.
- Composer expandido (botón ícono `expand`/`collapse`, `aria-pressed`): pestañas ARIA reales "Editar"/"Vista previa" (`role="tab"`, navegación con flechas vía `onComposerTabKeydown`), Markdown real en la vista previa, sin perder cursor/contenido al alternar (mismo nodo `<textarea>`, solo `v-show`).
- **Separador de columna de chat redimensionable** (`role="separator"`, `aria-orientation="vertical"`, `aria-valuenow/min/max` reales) — arrastrable con el mouse (`pointerdown`) y **operable por teclado** (`keydown` en el propio separador, `tabindex="0"`). No estaba en la primera versión de este documento.
- **Selector de nivel de esfuerzo** (`CustomSelect` con ícono `gauge` en el composer, no solo el comando de texto `/effort`) — envía `/effort <nivel>` por el mismo carril que un mensaje normal; clase CSS cambia según `effortChangeStatus` (pendiente/confirmado).
- Panel "Uso de la sesión" con **4 estadísticas exactas**: Entrada, Salida, Cache (suma de creación+lectura), Costo — se reinicia con `/clear` y al reanudar otra sesión.
- Auto-scroll al fondo solo si el usuario ya estaba cerca del fondo (no interrumpe lectura de historial).
- Ventaneo del historial: carga de a 24 entradas (`CHAT_HISTORY_CHUNK_SIZE`), centinela `IntersectionObserver` revela más sin saltos visuales.

### 1.5 Consola de actividad (FEAT-012)
- 3 vistas: Estilizada / Markdown / Salida cruda.
- Botón "Ocultar actividad" (oculta sección completa, no solo el cuerpo). **Corrección real (verificado en vivo): no existe ningún botón "Ocultar chat"** — el chat perdió su control de visibilidad en el Hito 9 de `revision-ux-modos-presentacion` (2026-09-05, ver `ARCHITECTURE.md` FEAT-013); una versión previa de este documento lo listaba por error, copiado de una nota de arquitectura ya desactualizada en ese punto sin verificar contra el DOM real.
- Resiembra completa al reanudar una sesión (mismo parser que eventos en vivo, mismo orden del `.jsonl`).
- Bloque de comando: prefijo `$` solo si `isShellCommand` es real, nunca para nombres de herramienta genéricos.
- Estado "En curso" de un comando — **hallazgo real conocido, no corregido**: todo comando (exitoso o no) queda "En curso" para siempre (`[QA-030]`, `CommandFinished` nunca se construye en el backend). Cualquier prueba nueva sobre comandos debe partir de esta brecha ya conocida, no reportarla como nueva.

### 1.6 Intérprete de contenido / bloques (FEAT-011)
- Tipos de bloque: párrafo (Markdown real), código, diff, tabla, comando, referencia de archivo, encabezado, warning, error, `command_invocation` (parseo independiente de 3 etiquetas en cualquier orden).
- Degradación por fragmento ante fallo de parseo (vía `armParseFault`) sin corromper el resto del turno ni tumbar la sesión.
- Limpieza de secuencias ANSI — **hallazgo real conocido**: los corchetes de escape (`[31m`, `[0m`) sobreviven como texto visible aunque el byte ESC desaparezca (`[QA-029]`).

### 1.7 Peticiones de interacción (FEAT-009/014)
- Variante `permission`: única con evento real confirmado hasta la fecha.
- Variantes `choice`/`open_question`/`confirmation`/`form`: UI lista, **sin mecanismo real que las dispare** — si logras construir un caso que sí las dispare (multi-tool con distintos tipos), es hallazgo nuevo de alto valor.
- Garantías de seguridad a verificar: nunca doble resolución, nunca auto-respuesta, independencia de la visibilidad de paneles, payload inválido descartado sin excepción.

### 1.8 Panel de administración — plugins y MCP (FEAT-032) `[verificado en código]`
- 3 pestañas reales (`selectAdminTab`): **Plugins** / **MCP** / **Ajustes**.
- Dentro de Plugins, 2 subpestañas (`selectPluginSubTab`): **Instalados** / **Instalar**.
- **Instalados** — por fila: botón "Activar"/"Desactivar" (`togglePlugin`, texto según estado), botón "Detalles"/"Ocultar detalles" (`aria-expanded` real, carga texto crudo bajo demanda), botón "Desinstalar" que **se reemplaza in-place** por `"¿Desinstalar <id>?"` + botón peligro "Sí, desinstalar" (`:disabled` mientras `uninstallingId` coincide, texto pasa a "Desinstalando...") + botón "Cancelar" — patrón de confirmación de 2 pasos. Listar plugins instalados — **hallazgo real conocido**: hay duplicados en la lista (`[QA-020]`).
- **Instalar** — `<input type="search">` de filtro en vivo (nombre/descripción/marketplace, sin botón, ningún debounce visible en el template) + botón "Instalar" por resultado + al pie: `<input type="text">` "Agregar marketplace" (placeholder "URL, ruta o owner/repo de GitHub", **sin ninguna validación de formato visible antes de enviar**) + botón "Agregar marketplace" (`submitAddMarketplace`). — **deliberadamente no probados en pasadas previas** por modificar configuración global real de `~/.claude`; si se prueban, hacerlo en una máquina/perfil desechable.
- **MCP** — por servidor: badge de estado (`connected`/`needs-authentication`/`pending-approval`/`failed`/`unknown`), botón de auth condicional (`startMcpAuthentication`, etiqueta dinámica), "Limpiar autenticación" condicional, "Reintentar conexión" (sin `:disabled` visible, siempre clickeable), y **"Quitar" (`removeMcp`) de un solo clic, SIN el patrón de confirmación de 2 pasos que sí tiene "Desinstalar" de plugin** — asimetría real encontrada en esta pasada, ver caso 16. Al pie: 2 inputs ("Nombre" + "Comando", placeholder "npx mi-server-mcp") + botón "Agregar" (`submitAddMcp`), **sin validación visible de nombre duplicado ni de comando vacío**.
- `authenticate_mcp` (login detached, ventana de detección temprana de 4s) / `clear_mcp_authentication` (logout síncrono).
- Servidor con prefijo `plugin:` → aviso adicional sobre autenticación dependiente del plugin.
- **Ajustes** — solo lectura (global + proyecto), JSON crudo renderizado.
- **El filtrado de secretos ocurre en el núcleo Rust con lista de permitidos, no es un filtro de la interfaz** (`nucleo-sesion/design.md`, D7: "las claves de la configuración se filtran en el núcleo con lista de permitidos, no en la interfaz"). **La prueba de seguridad correcta no es "¿la UI oculta el secreto en pantalla?"** — eso ya está confirmado (`[QA-026]`) — **sino "¿el comando Tauri devuelve el secreto si se invoca directo, fuera de la UI?"** (por ejemplo desde la consola del DevTools con `window.__TAURI__.core.invoke(...)` si está expuesto, o cualquier otro camino que evite el render). Probar solo el HTML renderizado no cubre la frontera de confianza real que el propio diseño dice que existe en Rust.

### 1.9 Avatar y personajes (FEAT-015/016/017/018/033) `[parcialmente verificado en código: CharacterEditor.vue, AnimationTimelineEditor.vue y PoseEditor.vue por grep dirigido, no lectura completa — 1060/1201/353 líneas]`
- Selección de personaje del catálogo (Rabbit, Polydancer — VRM real) y cambio en caliente sin re-suscribir el motor de reacciones.
- Advertencia de licencia visible en la ficha del catálogo (riesgo aceptado, no CC0 sin condiciones) — **distinta** de la advertencia de importación (ver abajo), no confundir ambas en una prueba.
- **Importación de personaje propio, flujo real de 2 pasos confirmado en `App.vue`**: 1) botón dispara diálogo nativo de archivo (via `pickCharacterFile()`, `character-file-picker.ts` — wrapper delgado sobre `open()` de `@tauri-apps/plugin-dialog`, cubierto por prueba unitaria mockeada de éxito/cancelación/error, `lanzamiento-publico` Hito 5) → 2) overlay "Importar personaje" muestra la ruta elegida (solo lectura) + el texto exacto **"La licencia de este archivo es tu responsabilidad; la aplicación no la verifica."** + botones "Confirmar importación" (texto cambia a "Importando...") / "Cancelar", ambos deshabilitados mientras importa → al terminar, resumen con nombre+formato y las listas de "Controles disponibles"/"Controles no disponibles". Validación real solo de header glTF binario (12 bytes) para VRM/GLB, manifiesto `.model3.json` para Live2D — el cuerpo del archivo no se valida (ver caso 4). **El clic dentro del diálogo nativo en sí es manual permanente** (ventana del SO fuera del webview, sin superficie de automatización via CDP/`tauri-driver`, mismo patrón que TC-085/098/099 de `robustez-distribucion`) — el resto del flujo (paso 2 completo, y los caminos de éxito/cancelación/error del wrapper) sí es automatizable y ya está cubierto.
- **El resumen de capacidades post-importación es por formato, no por archivo — brecha ya declarada en `presencia-vtuber/spec.md` (AC-017.3), no un hallazgo nuevo**: sin parsear la escena 3D real, dos archivos VRM distintos (uno con blendshapes/huesos completos, otro pobre) van a mostrar **exactamente el mismo** resumen "Controles disponibles/no disponibles", porque la declaración es a nivel VRM-vs-Live2D, no por archivo. Si una prueba futura importa dos VRM distintos y ve el mismo resumen, **no reportarlo como bug** — es el comportamiento documentado y aceptado.
- Render VRM real de un personaje importado (`resolveImportedVrmModelUrl` + `convertFileSrc`); fallo de carga (archivo corrupto) cae en mensaje específico, no el placeholder genérico.
- Live2D importado: solo ficha de texto, sin renderizador (fuera de alcance declarado).
- **Editor de personaje — tabla por estado, con botones reales por fila** (confirmado por `aria-label` en código): "Probar reacción de `<estado>`" (preview sin afectar lo guardado), por cada animación del pool "Ejecutar animación `<id>` de `<estado>`" / "Editar animación `<id>` de `<estado>`" / "Quitar animación `<id>` de `<estado>`", "Crear animación nueva para `<estado>`", "Editar pose de `<estado>`", "Crear pose nueva para `<estado>`" — celda de Boca es un `<input>` de solo lectura (`disabled`) que solo informa "sincronizada automáticamente con el audio"/"no soportado", no es un control real (no confundirla con un campo editable en una prueba).
- **Sección de anclaje/tamaño (5 campos, confirmados en código, todos bajo un único par de botones "Guardar"/"Descartar cambios" que los aplica en bloque, no por campo)**: `CustomSelect` "Esquina", `<input type="number" min="0">` "Margen X (px)", "Margen Y (px)" (mismo mínimo, **sin máximo**), "Tamaño" (con `min`/`max` reales — único campo con tope), "Transición (ms)" (`min="0" step="50"`, **sin máximo** — candidato directo de Fase 3, un valor absurdo como 999999999 no tiene nada que lo detenga en el HTML). Todos usan `@change` (confirma al perder foco/Enter), no `@input`.
- **"Descartar cambios" dispara `window.confirm()` nativo del navegador** ("Se perderán los cambios sin guardar. ¿Descartar?") — **inconsistente con el resto de la app**, que usa su propio diálogo accesible (`role="alertdialog"`) para toda otra confirmación destructiva (`/clear`, desinstalar plugin). Un `window.confirm()` bloquea el hilo de JS y no se cierra igual por CDP/DOM — cualquier automatización tiene que manejarlo como diálogo nativo del navegador, no como elemento del DOM.
- 3 estados del editor (`original`/`saved`/`editing`) — descartar siempre vuelve a defaults de fábrica, nunca al último guardado.
- Clamping de tamaño/anclaje/márgenes — **hallazgo real conocido**: se guardan y persisten correctamente pero **nada los consume para el render** (`[QA-046]`, cero consumidores confirmados por grep).
- Botón "Elegir archivo (.vrma)" para importar animación/pose externa (`:disabled` si ni animación ni pose están soportadas por el personaje activo).
- Editor de posado in-app (`PoseEditor.vue`): `CustomSelect` de hueso (etiqueta cambia a "`<hueso>` (tocado)" tras tocarlo — confirma que sí registra la interacción), canvas 3D con `aria-label="Vista 3D del personaje para posar huesos"`, gizmo sobre hueso real (integración `@theatre/core`).
- Editor de animación con timeline/keyframes (`AnimationTimelineEditor.vue`): botones "Previsualizar en bucle" / "Detener previsualización" / "Opciones" (abre panel lateral), y ahí **3 inputs numéricos "Rotación X/Y/Z (grados)", `step="0.1"`, sin `min` ni `max`** — aplican en vivo por `@change`, sin botón de confirmación aparte (candidato directo de Fase 3: >360°, negativo, decimales largos).
- Ambos editores se abren dentro de `EditorModal.vue` (overlay casi-pantalla-completa, foco atrapado, Escape) — pero también existen **montados de forma aislada en `harness.html`** (ver sección 1.17), una segunda superficie de prueba real para lo mismo.
- Interpolación real entre poses/animaciones al cambiar de estado (crossfade, duración mínima 750ms).
- Reacciones automáticas del motor de personalidad (67 estados en catálogo, reglas deterministas, cooldown/agrupación `groupingWindowMs=2500ms`) — cobertura 1:1 de cada reacción individual **no confirmada exhaustivamente** (`[QA-059]`); reacciones con `triggers: []` de alcanzabilidad desconocida (`[QA-060]`).

### 1.10 Voz (FEAT-020/021) `[verificado en código: VoiceControls.vue completo]`
- Checkbox "Activar voz" (desactiva/habilita el resto de controles reactivamente).
- Slider "Volumen" (0-1, paso 0.1, mostrado como %).
- Slider "Velocidad" (0.5-2, paso 0.1, mostrado como "Nx").
- Slider "Tono" (0-2, paso 0.1, mostrado con 1 decimal) — nombre real en UI es "Tono", no "pitch".
- `CustomSelect` "Voz" — opciones reales de `speechSynthesis.getVoices()` del sistema + "(voz por omisión del sistema)".
- **Checkbox "Permitir voz en modo mascota"** — texto completo real: *"el personaje hablará aunque esté en modo mascota, pudiendo interrumpir en cualquier momento"*. **No estaba en ninguna versión previa de este documento ni en `ARCHITECTURE.md`** — control real, independiente del checkbox general de voz, que decide si el TTS puede sonar sin aviso mientras la ventana está en modo mascota. Candidato fuerte de Fase 4 (voz sonando de la nada mientras el usuario cree que la app está "en reposo" en modo mascota).
- Botón "Detener voz" (`:disabled` si no está hablando y la cola está vacía).
- Mensaje de estado (`aria-live="polite"`): "Voz activada."/"Voz desactivada."/"Voz detenida." — y mensaje de error separado (`lastError`, también `aria-live`).
- Cola FIFO de frases con deduplicación de frase consecutiva.
- Sincronización de boca vía eventos `boundary` (sin amplitud real).
- Aislamiento de fallo (`armVoiceFault`) sin tumbar la sesión.
- R7 estructural: `ReactionEngine.emit()` es el único punto que llama `speak()` — la voz nunca se suscribe a eventos por su cuenta.
- Comandos en caliente (`/effort`, `/usage`, `/clear`) **nunca deben narrarse** por voz — **son 3 mecanismos de detección independientes unidos por OR** (`isHotCommandResponse = awaitingEffortResponse || awaitingUsageDetail || <flag de /clear>`), no una regla única. `revision-ux-sesion-real-5/design.md` (D7) declara explícitamente que el flag de `/clear` puede no existir todavía como mecanismo separado. **No asumir que si `/effort` no se narra, `/clear` tampoco** — probar los 3 comandos por separado; que uno pase no dice nada de los otros dos.

### 1.11 Ventana y presentación (FEAT-022/023/024/025) `[verificado en código: PetView.vue completo + template de App.vue]`
- **El tablist de modo visible en pantalla solo tiene 2 pestañas reales: "Modo completo" (`FULL`) y "Modo compañera" (`COMPANION`)** — `PET` **no es una pestaña de ese tablist**, se alcanza únicamente por el botón `SendToDesktopButton` ("Enviar al escritorio") visible en Avatar/Editor de personaje/Compañera, y se sale de PET con clic o Enter/Espacio sobre el propio escenario. No confundir "3 modos" con "3 pestañas" en una prueba.
- **El modo PET es literalmente otra ventana/otro componente Vue (`PetView.vue`), no una rama oculta de `App.vue`** — todo el `<section class="session-panel">` de `App.vue` está envuelto en `v-if="presentationState.mode !== 'PET'"`, así que en modo mascota ese árbol completo no existe en el DOM de la ventana principal. `PetView.vue` se sincroniza por eventos reales de Tauri (`PET_SYNC_EVENT`/`PET_SYNC_REQUEST_EVENT`/`PET_RESTORE_REQUESTED_EVENT`), no por estado compartido en memoria — cualquier prueba de PET tiene que conectarse a esa segunda ventana/página por CDP, no asumir que es la misma página que el resto de la app.
- `pet-stage` (`role="button"`, `tabindex="0"`) — `aria-label` **dinámico** real: `"Restaurar modo completo — autorizacion pendiente"` si hay una señal de atención visible, `"Restaurar modo completo"` si no. Clic, Enter o Espacio disparan `requestFullMode`.
- Arrastre real: `mousedown` arma un umbral de 4px (`DRAG_THRESHOLD_PX`) antes de considerarlo arrastre — por debajo de ese umbral, soltar el mouse cuenta como clic (`requestFullMode`), no como arrastre. Al detectarse arrastre real, llama `startDragging()` nativo y, al soltar, lee la posición final y la persiste en `AppSettings.petWindowPosition`.
- Indicador visual (`pet-stage__indicator`, con animación de pulso, `aria-hidden`) y burbuja de texto (`pet-stage__bubble`, con `ATTENTION_SIGNAL_MESSAGE`) — ambos condicionados a `attentionVisible` **y** su propio flag (`attentionVisualIndicator`/`attentionBubble` independientes).
- Selector de monitor y esquina (`calculateCornerPosition`), simulable con `armDualMonitors`/`disconnectSecondaryMonitor`.
- Tamaño de ventana, opacidad — **hallazgo real conocido**: opacidad se persiste pero **no tiene efecto real** (`DesktopWindowManager` no expone `setOpacity`).
- "Siempre encima" con override solo aplicado en PET.
- Slider "Tamaño de la mascota" (visible en Modo Compañera, no en PET — se controla desde fuera; 100-800px, `PET_WINDOW_SIZE_MIN/MAX_PX`) — **hallazgo real conocido**: el alto real queda consistentemente +20px por encima del solicitado, causa no diagnosticable sin herramientas Win32 nativas.
- Botón "Restaurar posición" (`:disabled` si no hay `petWindowPosition` guardada) junto a la etiqueta con la posición actual.
- Reabrir la ventana PET tras un reload del frontend sin duplicar webview (`"a webview with label 'pet' already exists"` ya corregido una vez — candidato a regresión).
- Click-through **no soportado** por región (limitación de Tauri, ventana completa captura el clic — comportamiento esperado, no bug).

### 1.12 Señales de atención (FEAT-026)
- 3 de 6 señales genuinamente configurables: indicador visual, burbuja, notificación del sistema.
- `expressionChange`/`animation`/`voice` sin compuerta propia (siempre activas, brecha declarada).
- Prioridad de señal y contexto técnico al restaurar desde PET.
- Permiso de notificación denegado por el SO no debe lanzar excepción.

### 1.13 Panel de depuración (FEAT-027) `[verificado en código: DebugPanel.vue completo]`
- Atajo `Ctrl+Shift+Alt+D` (solo build `DEV`), cierre con Escape o botón "Cerrar (Ctrl+Shift+Alt+D)" (texto exacto, recibe el foco inicial del diálogo).
- **12 botones de acción reales, contados uno por uno en el template** (no "5+" como decía la versión anterior de este documento):
  1. "Fallo de dibujo del avatar" (`injectAvatarFault`)
  2. "Fallo del motor de voz" (`injectVoiceFault`)
  3. "Fallo del intérprete sobre ese fragmento" (`injectParseFault`) — **par input+botón real**: junto a un `<input type="number" min="0">` "Índice de fragmento" (`parseFaultIndex`), sin `max` ni validación de que el índice exista de verdad en el turno actual (ver sección 1.19).
  4. "Fallo de gestión de ventana" (`injectWindowManagementFault`)
  5. "Fallo de transición de modo" (`injectTransitionFault`) — junto a un `CustomSelect` "Modo destino".
  6. "Simular capacidad de ventana ausente" (`injectMissingCapability`) — junto a un `CustomSelect` "Capacidad ausente".
  7. "Inyectar muestra de salida en el flujo de la sesión" (`injectSampleEvent`)
  8. "Simular 1 monitor" (`armSingleMonitor`)
  9. "Simular 2 monitores" (`armDualMonitors`)
  10. "Desconectar secundario" (`disconnectSecondaryMonitor`, `:disabled` si el preset activo no es `dual`)
  11. "Desarmar simulación" (`clearMonitorSimulation`)
  12. "Recalcular posición calculada en modo mascota" (`recalculatePetPosition`)
- Registro de fallas (`listFailures`) refleja cada inyección con clase y mensaje correctos, mostrado como lista de solo lectura.
- **Hallazgo real nuevo, encontrado en esta pasada de verificación (no estaba en `docs/reference/inventario-funcionalidades-qa.md`):** `clearFailureLog()` existe en `failure-taxonomy.ts` (usado en sus propias pruebas unitarias y en `presentation-manager.spec.ts`) pero **no tiene ningún botón en `DebugPanel.vue`** — no hay forma de limpiar el registro de fallas desde la UI durante una sesión de prueba larga. Ver caso 17.
- Foco no se mueve al botón "Cerrar" al abrirse — hallazgo de accesibilidad real conocido (`[QA-074]`).

### 1.14 Configuración persistente (FEAT-028)
- Lectura de ajustes global + por proyecto (hash determinista del `cwd`).
- Merge: el archivo de proyecto solo sobrescribe los campos que declara, cae al global en el resto.
- Degradación ante archivo ausente/corrupto: debe avisar (`AppSettingsResolution.usedDefaults`), nunca fallar en silencio.
- **Hallazgo real conocido**: no existe ningún llamador de `setGlobalAppSettings`/`setProjectAppSettings` desde la UI (`[QA-076]`) — la persistencia real entre reinicios de casi todo `AppSettings` no se puede confirmar en la práctica hasta que exista un control de escritura real.

### 1.14b Overlays/diálogos — auditar cada uno por separado, no como grupo

`revision-ux-sesion-real-5/design.md` (D17) documenta una decisión explícita: **no asumir que los overlays de la app comparten una clase contenedora o un comportamiento común** — varios tienen su propio wrapper (ej. `character-import-panel` además de `commands-overlay`). Los 4 overlays reales confirmados en `App.vue` son:
1. Confirmación de `/clear` (`clearConfirmationVisible`, `role="alertdialog"`).
2. Detalle de plan (`usageDetailVisible`, `role="dialog"`).
3. Importar personaje (`characterImportOverlayVisible`, `role="dialog"`, wrapper propio `character-import-panel` además del genérico `commands-overlay`).
4. Popup de tema (`themePopupVisible`, `role="dialog"`).

**Cualquier prueba de tema/contraste/foco atrapado/Escape/`v-html` sobre un overlay tiene que repetirse en los 4, no generalizarse a partir de uno solo** — es exactamente el error que D17 previene. (El editor de personaje también abre overlays vía `EditorModal.vue` para Pose/Animación — ver §1.9 — son una quinta y sexta instancia con su propio wrapper, no cubiertas por D17 pero con el mismo principio aplicable.)

### 1.15 Menú nativo y tema
- Orden: Window, Sesión, Character, Comandos.
- Id de sesión copiable al portapapeles con confirmación visual ("(copiado)").
- Últimas 5 sesiones de la carpeta activa dentro del submenú Sesión.
- Popup de tema (`ThemePopup.vue`) con rueda de color OKLCH, sin slider de alfa, persistencia real, botón de reset.
- Verificación pixel-perfect de menús nativos **no es posible por CDP** — limitación estructural aceptada, requiere ojo humano en la ventana real.

### 1.16 Empaquetado e instalación (FEAT-030)
- `.msi` (WiX) y `.exe` (NSIS) generados por `tauri build`.
- Mensaje específico si el binario `claude` no está en el `PATH` al arrancar sesión.
- Archivo de licencias/atribuciones copiado junto al binario de salida.
- Instalación en máquina virtual limpia — **manual permanente**, no ejecutable por un agente.

### 1.17 `harness.html` — banco de pruebas aislado, segunda superficie real (no documentada antes)

Existe un segundo punto de entrada de Vite, `harness.html` (raíz del proyecto, monta `DevHarness.vue` vía `dev-harness-main.ts`), **distinto de `index.html`** (que monta `App.vue`). Sirve para probar `PoseEditor`/`AnimationTimelineEditor` **sin necesitar una sesión real de Claude Code ni un personaje del catálogo cargado** — es, de hecho, la superficie que ya se usó en `[QA-051]`-`[QA-056]` ("vía harness equivalente al gizmo real", "Playwright real"). Botones reales confirmados en el template:
- Abrir editor de posado / abrir editor de animación (overlays de prueba).
- "Limpiar" override de animación de prueba (`testAnimationOverride = null`).
- "Limpiar" override de pose de prueba (`testPoseOverride = null`).
- "Aplicar lo último exportado" (animación) — `applyLastExported`.
- "Aplicar lo último exportado" (pose) — `applyLastExportedPose`.

**Para el Gauntlet: cualquier caso de la sección 1.9 sobre PoseEditor/AnimationTimelineEditor se puede (y probablemente se DEBE) correr dos veces** — una contra `harness.html` (aislado, rápido, sin sesión) y otra contra `index.html` en el flujo real (Editor de personaje dentro de una sesión activa) — para confirmar que ambas rutas de montaje del mismo componente se comportan igual. No asumir que probar solo el harness cubre el flujo real, ni viceversa.

### 1.18 Botones y componentes reusables — conteo real, no estimado

Conteo exacto por `grep` sobre `src/**/*.vue` en esta pasada (útil como línea base: si una pasada futura da un número distinto sin que nadie haya agregado/quitado UI a propósito, algo cambió sin que este documento se enterara):

| Elemento | Total | Archivos donde aparece |
|---|---|---|
| `<button` | **99** | `App.vue` (22), `AdminSettingsPanel.vue` (17), `DebugPanel.vue` (13), `CharacterEditor.vue` (12), `AnimationTimelineEditor.vue` (10), `InteractionRequestCard.vue` (7), `SessionHistoryExplorer.vue` (6), `DevHarness.vue` (5, ver 1.17), `PoseEditor.vue` (2), `ThemePopup.vue` (2), `CustomSelect.vue`/`SendToDesktopButton.vue`/`VoiceControls.vue` (1 cada uno) |
| `<CustomSelect` | **12** usos reales | Ver desglose abajo — cada uno con `:options`/`@update:model-value` propios, ninguno es copia-pega sin adaptar |
| `<IconGlyph`/`<ScrollableListPanel`/`<EditorModal`/`<SendToDesktopButton` | 47 usos combinados | `App.vue` (19), `CharacterEditor.vue` (10), `AdminSettingsPanel.vue` (7), `AnimationTimelineEditor.vue` (4), `SessionHistoryExplorer.vue` (5), `PoseEditor.vue`/`SendToDesktopButton.vue` (1 cada uno) |

**Los 12 usos reales de `CustomSelect`, verificados uno por uno (cada uno gobierna un flujo distinto — probar cada instancia por separado, un bug en una no implica que las demás fallen igual):**
1. `App.vue` — listado de comandos slash (`inline`, listbox anclado sobre el composer).
2. `App.vue` — nivel de esfuerzo (`/effort`, ícono `gauge`, en el composer).
3. `VoiceControls.vue` — selector de voz del sistema.
4. `SessionStartOptionsPanel.vue` — modo de permisos de arranque.
5. `DebugPanel.vue` — modo destino de la falla de transición inyectada.
6. `DebugPanel.vue` — capacidad de ventana a simular ausente.
7. `CharacterEditor.vue` — expresión asignada por fila/estado.
8. `CharacterEditor.vue` — agregar animación al pool de un estado.
9. `CharacterEditor.vue` — pose asignada por fila/estado.
10. `CharacterEditor.vue` — tipo de importación de animación (`importKindOptions`).
11. `CharacterEditor.vue` — esquina de anclaje (`cornerSelectOptions`).
12. `PoseEditor.vue` — hueso seleccionado para posar (etiqueta cambia a "(tocado)" tras usarlo).

### 1.19 Pares input+botón — los flujos de mayor riesgo real

Un input y un botón que dependen uno del otro son el punto donde más aparecen bugs de estado obsoleto, validación ausente o fuga de un valor a medio escribir. Lista completa de los pares reales encontrados en el código (no genérica):

| Input(s) | Botón que los consume | Riesgo real concreto |
|---|---|---|
| `<textarea>` del composer de chat | "Enviar" (`:disabled` si vacío tras `.trim()`) | Enter envía, Shift+Enter no — probar pegar texto con salto de línea vía portapapeles (no pasa por `keydown`), ¿se envía solo? |
| "Índice de fragmento" (`number`, sin `max`) | "Fallo del intérprete sobre ese fragmento" | Índice que no existe en el turno actual (negativo, o mayor a los fragmentos reales) — ¿el inyector falla silencioso o lanza? |
| "Modo destino" (`CustomSelect`) | "Fallo de transición de modo" | Armar el fallo con un modo destino igual al modo actual (transición a sí mismo) |
| "Capacidad ausente" (`CustomSelect`) | "Simular capacidad de ventana ausente" | Cambiar el valor del select DESPUÉS de haber armado un fallo previo sin desarmarlo — ¿se acumulan dos fallos o el segundo reemplaza al primero? |
| Búsqueda de plugins (`type="search"`, sin botón, filtro en vivo) | — (ninguno; el filtro es reactivo) | Sin debounce visible en el template — escribir rápido y confirmar que no dispara N llamadas reales a `claude plugin list` |
| "Agregar marketplace" (`text`, sin validación de formato) | "Agregar marketplace" | Enviar vacío, con espacios, con una URL claramente inválida — nada en el template lo detiene antes de llamar al comando real |
| "Nombre" + "Comando" (2 `text`, sin validación) | "Agregar" (MCP) | Enviar con "Nombre" vacío, o con un nombre que ya existe en la lista — ¿el backend rechaza con mensaje claro o el `submitAddMcp` ni siquiera valida antes de invocar? |
| "Esquina" + "Margen X" + "Margen Y" + "Tamaño" + "Transición (ms)" (5 campos, solo "Tamaño" tiene `max`) | "Guardar" (aplica los 5 a la vez) | Cambiar 4 campos y que solo 1 sea inválido — ¿"Guardar" rechaza todo el lote o guarda los 4 válidos y descarta el 5° en silencio? |
| (ninguno — `window.confirm()` nativo) | "Descartar cambios" | Automatización que espera un `role="alertdialog"` del DOM **nunca lo va a encontrar** aquí — es el único punto de confirmación de toda la app que no usa el patrón propio |
| "Rotación X/Y/Z" (3 `number`, sin `min` ni `max`, `step="0.1"`) | — (ninguno; aplica en vivo por `@change`) | Escribir 99999 o -99999 grados — sin tope en el HTML, ¿el motor 3D degrada con gracia o el hueso queda en una orientación irrecuperable sin recargar? |
| "Límite de gasto (USD)" (`SessionStartOptionsPanel.vue`, con su propia validación) | "Iniciar sesión" (**en `App.vue`, otro componente**, vía `defineModel`) | Flujo cruzado entre 2 componentes: si el binding del modelo se rompe, el input puede mostrarse "válido" mientras el botón del padre queda deshabilitado sin ninguna pista visible de por qué |

### 1.20 Interacciones de teclado — arquitectura real `[verificado en código: CustomSelect.vue, tab-navigation.ts, EditorModal.vue, ThemePopup.vue completos + funciones de teclado de App.vue/DebugPanel.vue por grep dirigido]`

No estaba cubierto como categoría propia en ninguna versión previa de este documento — solo aparecían propiedades sueltas (Enter/Escape mencionados al pasar). Esto es lo que hay realmente:

**Tablists con roving tabindex (`tab-navigation.ts`, 6 instancias reales: modo, composer, secondary, console-view, admin, plugin-sub)** — las teclas son **`ArrowLeft`/`ArrowRight`/`Home`/`End`** (`isTabArrowKey`), NO `ArrowUp`/`ArrowDown`. `nextTabId` **envuelve** (`% tabIds.length`): en el último tab, `ArrowRight` vuelve al primero. `Home`/`End` saltan directo al primero/último — **no estaban documentados en ninguna versión previa**, fáciles de omitir en una prueba que solo revisa las flechas.

**`CustomSelect.vue` — dos implementaciones de teclado completamente distintas según el modo, compartiendo solo la función pura `nextCommandIndex` (que NO envuelve, usa `Math.min`/`Math.max` — se detiene en los extremos, a diferencia de los tablists que sí envuelven):**
- **Modo trigger (11 de los 12 usos reales, sección 1.18)**: `onTriggerKeydown` propio del componente — `ArrowDown`/`ArrowUp` abre el panel si está cerrado o mueve el índice resaltado; `Enter` selecciona y cierra; `Escape` cierra sin seleccionar; perder el foco (`focusout`) fuera del componente también cierra. Sin manejo de tipo-a-letra (type-ahead).
- **Modo inline (1 uso: el listbox de comandos slash en el composer del chat)**: `onTriggerKeydown` **se desactiva a sí mismo** (`if (props.inline) return`) — todo el teclado lo maneja el padre (`onComposerKeydown` en `App.vue`): mismas flechas, misma función `nextCommandIndex`, pero **código escrito por separado**. Un bug en el manejo de teclado de un modo no implica nada sobre el otro. `onFocusOut` de `CustomSelect.vue` también se desactiva en modo inline a propósito — el cierre por pérdida de foco lo implementa el propio `App.vue` desde `correcciones-qa-gauntlet` Hito 3 (`onChatComposerBlur`, `@blur` en el textarea del composer, cierra `commandsListVisible` salvo que el nuevo foco caiga dentro del propio listbox), corrigiendo el caso 28/`[QA-128]` (listbox huérfano tras `Tab`). `onChatComposerInput` también dejó de exigir `value === '/'` exacto para abrir el listbox — ahora evalúa `chatDraft.value.startsWith('/')` directo, cubriendo también un `paste` de un salto (antes solo el tecleo incremental abría el listbox).

**Composer de chat**: `Enter` (sin modificadores, `.exact`) envía; `Shift+Enter` inserta salto de línea. Con el listbox de comandos visible, `ArrowUp`/`ArrowDown` navegan la lista y `Escape` la cierra sin tocar el borrador — pero el commit con `Enter` de un comando seleccionado vive en una función distinta (`onComposerEnterKey`) que decide entre "escribir el comando" y "enviar el mensaje" según si el listbox está visible.

**Separador de columna de chat**: solo `ArrowLeft`/`ArrowRight` (paso fijo `CHAT_COLUMN_KEYBOARD_STEP_PX`, clamped) — **sin `Home`/`End`** para saltar a mínimo/máximo, a diferencia de los tablists.

**`pet-stage`**: `Enter` o `Espacio` (`.prevent` en Espacio, para no hacer scroll de página) restauran modo completo.

**Trampas de foco (Tab/Shift+Tab) — 3 implementaciones independientes, con selectores DE VERDAD distintos, no una sola función compartida:**
| Implementación | Usada por | Selector real de "elementos enfocables" |
|---|---|---|
| `trapOverlayTab` (`App.vue`) | Los 4 overlays de `App.vue`: `/clear`, detalle de plan, importar personaje, tema | `'button, input, [role="option"]'` |
| `trapFocus`/`focusableElements` (`DebugPanel.vue`) | Panel de depuración | `'button, select, input, [tabindex]:not([tabindex="-1"])'` |
| `trapTab`/`focusableElementsWithin` (`EditorModal.vue`) | Editor de posado, Editor de animación | `'button, input, select, [tabindex]:not([tabindex="-1"])'` (idéntico al de `DebugPanel`, pero escrito de cero otra vez — 2 copias del mismo string, no una función importada) |

`trapOverlayTab` (la de `App.vue`) es la única de las 3 que **no incluye `select` ni `[tabindex]` genérico**. `ThemePopup.vue` (uno de sus 4 overlays) monta una rueda de color de una librería externa (`@jaames/iro`, SVG/canvas) que no es `button`/`input`/`[role="option"]` — si esa rueda recibe foco propio por su cuenta, el trap de `App.vue` no la contempla al calcular "primero/último" (ver caso 25).

**Escape:** en `App.vue`, los 4 overlays (`/clear`, detalle de plan, importar personaje, tema) ya NO tienen un listener global independiente cada uno — comparten 1 solo listener (`closeTopOverlayOnEscape`, registrado una vez en `onMounted`) que consulta una pila `openOverlayStack` (empujada/desapilada por cada `open*`/`close*` real) y cierra únicamente `openOverlayStack[length-1]` (el más reciente), corrigiendo el caso 31 (`correcciones-qa-gauntlet` Hito 2, `[QA-127]`). Fuera de `App.vue` siguen existiendo: 1 en `DebugPanel.vue` (combinado con el atajo de apertura `Ctrl+Shift+Alt+D` en la misma función `handleShortcut`), y 1 en `EditorModal.vue` (`closeOnEscape`, agregado/quitado en el propio montaje/desmontaje del modal). `CustomSelect.vue` corta su propio `Escape` con `stopPropagation` desde `correcciones-qa-gauntlet` Hito 1 (`[QA-126]`), por lo que ya no llega a interferir con ninguno de estos listeners superiores. Ver casos 24 y 31 (ya resueltos) para el contexto histórico de la arquitectura fragmentada previa.

---

## 2. Fases del Gauntlet — adaptadas a Codetuver Avatar

Esta app es de escritorio, un solo usuario local, sin backend HTTP ni roles — varias fases del Gauntlet genérico no aplican tal cual. Tabla de traducción:

| Fase | ¿Aplica? | Adaptación real para este proyecto |
|---|---|---|
| 1. Smoke | Sí | "Login/logout" → elegir carpeta + iniciar sesión / cerrar sesión. Confirmar que `npm run tauri dev` levanta sin pantalla en blanco, sin error crítico en consola, y que las **5** pestañas secundarias en Modo completo (Avatar/Actividad/Salida cruda/Configuración/Editor de personaje — verificado en código, no 4) cargan, además del tablist de 2 modos (completo/compañera) y `harness.html` (sección 1.17). |
| 2. Happy path | Sí | Un recorrido crear→consultar→editar→guardar→recargar→persistencia→eliminar por cada área de la sección 1 que tenga esa forma (editor de personaje, ajustes, personajes importados). |
| 3. Happy path roto | Sí | Entradas vacías/gigantes/Unicode ya cubiertas en chat; extender a: campos numéricos (tamaño mascota, opacidad, márgenes de anclaje, pitch/rate/volume) con 0, negativo, `NaN` vía consola, valor máximo+1; nombre de personaje/proyecto con emoji o RTL. |
| 4. Caos de usuario | Sí, es donde más rinde | Doble clic en "Iniciar sesión"/"Enviar"/"Bifurcar"; cambiar de modo de presentación en sucesión rápida; recargar durante streaming; cerrar la app mientras escribe `app_settings.json`. Ver sección 3. |
| 5. Permisos y seguridad | Reinterpretada | No hay roles de usuario. Se traduce a **fronteras de confianza**: validación de archivo importado (header-only, no parseo completo), filtrado de secretos **en el núcleo Rust con lista de permitidos (§1.8) — probar invocando el comando directo, no solo mirar la UI**, `DebugPanel` inalcanzable fuera de build `DEV` (confirmado por inspección de bundle minificado), aislamiento R7 del motor de voz, R4 (ninguna capa mata la sesión). |
| 6. Persistencia e integridad | Sí, prioritaria | Ya hay 3+ hallazgos reales de esta clase (opacidad sin efecto, ajustes sin escritor real, tamaño/anclaje del editor sin consumidor). Cualquier prueba nueva de persistencia debe primero revisar si el campo tiene un lector real antes de reportarlo como bug de guardado. |
| 7. UI/UX | Sí | Con la limitación estructural ya conocida: menús nativos y transparencia real de ventana no son verificables por captura CDP, requieren ojo humano en la ventana real. |
| 8. Compatibilidad | Reinterpretada | No hay multi-navegador (un solo motor de renderizado, WebView2 en Windows). Sí aplica: multi-monitor (simulable con `armDualMonitors`), distintas resoluciones/DPI, comportamiento con Mica activo/inactivo. **`presentacion-escritorio/design.md` (D9) fija 1280×720 como resolución mínima asumida para el layout de pestañas sin scroll — marcada literalmente "supuesto, verificar con el usuario", nunca confirmada.** Probar exactamente 1280×720 (no solo "resoluciones chicas" en general) es el caso concreto que el propio diseño dejó pendiente. macOS/Linux fuera de alcance salvo que exista esa máquina. |
| 9. API/Integraciones | Reinterpretada | No hay HTTP. Se traduce a: comandos `#[tauri::command]` (¿el resultado/error se corresponde con lo que realmente pasó?), y a la integración real con el binario `claude` (flags confirmados en H19/H20, versión, ausencia del ejecutable). |
| 10. Regresión | Sí | Usar el mapa de módulos de `ARCHITECTURE.md`: un cambio en `event_normalizer.rs` obliga a re-probar consola de actividad, chat, menú de comandos y motor de reacciones (todos consumen `ClaudeEvent`). Un cambio en `presentation-manager.ts` obliga a re-probar FULL/COMPANION/PET y señales de atención. |
| 11. Prueba de desastre | Sí | Ver sección 3 — 35 casos concretos, no genéricos (19 generales + 16 de teclado). |

---

## 3. Casos creativos para romperlo (mínimo 8 pedidos — se entregan 35: 19 generales + 16 de teclado)

Cada caso: hipótesis concreta, cómo montarlo con las herramientas reales del proyecto, y qué señal confirma que se rompió. Ninguno requiere hardware fuera de lo ya usado en pasadas previas (ver `[[verificacion-sin-hardware]]`).

1. **Doble clic en "Iniciar sesión"** — dos clics antes de que `sessionActive` se actualice en el primer `await`. ¿`check_active_then_spawn` es atómico o hay ventana de carrera que deja dos procesos `claude` hijos vivos?
2. **`/clear` a mitad de un streaming activo** — confirmar `/clear` mientras el turno anterior sigue emitiendo bloques. ¿El buffer de `content-interpreter.ts` mezcla texto del turno viejo con el `session_id` nuevo en la misma burbuja?
3. **Bifurcar la misma sesión dos veces, clic-clic rápido** — ¿se disparan dos `--fork-session` reales sobre el mismo turno base, o el guard de sesión única bloquea el segundo con un error visible?
4. **VRM/GLB con header glTF válido (12 bytes correctos) pero cuerpo truncado/vacío** — la validación de `character_import.rs` solo revisa el header. Un archivo así "se importa" con éxito; el reventón real ocurre después, al cargar en `VrmAvatar.vue`. ¿El error de carga cae en el mensaje específico ya previsto o tumba el canvas completo?
5. **Cambiar de personaje con el Editor en estado `editing` (cambios sin guardar)** — ¿el cambio de personaje descarta silenciosamente, mezcla claves de `localStorage` entre personajes, o corrompe el estado `original` del personaje nuevo?
6. **Bypassear el clamp del slider de tamaño de mascota vía consola** (`window.__qa*` o mutación directa del estado) enviando un valor negativo o `9999` sin pasar por el slider — ¿Rust vuelve a validar el tamaño real de la ventana, o confía ciegamente en el valor recibido del frontend?
7. **Cerrar la ventana PET a mitad de un arrastre** (`startDragging` en curso) — ¿la posición queda persistida a medio arrastrar, con coordenadas fuera de todos los monitores reales?
8. **Desconectar el monitor secundario simulado (`disconnectSecondaryMonitor`) mientras PET está posicionada ahí** — ¿la ventana queda "perdida" fuera de cualquier área visible, sin mecanismo de recuperación a un monitor real?
9. **Mensaje larguísimo con decenas de code fences (` ``` `) sin cerrar, intercalados** — forzar que el parser incremental nunca decida que un bloque de código terminó, y medir si el buffer de streaming crece sin límite en una sesión larga (memoria).
10. **Forzar dos peticiones de interacción pendientes simultáneas** (dos `tool_use` en paralelo que ambos requieran permiso) — el contrato promete "nunca doble resolución" pero nunca se probó con 2+ pendientes reales a la vez; toda la evidencia previa es con como máximo una.
11. **Cambiar de modo de presentación en sucesión muy rápida** (FULL→PET→COMPANION→FULL sin esperar a que cada transición termine) — ¿la máquina de 6 transiciones encola, ignora, o dos transiciones concurrentes dejan el estado real de la ventana desincronizado del estado en memoria de `PresentationManager`?
12. **Editar `app_settings.json`/`preferences.json` a mano con la app abierta**, insertando un tipo incorrecto (`chatColumnWidthPx: "x"`) o bytes corruptos, y disparar cualquier acción que relea ese archivo — ¿degrada a defaults con el aviso que promete `AppSettingsResolution.usedDefaults`, o revienta la acción?
13. **Corromper una línea JSON en medio de un `.jsonl` de transcript real** (no solo campos ausentes, que ya se probó) y reanudar esa sesión — ¿`read_session_transcript` degrada esa línea a `None` como promete, o el error de parseo de una sola línea tumba la resiembra completa del chat?
14. **Frase larga en la cola de voz + `/clear` inmediato** — ¿la cola FIFO de TTS sigue narrando texto del turno ya borrado del chat, produciendo una "voz fantasma" sin contenido visible en pantalla que la respalde?
15. **`--permission-mode plan` (ya confirmado real) + `/clear` en medio de un plan sin terminar** — combinar dos mecanismos individualmente confirmados pero nunca juntos: ¿`/clear` deja el proceso real en un estado de "plan a medias" que el nuevo `session_id` no puede limpiar?
16. **Quitar un servidor MCP por accidente** — a diferencia de "Desinstalar" plugin (confirmación de 2 pasos real, verificada en código), "Quitar" servidor MCP es **un solo clic sin confirmación** (`removeMcp`, sección 1.8/1.19). Un doble clic accidental en la fila equivocada de una lista con varios servidores reales elimina configuración real sin forma de deshacer desde la UI.
17. **Generar fallas hasta saturar el panel de Diagnóstico sin poder limpiarlo** — `clearFailureLog()` existe en `failure-taxonomy.ts` pero no tiene botón real en `DebugPanel.vue` (hallazgo nuevo, sección 1.13). Disparar los 7 inyectores de falla en bucle durante una sesión larga de pruebas y confirmar si la lista (`v-for` sin límite visible) degrada el rendimiento del panel o de la app al crecer indefinidamente.
18. **Dos `/clear` casi simultáneos** — la confirmación de que `/clear` funcionó es inferencial (comparar `session_id` viejo vs. nuevo, sección 1.2), no un ack explícito del backend. Confirmar el primer `/clear` y, antes de que llegue el `session_id` nuevo, disparar un segundo `/clear` — ¿el segundo cuenta el cambio de `session_id` del primero como si fuera el suyo, dando un falso "confirmado" sobre el turno equivocado?
19. **Colisión de sesión disparada desde el menú nativo, no desde la UI** — el mismo rollback/retry de la sección 1.2 debe correr igual si "Reanudar" se dispara desde el submenú "Sesión" del menú nativo mientras otra sesión sigue activa, no solo desde el botón de la pantalla previa. Confirmar que ambos caminos comparten de verdad el mismo mecanismo (`resumeSession`/`beginSession`) y no hay un segundo camino más nuevo que nadie actualizó junto con el primero.

### Interacciones de teclado (arquitectura real en sección 1.20) — esperables

20. **Wrap-around real en los 6 tablists** — parado en el último tab de cualquiera de los 6 (modo, composer, secondary, console-view, admin, plugin-sub), presionar `ArrowRight` y confirmar que vuelve al primero (`nextTabId` usa módulo) — y al revés con `ArrowLeft` desde el primero.
21. **`Home`/`End` en los mismos 6 tablists** — saltan directo al primer/último tab sin pasar por los de en medio; no estaban documentados en ninguna versión previa de este catálogo, fáciles de dar por sentado que "las flechas ya cubren todo el teclado".
22. **Un `CustomSelect` en modo trigger, de punta a punta solo con teclado**: `Tab` hasta el botón → `Enter`/`Espacio` (semántica nativa de `<button>`) abre → flechas navegan (clamped, sin envolver — confirmar que se detiene en el último, no da la vuelta) → `Enter` confirma y cierra. Probar en al menos 3 de las 11 instancias reales (una de `App.vue`, una de `CharacterEditor.vue`, una de `DebugPanel.vue`) — no asumir que una prueba cubre las 11.
23. **El camino feliz completo sin un solo clic de mouse**: elegir carpeta → iniciar sesión → enviar un mensaje → cambiar a Modo Compañera → volver a Modo Completo → cerrar sesión, usando solo `Tab`/`Shift+Tab`/`Enter`/flechas/`Espacio`. Si algún control de ese camino solo responde a mouse (`@click` sin equivalente de teclado, sin ser un `<button>`/`<input>` real), esta prueba se atasca ahí mismo.

### Interacciones de teclado — casos no esperables (de borde, plausibles)

24. **Escape anidado: `CustomSelect` dentro de un overlay con su propio trap** — con el panel de depuración abierto, abrir el select "Modo destino" o "Capacidad ausente" (ambos viven dentro de `DebugPanel`, que escucha `Escape` globalmente vía `handleShortcut`) y presionar `Escape` una sola vez. `CustomSelect.onTriggerKeydown` llama `preventDefault()` pero no `stopPropagation()` — confirmar si un solo `Escape` cierra SOLO el select (esperado) o el select Y el panel de depuración completo de un tirón.
25. **Shift+Tab contra la rueda de color no cubierta por el selector del trap** — desde el primer botón real de `ThemePopup.vue`, presionar `Shift+Tab`. El selector de `trapOverlayTab` (`'button, input, [role="option"]'`) no incluye la rueda de `@jaames/iro` (SVG/canvas de terceros). Si esa rueda tiene algún nodo interno con `tabindex` propio, puede quedar fuera del cálculo de "primero/último" — confirmar si el foco se escapa del popup hacia el fondo de la página, o si la rueda simplemente nunca fue alcanzable por teclado (en cuyo caso elegir un color a mano es imposible sin mouse — hallazgo de accesibilidad aparte, no solo de teclado).
26. **`Tab` en spam dentro de cada uno de los 6 overlays/paneles con trap** (4 de `App.vue` + `DebugPanel` + `EditorModal`, cada uno con su propia implementación, ninguna comparte código) — confirmar que ninguno deja escapar el foco bajo pulsaciones rápidas y repetidas, y que no hay parpadeo por recalcular `querySelectorAll` en cada tecla.
27. **Auto-repeat del SO sobre el separador de columna de chat** — mantener presionada una flecha izquierda/derecha. Cada `keydown` repetido llama `persistChatColumnWidth()` sin ningún debounce visible en el código — confirmar que no se disparan decenas de escrituras reales a `app_settings.json` por segundo mientras la tecla sigue presionada.
28. **`Tab` con el listbox de comandos inline todavía abierto** — el composer del chat no es un overlay con trap propio (es parte del flujo normal de la página); `CustomSelect` en modo inline explícitamente no tiene `onFocusOut` (`if (props.inline) return` lo corta). Presionar `Tab` para salir del textarea sin usar `Escape` — ¿el listbox de comandos queda visible en pantalla, "huérfano", sin nada enfocado dentro?

### Interacciones de teclado — creatividad de romperlo

29. **Atajo global mientras se escribe** — abrir el panel de depuración (`Ctrl+Shift+Alt+D`) con el foco dentro del textarea del chat, a mitad de escribir un mensaje largo. Confirmar que el texto a medio escribir sigue intacto al cerrar el panel (y que el atajo sí se dispara pese al campo de texto enfocado, o documentar que el navegador se lo come).
30. **Doble atajo global casi simultáneo** — `Ctrl+Shift+Alt+D` dos veces en menos de 100ms. ¿El segundo evento se procesa contra un DOM que el primero todavía está montando/desmontando, dejando el panel abierto pero sin foco atrapado, o el listener de `Escape` de una instancia vieja todavía colgado?
31. **Dos overlays visibles a la vez, un solo `Escape`** — si el flujo de la app permite tener dos de los 4 overlays de `App.vue` visibles al mismo tiempo (cada uno con su propia bandera y su propio listener global, sección 1.20), un `Escape` dispara los 5 listeners de golpe (los 4 revisan su propia bandera). Confirmar si eso cierra los dos overlays con una sola tecla en vez de solo "el de encima" — comportamiento que ningún usuario esperaría.
32. **Pegar un salto de línea real en el composer** — `Ctrl+V` un texto que contenga un salto de línea real. El evento `paste` no simula un `keydown.enter`, así que el guardia `@keydown.enter.exact.prevent` nunca se entera — confirmar que el mensaje NO se envía solo por el salto de línea pegado.
33. **Layout de teclado no-QWERTY** — el menú de comandos se abre por el carácter literal `/` en el texto del borrador (detección por contenido, no por tecla física) — confirmar que funciona igual en un layout donde `/` está en otra posición física (AZERTY, por ejemplo).
34. **Dos manejadores de flecha compitiendo por el mismo evento** — con el composer expandido (pestañas "Editar"/"Vista previa" activas, `onComposerTabKeydown` escuchando flechas para cambiar de pestaña) Y el listbox de comandos visible al mismo tiempo (`onComposerKeydown` escuchando las mismas flechas para navegar la lista) — ¿cuál gana? ¿Puede el usuario quedar sin forma de mover el listbox porque el foco real está en el tablist de pestañas del composer, no en el textarea?
35. **Lector de pantalla con `aria-activedescendant` cambiante** — con NVDA/Narrator real activo, navegar el listbox de comandos con flechas y confirmar que cada cambio de opción activa (`aria-activedescendant` del textarea) se anuncia en cada tecla, no solo al abrir el listbox la primera vez.

---

## 4. Dónde documentar lo que se encuentre — `QA/bugs/` vs `QA/OPmejora/`

Dos carpetas, criterio de corte claro (mismo patrón de honestidad que `docs/reference/inventario-funcionalidades-qa.md`: nunca marcar algo sin evidencia literal):

- **`QA/bugs/`** — solo cuando un caso de este documento **se ejecutó de verdad** (en vivo, contra la app real o `harness.html`) y algo se rompió. Exige evidencia concreta (captura, mensaje de error real, dato leído en vivo).
- **`QA/OPmejora/`** — hallazgos de **lectura de código** (grep/Read, sin ejecutar nada) que apuntan a un riesgo, una inconsistencia de patrón, o una validación ausente, pero que no se confirmaron en vivo. Si más adelante se ejecuta el caso y el riesgo se confirma como defecto real, el resultado se documenta en `QA/bugs/` (puede referenciar la propuesta relacionada) — la propuesta no se "asciende" a bug solo por sospecha.

No arreglar nada al encontrar un caso — documentar y seguir con el siguiente, salvo que el hallazgo bloquee continuar el Hito de QA en curso (ahí sí se pausa).

**Plantilla `QA/bugs/<slug-corto>.md`:**

```markdown
# <título corto del bug>

**Caso general que se estaba revisando:** <área/fase de este documento>
**Prueba específica armada:** <qué se hizo exactamente, paso a paso>
**Qué tronó:** <síntoma observado>
**Cómo tronó:** <secuencia real que lo disparó — el "cómo", no solo el "qué">
**Resultado obtenido:** <mensaje de error real, captura, estado final observado — texto literal cuando exista>
**Evidencia:** <ruta a captura en `docs/reference/qa-evidencia/` o dato leído en vivo>
**¿Bloquea el Hito de QA en curso?:** sí/no — si sí, indicar cuál y por qué se pausó ahí
```

**Plantilla `QA/OPmejora/<slug-corto>.md`:** ver `QA/OPmejora/README.md` (tiene la plantilla completa y los 6 hallazgos ya escritos de la verificación de código de esta pasada — inconsistencias de confirmación, campos numéricos sin tope, formularios sin validación visible).

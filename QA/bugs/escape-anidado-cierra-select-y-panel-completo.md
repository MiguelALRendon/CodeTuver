# Un solo `Escape` cierra el `CustomSelect` abierto Y el `DebugPanel` completo

**Caso general que se estaba revisando:** Interacciones de teclado — caso 24 de `QA/to-prove.md` (Escape anidado entre un `CustomSelect` y su overlay padre).
**Prueba específica armada:** Contra la app real (`npm run tauri dev`, CDP directo vía WebSocket a `ws://localhost:9222`, sesión activa sin proceso real de Claude Code en curso):
1. Abrir el panel de depuración con `Ctrl+Shift+Alt+D` (dispatch de `KeyboardEvent('keydown', {key:'D', ctrlKey:true, shiftKey:true, altKey:true})` sobre `window`).
2. Enfocar el trigger del `CustomSelect` "Modo destino" dentro del panel y abrirlo con `ArrowDown`.
3. Confirmar que el panel del select está abierto (`.commands-inline-list--floating` presente).
4. Disparar **un solo** `Escape` sobre el elemento raíz del `CustomSelect`.
**Qué tronó:** El único `Escape` cerró el `CustomSelect` (esperado) **y también cerró el `DebugPanel` completo** (no esperado) — el usuario pierde el panel de depuración entero por intentar cerrar solo el desplegable.
**Cómo tronó:** `CustomSelect.vue::onTriggerKeydown` maneja `Escape` con `event.preventDefault()` pero **sin `event.stopPropagation()`** — el evento sigue burbujeando hasta el listener global `window.addEventListener('keydown', handleShortcut)` de `DebugPanel.vue`, que también reacciona a `Escape` (revisa `isOpen.value` y lo pone en `false`). Ambos manejadores — uno local vía `@keydown` de Vue, otro global vía `addEventListener` — procesan el mismo evento sin que ninguno sepa del otro.
**Resultado obtenido:** `selectOpenAfter: false`, `debugOpenAfter: false` (medidos directamente sobre el DOM real tras el `Escape`) — confirmado con `debugOpen1: true`/`selectOpenBefore: true` inmediatamente antes, mismo objeto de resultado, misma ejecución.
**Evidencia:** Ejecución en vivo vía CDP (script Node ad-hoc sobre `ws://localhost:9222/devtools/page/...`, sin capturas de pantalla — el resultado es el propio JSON de estado del DOM leído en el momento).
**¿Bloquea el Hito de QA en curso?:** No. Es un defecto real pero acotado (afecta solo la combinación CustomSelect-dentro-de-overlay-con-Escape-propio: los mismos 2 selects de `DebugPanel` y cualquier overlay futuro que combine ambos patrones) — se documenta y se continúa con el resto del catálogo.

**Corregido:** `CustomSelect.vue::onTriggerKeydown` agrega `event.stopPropagation()` en el caso `Escape`, junto al `preventDefault()` existente — corta la propagación en el origen compartido por las 12 instancias reales del componente. Ver `specs/correcciones-qa-gauntlet/plan.md` Hito 1.

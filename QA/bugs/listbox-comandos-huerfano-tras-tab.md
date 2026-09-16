# El listbox de comandos slash queda visible ("huérfano") tras perder el foco con Tab

**Caso general que se estaba revisando:** Interacciones de teclado — caso 28 de `QA/to-prove.md` (Tab con el listbox de comandos inline todavía abierto).
**Prueba específica armada:** Contra la app real, con sesión activa y Modo completo:
1. Enfocar el textarea del chat y escribir `/` (dispara la aparición del listbox de comandos, confirmado visible).
2. Simular la pérdida real de foco que un `Tab` del navegador produce de verdad: `textarea.blur()` seguido de `.focus()` en otro control real de la página (el botón "Enviar"). (Nota: un `KeyboardEvent('keydown', {key:'Tab'})` sintético NO mueve el foco de verdad — solo dispara los `addEventListener`, no el algoritmo nativo de tabulación del navegador — por eso la prueba usa `blur()+focus()` real en vez de solo despachar la tecla, para reproducir el efecto genuino de un `Tab`.)
3. Comparar el estado del listbox antes/después.
**Qué tronó:** El listbox de comandos (`.commands-inline-list`) **sigue visible en pantalla** después de que el foco real se movió a otro control (`send-button`), sin ningún elemento del listbox enfocado y sin ninguna relación visible con el nuevo elemento activo.
**Cómo tronó:** `CustomSelect.vue` en modo `inline` corta explícitamente su propio manejo de `focusout` (`function onFocusOut(event) { if (props.inline) return; ... }`) — el listbox de comandos usa ese modo. La visibilidad real del listbox en `App.vue` depende de `commandsListVisible` (computado a partir del contenido de texto del borrador, no del foco), así que perder el foco del textarea no lo oculta bajo ninguna circunstancia.
**Resultado obtenido:** `before.listbox: true` → `after.listbox: true` (sin cambio) mientras `after.activeEl: "send-button"` confirma que el foco real ya se movió fuera del textarea. El borrador (`value: "/"`) permanece intacto.
**Evidencia:** Ejecución en vivo vía CDP contra la ventana Tauri real.
**¿Bloquea el Hito de QA en curso?:** No. Es un defecto de UI real y reproducible (listbox visualmente "flotando" sin relación con el foco actual, confuso mientras el usuario sigue navegando la página con Tab) — se documenta y se continúa.

**Corregido:** `App.vue` agrega `onChatComposerBlur` (`@blur` en el textarea del composer) — cierra `commandsListVisible` salvo que `event.relatedTarget` caiga dentro del propio listbox (`document.getElementById(COMMANDS_LISTBOX_ID)`). Ver `specs/correcciones-qa-gauntlet/plan.md` Hito 3.

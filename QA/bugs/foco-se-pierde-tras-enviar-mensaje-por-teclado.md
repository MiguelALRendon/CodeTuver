# Enviar un mensaje (por teclado o clic) deja el foco en `<body>` — un usuario de teclado pierde su lugar en cada turno

**Caso general que se estaba revisando:** Caso general 23 del catálogo (`QA/to-prove.md`) — recorrer el happy path completo usando únicamente el teclado, sin un solo clic de mouse.

**Prueba específica armada:** Contra la app real, sesión activa, en Modo completo:
1. `Tab`/foco programático al `<textarea class="chat-panel__input">` real del composer (confirmado con `document.activeElement === textarea`).
2. Se tecleó un mensaje real carácter por carácter (`input` real, no un pegado de golpe) y se disparó `Enter` (interceptado por `@keydown.enter.exact.prevent="onComposerEnterKey"`, el mismo manejador real de la app).
3. El mensaje se envió correctamente (`chatEntryListLength` subió de 0 a 1, turno real iniciado, `sessionId` asignado) — el envío en sí **funciona bien**.
4. Inmediatamente después de `Enter`: `document.activeElement` ya no es el textarea, sino **`<body>`**.
5. Se esperó a que el turno real terminara (`session_finished`, textarea vuelve a `disabled:false`, `chatEntryListLength` sube a 2 con la respuesta real) y se volvió a comprobar el foco: **sigue en `<body>`**, no se restauró en ningún momento.

**Qué tronó:** Un usuario que opera la app solo con teclado, después de enviar cualquier mensaje, **pierde el foco por completo**. Para escribir el siguiente mensaje no basta con seguir tecleando: tiene que volver a `Tab`-ear desde el principio de la página (o usar el atajo global) hasta llegar de nuevo al composer.

**Cómo tronó:** El `<textarea>` del composer tiene `:disabled="isSending"` (`App.vue:1895`). `sendChatMessage()` (`App.vue:709-723`) pone `isSending.value = true` de forma síncrona apenas se dispara el envío — y **deshabilitar un elemento de formulario que tiene el foco lo fuerza a perder el foco de inmediato** (comportamiento estándar del navegador; el foco cae a `<body>` porque un elemento `disabled` no es enfocable). Cuando el turno real termina, `isSending.value` vuelve a `false` únicamente en el manejador de `session_finished` (`App.vue:1420-1421`) o en el `catch` de un error de envío (`App.vue:719-721`) — en ninguno de los dos caminos hay una llamada a `.focus()` sobre el textarea para devolver el foco a donde estaba. El mismo patrón de `disabled` sin restauración de foco se repite tanto si el envío fue por `Enter` como por clic en el botón de enviar (la causa es el atributo `disabled`, no la tecla usada).

**Resultado obtenido:** `document.activeElement.tagName === 'BODY'` tanto justo después de enviar como varios segundos después, con el turno ya completado y el textarea ya vuelto a habilitar — reproducido de forma determinística, sin intervención de foco en ningún punto del ciclo.

**Evidencia:** Ejecución en vivo vía CDP contra la ventana Tauri real, con un turno real completo (mensaje enviado, respuesta real recibida, `chatEntryListLength` 0→1→2), leyendo `App.vue:709-723,1416-1421,1895` para confirmar la causa exacta (no solo observada, sino explicada por el código).

**¿Bloquea el Hito de QA en curso?:** No, pero es un defecto real de accesibilidad de teclado que contradice el propósito del propio `role="combobox"`/`aria-*` cuidadosamente puesto en ese textarea (`App.vue:1884-1893`) — el composer está bien anotado para lectores de pantalla, pero un usuario de teclado puro pierde el hilo después de cada turno de todos modos. La corrección natural sería, en los dos puntos donde `isSending.value` vuelve a `false`, restaurar el foco al textarea si el usuario no movió el foco a otro lado intencionalmente mientras tanto (o al menos siempre, dado que la app no ofrece hoy ninguna otra superficie de foco relevante durante el envío). Se documenta, no se corrige, por instrucción del propio catálogo.

**Corregido:** nueva función compartida `restoreComposerFocusIfIdle()` (`App.vue`), llamada en los 2 puntos reales donde `isSending.value` vuelve a `false` (el catch de `sendChatMessage` y el handler de `session_finished`) — restaura el foco al textarea solo si `document.activeElement` es `document.body` o el propio textarea, nunca si la persona ya lo movió a otro control a propósito. Ver `specs/correcciones-qa-gauntlet/plan.md` Hito 9.

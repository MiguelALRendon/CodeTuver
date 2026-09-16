# Chat y contenido

Este dominio cubre todo lo que ocurre entre que la persona escribe algo en el composer y lo que aparece renderizado en pantalla: el envío de mensajes, el listado de comandos slash, el intérprete que convierte texto plano en bloques tipados (código, tabla, diff, comando, etc.), la consola de actividad, y el ciclo de vida de una petición de interacción (permiso, confirmación, elección, pregunta abierta, formulario).

## Conceptos clave

**Turno abierto vs. entradas cerradas.** El chat (`src/chat.ts`) modela su estado como `ChatState { closedEntries, openTurn, usage }`. Mientras el agente está respondiendo, su contenido vive en `openTurn` (un buffer de streaming + una consola de actividad en construcción); al recibir `session_finished` el turno se cierra y se mueve a `closedEntries`. La lista visible (`chatEntries()`) es derivada: si hay un turno abierto, lo agrega al final sin duplicar estado.

**Streaming incremental con "boundary segura".** El texto del agente llega en fragmentos (`assistant_message` con `text` parcial). `pushStreamChunk` (`content-interpreter.ts`) acumula el texto en un buffer y solo "libera" como bloques completos la parte de texto hasta la última línea en blanco que **no** está dentro de un fence (```` ``` ````) abierto — así un bloque de código a medio escribir nunca se corta ni se interpreta antes de tener sus tres backticks de cierre. El resto queda pendiente (`pendingText`) hasta el próximo chunk o hasta que el turno cierra (`flushStreamBuffer`, que fuerza el parseo de lo que quede, cerrado o no).

**Detección de tipo de bloque por cascada de detectores.** `parseSegment()` limpia secuencias ANSI (`stripAnsiSequences`) y prueba, en orden, `detectFence → detectTable → detectHeading → detectCommandInvocation → detectCommand → detectFileReference → detectWarningOrError`; el primero que matchea gana. Si ninguno matchea, cae a `detectDefault` (`paragraph` si tiene letras, `plain_text` si no). El orden importa: por ejemplo, un fence siempre se evalúa antes que cualquier otra cosa, así que un bloque de código con una tabla adentro nunca se interpreta como tabla.

**Aislamiento de fallos de parseo.** `parseSegmentSafely` envuelve cada segmento: si el parseo lanza (o si el modo de inyección de fallas de QA lo fuerza vía `armParseFault`/`FAULT_INJECTION_MARKER`, solo en `DEV`), se registra en la taxonomía de fallas (`registerFailure('parsing-error', …)`) y el segmento cae a `plain_text` con su texto original — nunca se pierde contenido ni se rompe el resto del render.

**Listbox de comandos con roving tabindex, siempre inline.** El listado de comandos slash no es un dropdown flotante clásico: es un panel inline que aparece debajo del composer (`commandsListVisible`), navegable con flechas (`nextCommandIndex`) y filtrado en vivo por lo que sigue a la `/` (`filterCommands`, case-insensitive, substring). Elegir una opción (`commitSelectedCommand`) **no envía el mensaje** — escribe el texto en el borrador y devuelve el foco al textarea con el cursor al final, salvo el caso especial de `/clear` (ver abajo).

**Peticiones de interacción: solo `permission` tiene ruta real hoy.** El contrato `InteractionRequest` (`claude-transport.ts`, espejado en `src-tauri/src/interaction_request.rs`) define 5 variantes: `permission`, `choice`, `open_question`, `confirmation`, `form`. **Solo `permission` tiene un constructor real** (`parse_can_use_tool_request` en Rust, disparado por un `control_request` de subtipo `can_use_tool` del proceso real de Claude Code) — las otras 4 están marcadas explícitamente `#[allow(dead_code)]` en Rust con un comentario "sin constructor" explicando por qué ningún evento crudo confirmado las dispara todavía (`choice`: ninguna elección de opciones real vista; `open_question`: en modo `-p` una pregunta abierta se resuelve como texto plano dentro de `result`, no como evento propio; `confirmation`: nada distingue una confirmación genérica de una autorización; `form`: nada modela un formulario real de varios campos). Estos 4 tipos solo se pueden ejercitar hoy inyectando la petición manualmente vía `window.__qaInjectPermissionPending` (hook de QA, ver [sesion-y-transporte](../sesion-y-transporte/overview.md)). Resolver una petición **de tipo `permission`** sí llama al backend real (`respond_to_permission_request` vía `respondToPermissionRequest`); resolver cualquier otro tipo se resuelve enteramente en el frontend (`resolveRequest`), sin ninguna llamada a Tauri — es la única vía real de ejercitar esas 4 ramas del componente `InteractionRequestCard.vue` hoy.

## Flujos reales

### Escribir y enviar un mensaje
1. Cada tecla dispara `onChatComposerInput`: redimensiona el textarea (`resizeChatComposer`, mide `line-height` real del DOM, no un valor fijo) y, si el borrador empieza con `/`, abre el listado de comandos (`commandsListVisible = true`, reinicia el índice activo a 0). Si deja de empezar con `/`, lo cierra.
2. `Enter` dispara `onComposerEnterKey`, que evalúa en este orden: (a) ¿el borrador es `/clear` con texto extra? → abre confirmación de `/clear`, no envía nada; (b) ¿el listado de comandos está visible? → confirma la opción resaltada (`commitSelectedCommand`), no envía; (c) si no aplica ninguna, `sendChatMessage()`.
3. `sendChatMessage()`: si ya hay un envío en curso o el borrador está vacío tras `trim()`, no hace nada. Si no, marca `isSending = true`, cierra el turno anterior y agrega la entrada `person` (`recordPersonMessage`), limpia el borrador, y llama a `sendInstruction(text)` (ver [sesion-y-transporte](../sesion-y-transporte/overview.md)). Si el `invoke` real falla (nunca llegará un `session_finished` que cierre el turno), revierte `isSending = false` y restaura el foco — sin este `catch`, el composer quedaría deshabilitado para siempre.
4. Al terminar el turno (`isSending` vuelve a `false`), `restoreComposerFocusIfIdle()` devuelve el foco al textarea **solo si** el foco actual es `document.body` o el propio textarea — nunca le roba el foco a un control donde la persona haya hecho clic a propósito mientras el mensaje estaba en vuelo. Nota real: el textarea sigue `:disabled` hasta que Vue vacía el render que puso `isSending` en `false`, por eso el `.focus()` va dentro de un `nextTick()`.

### Pegar o escribir un comando slash
El listado se abre con la misma condición sin importar el origen del texto: `chatDraft.value.startsWith('/')`, evaluada en cada `input` del textarea — sea que el usuario tecleó carácter por carácter o pegó de un solo golpe (`Ctrl+V`) un texto que ya empieza con `/`. `Tab` fuera del composer (`onChatComposerBlur`) cierra el listado **salvo que** el nuevo foco (`event.relatedTarget`) caiga dentro del propio listbox (clic en una opción) — las opciones usan `@mousedown.prevent` para nunca robarle el foco al textarea antes de que el `blur` se evalúe.

### `/clear` con y sin confirmación
- `/clear` exacto (elegido del listado o tecleado y confirmado con Enter estando el listado visible): `commitSelectedCommand` detecta el texto exacto `/clear` y llama `openClearConfirmation()` directamente, sin escribirlo en el borrador.
- `/clear algo más` (cualquier texto que empiece con el primer token exacto `/clear` seguido de espacio y algo más — el proceso real de Claude Code interpreta esto igual que `/clear` solo): `isClearCommandWithExtraContent()` lo detecta en `onComposerEnterKey` **antes** de mirar el listado de comandos, y abre la misma confirmación.
- La confirmación es un overlay propio (pila de overlays, ver [orquestacion-app](../orquestacion-app/overview.md)), con foco atrapado y un timeout de 8000&nbsp;ms (`CLEAR_CONFIRMATION_TIMEOUT_MS`) tras confirmar, para detectar si el reset nunca llegó.
- Confirmar (`confirmClear`) pone el borrador exactamente en `/clear` y llama a `sendChatMessage()` real — el reset de contexto es una instrucción real enviada al proceso, no un mecanismo aparte.

### Formación de bloques desde texto plano
Un mensaje del agente pasa completo por `parseContentBlocks` (vía streaming o de una sola vez al reanudar una sesión). Cada segmento entre líneas en blanco (fuera de fences) se evalúa contra los detectores en cascada descritos arriba. Ejemplos reales:
- ` ```typescript\ncodigo\n``` ` → `{ type: 'code', language: 'typescript', code }`.
- ` ```diff\n+linea\n-otra\n``` ` → `{ type: 'diff', additions, deletions }` (cada línea pierde su prefijo `+`/`-` y espacios iniciales).
- ` ``` \ncontenido\n``` ` (sin lenguaje) → `{ type: 'ascii_art', content }` — así es como un bloque de texto literal (por ejemplo, contenido de archivo citado tal cual) sobrevive sin que Markdown lo reinterprete.
- Una línea que empieza con `$ ` → `{ type: 'command', isShellCommand: true }`.
- Un `` `ruta/con/punto.ts` `` solo en su línea (con `.` o `/`) → `{ type: 'file_reference' }`.
- `warning:`/`advertencia:` o `error:` al inicio → bloques `warning`/`error`.
- Cualquier otra cosa con letras → `paragraph` (se renderiza como Markdown real); sin letras → `plain_text` (se muestra literal).

### Consola de actividad (eventos técnicos + texto del agente en un solo timeline)
`activity-console.ts` combina, en un único arreglo de bloques ordenado por llegada, tanto el texto interpretado del agente (vía `parseContentBlocks`) como eventos técnicos reales normalizados: `tool_started`/`tool_finished` (bloque `command` con `status: running/success/failed`, resuelto por `tool_use_id` cuando llega el resultado), `command_started` (mismo mecanismo, cola separada `pendingCommandIndices`), `file_read`/`file_modified` (bloque `file_reference`), y `permission_denied` (resuelve el comando pendiente más antiguo como fallido). Al terminar la sesión (`session_finished`), `sweepStalePending` resuelve como fallido cualquier `tool`/`command` que se haya quedado "en curso" sin que llegara nunca su resultado — nunca queda un bloque marcado "En curso" para siempre en una sesión ya cerrada.

## Modelo de datos real

- `ContentBlock` (`content-interpreter.ts`): unión discriminada por `type` — `paragraph | heading | code | diff | file_reference | command | table | ascii_art | warning | error | plain_text | command_invocation`. Cada variante trae solo los campos que necesita (ver `docs/specs/chat-y-contenido/reference.md` para el detalle exacto de cada una).
- `ChatEntry`: `{ role: 'person', text } | { role: 'agent', blocks: ContentBlock[] }`.
- `InteractionRequest` (`claude-transport.ts`): unión con `request_id` + campos propios por tipo (`tool_name`+`input` para `permission`, `title`+`options` para `choice`, etc.).
- `InteractionDecision`: unión paralela de "qué se respondió" — `permission{allow}`, `confirmation{allow}`, `choice{selected}`, `open_question{answer}`, `form{values}`.
- `InteractionRequestsState`: `{ pending: Record<id, Request>, resolved: Record<id, {request, decision}> }` — un `Record` indexado por `request_id`, así que inyectar dos veces el mismo id nunca duplica una entrada, solo la sobrescribe.

## Casos borde reales confirmados

- **Backticks sueltos sin cerrar** (`chat-draft-markdown.ts::neutralizeUnpairedBackticks`): antes de pasar el texto a `markdown-it`, cada corrida de backticks busca la siguiente corrida de **igual longitud** como cierre (algoritmo de emparejamiento de CommonMark); si no la encuentra, se reemplaza por la entidad `&#96;` para que sobreviva como carácter literal visible en vez de que `markdown-it` la descarte silenciosamente al tratarla como un delimitador de código inline fallido.
- **Fence que nunca cierra**: si un bloque de código no llega a tener su ```` ``` ```` de cierre antes de que el turno termine, `flushStreamBuffer` fuerza el parseo de lo que quede en el buffer tal cual (incluida la línea ```` ```typescript ```` sola) — cae a `paragraph`/`plain_text` con el texto crudo visible, sin perder contenido ni trabar el resto del render.
- **Texto pegado de un solo golpe que empieza con `/`**: como la condición de apertura del listado (`onChatComposerInput`) es `startsWith('/')` sobre el valor final del borrador (no un `keydown` incremental), un `paste` de un salto abre el listado igual que si se hubiera tecleado carácter por carácter.
- **Payload de interacción con `type` desconocido**: `isInteractionRequest()` en `interaction-requests.ts` es una frontera de confianza explícita — si el `type` no está en el conjunto de 5 conocidos, o falta `request_id`, el payload se descarta silenciosamente (`receivePendingRequest` devuelve el estado sin cambios), nunca se pinta una tarjeta a ciegas con forma desconocida.
- **Responder una petición ya resuelta o inexistente**: `resolveRequest` es no-op si el `id` no está en `pending` — cubre tanto un id que nunca existió como uno que ya se resolvió antes; no hay forma de "resolver dos veces" porque `InteractionRequestCard.vue` deja de ofrecer los botones de acción en cuanto la entrada tiene `decision !== null`.

## Huecos y limitaciones reales vigentes hoy

- De las 5 variantes de `InteractionRequest`, 4 (`choice`, `open_question`, `confirmation`, `form`) no tienen ningún camino real de producción que las construya — solo son alcanzables inyectándolas manualmente para pruebas. El componente que las renderiza (`InteractionRequestCard.vue`) y la lógica que las resuelve sí están completas y probadas, pero en un uso normal de la app hoy, nunca aparecerán en pantalla.
- `interactionRequestsState` no se reinicia al cerrar una sesión ni al arrancar una nueva (`beginSession`/`closeSession` en `App.vue` no lo tocan) — peticiones pendientes o resueltas de una sesión ya cerrada se arrastran visualmente a la sesión siguiente. Si la petición arrastrada era de tipo `permission`, además queda irresoluble para siempre (el backend real, `PendingRequestsState` en Rust, es un mapa en memoria por sesión que empieza vacío en cada arranque).

## Referencias cruzadas

- [sesion-y-transporte](../sesion-y-transporte/overview.md) — de dónde vienen los `NormalizedEvent` reales que alimentan este dominio, y el hook de inyección de peticiones para QA.
- [gestion-de-personajes](../gestion-de-personajes/overview.md) — el editor de personaje también usa `EditorModal` (mismo patrón de overlay con foco atrapado que `/clear`).
- [reacciones-y-voz](../reacciones-y-voz/overview.md) — `blocksToSpeechText` (`content-block-text.ts`) convierte estos mismos bloques a texto hablable, con sus propias reglas de qué se narra y qué se omite.
- [orquestacion-app](../orquestacion-app/overview.md) — cómo `App.vue` conecta el composer, el listado de comandos, la pila de overlays y las peticiones de interacción con el resto de la aplicación.

# Sesión y transporte

Dominio responsable de todo lo que ocurre entre "el usuario elige una carpeta de trabajo" y "hay un proceso `claude` real corriendo, emitiendo eventos normalizados a la interfaz". Cubre también el historial de sesiones pasadas (leído directamente de los `.jsonl` que escribe Claude Code, no de una base de datos propia) y el registro crudo en disco.

Ver también: [chat-y-contenido](../chat-y-contenido/overview.md) (consume los eventos normalizados que este dominio produce), [administracion-y-configuracion](../administracion-y-configuracion/overview.md) (persiste `SessionStartOptions` como parte de `AppSettings`), [robustez-y-actualizaciones](../robustez-y-actualizaciones/overview.md) (taxonomía de fallos del proceso hijo), [arquitectura-general](../arquitectura-general/overview.md) (mapa completo del sistema).

## Qué es una "sesión" aquí

Una sesión es un proceso hijo real de Claude Code (`claude -p --input-format stream-json --output-format stream-json --verbose`), no una abstracción de la app. La app nunca reimplementa el modelo ni el razonamiento del agente: solo arranca el proceso, le habla por stdin en NDJSON, y traduce lo que escribe por stdout a un tipo propio (`ClaudeEvent` / `NormalizedEvent`) que el resto de la interfaz consume. Regla de arquitectura confirmada en el código: **una sola sesión activa a la vez** — arrancar una nueva mientras hay una viva se rechaza con el error `session-already-active` en vez de permitir procesos concurrentes.

## Flujo: arrancar una sesión desde cero

1. El usuario elige una carpeta real de trabajo (selector nativo de carpeta o "Retomar `<ruta>`" con la última carpeta usada).
2. `beginSession(cwd)` en `src/App.vue` (línea 1354) hace guard temprano: si ya hay un arranque en curso (`isStarting`) o si el borrador de opciones de arranque tiene errores de validación, no hace nada.
3. Se resetea el estado visible: `sessionId`, `sessionActive`, el chat (`createChatState()`) y la consola de actividad (`createActivityConsoleState()`) — todo esto ANTES de que el proceso realmente arranque, así la interfaz nunca muestra restos de la sesión anterior mientras se conecta la nueva.
4. Se cargan los ajustes de la app para esa carpeta (`initializeAppSettings(cwd)`, dominio [administracion-y-configuracion](../administracion-y-configuracion/overview.md)).
5. Se invoca `startSessionWithRetry(...)` (`src/session-start-retry.ts`), que intenta `startSession(cwd, options)` una vez; si el backend responde con el error tipado `session-already-active`, cierra la sesión existente (`closeSession()`) y reintenta una sola vez. No hay reintentos adicionales — si el segundo intento también falla, el error se propaga.
6. Si el arranque tiene éxito, `sessionActive` pasa a `true` y las opciones de arranque usadas se persisten (`persistSessionStartOptions()`) para la próxima vez.
7. Si falla, se revierte `chosenCwd`/`sessionId` a los valores previos, se guarda el mensaje de error legible (`startError`) y, si el error es "Claude Code no encontrado" (`isClaudeCodeNotFound`), se registra como fallo en la taxonomía de fallos ([ui-compartida](../ui-compartida/overview.md)).
8. Pase lo que pase, `isStarting` vuelve a `false` en el `finally`.

## Flujo: reanudar o bifurcar una sesión pasada

Reanudar (`resumeSession(cwd, resumeSessionId, fork, folder)`, `src/App.vue` línea 1393) reutiliza el mismo `startSession`, pasando `{ sessionId, fork }` como opciones adicionales. La diferencia clave frente a un arranque limpio: **el proceso reanudado no reemite los turnos previos como eventos** (confirmado en vivo, no es una suposición de diseño) — así que la interfaz "siembra" el chat leyendo el transcript real del `.jsonl` de esa sesión ANTES de arrancar el proceso:

1. Se leen en paralelo (`Promise.all`) el transcript (`readSessionTranscript`) y los eventos de actividad históricos (`readSessionActivityEvents`) de la sesión elegida. Cualquier error en cualquiera de las dos lecturas se atrapa y degrada a lista vacía (nunca bloquea el arranque).
2. El chat se reconstruye con `transcriptToChatEntries(transcript)` como `closedEntries`, sin turno abierto.
3. La consola de actividad se reconstruye con `resumeActivityConsoleState(activityEvents)`.
4. La vista de chat se posiciona al final (no hay "cerca del fondo que respetar" como al recibir un evento nuevo en una sesión ya abierta — al reanudar siempre se asume que el usuario quiere ver lo último).
5. Recién entonces se llama `startSessionWithRetry` con `sessionId`/`fork` en las opciones.

"Bifurcar" (`fork: true`) usa exactamente el mismo camino que reanudar; la única diferencia es el flag que se pasa al proceso real de Claude Code, que decide si continúa el historial original o crea una rama nueva a partir de él.

`retomarUltimaCarpeta()` (línea 1454) es un atajo de un renglón: si existe una preferencia guardada (`lastPreference`), llama a `beginSession` (no `resumeSession`) con su `lastWorkingDirectory` — es decir, "retomar" desde el menú principal abre una sesión nueva en esa carpeta, no reanuda el `sessionId` exacto.

## Flujo: cerrar una sesión

`closeActiveSession()` (línea 1460) es el único punto de entrada expuesto a la interfaz (cableado a la entrada de menú nativo "Cerrar sesión"): si no hay sesión activa no hace nada; si la hay, invoca el comando de backend `closeSession()` y refleja el cierre poniendo `sessionActive = false` y `sessionId = null`. `sessionActive` gobierna casi todo el árbol condicional de `App.vue` — apagarlo es lo que hace que la interfaz vuelva a la pantalla de selección de carpeta.

## Persistencia de "última sesión" (retomar entre arranques de la app)

Esto NO lo decide el frontend. Cada vez que el proceso hijo real emite una línea `session_started` por stdout, el lector de stdout en Rust (`read_stdout`, `src-tauria/src/claude_transport.rs` línea 332) llama a `persist_session_started`, que escribe `{ lastWorkingDirectory: cwd, lastSessionId: session_id }` a `preferences.json` dentro del directorio de datos de la app (vía `session_preferences::write_preference`, en un `spawn_blocking` para no bloquear el hilo async del lector). Un fallo de escritura se emite como evento de stderr, pero nunca aborta la sesión — igual que el registro crudo, esta escritura es "best effort, no crítica".

Al arrancar la app, `App.vue` llama una vez a `getLastSessionPreference()` (línea 1603), que lee ese mismo archivo. Si la ruta guardada ya no existe en disco, el backend la devuelve igual sin validarla — la validación real ocurre al intentar arrancar el proceso en esa carpeta, no antes.

## Registro crudo (raw log) y por qué existe

Regla de arquitectura del proyecto (ver `CLAUDE.md`): **la salida cruda se escribe antes de interpretarla y sobrevive a cualquier fallo del intérprete**. Cada línea NDJSON que llega por stdout se anexa a un archivo de registro crudo (`RawLogWriter`, `src-tauri/src/raw_log.rs`) ANTES de normalizarla — así que si `normalize()` panicara o devolviera basura para una línea nueva del CLI real, la evidencia cruda ya quedó en disco para depurar después. La escritura es concurrente-segura (soporta múltiples `append` simultáneos sin corromper el archivo, cubierto por pruebas de concurrencia).

## Normalización de eventos: por qué existe un tipo propio

El proceso real de Claude Code emite JSON crudo con su propio esquema evolutivo (el de la CLI, no controlado por esta app). `event_normalizer::normalize()` (`src-tauri/src/event_normalizer.rs`) traduce cada línea a un `ClaudeEvent` — un enum cerrado y propio de la app — para que el resto del código (frontend incluido, vía el tipo espejo `NormalizedEvent` en TypeScript) nunca dependa de la forma exacta del JSON del CLI. Una línea que no calza con ningún patrón conocido no rompe el pipeline: se normaliza a una variante neutra en vez de propagar un error, y las pruebas de este módulo usan fixtures de líneas reales capturadas del CLI, no JSON inventado a mano.

## Modelo de datos real (no aspiracional)

- **`SessionSummary`** (lo que se lista en el historial): se arma leyendo el `.jsonl` de la sesión con dos pasadas acotadas, nunca el archivo completo — hay sesiones reales de hasta 3MB:
  - `title`/`cwd`/`gitBranch`/`cliVersion`: de la **primera** línea de tipo `user` que no sea meta (`find_first_useful_user_line`, se detiene en la primera coincidencia).
  - `totalCostUsd`/`totalDurationMs`/`startTimeMs`/`modelUsage`: de la **última** línea de tipo `cost-state`, leída solo de la cola del archivo (`TAIL_READ_CAP_BYTES` = 256 KiB desde el final, vía `seek(SeekFrom::End(...))`) — nunca carga el archivo entero para esto.
  - Cualquier campo que falte, o cualquier línea corrupta a mitad del archivo, cae a `None` por su cuenta (`Option` en cada campo) — un `.jsonl` corrupto o vacío nunca hace que la sesión desaparezca del listado, ni rompe el resto de campos que sí se pudieron leer.
- **`TranscriptEntry`** (texto legible de una sesión pasada): solo turnos de la conversación principal — se excluyen explícitamente las líneas de subagente (`isSidechain: true`) y las líneas meta (`isMeta: true`), y los turnos sin texto (por ejemplo un turno de usuario que solo trae un `tool_result`) se omiten en vez de producir una entrada en blanco. El contenido real llega en dos formas según el origen y ambas se manejan: string plano (sesión interactiva tecleada directamente) o arreglo de bloques con `type: "text"` (protocolo stream-json del SDK, el que usa esta app en producción) — se concatenan con salto de línea si hay varios bloques de texto.
- **`ModelUsage`**: tokens de entrada/salida, tokens de caché (lectura y creación) y costo en USD, todos opcionales — un modelo sin algún campo no descarta el resto.

## Carpetas de proyecto: convención y su caso especial

Claude Code organiza el historial en `~/.claude/projects/<carpeta-codificada>/*.jsonl` (o bajo `CLAUDE_CONFIG_DIR` si esa variable de entorno está definida y no vacía — mueve el historial completo). La codificación de una ruta real a nombre de carpeta reemplaza cada `\`, `/`, `:` y espacio por `-` (`cwdToProjectFolder`); la función inversa (`describeProjectFolder`) es **best-effort**: si el segmento original tenía un guion literal, no hay forma de distinguirlo del separador codificado, así que la ruta reconstruida puede ser ligeramente distinta de la original en ese caso límite (no se puede resolver sin ambigüedad, es una limitación aceptada, no un bug).

Caso especial filtrado activamente: cuando esta misma app usa un scratchpad de sesión, ese scratchpad vive bajo el directorio temporal de Claude Code y termina apareciendo como si fuera "una carpeta de proyecto más" en el listado — sin serlo realmente. `is_scratchpad_project_folder` detecta este patrón (contiene el marcador de temp de Claude Code y termina en `-scratchpad`) y esas carpetas se excluyen del listado que ve el usuario.

## Opciones de arranque de sesión

Expuestas en el panel de administración ([ui de administracion-y-configuracion](../administracion-y-configuracion/reference.md)) como un formulario de texto plano (`SessionStartOptionsDraft`) distinto de la forma tipada que realmente cruza a Rust (`SessionStartOptions`). Los seis modos de permiso reales (`PERMISSION_MODES`) fueron confirmados uno por uno contra `claude --help` de una versión real del CLI, no inventados: `acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk`, `plan`.

Cada campo del borrador mapea a un flag real de la CLI:

| Campo del borrador | Flag real |
|---|---|
| `model` | `--model` |
| `permissionMode` | `--permission-mode` |
| `addDir` (una ruta por línea) | `--add-dir` |
| `allowedTools` (una por línea) | `--allowedTools` |
| `disallowedTools` (una por línea) | `--disallowedTools` |
| `maxBudgetUsd` | `--max-budget-usd` |

La validación (`validateStartOptionsDraft`) corre en el cliente con el mismo criterio que la validación real en Rust (frontera de confianza duplicada a propósito: se rechaza antes de invocar, no solo después) — hoy el único campo con regla real es `maxBudgetUsd`, que debe ser un número finito y positivo si no está vacío. Estas opciones **solo se aplican al arrancar la sesión**, nunca en caliente, y se recuerdan (persisten) para la próxima vez que se abra una sesión — ver [administracion-y-configuracion](../administracion-y-configuracion/overview.md) para dónde y cómo se guardan.

## El "carril caliente" (hot options): qué cambia una sesión ya viva

Con una sesión ya corriendo, la única opción confirmada con un cambio de estado real demostrado contra un proceso real es `/effort <nivel>` (`src/session-hot-options.ts`), con cinco niveles reales: `low`, `medium`, `high`, `xhigh`, `max`. El resto de candidatas evaluadas en su momento (cambiar `/model` en caliente, `/permissions`, `/add-dir`) o no se lograron confirmar contra un proceso real o se rechazan de verdad por el CLI — por eso **no se exponen** en la interfaz como si funcionaran; exponer una opción sin confirmar que realmente cambia algo se consideró peor que no ofrecerla.

La confirmación de que el cambio de effort surtió efecto es una heurística sobre el texto real de la respuesta del proceso (`parseEffortChangeConfirmation`): si el texto no contiene explícitamente la frase de confirmación esperada (`/set effort level to/i`), el resultado se declara `'unknown'` — nunca se asume éxito solo porque no hubo un error explícito.

## Límites y comportamientos actuales (no "bugs pendientes", así funciona hoy)

- Solo puede haber **una sesión activa a la vez** en todo el proceso de la app; es una regla de diseño del backend, no una limitación técnica temporal.
- Reanudar/bifurcar una sesión **no reemite los turnos anteriores** como eventos de streaming — por eso la app tiene que reconstruir el chat leyendo el transcript aparte. Si Claude Code cambiara este comportamiento en una versión futura del CLI, este camino de "sembrado manual" dejaría de ser necesario, pero hoy es imprescindible.
- La reconstrucción de `describeProjectFolder` (ruta legible a partir del nombre de carpeta codificado) puede ser ambigua si algún segmento de la ruta original contenía un guion literal — no hay información suficiente en el nombre de carpeta para deshacer esa codificación sin ambigüedad.
- Ninguna sesión desaparece del historial por tener un `.jsonl` vacío o parcialmente corrupto; los campos no reconstruibles simplemente quedan en `None`/ausentes.
- El registro crudo y la persistencia de "última sesión" son ambos best-effort: un fallo de escritura en cualquiera de los dos se reporta (evento de stderr) pero nunca aborta ni bloquea la sesión en curso.

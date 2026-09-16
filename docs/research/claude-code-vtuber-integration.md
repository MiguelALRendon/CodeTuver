---
id: research-claude-code-integration
title: Integración real con Claude Code
type: reference
status: current
source: both
last_verified: 2026-08-27
symbols: []
related: [how-to-investigar-integracion-claude-code, ref-entregables-investigacion, ref-modelo-eventos, ref-peticiones-interaccion, ref-bloques-contenido]
---

# Integración real con Claude Code

Entregable de FEAT-001, Hito 1 de `specs/investigacion-previa/plan.md`. Cubre AC-001.1 a AC-001.5.

**Etiquetas de cada hallazgo:** [OFICIAL] información confirmada por documentación oficial (`claude --help`, mensajes de error del propio binario) · [OBSERVADO] comportamiento observado experimentalmente en este entorno · [INFERENCIA] inferencia o hipótesis sin confirmación directa · [NO-DISPONIBLE] funcionalidad no disponible o no garantizada · [NATIVO] funcionalidad que requiere integración nativa · [FALLBACK] funcionalidad que necesita un fallback.

## 1-2. Fuentes consultadas y fecha de consulta

- `claude --help` (binario instalado), consultado 2026-08-27. [OFICIAL]
- `claude mcp --help`, `claude plugin --help`, consultados 2026-08-27. [OFICIAL]
- 17 llamadas experimentales reales a `claude -p` desde este mismo entorno (Bash de Claude Code, no una terminal externa — ver limitación en §"Supuesto verificado"), 2026-08-27, entre las 11:09 y las 12:35 (hora local). [OBSERVADO]
- Fixtures anonimizados en `docs/research/fixtures/01..10` — son la evidencia primaria de este informe, no una ilustración. [OBSERVADO]

No se consultó documentación web externa: el propio binario instalado (`--help`, mensajes de error) fue fuente suficiente y más confiable que buscar en línea una versión que podría no coincidir con la instalada.

## 3. Versión de Claude Code analizada

**2.1.247** (`claude --version`), instalada localmente. [OFICIAL]

## 4. Versión de Tauri analizada

No aplica a este informe — Tauri se investiga en el Hito 2 (`docs/research/desktop-window-management.md`). Este informe es exclusivamente sobre el canal de comunicación con Claude Code, que es agnóstico del framework de presentación.

## 5. Sistema operativo y versión utilizados en las pruebas

Windows 11, build 26200 (`ver` del sistema), Node v23.11.1, npm 10.9.2. Todas las pruebas se ejecutaron vía Git Bash y PowerShell sobre este mismo Windows. **No se probó en macOS ni Linux** — ver §25.

## 6. Capacidades confirmadas

### 6.1 Arranque y ciclo de vida (AC-001.1)

- `claude -p "<prompt>"` inicia una sesión no interactiva, imprime y termina — es la forma oficial de invocar el agente desde otro proceso. [OFICIAL] [OBSERVADO] (fixture `01`)
- `--no-session-persistence` evita que la sesión quede guardada en disco cuando no hace falta reanudarla (solo válido con `--print`). [OFICIAL]
- **Identificador de sesión:** todo resultado trae `session_id` (UUID). [OBSERVADO] (fixture `01`, `06`)
- **Reanudación:** `--resume <session_id>` recupera el contexto completo de una sesión anterior — confirmado con una prueba real de dos llamadas encadenadas (una guarda un dato arbitrario, la siguiente, ya sin ese dato en el prompt, lo recuerda correctamente). [OBSERVADO] (fixture `06`) `-c/--continue` hace lo mismo para "la conversación más reciente en el directorio actual", sin necesitar el UUID. [OFICIAL, no probado directamente]
- **`--fork-session`** crea un ID nuevo al reanudar en vez de reutilizar el original — relevante si el modo "continuar sesión anterior" de la UI no debe pisar la sesión original. [OFICIAL]
- **Directorio de trabajo:** es el `cwd` del proceso hijo; aparece reflejado en `system.init.cwd` del stream y en los mensajes de error de herramientas ("your current working directory is..."). [OBSERVADO] (fixture `04`)
- **Interrupción/cancelación:** el evento `system.init` declara explícitamente `"capabilities":["interrupt_receipt_v1","interrupt_cancel_queued_v1","msg_lifecycle_v1"]` — la interrupción cooperativa es parte del protocolo. [OBSERVADO, capacidad confirmada] **El mecanismo exacto para dispararla desde un proceso externo no se confirmó de forma concluyente**: enviar `SIGINT`/`Stop-Process` desde Git Bash a un proceso Node nativo de Windows no demostró de forma fiable una cancelación cooperativa (la sesión de prueba corrió hasta el final pese al intento). Falta reproducir esto desde una terminal Windows nativa (cmd/PowerShell directo, no Git Bash) antes de darlo por cerrado. [INFERENCIA sobre el mecanismo, hallazgo pendiente de re-verificación]
- **Finalización normal vs. error:** el objeto `result` trae `is_error: boolean`, `subtype` (`"success"` visto; se infiere que hay variantes de error), `stop_reason` (`"end_turn"`, `"stop_sequence"` vistos) y **código de salida del proceso** — `0` en éxito, `1` confirmado en dos casos reales: entrada inválida (fixture `09`) y una combinación de flags inválida (`--input-format stream-json` sin `--output-format stream-json`). [OBSERVADO]
- **Cierre inesperado:** un proceso terminado a la fuerza (`Stop-Process -Force`, equivalente a `SIGKILL`) deja el stream **truncado sin evento `result` final** — el consumidor no puede asumir que el stream siempre cierra con una señal de fin. [OBSERVADO] (fixture `08`) — esto confirma por qué la regla de aislamiento del proyecto ("ninguna capa mata la sesión") tiene que tratar "proceso terminado sin `result`" como su propia clase de error, no como una variante de `is_error:true`.

### 6.2 Canal de datos (AC-001.3)

- **Salida estructurada oficial confirmada**, orden de preferencia del how-to totalmente satisfecho en el primer escalón: `--output-format json` (resultado único) y `--output-format stream-json` (streaming real, evento por evento) son ambas oficiales, documentadas en `--help` y **no requieren parsing de texto libre**. [OFICIAL] [OBSERVADO]
- `stream-json` en modo `--print` **exige** `--verbose`; si falta, el proceso termina con código 1 y sin llamar a la API (costo $0). [OBSERVADO] (mensaje de error real, sin fixture porque no llegó a producir un stream)
- `--input-format stream-json` (entrada estructurada) **exige** `--output-format stream-json`; violar esto también falla antes de la llamada. [OBSERVADO]
- Vocabulario real de eventos observado en `stream-json` (no es el que proponía `modelo-eventos.md` original — ver §"Contratos corregidos"): `system` (subtypes `init`, `status`, `hook_started`, `hook_response`, `thinking_tokens`), `stream_event` (envoltura de los eventos nativos de la API: `message_start`, `content_block_start/delta/stop`, `message_delta`, `message_stop`), `assistant`/`user` (snapshots completos de mensaje, incluyendo `tool_use`/`tool_result`), `rate_limit_event`, y el evento terminal `result`. [OBSERVADO] (fixture `02`)
- **No hay canal separado sin texto humano**: incluso el streaming estructurado lleva el texto de pensamiento (`thinking_delta`) y de respuesta (`text_delta`) como texto natural dentro de los deltas — la "estructura" es la envoltura (tipo de evento, índices, metadata), no una alternativa al lenguaje natural en el contenido. Es la distinción correcta para el parser: la envoltura JSON no necesita parsing frágil, el *contenido* de texto adentro sigue siendo Markdown/prosa que si lo necesita (bloques-contenido.md). [OBSERVADO]
- **stdin/stdout/stderr:** `-p` con prompt posicional no toca stdin; `--input-format stream-json` sí, leyendo líneas NDJSON de stdin. Errores de proceso (flags inválidos, JSON malformado) salen mezclados con stdout cuando se redirige `2>&1`, pero el binario los separa realmente en stderr (confirmado al no redirigir: el mensaje de flags inválidos aparece antes que cualquier evento). [OBSERVADO]

### 6.3 Actividad (AC-001.3, permisos)

- **Petición de permiso — hallazgo importante:** en `-p` sin TTY, con `permission-mode` por defecto o incluso `manual`, las herramientas (Bash/PowerShell) se ejecutaron **sin generar una pausa ni un evento de solicitud**. `permission_denials` quedó vacío en todos los casos donde la herramienta estaba disponible. [OBSERVADO] — **con una salvedad explícita marcada desde la planeación** (paso 1.1 del plan): estas pruebas corrieron *desde dentro de una sesión de Claude Code* (este mismo agente, vía su herramienta Bash), no desde una terminal externa limpia. Es razonable que el proceso hijo herede variables de entorno o contexto de confianza de su padre que alteren el comportamiento de permisos. **Esto se registra como hallazgo, tal como el how-to anticipó, y queda pendiente de reproducir desde un proceso verdaderamente externo antes de que la arquitectura confíe en "modo por defecto = pide permiso".** [INFERENCIA — requiere re-verificación externa]
- **Denegación real sí confirmada** por otra vía: `--disallowedTools "Bash" "PowerShell"` quita la herramienta del catálogo que el modelo ve; el modelo lo reporta como indisponible en su propio texto, y de nuevo `permission_denials` queda vacío — es decir, **"no disponible" y "denegado en tiempo de ejecución" no son el mismo evento** en este protocolo; ninguno de los dos casos observados llenó `permission_denials`. Qué SÍ llena ese arreglo no se pudo observar en este entorno (ver limitación arriba). [OBSERVADO + limitación]
- **Herramientas usadas y resultados:** confirmado con fixtures reales — lectura de archivo (éxito y error "File does not exist", fixture `04`), escritura de archivo, ejecución de comando de terminal (fixture `03`). Todas via el mismo mecanismo `tool_use` (petición) / `tool_result` (respuesta, con `is_error` propio). [OBSERVADO]
- **Nombre real de la herramienta de terminal:** con `--allowedTools "Bash"` explícito, la herramienta que efectivamente se invocó fue `"PowerShell"`, no `"Bash"` — en este Windows ambas existen y el filtro de `allowedTools` no impidió el uso de la que no se listó. Implica que filtrar por nombre de herramienta es menos fiable de lo que el nombre sugiere; conviene no asumir que allowlistear una sola herramienta de shell basta en Windows. [OBSERVADO]
- **Preguntas al usuario — hallazgo central para `peticiones-interaccion.md`:** cuando el prompt fuerza una situación donde el agente normalmente preguntaría con opciones, en `-p` sin TTY **no aparece ningún evento ni herramienta dedicada de pregunta** — el modelo resuelve la "pregunta" como texto plano dentro del `result` final (fixture `07`), completa con `subtype: "success"`, sin bloquear el proceso. **Implicación arquitectónica directa:** una integración que dependa de `-p`/`stream-json` no puede recibir una señal estructurada de "pregunta pendiente que bloquea"; si el producto necesita ese bloqueo real (que es lo que pide `peticiones-interaccion.md`), tiene que ser la propia aplicación quien detecte el patrón en el texto de salida, o correr en un modo distinto (interactivo con TTY, fuera del alcance verificado aquí). [OBSERVADO, hallazgo de diseño]

### 6.4 Interfaces oficiales (AC-001.5)

- **Comandos de administración del cliente** (no se envían al agente como instrucción; son subcomandos de la CLI, ejecutables sin sesión): `claude mcp <add|get|list|...>`, `claude plugin <list|install|enable|disable|...>`, `claude project`, `claude auth`, `claude doctor`, `claude update`, `claude setup-token`, `claude config` (visto en el listado de slash-commands internos del propio agente, no como subcomando top-level — verificar en 1.z si aplica). Todos scriptables sin abrir una sesión interactiva ni pilotar el menú de terminal (**R12** respetado: se usan los subcomandos documentados, nunca simulación de teclas). [OFICIAL]
- **Comandos que sí son instrucción al agente:** el `prompt` posicional de `claude [opciones] [prompt]`, y — una vez dentro de una sesión — los *slash commands* (skills) listados en `system.init.slash_commands`, que **no son subcomandos de la CLI** sino comandos internos de la conversación (confirmado: `flujo-core:flujo-implement`, `/doctor`, `/config`, etc. aparecen ahí, mezclados con comandos de administración como `/doctor` y `/color` que además se listan aparte en `terminal_slash_commands`). [OBSERVADO] (fixture `02`, campo `slash_commands`/`terminal_slash_commands`)
- **Vía no interactiva para MCP:** `claude mcp add/add-json/get/list` gestiona servidores MCP por línea de comandos; el propio `--help` de `mcp get` menciona `.mcp.json` como archivo de configuración de proyecto para servidores pendientes de aprobación. [OFICIAL]
- **Vía no interactiva para plugins:** `claude plugin install/enable/disable/list/marketplace` — mismo patrón. Los plugins instalados quedan en caché local (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, confirmado en el propio `system.init.plugins[].path` de las pruebas: rutas reales bajo `.claude\plugins\cache\...`). [OFICIAL] [OBSERVADO]
- **Rutas de configuración por ámbito**, confirmadas por uso directo en esta misma sesión y por las flags `--settings <file-or-json>` / `--setting-sources <user,project,local>` de `--help`:
  - **Ámbito global (usuario):** `~/.claude/CLAUDE.md`, `~/.claude/settings.json`.
  - **Ámbito de proyecto:** `<repo>/.claude/settings.json` (versionado) y `<repo>/.claude/settings.local.json` (no versionado, para overrides personales — visible en `.gitignore` del propio repo).
  - **MCP de proyecto:** `<repo>/.mcp.json` (mencionado por `claude mcp get --help`).
  [OFICIAL + OBSERVADO directamente en este repo]

## 7. Limitaciones conocidas

- El comportamiento de permisos en `-p` (sin pausas observadas) **puede estar sesgado por ejecutarse anidado dentro de otra sesión de Claude Code** — no se confirmó desde una terminal externa limpia. No se debe implementar la lógica de permisos del transporte asumiendo que "modo por defecto no pide nada"; hay que volver a probarlo antes de FEAT-006/FEAT-007 (interfaz de permisos).
- El mecanismo real de cancelación/interrupción (más allá de que el protocolo lo declara soportado) no se confirmó de forma reproducible en este entorno Windows+Git Bash.
- **Límite de cuota real observado a mitad de la investigación**: la cuenta alcanzó el 94% de su ventana de 5 horas (`rate_limit_event`) y las llamadas subsiguientes fallaron con `is_error:true` y `total_cost_usd:0` hasta que la ventana se liberó. Cualquier arquitectura que dependa de invocar `claude -p` de forma intensiva (por ejemplo, para automatizar pruebas o para múltiples subagentes) debe contemplar que el límite es real y compartido por cuenta, no solo teórico.
- No se probó en macOS ni Linux (§25).
- No se probó el modo verdaderamente interactivo (sin `-p`) desde un proceso hijo — todo lo aquí confirmado es sobre el modo no interactivo, que es el que la aplicación VtuberXD necesita de todos modos (es ella la que provee la interfaz, no una terminal).

## 8. Riesgos de compatibilidad

- Si Anthropic cambia el esquema de eventos de `stream-json` entre versiones (no está versionado explícitamente en el payload salvo por `claude_code_version` dentro de `system.init`), el normalizador debe tratar campos desconocidos como ignorables y no fallar duro — mismo principio que ya exige `no-depender-de-texto-fragil.md`.
- El hallazgo de que `allowedTools`/`disallowedTools` puede comportarse distinto entre "Bash" y "PowerShell" en Windows sugiere que cualquier lista de herramientas permitidas que la aplicación construya debe probarse contra el SO real de destino, no asumirse portable.

## 9. Recomendación de arquitectura

Confirma la preferencia por defecto del how-to, en su primer escalón: usar `claude -p --output-format stream-json --verbose --include-partial-messages` como transporte primario (streaming real, estructurado, sin parsing de stdout libre). El transporte se implementa como un adaptador único (`ProcessTransport` sobre `stream-json`); no hace falta la jerarquía completa de 4 adaptadores que el how-to dibuja como alternativa, porque el escalón 1 (APIs y eventos estructurados) ya es suficiente y está confirmado — **el ladder anti-sobreingeniería aplica aquí**: no se construyen `StructuredTransport`/`OfficialApiTransport`/`FallbackRawTransport` por separado cuando un único transporte cubre el caso real. Se deja la interfaz común (`ClaudeCodeTransport`) para que sustituirlo sea posible, pero la implementación es una sola clase, no cuatro.

## 10. Qué debe probarse localmente (antes de EPIC-002)

1. Comportamiento real de permisos desde un proceso externo (no anidado). Bloqueante para el diseño de FEAT-006/007.
2. Mecanismo de cancelación cooperativa desde una terminal Windows nativa.
3. Qué evento (si alguno) llena `permission_denials` en la práctica.

## 11. Qué partes pueden implementarse en el MVP

Transporte con `stream-json`, captura de salida cruda, normalizador de los eventos ya confirmados (`system.init`, `stream_event.*`, `assistant`/`user` con `tool_use`/`tool_result`, `result`, `rate_limit_event`), y el manejo de "cierre sin `result`" como estado de error explícito.

## 12. Qué partes deben posponerse

El modelo de "petición de permiso pendiente que bloquea la UI" tal como está diseñado en `peticiones-interaccion.md` depende de un mecanismo que este informe no pudo confirmar (§7, §10.1). Implementarlo con la información de hoy sería adivinar el evento; se pospone hasta la prueba local pendiente.

## 13. Qué capacidades del modo mascota requieren APIs nativas

No aplica a este informe (es del Hito 2). Nota cruzada: el hallazgo de §6.3 sobre preguntas resueltas como texto plano es relevante para el modo mascota, porque **si la aplicación no puede detectar de forma estructurada que hay una pregunta pendiente, tampoco puede levantar la señal de atención del modo mascota con confianza** — queda registrado para el Hito 2 y para `avatar-reacciones-voz.md`.

## 14. Qué fallbacks deben existir

- Si el stream se corta sin `result` (fixture `08`): la aplicación debe declarar la sesión en estado de error de transporte, no quedarse esperando indefinidamente ni asumir éxito silencioso.
- Si `stream-json` alguna vez no está disponible o cambia de forma incompatible: fallback declarado pero no implementado en este Epic (parsing de `--output-format json` simple, que sí se confirmó estable) — ver decisión D3 del plan: **este Epic no diseña el fallback completo**, solo dejarlo anotado como camino de escape conocido.

## 15. Qué comportamiento no puede garantizarse en todas las plataformas

Todo lo de este informe se verificó únicamente en Windows 11. La captura de proceso hijo, el manejo de señales (`SIGINT`/`SIGKILL` vs. `Stop-Process`) y el nombre real de la herramienta de shell (`PowerShell` vs. `Bash`) son plausiblemente distintos en macOS/Linux. No se garantiza nada de la sección 6.3 sobre nombres de herramienta fuera de Windows.

## Contratos corregidos

Con esta investigación:

- [`modelo-eventos.md`](modelo-eventos.md) y [`bloques-contenido.md`](bloques-contenido.md) pasan a `status: current` — lo que este Hito confirmó los respalda.
- [`peticiones-interaccion.md`](peticiones-interaccion.md) **se queda `proposed`**: el mecanismo real de una petición pendiente (permisos, cancelación) no se pudo confirmar sin ambigüedad — ver §6.3 y §7 arriba. No se promueve por inercia, tal como exige `ARCHITECTURE.md` §"Modelos y contratos".

## FEAT-011 — dónde vive el intérprete incremental

Ver decisión dedicada abajo, en la sección "Paso 1.8".

## Addendum (2026-08-27, durante Hito 1 de `nucleo-sesion`) — mecanismo de sesión persistente confirmado

Al planear FEAT-006 (EPIC-002) quedó abierta la pregunta de qué es realmente "una sesión" en `-p`: ¿un proceso nuevo por turno con `--resume <session_id>`, o un único proceso vivo que recibe varios turnos? Se probó en vivo: `claude -p --input-format stream-json --output-format stream-json --verbose`, con dos objetos `{"type":"user","message":{...}}` escritos al stdin del mismo proceso, con una pausa entre ambos. **Resultado real:**

- El proceso **no termina** después del primer turno — sigue vivo esperando más entrada en stdin.
- El segundo turno se respondió correctamente usando el contexto del primero (se le pidió recordar un número en el turno 1; en el turno 2, sin repetírselo, lo recordó bien), confirmando que es la **misma conversación**, no una nueva.
- Los hooks de sesión (`SessionStart`) corrieron **una sola vez**, al inicio del proceso — no se repiten por turno.
- Cada turno sigue cerrando con su propio evento `result` (mismo `session_id` en ambos), y el proceso permanece vivo después de cada uno hasta que se cierra el stdin o se termina explícitamente. [OBSERVADO]

**Esto es el mecanismo correcto para FEAT-006:** un único proceso hijo por sesión de la aplicación, alimentado por stdin conforme la persona escribe instrucciones, no un proceso nuevo por turno. `--resume <session_id>` (confirmado en el Hito 1 original, fixture `06`) queda como el mecanismo para **reanudar** una sesión después de que la aplicación se cerró, no para turnos dentro de la misma sesión activa.

## Paso 1.8 — decisión: dónde vive el intérprete incremental (FEAT-011)

**Decisión: TypeScript, en la capa de presentación — no Rust.**

Razón basada en lo observado en este Hito, no en preferencia: el contenido que el intérprete tiene que partir en `ContentBlock`s (Markdown, código, diffs, tablas, ASCII) **llega como texto plano dentro de campos de un evento JSON ya parseado** (`text_delta.text`, `assistant.message.content[].text`) — el trabajo de "structured parsing del transporte" ya lo resuelve `stream-json` en el lado de Node/Rust del proceso Claude Code, antes de que la aplicación lo vea. Lo que queda para el intérprete incremental es **interpretación semántica de texto ya en UTF-8**, no parsing de protocolo ni de binario — no hay ninguna razón de rendimiento o de acceso a memoria que empuje esto a Rust. Vive junto al resto de la capa de presentación en TypeScript, consumida por el normalizador de eventos (que sí puede vivir en cualquiera de los dos lados, pero la fuente de datos ya llega como JSON estructurado por stdout, no exige Rust tampoco).

**Alternativa descartada:** Rust junto al normalizador — se descarta porque no hay carga de trabajo (parsing binario, throughput crítico) que lo justifique; sería cruzar el límite `invoke`/eventos de Tauri (fronteras no negociables de `ARCHITECTURE.md`) sin necesidad, además de duplicar en dos lenguajes una lógica que es puramente de texto.

Candidato a ADR — se registra en el Hito 6 junto con el resto de decisiones cerradas por esta investigación.

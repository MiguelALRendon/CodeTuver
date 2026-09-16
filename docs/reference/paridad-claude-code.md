---
id: ref-paridad-claude-code
title: Paridad de la app contra Claude Code (binario real)
type: reference
status: current
source: both
last_verified: 2026-09-06
symbols: [claude_transport.rs]
related: [adr-0006, ref-modelo-eventos]
---

# Paridad de la app contra Claude Code

> **Producido por el Hito 19 de `specs/revision-ux-sesion-real-3/plan.md` (AC-107), 2026-09-06.** Hito de verificación pura, no toca interfaz. Reparte su resultado entre H20 (arranque), H21 (caliente) y H22 (reanudar/bifurcar). Evidencia real: `claude --help`/`claude --version` contra el binario instalado (2.1.263) y comandos slash reales enviados por el stdin de una sesión `-p --input-format stream-json` real, exactamente el transporte que usa la app (`spawn_claude`, `claude_transport.rs:117-127`).

## La pregunta que gobierna el carril caliente — resuelta

El inventario previo la marcaba como no verificada: ¿un comando slash enviado por el stdin de una sesión `-p` se ejecuta de verdad, o se trata como texto plano dirigido al modelo?

**Resuelta: se ejecuta de verdad.** Evidencia real, no inferida:

- `/context` real produjo una respuesta con `"model":"<synthetic>"`, `total_cost_usd:0`, `duration_api_ms:0`, `num_turns:0` — cero llamadas reales al modelo, y un reporte estructurado exacto (tokens por herramienta MCP, por skill, por agente personalizado) que ningún modelo genera por sí solo con esa precisión. Es manejo del lado del cliente, no una respuesta del LLM.
- `/model` (sin argumento) devolvió `"Current model: `Sonnet 5` (effort: high)\nUsage: /model <name>..."` — el estado real de la sesión, no una alucinación.
- `/effort medium` devolvió `"Set effort level to medium (this session only): ..."` — confirma que además de consultarse, el estado se puede cambiar de verdad por este canal.
- `/usage` devolvió datos reales de la cuenta (porcentaje de uso, fecha de reinicio, desglose por sesión) — imposibles de inventar.
- `/compact` devolvió `"Not enough messages to compact."` — reconocido y procesado (rechazado por una razón real, no por no existir).

## Carril caliente (sesión ya viva, sin relanzar el proceso)

Probado enviando el comando real por stdin contra una sesión `-p` real de esta máquina:

| Comando | Resultado real | Veredicto |
|---|---|---|
| `/context` | Reporte estructurado real, sin costo de API | ✅ Funciona |
| `/model` (consulta) | Estado real de la sesión | ✅ Funciona |
| `/effort <nivel>` | Cambia el estado real (confirmado, "this session only") | ✅ Funciona |
| `/usage` | Datos reales de la cuenta | ✅ Funciona |
| `/compact` | Reconocido, rechazado por razón real (pocos mensajes) | ✅ Funciona |
| `/permissions` | `"/permissions isn't available in this environment."` | ❌ Rechazado explícitamente |
| `/add-dir <ruta>` | `"/add-dir isn't available in this environment."` | ❌ Rechazado explícitamente |

**Petición de permisos (`can_use_tool`).** No se re-probó en este hito porque ya tiene evidencia real de sesiones de usuario previas y el código lo desmiente de forma verificable sin necesidad de repetir el experimento: `respond_to_permission_request` (`claude_transport.rs:440`) existe, está cableado a `register_permission_request_if_present` (`:260`) sobre `parse_can_use_tool_request`, y las tarjetas de permiso de la app ya funcionan en producción — el inventario previo que afirmaba "no existe mecanismo de PermissionRequest en stream-json" está confirmado equivocado por el propio código, no solo por este hito.

**No probado en esta pasada** (fuera del set mínimo necesario para resolver la pregunta que gobierna el bloque): `/model <nombre>` con argumento real (cambiar de modelo de verdad, no solo consultar) — el riesgo de dejar la sesión de investigación en un modelo distinto al esperado no se justificaba para una sesión descartable; se infiere que funciona igual que `/effort` dado el mismo mecanismo de reconocimiento confirmado, pero queda como inferencia declarada, no como hecho verificado línea por línea.

**Implementado por el Hito 21** (`session-hot-options.ts`, panel en la pestaña Configuración): de toda la tabla, solo `/effort` es una **opción** (algo que se elige y persiste durante la sesión) con cambio de estado demostrado — `/context`/`/usage` son reportes de solo lectura, `/compact` es una acción puntual, ninguno tiene un "valor" que la interfaz pueda reflejar como vigente. Por eso el control en caliente que la app expone es únicamente el nivel de esfuerzo; el resto de candidatas rechazadas (`/permissions`, `/add-dir`) ya tienen su equivalente real en el carril de arranque (H20, `--permission-mode`/`--add-dir`), así que AC-112/D16-paso-3 quedan satisfechos sin trabajo adicional.

## Carril de arranque (exige relanzar el proceso)

Confirmados como flags reales del binario instalado (`claude --help`, versión 2.1.263). Implementados y verificados en vivo por el Hito 20 (`build_startup_args`, `claude_transport.rs`): `--permission-mode plan` probado contra un proceso real cambió el comportamiento real de la sesión (rechazó escribir un archivo, generó un plan y falló al intentar `ExitPlanMode`) — no solo se confirmó que el flag existe, se confirmó que hace lo que dice.

| Flag | Qué hace |
|---|---|
| `--model <model>` | Modelo de la sesión (alias o nombre completo) |
| `--permission-mode <mode>` | `acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk`, `plan` |
| `--allowedTools` / `--disallowedTools <tools...>` | Lista de herramientas permitidas/denegadas |
| `--add-dir <directories...>` | Directorios adicionales con acceso de herramientas |
| `--max-budget-usd <amount>` | Tope de gasto en llamadas a la API (solo con `--print`) |
| `--append-system-prompt <prompt>` | Agrega al system prompt por omisión |
| `--system-prompt <prompt>` | Reemplaza el system prompt |
| `--settings <file-or-json>` | Archivo o JSON de configuración adicional |
| `--mcp-config <configs...>` | Servidores MCP desde archivos/JSON |
| `--resume [value]` / `-r` | Reanuda por id de sesión (H22) |
| `--continue` / `-c` | Continúa la conversación más reciente de la carpeta (H22) |
| `--fork-session` | Al reanudar, crea un id de sesión nuevo en vez de reusar el original (H22) |
| `--session-id <uuid>` | Usa un id de sesión específico |
| `--effort` no existe como flag de arranque — solo como comando `/effort` en caliente (confirmado en la tabla de arriba) | — |

**No existía en el inventario previo, confirmado real en `--help`:** `--max-turns` citado por el inventario original **no aparece** en la salida real de `claude --help` de esta versión (2.1.263) — puede haberse retirado o renombrado entre versiones del CLI. Se descarta de H20 hasta confirmar un equivalente real; exponer un flag que el binario instalado no reconoce violaría AC-112.

## Reanudar y bifurcar contra el proceso real (H22, AC-113)

Verificado en vivo contra el binario instalado, no solo contra `--help`:

- **`--resume <id> [--fork-session]` con stdin vacío no produce salida y sale con código 0** (probado directo, sin la app de por medio) — muy distinto de un arranque fresco, que emite `hook_started`/`hook_response` de inmediato aunque stdin este cerrado. El hook que dispara al reanudar es `SessionStart:resume`, no `SessionStart:startup` (nombre real observado en `rawActivityTail`).
- **El proceso reanudado nunca reemite los turnos previos como eventos de stream-json.** Solo el turno nuevo llega por el pipeline normal (`assistant_message`, etc.). Consecuencia real: si la interfaz solo confía en `applyChatEvent`/`chatEntries` (el reductor que consume esos eventos), una sesión reanudada se ve en blanco hasta el primer mensaje nuevo — el chat visible no es la conversación restaurada. Por eso `read_session_transcript` (`session_history.rs`) lee el `.jsonl` directamente y siembra `chatState` con sus turnos de texto **antes** de arrancar el proceso.
- **Un id que no existe no falla al invocar `start_claude_session`** (el spawn del proceso siempre tiene éxito, el binario existe) — falla más tarde, dentro del proceso ya vivo, con un evento `{"type":"result","subtype":"error_during_execution","is_error":true,"session_id":"<el-id-pedido>"}` y **sin que `session_started` llegue nunca** (`sessionId` de la app se queda en `null`). Esa ausencia es la señal real que distingue "fallo de arranque" de "sesión que ya vivió y luego se cortó": `handleIncomingEvent` solo convierte `session_finished{is_error:true}` en `startError` visible cuando `sessionId.value` sigue `null`.
- **Bifurcar (`--fork-session`) crea un id de sesión nuevo** (verificado: id original `722c353e-...` vs. id bifurcado `c4e8cdf9-...`) y **el archivo original queda byte-por-byte intacto** (mismo hash MD5 antes y después de bifurcar y de reanudar sin enviar mensaje) — la mitad más delicada del criterio, confirmada con evidencia real, no inferida del flag.

## Descartado de la interfaz (D16, AC-114)

Se configuran editando archivos del usuario, no controlando un proceso — exponerlos sería una interfaz que promete lo que no puede cumplir:

- **Hooks** (`.claude/settings.json`, hooks de proyecto/usuario).
- **Subagentes personalizados** (`.claude/agents/*.md`).
- **Statusline** (`.claude/settings.json`, `statusLine`).
- **Memoria / `CLAUDE.md`** (auto-discovery de archivos, no un parámetro de proceso).
- **`skillOverrides`** (configuración de settings, no un flag ni un comando).

## Lo que queda sin verificar (declarado, no ocultado)

- Cada flag del carril de arranque, uno por uno, relanzando el proceso — H20 lo hace al implementar cada uno, con evidencia propia.
- `/model <nombre>` cambiando de modelo de verdad (solo se confirmó `/model` en modo consulta).
- El resto de comandos slash del catálogo completo de Claude Code que ni el inventario ni D16 nombraron como candidatos del carril caliente — fuera del alcance declarado de este hito (AC-107 pide paridad sobre lo que Claude Code **ofrece y el inventario señaló**, no un barrido exhaustivo de cada slash command existente).

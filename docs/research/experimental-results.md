---
id: research-experimental-results
title: Resultados de las pruebas experimentales
type: reference
status: current
source: both
last_verified: 2026-08-27
symbols: []
related: [how-to-investigar-integracion-claude-code, how-to-investigar-ventanas-y-modo-pet, ref-entregables-investigacion, research-claude-code-integration, research-desktop-window-management]
---

# Resultados de las pruebas experimentales

**Estado: cerrado.** Ambos bloques (Claude Code — Hito 1, ventana — Hito 2) tienen resultado real registrado.

Recoge lo **observado**, no lo esperado. Dos bloques:

- **Comportamiento de Claude Code** — las 25 pruebas de [su how-to](../how-to/investigar-integracion-claude-code.md#3-pruebas-experimentales): desde el inicio del proceso hasta la salida inválida o inesperada.
- **Comportamiento de la ventana** — las pruebas de escritorio de [su how-to](../how-to/investigar-ventanas-y-modo-pet.md#4-pruebas-de-escritorio-completas): transparencia, click-through, monitores, escalado, bloqueo, suspensión, fallo de una capacidad nativa y recuperación desde un estado inconsistente.

Los ejemplos reales anonimizados van a [`fixtures/`](fixtures/).

> Si una fuente contradice a otra, **documenta la contradicción y decide con una prueba local**, no por autoridad de la fuente.

## Comportamiento de Claude Code (Hito 1, 2026-08-27, Claude Code 2.1.247, Windows 11 build 26200)

Metodología completa, cada prueba etiquetada y sus fixtures: [`claude-code-vtuber-integration.md`](claude-code-vtuber-integration.md). Aquí, el resultado crudo de cada una de las 25 pruebas del how-to:

| # | Prueba | Resultado observado |
|---|---|---|
| 1 | Inicio de proceso | `claude -p` arranca, corre hooks de sesión, responde y termina con código 0. Fixture `01`. |
| 2 | Instrucción simple | Confirmado en la misma llamada que #1. |
| 3 | Salida incremental | `--output-format stream-json --include-partial-messages` entrega `content_block_delta` evento por evento (`thinking_delta`, luego `text_delta`). Fixture `02`. |
| 4 | Mensaje largo | No se generó un mensaje largo real (para no gastar cuota); inferido de `modelUsage` real capturado: contexto 200 000 tokens, salida máxima 32 000 tokens por turno (campo `contextWindow`/`maxOutputTokens` del modelo usado). **[INFERENCIA]** |
| 5 | Lectura de archivos | `Read` sobre un archivo real devuelve su contenido interpretado correctamente (conteo de palabras exacto). |
| 6 | Modificación de archivos | `Write` crea un archivo real con el contenido pedido, verificado leyéndolo después. Fixture `03`. |
| 7 | Ejecución de comandos | Un comando (`echo`) se ejecutó vía la herramienta **`PowerShell`**, no `Bash`, pese a que solo se permitió `Bash` — ver hallazgo en el informe principal. Fixture `03`. |
| 8 | Ejecución de pruebas | Mismo mecanismo que #7 (una prueba/test es, para el transporte, un comando más); no se repite como caso aparte. |
| 9 | Error intencional | Pedir leer un archivo inexistente produce `tool_result` con `is_error:true` y mensaje `"File does not exist. Note: your current working directory is..."`, sin tumbar la sesión. Fixture `04`. |
| 10 | Solicitud de permiso | En `-p` sin TTY, ni el modo por defecto ni `--permission-mode manual` pausaron la ejecución de Bash/PowerShell. `permission_denials` vacío. **Posible sesgo por ejecutarse anidado** — ver limitación §7 del informe principal. |
| 11 | Rechazo de permiso | `--disallowedTools` sí bloquea de verdad (la herramienta desaparece del catálogo); el modelo lo reporta en texto, no como evento de rechazo. Fixture `05`. |
| 12 | Pregunta con opciones | Resuelta como texto plano dentro de `result`, sin evento ni herramienta dedicada. Fixture `07`. |
| 13 | Pregunta abierta | Mismo mecanismo que #12; no se pudo distinguir un caso del otro a nivel de protocolo en `-p`. |
| 14 | Cancelación | El protocolo declara soporte (`system.init.capabilities` incluye `interrupt_receipt_v1`), pero no se logró disparar de forma concluyente enviando `SIGINT` desde Git Bash a un proceso Node nativo de Windows. Pendiente de reproducir desde una terminal Windows nativa. |
| 15 | Interrupción | Mismo resultado que #14. |
| 16 | Sesión reanudada | `--resume <session_id>` recuperó contexto real de una sesión anterior en una prueba de dos llamadas encadenadas. Fixture `06`. |
| 17 | Salida con Markdown | Confirmado: texto con `**negrita**`/`_itálica_` llega como Markdown literal dentro de `result`, sin marcado adicional. Fixture `10`. |
| 18 | Salida con código | Bloque ```` ```typescript ``` ```` literal dentro del mismo string de texto. Fixture `10`. |
| 19 | Salida con diff | Bloque ```` ```diff ``` ```` literal, mismo mecanismo. Fixture `10`. |
| 20 | Salida con tabla | Tabla Markdown literal (`\|---\|---\|`), mismo mecanismo. Fixture `10`. |
| 21 | Salida con ASCII art | ASCII art dentro de un bloque de código literal, mismo mecanismo. Fixture `10`. |
| 22 | Salida fragmentada en streaming | Confirmado con el mismo mecanismo que #3: los `content_block_delta` llegan en fragmentos de pocas palabras, no por bloque completo. Fixture `02`. |
| 23 | Cierre inesperado del proceso | `Stop-Process -Force` a mitad de ejecución deja el archivo de salida truncado justo después de `system.init`, **sin evento `result` de cierre**. Fixture `08`. |
| 24 | Salida inválida o inesperada | Una línea de stdin no-JSON con `--input-format stream-json` produce `Error parsing streaming input line: ...` en stderr y código de salida 1 — **después** de que los hooks de sesión ya corrieron. Fixture `09`. También: combinaciones de flags inválidas (`stream-json` sin `--verbose`, o `--input-format stream-json` sin `--output-format stream-json`) fallan con código 1 **antes** de cualquier llamada a la API (costo $0). |
| 25 | Diferencias entre sistemas operativos | No verificable en este entorno: una sola máquina Windows disponible. Sin datos de macOS/Linux. **[NO-DISPONIBLE en este entorno]** |

**Hallazgo transversal no pedido por ninguna prueba individual pero relevante para todas:** a mitad de esta tanda la cuenta alcanzó el límite de su ventana de 5 horas (`rate_limit_event` con `utilization: 0.94`); las llamadas siguientes devolvieron `is_error:true` con `total_cost_usd:0` hasta que el límite se liberó. Cualquier diseño que dependa de invocar `claude -p` repetidamente (automatización de pruebas, subagentes) debe contar con este límite como real, no solo teórico.

## Comportamiento de la ventana (Hito 2, 2026-08-27, Tauri 2, Windows 11 build 26200)

Metodología completa: [`desktop-window-management.md`](desktop-window-management.md). Contra la lista de pruebas de escritorio del [how-to](../how-to/investigar-ventanas-y-modo-pet.md#4-pruebas-de-escritorio-completas):

| Prueba | Resultado observado |
|---|---|
| Ventana sin bordes | `decorations: false` aplicado en `tauri.conf.json`; el PoC arrancó sin marco visible de sistema (confirmado por build/arranque sin error; sin inspección de píxel por sesión bloqueada, ver limitación abajo). |
| Transparencia real / fondo transparente | `transparent: true` + `shadow: false` + CSS `background: transparent`; build y arranque sin error. **No verificado por inspección visual de píxeles** — sesión de Windows bloqueada durante la ventana de prueba. |
| Siempre encima | **Confirmado en la ventana viva**: el bit `WS_EX_TOPMOST` (`0x8`) está presente en el `ExStyle` real (`0x40118`), leído con `GetWindowLongPtr` mientras el proceso corría. |
| Posicionamiento en cada esquina | **Confirmado en la ventana viva**: posición real `(1576,24)-(1896,344)` coincide exactamente con el cálculo esperado para `top-right`, margen 24px, monitor 1920×1080. |
| Posicionamiento en múltiples monitores | Sin segunda pantalla física (igual que Hito 1). Cubierto por 10 pruebas unitarias reales con monitores sintéticos (coordenadas negativas, densidades distintas, 4 bordes de barra de tareas) — 10/10 en verde. Ver ADR-0005. |
| DPI y escalado | `scaleFactor` se preserva por monitor en `toMonitorInfoList` (prueba unitaria dedicada). Cambio de escala en caliente sobre una ventana ya abierta: **no observado** — reconfigurar la pantalla del equipo excede el alcance de esta prueba. |
| Cambio de tamaño / cambio de posición | Comandos (`setSize`, `setPosition`) compilan y están permitidos; aplicación programática confirmada (ver posicionamiento arriba). Disparo por clic de usuario: no verificado interactivamente (ver limitación). |
| Pérdida y recuperación de foco | Comando (`setFocus`/`onFocusChanged`) oficial y disponible; no verificado interactivamente. |
| Click-through | Comando (`setIgnoreCursorEvents`) compila y tiene permiso declarado; **no verificado** — sesión bloqueada, sin herramienta de automatización de mouse en este entorno. |
| Captura de clic sobre el avatar | No verificado, misma causa. |
| Restauración al hacer clic | El botón "Restaurar" del PoC ejecuta la secuencia real (quita decoraciones/always-on-top/click-through, simula opacidad); **hallazgo real:** Tauri 2 no permite desactivar `transparent` en runtime, solo simular opacidad — ver ADR-0008. No verificado por clic real de usuario. |
| Alt+Tab, barra de tareas, cambio de aplicación, pantalla completa | No verificado — requiere interacción real de teclado/mouse sobre el escritorio del usuario, que este agente no ejecuta sin su presencia. |
| Bloqueo y desbloqueo de Windows | **Confirmado de forma no planeada pero real**: la sesión de Windows se bloqueó durante la propia ventana de prueba. El proceso `tauri-app.exe` siguió vivo (`tasklist`) y sus propiedades de ventana siguieron siendo consultables vía Win32 mientras la sesión estaba bloqueada. Sin error, sin cierre del proceso. |
| Suspensión y reanudación, escritorios virtuales, desconexión de monitor | No verificado — requiere cambiar el estado real del hardware/SO del equipo del usuario. |
| **Fallo de una capacidad nativa** | No se forzó un fallo real (ej. deshabilitar WebView2) en esta pasada — el PoC no incluye todavía un manejo explícito de ese caso; declarado como pendiente, no como resuelto. |
| **Recuperación desde un estado de ventana inconsistente** | No se forzó este escenario deliberadamente. El hallazgo del bloqueo de sesión (arriba) es el caso más cercano observado: el proceso sobrevivió a un cambio de estado del sistema no iniciado por la aplicación, sin quedar en un estado inaccesible. |
| Rendimiento con avatar animado / consumo de memoria y GPU | No aplica todavía — el avatar de prueba es estático (círculo CSS), sin animación que medir. Pospuesto a EPIC-004. |

**Limitación transversal de este bloque:** la sesión de Windows del equipo estaba bloqueada durante buena parte de la ventana de prueba, y este agente no cuenta con herramienta de automatización de mouse/teclado sobre la sesión real del usuario. Los puntos marcados "no verificado" no están inventados ni asumidos — quedan como trabajo pendiente explícito antes de EPIC-005 (`desktop-window-management.md` §10).

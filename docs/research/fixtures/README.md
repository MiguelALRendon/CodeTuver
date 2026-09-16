# fixtures — ejemplos reales anonimizados

Salida real capturada de Claude Code durante la investigación, guardada para probar contra ella.

**Se usan para probar** el parser, el normalizador, el motor de reacciones y, cuando sea posible, la representación de los estados de presentación.

## Regla que no se dobla

**No se incluyen secretos, tokens, rutas privadas ni información sensible.** Anonimiza antes de guardar, no después.

## Qué conviene capturar

Salida con Markdown · con código · con diff · con tabla · con ASCII art · fragmentada por streaming · peticiones de permiso · preguntas con opciones · preguntas abiertas · errores · cierre inesperado del proceso · salida inválida o inesperada.

Lista completa en [el how-to de integración](../../how-to/investigar-integracion-claude-code.md#3-pruebas-experimentales).

## Inventario (Hito 1, `claude --output-format json|stream-json`, Claude Code 2.1.247, Windows 11 build 26200)

Todos con `--model haiku` para abaratar la investigación — el protocolo observado no depende del modelo. Rutas y `session_id`/`uuid` anonimizados con `<usuario>` / `<anonimizado>`.

| Archivo | Qué demuestra |
|---|---|
| `01-resultado-simple-json.json` | `--print --output-format json`: metadata completa de una respuesta (costo, tokens, `stop_reason`, `session_id`) en un solo objeto |
| `02-streaming-incremental-sin-hooks.json` | `--output-format stream-json --include-partial-messages`: secuencia real de eventos (`message_start` → `content_block_delta` con `thinking_delta`/`text_delta` → `message_stop` → `result`); se quitó el volcado de hooks de sesión, documentado aparte |
| `03-tool-use-write-y-comando.json` | Secuencia `tool_use`/`tool_result` real para `Write` y para un comando de terminal — nota: con `--allowedTools "Write,Bash"` la herramienta que efectivamente se uso fue `PowerShell`, no `Bash` (hallazgo 1.2) |
| `04-error-herramienta-archivo-inexistente.json` | `tool_result` con `is_error:true` cuando se pide leer un archivo que no existe — la sesion no se cae, el error se reporta como resultado de la herramienta |
| `05-herramienta-no-disponible-disallowedTools.json` | Con `--disallowedTools "Bash" "PowerShell"` el modelo no ve la herramienta y lo declara en texto; `permission_denials` queda vacío (no es lo mismo "no disponible" que "denegado") |
| `06-sesion-reanudada.json` | `--resume <session_id>` recupera contexto real de una sesión anterior (par de llamadas: una guarda un dato, la otra —ya sin ese contexto en el prompt— lo recuerda) |
| `07-pregunta-abierta-como-texto.json` | En `-p` sin TTY, una pregunta que el modelo normalmente haría con la herramienta de opciones se resuelve como **texto plano dentro de `result`**, sin evento dedicado — implicación directa para `peticiones-interaccion.md` |
| `08-cierre-inesperado-truncado.jsonl` | Proceso terminado a la fuerza (`Stop-Process -Force`) a mitad de un stream: el archivo queda truncado justo después de `system.init`, **sin evento `result` de cierre** — el consumidor debe asumir que el stream puede cortarse sin aviso |
| `09-entrada-invalida-error-parseo.jsonl` | `--input-format stream-json` con una línea de stdin que no es JSON válido: los hooks de sesión ya corrieron antes de que la entrada se valide; el proceso termina con `Error parsing streaming input line: ...` y código de salida 1 |
| `10-formatos-markdown-codigo-diff-tabla-ascii.json` | Confirma que Markdown, bloque de código, diff, tabla y ASCII art llegan como **un único string de texto** en `result` — el parser/normalizador de la aplicación es quien debe partirlo en `ContentBlock`s, el protocolo no lo hace por ella |

**Limite de sesion durante la investigacion:** en un punto la cuenta alcanzo su limite de 5 horas (`rate_limit_event` con `utilization: 0.94`) y las llamadas devolvieron `is_error:true` con `total_cost_usd:0` hasta el reinicio — comportamiento real de agotamiento de cuota, relevante para cualquier arquitectura que dependa de invocar `claude -p` repetidamente.

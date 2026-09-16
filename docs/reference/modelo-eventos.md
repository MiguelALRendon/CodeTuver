---
id: ref-modelo-eventos
title: Modelo de eventos normalizados
type: reference
status: current
source: both
last_verified: 2026-08-27
symbols: []
related: [ref-peticiones-interaccion, ref-bloques-contenido, exp-no-depender-de-texto-fragil, how-to-investigar-integracion-claude-code, research-claude-code-integration]
---

# Modelo de eventos normalizados

> **Estado: confirmado por FEAT-001 (Hito 1 de `investigacion-previa`)**, con una salvedad: el ciclo de vida de `permission_required`/`interaction_required` (abajo) no se pudo verificar sin ambigüedad — ver `docs/research/claude-code-vtuber-integration.md` §6.3 y §7. Este documento sigue siendo el **modelo normalizado** que la aplicación consume; la fuente real que hay que normalizar (`stream-json`) es más rica y se documenta en "Fuente real (raw)" abajo.
>
> **Implementación real (Hito 3 de `nucleo-sesion`, 2026-08-27):** `src-tauri/src/event_normalizer.rs`, enum `ClaudeEvent`. Cubre 5 de las 7 familias con constructor real (probado contra todos los fixtures de investigación); `CommandFinished` e `InteractionRequired` quedan declaradas en el contrato pero sin constructor — ningún evento crudo confirmado las dispara todavía.
>
> **Variante nueva (Hito 2 de `specs/correcciones-qa-sesion-real/plan.md`, corrige el Hallazgo 1 de `qa-sesion-real-hallazgos.md`):** `normalize_system()` distingue ahora `subtype: "permission_denied"` (bloqueo real de seguridad, produce `ClaudeEvent::PermissionDenied { tool_name }`) de cualquier otro `subtype` de sistema no reconocido — `hook_started`/`hook_response`/futuros subtypes siguen cayendo en `Unclassified`, pero ese trigger ya no dispara ninguna reacción visible de "el agente no entendió" (`mental-confundida`/`interaccion-no-entendio-la-instruccion` en `reaction-catalog.ts` perdieron el trigger `unclassified`). `permission_denied` se conecta a `mental-alarmada`, que antes no tenía forma de dispararse.
>
> **Hito 3 (misma spec, corrige el Hallazgo 3):** `activity-console.ts` resuelve como `'failed'` el bloque de comando pendiente cuando llega `permission_denied` (mismo mecanismo que `command_finished` con `success: false`) — antes quedaba "En curso" para siempre. Solo resuelve la cola de comandos (`Bash`/`PowerShell`), no la de herramientas genéricas.

Toda la aplicación consume eventos normalizados. La interfaz nunca depende del formato crudo de Claude Code — ver [Por qué no dependemos de texto frágil](../explanation/no-depender-de-texto-fragil.md).

## Contrato propuesto

```typescript
type ClaudeEvent =
  | { type: "session_started"; sessionId: string }
  | { type: "assistant_message"; content: string }
  | { type: "thinking" }
  | { type: "tool_started"; tool: string; input?: unknown }
  | { type: "tool_finished"; tool: string; success: boolean }
  | { type: "file_read"; path: string }
  | { type: "file_modified"; path: string }
  | { type: "command_started"; command: string }
  | { type: "command_finished"; command: string; success: boolean }
  | { type: "permission_required"; description: string }
  | { type: "interaction_required"; requestId: string; request: UserInteractionRequest }
  | { type: "error"; message: string }
  | { type: "session_finished" };
```

**Requisito vinculante:** cada evento debe conservar información suficiente para que el modo completo, el modo compañera y el modo mascota representen **el mismo estado** de forma distinta. Un evento que solo sirva a un modo está mal modelado.

## Catálogo de eventos a cubrir

FEAT-001 debe enumerar todos los tipos que Claude Code produzca. Como mínimo, estas familias:

### Ciclo de sesión

Inicio de sesión · inicialización · identificador de sesión · reanudación · cambio de proyecto · cambio de directorio de trabajo · espera · pausa · reanudación · cancelación · interrupción · finalización exitosa · finalización con error · desconexión · reconexión (si aplica).

### Mensajes del asistente

Texto normal · texto incremental en streaming · mensajes parciales · mensajes finales · resúmenes · explicaciones · advertencias · errores.

Y por su contenido: Markdown · bloques de código · listas · tablas · enlaces · imágenes o referencias visuales (si aplica) · diagramas ASCII · diffs · rutas de archivos · comandos · resultados de pruebas · preguntas.

El modelado del contenido de estos mensajes vive en [Bloques de contenido](bloques-contenido.md).

### Peticiones de interacción

Familia completa en [Peticiones de interacción](peticiones-interaccion.md). No es una simple confirmación de sí o no.

## Fuente real (raw) que el normalizador consume

Confirmado con `claude -p --output-format stream-json --verbose` (fixtures en `docs/research/fixtures/`): el transporte real no entrega directamente el `ClaudeEvent` de arriba — entrega eventos de más bajo nivel que el normalizador traduce:

- `system` (`subtype`: `init`, `status`, `hook_started`, `hook_response`, `thinking_tokens`) → normalizar `init` a `session_started`; **descartar o filtrar `hook_started`/`hook_response` antes de mostrarlos** — pueden contener contenido de configuración del usuario no apto para chat (hallazgo confirmado: un `hook_response` real trajo el `CLAUDE.md` completo del usuario en su campo `output`).
- `stream_event` (envoltura de `message_start`/`content_block_start`/`content_block_delta`/`content_block_stop`/`message_delta`/`message_stop`) → normalizar los `content_block_delta` de tipo `thinking_delta` a `thinking`, los de tipo `text_delta` a `assistant_message` incremental.
- `assistant`/`user` (snapshot completo del mensaje, incluye `tool_use`/`tool_result` con su propio `is_error`) → normalizar a `tool_started`/`tool_finished`, `file_read`, `file_modified`, `command_started`/`command_finished` según el nombre de la herramienta y su input.
- `result` (evento terminal único, con `is_error`, `stop_reason`, `session_id`, costo y uso de tokens) → normalizar a `session_finished`, adjuntando el motivo si `is_error`.
- `rate_limit_event` → **no tiene tipo propuesto arriba**; falta agregar `{ type: "rate_limit_warning"; utilization: number }` o similar antes de implementar, porque es información real que la UI puede necesitar mostrar (ver hallazgo del límite de cuota alcanzado durante esta misma investigación).
- **Cierre sin `result`** (proceso terminado a la fuerza, fixture `08`): no es un evento — es la *ausencia* de `session_finished`. El normalizador debe declarar `session_finished` con un motivo de error de transporte si el proceso termina y nunca llegó un `result`.

No se confirmó un evento distinto para `permission_required` ni `interaction_required`: en las pruebas realizadas, una pregunta que el modelo normalmente haría con una herramienta de opciones se resolvió como texto plano dentro del `result` final, sin pausa ni evento dedicado (ver `peticiones-interaccion.md`). Se deja el tipo en el contrato porque el diseño lo necesita, pero su origen real en el evento crudo queda **pendiente de la prueba local marcada en el informe** (§10 de `claude-code-vtuber-integration.md`).

## Regla de aislamiento

El cambio de presentación consume estado y eventos normalizados. **Nunca se comunica directamente con el proceso de Claude Code.** Ver [ADR-0004](../adr/0004-presentacion-centralizada.md).

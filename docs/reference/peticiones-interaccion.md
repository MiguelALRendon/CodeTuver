---
id: ref-peticiones-interaccion
title: Peticiones de interacción del usuario
type: reference
status: proposed
source: both
last_verified: 2026-08-27
symbols: []
related: [ref-modelo-eventos, how-to-investigar-integracion-claude-code, research-claude-code-integration]
---

# Peticiones de interacción del usuario

> **Estado: sigue `proposed` a propósito.** FEAT-001 (Hito 1) investigó el mecanismo real y **no encontró un evento estructurado dedicado** para nada de esto en el transporte `-p`/`stream-json`: una pregunta con opciones se resolvió como texto plano dentro del resultado final, sin pausa (ver `docs/research/claude-code-vtuber-integration.md` §6.3, fixture `07`). Tampoco se confirmó qué dispara `permission_denials`, ni el mecanismo real de una petición de permiso pendiente — las pruebas se ejecutaron anidadas dentro de otra sesión de Claude Code, lo que puede sesgar el resultado (mismo informe, §7). **No se promueve a `current` por inercia**: falta la prueba local marcada en el informe (§10) desde un proceso verdaderamente externo antes de que este contrato pueda darse por confirmado. El modelo sigue siendo el diseño correcto — lo que falta es el evento crudo del que se deriva.
>
> **Actualización (Hito 4 de `nucleo-sesion`, 2026-08-27):** se encontró evidencia real más fuerte para la variante de **autorización** — extracción de strings del binario de `claude` confirma los identificadores `can_use_tool`, `tool_name`, `behavior`, `allow`, `deny`, `updatedInput`, coincidiendo con el patrón público del SDK de Claude. Implementado en `src-tauri/src/interaction_request.rs` contra esa evidencia. **Sigue sin confirmarse en vivo** (mismo sesgo de ejecución anidada) — el contrato se queda `proposed` hasta esa verificación externa, aunque la variante de autorización ya tiene una implementación real lista para cuando se confirme.
>
> **Actualización (Hito 4 de `contenido-transparencia`, 2026-08-27):** la interfaz visual de las 5 variantes ya existe (`src/components/InteractionRequestCard.vue`) — cada una con sus propios controles reales, nunca botones genéricos. La forma real que consume (`src/claude-transport.ts::InteractionRequest`) es más pobre que el contrato aspiracional de arriba: el backend solo entrega `request_id`/`tool_name`/`input` para `permission`, no `title`/`description`/`risk`/`options` ya resueltos — la presentación deriva lo legible directamente de `tool_name`+`input`. **Sigue `proposed`**: de las 5 variantes, solo `permission` tiene un evento real confirmado; `choice`/`open_question`/`confirmation`/`form` tienen su UI lista pero ningún camino real que las dispare todavía.

**No asumas que siempre será una confirmación de sí o no.** Esa suposición es el error que este documento existe para evitar.

## Variantes a modelar

| Grupo | Variantes |
|---|---|
| Autorización | Permitir o rechazar una herramienta · un comando · una modificación. Confirmar una acción destructiva |
| Elección | Elegir entre varias opciones · opciones con valores predefinidos · resolver una ambigüedad |
| Entrada libre | Responder una pregunta abierta · proporcionar información adicional · formularios con varios campos |
| Selección | Seleccionar archivos o rutas · elegir un modo de ejecución |
| Control de flujo | Confirmar continuar · confirmar cancelar |
| Configuración | Proporcionar credenciales o configuración, si aplica |

Y por su **momento y ciclo de vida**: solicitudes que aparecen antes de una herramienta · durante una herramienta · que pueden expirar · que pueden cancelarse · simultáneas o anidadas · que requieren mostrar contexto técnico.

## Contrato propuesto

```typescript
type UserInteractionRequest =
  | {
      type: "permission";
      requestId: string;
      title: string;
      description?: string;
      risk?: "low" | "medium" | "high";
      action?: string;
      details?: unknown;
      options: InteractionOption[];
    }
  | {
      type: "choice";
      requestId: string;
      title: string;
      description?: string;
      options: InteractionOption[];
      allowMultiple?: boolean;
    }
  | {
      type: "text_input";
      requestId: string;
      title: string;
      description?: string;
      placeholder?: string;
      defaultValue?: string;
      validation?: unknown;
    }
  | {
      type: "form";
      requestId: string;
      title: string;
      fields: InteractionField[];
    }
  | {
      type: "confirmation";
      requestId: string;
      title: string;
      description?: string;
      confirmLabel?: string;
      cancelLabel?: string;
    };
```

## Reglas vinculantes

Estas no dependen de la investigación. Son de seguridad.

1. **La respuesta se transmite al mecanismo real de Claude Code.** No existe un sistema paralelo de permisos que pueda provocar que se ejecute un comando sin autorización.
2. **Ninguna petición se responde sin acción explícita de la persona.** El modo mascota nunca convierte una petición pendiente en una autorización implícita.
3. **Las peticiones pendientes sobreviven al cambio de presentación.** Ocultar el chat, pasar a modo compañera o enviar al escritorio no las descarta; se muestran intactas al restaurar.
4. **En modo mascota, una petición produce una señal visible y configurable**, y la persona debe poder restaurar la interfaz completa y revisar el contexto técnico antes de responder.
5. **La interfaz representa cada tipo de forma clara y propia.** No se reducen todas las interacciones a botones genéricos de «Aceptar» y «Cancelar».

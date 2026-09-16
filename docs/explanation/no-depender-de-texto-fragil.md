---
id: exp-no-depender-de-texto-fragil
title: Por qué no dependemos de texto frágil
type: explanation
status: current
source: user
last_verified: 2026-08-26
symbols: []
related: [ref-modelo-eventos, ref-bloques-contenido, ref-taxonomia-errores, how-to-investigar-integracion-claude-code]
---

# Por qué no dependemos de texto frágil

## El riesgo

La forma más rápida de construir esta aplicación sería suponer que ciertas frases exactas de la consola de Claude Code permanecerán iguales para siempre, y encadenar toda la interfaz a esas cadenas de texto.

Funcionaría hasta la siguiente versión de Claude Code. Después, la aplicación dejaría de entender la actividad — y ese es el **riesgo número 1** registrado en `02_entendimiento.md` §12.

## La respuesta: prioridad de mecanismos

No se diseña contra la salida humana si existe algo mejor. En orden:

1. APIs y eventos estructurados.
2. Salida estructurada.
3. Interfaces oficiales de integración.
4. Parsing de stdout y stderr, **solo** como compatibilidad o respaldo.

Cuál de los cuatro aplica es lo que debe descubrir [la investigación de FEAT-001](../how-to/investigar-integracion-claude-code.md). Lo que no se negocia es el orden de preferencia.

## La respuesta: encapsular el parsing

Si hace falta interpretar texto, se encapsula detrás de una interfaz para poder reemplazarlo después:

```text
ClaudeCodeTransport
        ↓
EventNormalizer
        ↓
UnifiedClaudeEvent
```

**La interfaz visual nunca depende directamente del formato crudo de Claude Code.** Consume eventos normalizados. Así, cuando el formato cambie, lo que se reescribe es un adaptador, no la aplicación.

## La regla de oro de depuración

Siempre existe un camino a la información. El normal:

```text
Claude Code → Raw Output → Event Parser → Normalized Events → UI
```

Y el que queda cuando el parser falla:

```text
Claude Code → Raw Output → UI
```

**La persona nunca debería quedarse sin información porque nuestro parser no entendió una salida nueva.** Por eso la salida cruda se registra íntegra, en orden y con marca de tiempo, **antes** de interpretarla, y sobrevive a cualquier fallo de las capas superiores.

Cambiar de modo de presentación tampoco puede ocultar permanentemente la salida cruda ni los eventos pendientes.

## Por qué esto vale la degradación

El resultado es que la aplicación tiene un modo de fallo **legible**: pierde belleza, no información. Un fallo del intérprete degrada la vista bonita y deja la cruda; un fallo del avatar o de la voz no toca ninguna de las dos; ninguno mata la sesión.

Ese comportamiento está especificado en [Taxonomía de errores](../reference/taxonomia-errores.md), y es lo que hace que el riesgo 6 de `02_entendimiento.md` —«interpretar el contenido resulta más frágil de lo previsto»— sea una molestia y no una falla del producto.

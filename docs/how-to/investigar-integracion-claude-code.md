---
id: how-to-investigar-integracion-claude-code
title: Investigar la integración real con Claude Code
type: how-to
status: current
source: user
last_verified: 2026-08-26
symbols: []
related: [ref-modelo-eventos, ref-peticiones-interaccion, ref-bloques-contenido, ref-entregables-investigacion, exp-no-depender-de-texto-fragil]
---

# Investigar la integración real con Claude Code

Cubre **FEAT-001**. Salida: `docs/research/claude-code-vtuber-integration.md` + fixtures.

> **No des por hecho que la salida visible en una terminal es la única interfaz de Claude Code.** Esa suposición es exactamente lo que esta investigación existe para descartar.

## 1. Qué averiguar

**Arranque y ciclo de vida** — formas oficiales de iniciar Claude Code desde otro proceso · modos interactivos y no interactivos · opciones de entrada y salida · eventos de sesión · identificadores de sesión · continuación y reanudación · directorio de trabajo · interrupciones · cancelación · finalización normal · finalización por error · códigos de salida y señales del proceso.

**Canal de datos** — streaming de respuestas · formatos estructurados disponibles · comunicación por stdin, stdout y stderr · posibilidad de recibir eventos **sin depender de texto humano** · diferencias entre la salida destinada a humanos y la destinada a automatización.

**Actividad** — solicitudes de permisos · respuestas del usuario · herramientas utilizadas · lectura y modificación de archivos · ejecución de comandos · resultados de herramientas · errores.

**Interfaces oficiales** — hooks, callbacks, plugins, SDKs, APIs.

**Entorno** — comportamiento en Windows, macOS y Linux · requisitos de autenticación · requisitos de instalación · restricciones de distribución de la aplicación · cambios entre versiones.

## 2. Orden de preferencia al elegir mecanismo

1. APIs y eventos estructurados.
2. Salida estructurada.
3. Interfaces oficiales de integración.
4. Parsing de stdout y stderr, **solo** como compatibilidad o respaldo.

Si no existe una API oficial suficientemente completa, diseña el transporte con varios adaptadores tras una interfaz común:

```text
ClaudeCodeTransport
├── StructuredTransport
├── OfficialApiTransport
├── ProcessTransport
└── FallbackRawTransport
```

El resto de la aplicación depende únicamente de la interfaz común.

## 3. Pruebas experimentales

Escribe scripts pequeños y observa el comportamiento **real**, no el esperado:

1. Inicio de proceso.
2. Envío de una instrucción simple.
3. Recepción de salida incremental.
4. Mensaje largo.
5. Lectura de archivos.
6. Modificación de archivos.
7. Ejecución de comandos.
8. Ejecución de pruebas.
9. Error intencional.
10. Solicitud de permiso.
11. Rechazo de permiso.
12. Pregunta con opciones.
13. Pregunta abierta.
14. Cancelación.
15. Interrupción.
16. Sesión reanudada.
17. Salida con Markdown.
18. Salida con código.
19. Salida con diff.
20. Salida con tabla.
21. Salida con ASCII art.
22. Salida fragmentada en streaming.
23. Cierre inesperado del proceso.
24. Salida inválida o inesperada.
25. Diferencias entre sistemas operativos, si es posible.

## 4. Guardar fixtures

Los ejemplos reales, **anonimizados**, van a `docs/research/fixtures/`. Sin secretos, tokens, rutas privadas ni información sensible. Sirven para probar el parser, el normalizador y el motor de reacciones.

## 5. Cerrar

Con lo confirmado, adapta [el modelo de eventos](../reference/modelo-eventos.md), [las peticiones de interacción](../reference/peticiones-interaccion.md) y [los bloques de contenido](../reference/bloques-contenido.md), que hoy están marcados `status: proposed`.

**No implementes el transporte definitivo antes de este punto.**

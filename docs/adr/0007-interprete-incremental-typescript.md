---
status: accepted
date: 2026-08-27
deciders: [propietario del proyecto, investigacion FEAT-001]
---

# 0007. El intérprete incremental de contenido (FEAT-011) vive en TypeScript, no en Rust

## Context and Problem Statement

`ARCHITECTURE.md` dejaba explícitamente sin decidir dónde vive el intérprete que convierte el texto de Claude (Markdown, código, diffs, tablas, ASCII) en `ContentBlock`s: junto al normalizador en Rust, o en la capa de presentación en TypeScript. La propia arquitectura ordenaba no decidirlo hasta que FEAT-001 investigara qué forma tiene realmente el contenido que hay que interpretar.

## Considered Options

- Rust, junto al normalizador de eventos.
- TypeScript, en la capa de presentación.

## Decision Outcome

Elegida: **TypeScript, en la capa de presentación**. La investigación (`docs/research/claude-code-vtuber-integration.md`, fixture `10`) confirmó que Markdown, código, diffs, tablas y ASCII art llegan como **un único string de texto plano ya dentro de un evento JSON parseado** (`text_delta.text` / `assistant.message.content[].text`) — el transporte (`stream-json`) ya resolvió el parsing de protocolo antes de que la aplicación reciba nada. Lo que queda para el intérprete es interpretación semántica de texto UTF-8, sin carga de parsing binario ni de protocolo que justifique cruzar a Rust.

Construirlo en Rust habría cruzado la frontera no negociable "la presentación no sabe que es escritorio" (`ARCHITECTURE.md`) sin necesidad real, y habría duplicado en dos lenguajes una lógica que es puramente de texto.

### Consequences

- Positiva: un solo lenguaje para toda la cadena de interpretación de contenido, sin serialización extra entre Rust y TypeScript para esto.
- Positiva: las pruebas del intérprete corren con el mismo stack (Vitest) que el resto de la presentación.
- Negativa: si en el futuro aparece contenido verdaderamente binario o de muy alto volumen que sí justifique Rust, esta decisión habría que revisarla — no se previó especulativamente aquí.

## More Information

- Paso 1.8 de `specs/investigacion-previa/plan.md`, Hito 1.
- `docs/research/claude-code-vtuber-integration.md`, sección "Paso 1.8".
- Contrato: `docs/reference/bloques-contenido.md`.

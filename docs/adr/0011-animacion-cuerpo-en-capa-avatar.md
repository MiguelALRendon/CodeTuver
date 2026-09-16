---
status: accepted
date: 2026-08-30
deciders: [propietario del proyecto, planeacion animaciones-editables]
---

# 0011. La reproduccion de animaciones/poses de cuerpo vive en la capa de avatar, nunca en el motor de reacciones

## Context and Problem Statement

`animaciones-editables` agrega el primer sistema de animacion de cuerpo del proyecto: pools de animaciones por estado, una pose que se dispara periodicamente, y su combinacion sin choque. `ARCHITECTURE.md` ya fija una frontera no negociable — "el motor de reacciones y el avatar estan separados... el motor no consulta el modo de presentacion ni el personaje activo" — pero esa frontera se escribio antes de que existiera ningun mecanismo de animacion de cuerpo real, y `reaction-catalog.ts` ya tiene, desde otro eje (`PRESENTATION_REACTIONS`), un campo `animation?: string` de nombre parecido (`blink`, `breathe`, `head-tilt`). Habia que decidir explicitamente si el sistema nuevo reusa ese campo o se separa, antes de escribir el primer modulo.

## Considered Options

- **Capa de avatar** (`character-editor.ts`/`VrmAvatar.vue` y modulos nuevos: `avatar-animation-pool.ts`, `avatar-pose-timer.ts`): el motor de reacciones sigue emitiendo solo `state` (string); toda la logica de que animacion/pose concreta suena, cuando cambia, y como se combina, vive del lado del avatar.
- **Motor de reacciones** (`reaction-catalog.ts`): reusar/ampliar el campo `animation?: string` ya existente en `AvatarReactionDefinition` para que cada reaccion declare directamente su animacion de cuerpo.

## Decision Outcome

Elegida: **capa de avatar**. Es la aplicacion directa de la frontera ya fijada en `ARCHITECTURE.md` §"Fronteras no negociables", no una decision nueva desde cero — este ADR la deja explicita para el caso concreto de animacion de cuerpo, porque el campo `animation` ya existente en `reaction-catalog.ts` pertenece a un eje distinto (efectos de presentacion disparados por evento discreto, ej. `blink` al parpadear) con reglas de disparo incompatibles con el sistema nuevo (bucle aleatorio sostenido mientras el estado sigue activo, no un disparo puntual por evento). Mezclarlos habria significado que el motor tuviera que saber que personaje esta activo y que pool de animaciones tiene disponible para decidir que reproducir — exactamente lo que la frontera de `ARCHITECTURE.md` prohibe.

### Consequences

- Positiva: si una reaccion no es compatible con el avatar cargado (ej. personaje importado sin pool para ese estado), la capa de avatar ya sabe degradar sola (mismo patron ya usado para expresion/boca) sin que el motor necesite lógica condicional nueva.
- Positiva: el eje `PRESENTATION_REACTIONS` de `reaction-catalog.ts` (`blink`, `breathe`, `head-tilt`, etc.) queda intacto y sin ambiguedad de proposito frente al sistema nuevo.
- Negativa: existen ahora dos conceptos llamados "animacion" en el codigo (el campo de `reaction-catalog.ts` y el pool de `character-editor.ts`) que un futuro colaborador podria confundir sin leer este ADR — mitigado documentandolo explicitamente en `docs/reference/avatar-reacciones-voz.md` (doc-check del Hito 1 de `animaciones-editables`).

## More Information

- `specs/animaciones-editables/design.md`, decision D1.
- `docs/ARCHITECTURE.md`, seccion "Fronteras no negociables".
- `src/reaction-catalog.ts`, eje `PRESENTATION_REACTIONS` (el campo `animation` que no se reutiliza).

---
status: accepted
date: 2026-08-27
deciders: [propietario del proyecto, investigacion FEAT-002]
---

# 0008. La transparencia de ventana se fija al crearla; el modo mascota no la alterna en runtime

## Context and Problem Statement

`presentacion-y-ventana.md` modelaba `PresentationState.window.transparent` como un booleano más del estado de presentación, alternable al cambiar de modo (`PET → FULL` implicaría pasar de `transparent: true` a `transparent: false`). Había que confirmar con un PoC real si Tauri 2 permite ese cambio en tiempo de ejecución.

## Considered Options

- Asumir que `transparent` es togglable en runtime, como el resto de las propiedades de `PresentationState.window` (`alwaysOnTop`, `focusable`, `ignoreMouseEvents`).
- Confirmar con el PoC real antes de diseñar la transición de modos sobre ese supuesto.

## Decision Outcome

Confirmado con el PoC del Hito 2 (`docs/research/desktop-window-management.md` §6.4): **Tauri 2 no expone un método para desactivar `transparent` en tiempo de ejecución** — es una propiedad de creación de la ventana (`tauri.conf.json` o `WindowBuilder`), no un `setTransparent(bool)`. La transición `PET → FULL` no puede implementarse cambiando ese booleano de la ventana ya creada.

**Decisión de diseño resultante:** la ventana principal se crea siempre con `transparent: true`, y la transición a un modo "opaco" (FULL/COMPANION) se simula pintando un color de fondo sólido con `setBackgroundColor()`, en vez de alternar la propiedad de transparencia real. La alternativa —crear y destruir la ventana al cambiar de modo— se descarta por ahora: perdería estado de foco/posición y es una complejidad mayor que simular opacidad con un color de fondo.

### Consequences

- Positiva: el modo mascota (transparencia real) queda garantizado sin trucos adicionales.
- Positiva: la transición de modo no requiere recrear la ventana, evitando parpadeos o pérdida de estado.
- Negativa: `docs/reference/presentacion-y-ventana.md` debe leerse con esta corrección — `window.transparent` en `PresentationState` pasa a ser informativo/derivado, no una propiedad que `DesktopWindowManager.setTransparent()` alterne libremente; ese método, si se implementa, debe advertir o documentar que solo aplica en la creación.
- Neutral: no se verificó interactivamente (sesión bloqueada durante la prueba, ver `desktop-window-management.md` §7) el comportamiento visual completo del color de fondo simulado — pendiente de confirmar con interacción real antes de EPIC-005.

## More Information

- `docs/research/desktop-window-management.md` §6.4.
- Corrección aplicada en `docs/reference/presentacion-y-ventana.md`.
- Implementación de referencia: `src/App.vue` (`restore()`) del PoC del Hito 2, en `specs/investigacion-previa/plan.md`.

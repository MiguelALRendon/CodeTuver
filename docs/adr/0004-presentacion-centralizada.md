---
status: accepted
date: 2026-08-25
deciders: [propietario del proyecto]
---

# 0004. La presentación se centraliza en un PresentationManager

## Context and Problem Statement

La aplicación tiene tres modos de presentación —completo, compañera y mascota de escritorio— y, además, visibilidad independiente del chat, de la actividad y de la posición del avatar. Cada componente de la interfaz podría consultar el modo actual y decidir por su cuenta cómo comportarse.

Eso es lo que hay que evitar. Con las condiciones repartidas, cambiar de modo deja de ser una transición y pasa a ser una carrera entre docenas de decisiones locales, cada una capaz de dejar la aplicación a medio camino.

## Considered Options

- Condiciones dispersas del tipo `if (mode === "pet")` por toda la aplicación.
- Un `PresentationManager` centralizado que gobierna un `PresentationState` explícito.

## Decision Outcome

Elegida: **`PresentationManager` centralizado**, porque el propietario del proyecto lo pidió dos veces y de forma literal —«no debe depender de condiciones dispersas como `if (mode === "pet")` por toda la aplicación»—, y porque es lo único que permite cumplir la regla de negocio R2: cambiar de modo no detiene, reinicia ni duplica la sesión.

El manager recibe cambios de modo, valida transiciones, coordina la visibilidad de los paneles y el `DesktopWindowManager`, mantiene el estado de sesión intacto, restaura la configuración anterior, notifica al avatar y a la interfaz, gestiona fallbacks cuando la plataforma no soporta una capacidad, y **evita que una transición incompleta deje la aplicación en un estado inconsistente**.

Dos condiciones que lo acompañan:

- **Modo y visibilidad de paneles son estados independientes**, para permitir combinaciones futuras sin rediseñar la interfaz.
- **No depende de detalles internos del transporte.** Recibe estado y eventos por interfaces públicas, nunca hablando con el proceso de Claude Code.

### Consequences

- Positiva: existe un solo lugar donde una transición puede fallar, y por tanto un solo lugar donde implementar la recuperación a un modo seguro (ver `docs/reference/taxonomia-errores.md`).
- Positiva: la regla «cambiar de presentación no toca la sesión» es estructural, no una disciplina que haya que recordar en cada componente.
- Positiva: agregar un cuarto modo, o una combinación nueva de paneles, no obliga a tocar la interfaz entera.
- Negativa: es indirección desde el primer día. Un componente que solo quiere saber si mostrarse tiene que pasar por el estado de presentación en vez de preguntar el modo.
- Negativa: el manager concentra complejidad —validación de transiciones, fallbacks de plataforma, restauración de estado previo— y es el punto que más hay que probar.
- Neutral: obliga a que el `DesktopWindowManager` sea una abstracción propia y no llamadas sueltas a Tauri, lo que a su vez hace realista la extensión futura a macOS y Linux, hoy fuera de alcance.

## More Information

- Estado, transiciones y contrato de ventana: `docs/reference/presentacion-y-ventana.md`.
- Validación de las capacidades que asume: `docs/how-to/investigar-ventanas-y-modo-pet.md`.

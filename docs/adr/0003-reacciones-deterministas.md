---
status: accepted
date: 2026-08-25
deciders: [propietario del proyecto]
---

# 0003. Las reacciones del personaje se deciden con reglas, no con un modelo

## Context and Problem Statement

El avatar debe reaccionar a la actividad de Claude Code: cambiar de expresión, de estado, animarse y a veces hablar. Alguien tiene que decidir *cuándo* y *con qué intensidad*, y hacerlo bien es lo que separa una compañera de un muñeco que parpadea al azar.

Además hay un problema de dosificación: Claude puede hacer quince lecturas de archivo seguidas, y quince reacciones seguidas son insoportables.

## Considered Options

- Motor de reglas deterministas.
- Un modelo de IA que decida las reacciones.

## Decision Outcome

Elegida: **motor de reglas deterministas**, porque el propietario del proyecto lo fijó explícitamente —«NO agregues otro modelo de IA para esto salvo que exista una razón técnica clara»— y porque un modelo para decidir reacciones está en el fuera de alcance aprobado (`flujo_projects/codetuver-avatar/02_entendimiento.md` §6).

La dosificación se resuelve dentro del motor, con **prioridades, cooldowns, agrupación y deduplicación**, no delegándola a un modelo.

El motor es una capa separada entre los eventos y todo lo que se ve, y funciona igual en los tres modos de presentación; el modo solo determina cómo se muestra cada reacción.

### Consequences

- Positiva: el comportamiento del personaje es auditable y reproducible. Una reacción molesta se corrige cambiando una regla, no reentrenando ni reajustando un prompt.
- Positiva: no añade latencia, ni coste, ni una segunda dependencia de IA a una aplicación cuyo principio rector es que **Claude Code es el único agente** (ver [ADR-0002](0002-stack-tauri-rust-vue.md) y `docs/constitution.md`).
- Positiva: funciona sin conexión y sin credenciales adicionales.
- Negativa: el catálogo de reacciones y su mapeo a eventos se mantiene a mano, y es grande —cinco ejes, más de cien entradas en `docs/reference/avatar-reacciones-voz.md`—.
- Negativa: la naturalidad tiene techo. Las reacciones serán correctas antes que sorprendentes.
- Neutral: la puerta queda abierta. La condición del propietario fue «salvo que exista una razón técnica clara», así que un ADR posterior puede revertir esto si aparece.

## More Information

- Catálogo y contrato de reacción: `docs/reference/avatar-reacciones-voz.md`.
- Fuera de alcance que lo respalda: `flujo_projects/codetuver-avatar/02_entendimiento.md` §6.

---
status: accepted
date: 2026-08-26
deciders: [propietario del proyecto]
---

# 0005. Ningún criterio de aceptación se verifica exigiendo hardware al verificador

## Context and Problem Statement

Al planear EPIC-001 apareció que **AC-002.3** exige "el comportamiento observado con dos monitores, con escalado distinto de 100 %". El equipo de trabajo tiene una sola pantalla, de modo que el criterio era, en la práctica, inverificable.

El problema de fondo no es esa pantalla concreta. Es que el criterio confunde dos cosas distintas: **el requisito real** —que la aplicación se comporte bien cuando cambia la configuración de pantalla— y **el vehículo de verificación** —que quien verifica posea dos monitores—. Escrito así, condiciona comprobar un requisito del producto a la dotación material de quien lo comprueba.

Se buscó el origen de la exigencia y no está en el negocio: "dos monitores" no aparece en `flujo_projects/codetuver-avatar/02_entendimiento.md` ni en `docs/constitution.md`. Lo único que el negocio pide sobre monitores es que la configuración persista **cuál** monitor (`02_entendimiento.md` §5), que exige enumeración de monitores en el producto, no dos pantallas en el escritorio. La exigencia entró por la redacción del criterio.

## Considered Options

- Exigir una segunda pantalla física para poder verificar.
- Instalar un driver de monitor virtual (`usbmmidd`, `IddSampleDriver`) como sustituto.
- Declarar el criterio "no verificado" y acogerse a la alternativa documentada de AC-002.4.
- Separar el requisito del vehículo: observación real de lo que la máquina disponible sí puede provocar, más prueba automatizada de la lógica determinista.

## Decision Outcome

Elegida: **separar el requisito del vehículo de verificación**, porque el propietario del proyecto lo fijó explícitamente al revisar el plan —«en ningún momento se discutieron 2 monitores físicos para esto, eso rompe con accesibilidad»— y porque la regla de asignación de `flujo_projects/codetuver-avatar/04_pruebas/estrategia.md` §0 ya lo ordenaba: *"un criterio que puede automatizarse no se convierte en caso manual"*. La matemática de multi-monitor —coordenadas negativas, densidades distintas, área de trabajo excluyendo la barra de tareas— es lógica determinista, y por tanto pertenece a una prueba automatizada, no a una inspección visual.

La regla que queda, de aquí en adelante y para todo el proyecto: **un criterio de aceptación describe el comportamiento del producto, no la dotación de quien lo verifica.** Donde un criterio dependa de hardware, se rastrea si esa dependencia viene del negocio; si no viene, se reescribe.

Se descartó el driver de monitor virtual porque instalar un driver sin firmar es una barrera equivalente a la que se está quitando; queda disponible como escalación **opcional**, no como requisito. Se descartó declararlo "no verificado" porque cumpliría la letra de AC-002.4 sin haber intentado nada, dejando intacto el riesgo 2 de `02_entendimiento.md`.

### Consequences

- Positiva: AC-002.3 pasa a ser verificable en cualquier equipo Windows 11, con una pantalla o con seis.
- Positiva: la parte determinista queda cubierta por una prueba que corre en cada cambio, en vez de por una inspección visual que solo ocurre cuando alguien se acuerda.
- Positiva: el escalado distinto de 100 %, el cambio de resolución y el evento de cambio de pantalla **sí se observan de verdad** — no se pierde observación real, se pierde la exigencia de hardware.
- Negativa: el comportamiento físico de arrastrar la ventana entre dos pantallas de densidad distinta queda sin observar. Se declara como tal con su alternativa documentada bajo AC-002.4, y se remite a **FEAT-029 / US-029**, que es donde el proyecto ya tiene la comprobación en condiciones reales de escritorio.
- Negativa: obliga a corregir `03_requerimientos.md`, lo que reabre el gate de Definition of Ready.
- Neutral: **AC-029.1** (FEAT-029, EPIC-006) arrastra la misma redacción. No se corrige aquí —pertenece a otro Epic— pero esta decisión lo alcanza cuando se planee.

## More Information

- Decisión y vehículos de verificación: `specs/investigacion-previa/design.md` §2, decisión D2.
- Criterio reformulado y su justificación: `specs/investigacion-previa/spec.md` §"Correccion de AC-002.3".
- Aplicación: `specs/investigacion-previa/plan.md`, Hito 2, pasos 2.5 y 2.7. La corrección de `03_requerimientos.md` viaja por `/workflow-update-docs`, tal como prescribe `docs/how-to/investigar-ventanas-y-modo-pet.md` §5.
- Contrato de monitores contra el que se prueba: `docs/reference/presentacion-y-ventana.md` (`MonitorInfo`, `getMonitors`, `getCurrentMonitor`).

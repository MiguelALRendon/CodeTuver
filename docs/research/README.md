---
id: research-index
title: Investigación previa (EPIC-001)
type: reference
status: current
source: user
last_verified: 2026-08-26
symbols: []
related: [ref-entregables-investigacion, exp-por-que-este-orden]
---

# Investigación previa — EPIC-001

Aquí viven los informes de la fase de investigación. **Ninguna decisión de arquitectura grande se cierra sin su entrada correspondiente en esta carpeta.**

Las rutas de esta carpeta las fijó el propietario del proyecto en el prompt maestro y se respetan tal cual. El resto de `docs/` sigue Diataxis; esta carpeta es la excepción deliberada.

| Informe | Cubre | Cómo se produce | Estado |
|---|---|---|---|
| [`claude-code-vtuber-integration.md`](claude-code-vtuber-integration.md) | FEAT-001 | [how-to](../how-to/investigar-integracion-claude-code.md) | **Cerrado** (Hito 1, 2026-08-27) |
| [`desktop-window-management.md`](desktop-window-management.md) | FEAT-002 | [how-to](../how-to/investigar-ventanas-y-modo-pet.md) | **Cerrado** (Hito 2, 2026-08-27; click-through/foco interactivo no verificado, ver informe §10) |
| [`avatar-and-tts.md`](avatar-and-tts.md) | FEAT-003, FEAT-004 | [avatar](../how-to/evaluar-avatar-y-licencia.md) · [voz](../how-to/evaluar-motor-de-voz.md) | **Cerrado** (Hitos 3 y 4, 2026-08-27) |
| [`experimental-results.md`](experimental-results.md) | Pruebas de las cuatro líneas | Ambos how-to de investigación | **Cerrado** (Hitos 1 y 2, 2026-08-27) |
| [`fixtures/`](fixtures/) | Ejemplos reales anonimizados | — | 10 fixtures del Hito 1 |

**Qué debe contener cada informe y cómo se etiqueta cada hallazgo:** [Entregables de la investigación previa](../reference/entregables-investigacion.md).

Al cerrar la fase se presenta un resumen ejecutivo y **se espera confirmación** antes de cambios arquitectónicos grandes.

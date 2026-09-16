# QA/OPmejora — criterio de esta carpeta

Una propuesta de mejora es un hallazgo real en el **código** (no en documentación, no inventado) que no se confirmó ejecutando la app en vivo — o que, aun ejecutado, no es un defecto funcional sino una inconsistencia de patrón, una validación ausente, o un control incompleto. No es un bug (eso va en `QA/bugs/`, y exige evidencia de ejecución real). Es una observación con archivo:línea real detrás, entregada para que alguien decida si vale la pena atenderla.

Plantilla por archivo:

```markdown
# <título corto de la propuesta>

**Área/flujo relacionado:** <sección de QA/to-prove.md o componente>
**Qué se observó en el código (sin ejecución en vivo):** <hallazgo con archivo:línea>
**Por qué podría importar:** <riesgo concreto o escenario que lo dispara>
**Mejora propuesta:** <qué cambiaría, en una o dos líneas — no es una implementación>
**¿Bloquea alguna prueba de `to-prove.md`?:** sí/no
**Estado:** propuesta sin verificar en vivo
```

Las 6 propuestas de esta carpeta salieron de la verificación de `QA/to-prove.md` contra el código real de `App.vue`, `AdminSettingsPanel.vue`, `CharacterEditor.vue`, `AnimationTimelineEditor.vue` y `DebugPanel.vue` (2026-09-12) — ninguna se ejecutó en vivo todavía.

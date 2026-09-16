# `clearFailureLog()` sin botón en el panel de depuración

**Área/flujo relacionado:** QA/to-prove.md §1.13 (Panel de depuración, FEAT-027)
**Qué se observó en el código (sin ejecución en vivo):** `clearFailureLog()` está definido y usado en `src/failure-taxonomy.ts` (y referenciado en `src/failure-taxonomy.spec.ts` y `src/presentation-manager.spec.ts`), pero un grep completo de `DebugPanel.vue` (544 líneas, leído entero) no tiene ningún `@click` que lo invoque. Los 12 botones reales del panel cubren 7 inyectores de falla, 4 de simulación de monitores y 1 de diagnóstico — ninguno limpia el log.
**Por qué podría importar:** el registro de fallas (`listFailures`) se muestra como una lista sin límite visible de tamaño (`v-for` sobre `failures`). En una sesión de pruebas larga que dispare los inyectores repetidamente (como el caso 17 de `to-prove.md`), esa lista solo crece — no hay forma de resetearla desde la UI sin recargar toda la app (lo que además destruye el estado de la sesión activa).
**Mejora propuesta:** agregar un botón "Limpiar registro" en la sección "Diagnóstico" de `DebugPanel.vue` que invoque `clearFailureLog()`.
**¿Bloquea alguna prueba de `to-prove.md`?:** no bloquea, pero hace más costoso ejecutar el caso 17 (hay que recargar la app para "limpiar" el log entre rondas de prueba).
**Estado:** propuesta sin verificar en vivo.

**Corregido:** `DebugPanel.vue` agrega el botón "Limpiar registro de fallas" (deshabilitado si ya está vacío) junto al contador, invoca `clearFailureLog()` — `failureLog` ya es `reactive()` (Vue), así que el contador y la lista se actualizan solos sin mecanismo adicional. Ver `specs/correcciones-qa-gauntlet/plan.md` Hito 13.

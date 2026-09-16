# `CustomSelect` no soporta `Home`/`End`, a diferencia de los tablists

**Área/flujo relacionado:** QA/to-prove.md §1.20 (arquitectura de teclado) — cualquiera de los 12 usos reales de `CustomSelect`.
**Qué se observó (verificado en vivo, no solo código):** Con el selector de "Nivel de esfuerzo" abierto y resaltando "medium", presionar `Home` no hizo nada — el resaltado se quedó en "medium" en vez de saltar a la primera opción ("low"). Confirmado también en el código: `CustomSelect.vue::onTriggerKeydown` solo maneja `ArrowDown`/`ArrowUp`/`Enter`/`Escape`, sin ningún caso para `Home`/`End` — a diferencia de `tab-navigation.ts::isTabArrowKey`, que sí los incluye para los 6 tablists de la app.
**Por qué podría importar:** inconsistencia menor de teclado entre dos patrones de navegación de la misma app — un usuario que aprendió que `Home`/`End` funcionan en las pestañas puede esperar lo mismo en cualquier desplegable, sin éxito. Severidad baja (no bloquea nada, `ArrowUp`/`ArrowDown` siguen funcionando).
**Mejora propuesta:** agregar `Home`/`End` a `onTriggerKeydown` (saltar al primer/último elemento de `options`), mismo patrón ya usado en `nextTabId`.
**¿Bloquea alguna prueba de `to-prove.md`?:** no.
**Estado:** confirmado en vivo, severidad baja — propuesta de mejora, no bug.

**Corregido:** `CustomSelect.vue::onTriggerKeydown` agrega `Home`/`End` (salta a `props.options[0]`/`props.options[length-1]`, mismo criterio `Math.min/Math.max` sin envolver que ya usan las flechas). Ver `specs/correcciones-qa-gauntlet/plan.md` Hito 4.

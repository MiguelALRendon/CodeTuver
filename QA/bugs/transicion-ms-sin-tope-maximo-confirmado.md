# "Transición (ms)" del Editor de personaje acepta y guarda valores absurdos sin tope

**Caso general que se estaba revisando:** Fase 3 (entradas límite) sobre el Editor de personaje, siguiendo la propuesta `QA/OPmejora/campos-numericos-sin-tope-maximo.md`.
**Prueba específica armada:** Contra la app real, en la pestaña "Editor de personaje" con sesión activa:
1. Escribir `999999999` en el campo "Transición (ms)" (disparando el evento `change` real).
2. Escribir `-500` en el campo "Margen X (px)" al mismo tiempo (mismo mecanismo).
3. Click en el botón "Guardar" real.
**Qué tronó:** "Transición (ms)" guardó **`999999999`** tal cual, sin ningún clamp, y el guardado se reportó exitoso ("Cambios guardados."). **Margen X sí clampeó correctamente a `0`** — el `min="0"` (o un clamp interno en `setMarginX`) funciona de verdad, así que esa mitad de la preocupación original queda descartada por esta ejecución.
**Cómo tronó:** El campo "Transición (ms)" tiene `min="0" step="50"` en el HTML pero **ningún `max`**, y a diferencia de `setMarginX` (que sí clampa), `setTransitionDuration` deja pasar el valor sin acotarlo por arriba.
**Resultado obtenido:** `transValueAfter: "999999999"`, `statusMsg: "Cambios guardados."` — confirmado por lectura directa del input y del mensaje de estado tras el guardado real.
**Evidencia:** Ejecución en vivo vía CDP contra la ventana Tauri real.
**¿Bloquea el Hito de QA en curso?:** No. **Brecha declarada, no verificada aún en esta pasada**: no se confirmó el efecto visual real (¿el avatar queda "congelado" a mitad de transición durante ~11.5 días si `transitionDurationMs` se usa literalmente como duración de crossfade? ¿o hay algún tope aplicado más abajo, en `VrmAvatar.vue`, al consumir el valor?) — pendiente de una prueba de seguimiento que dispare una transición real de estado con este valor guardado y observe el resultado en el avatar.

**Corregido:** `character-editor.ts` gana `clampTransitionDuration(durationMs)` (rango 0-10000ms), usada por `setTransitionDuration` (`CharacterEditor.vue`) antes de aplicar el cambio; `max` agregado al input HTML como refuerzo visual. Ver `specs/correcciones-qa-gauntlet/plan.md` Hito 5.

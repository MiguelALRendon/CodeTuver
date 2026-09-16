# Búsqueda de plugins sin debounce visible

**Área/flujo relacionado:** QA/to-prove.md §1.8 (Panel de administración — pestaña "Instalar", FEAT-032)
**Qué se observó en el código (sin ejecución en vivo):** `AdminSettingsPanel.vue:549-554` — `<input v-model="pluginSearch" type="search">` sin ningún `@input` propio ni referencia a un temporizador/debounce en el template. El filtrado real (`filteredAvailablePlugins`) vive en el script, no visible en este grep de template.
**Por qué podría importar:** si el filtro es puramente local (sobre una lista ya cargada en memoria), no hay problema. Pero si `pluginSearch` dispara una llamada real a `claude plugin list`/búsqueda contra un marketplace por cada tecla, escribir rápido generaría N llamadas reales innecesarias — no confirmado sin leer el script completo (921 líneas, no leído entero en esta pasada) ni ejecutar en vivo.
**Mejora propuesta:** si el filtro ya es local, no se necesita nada — dejar constancia de que se confirmó. Si dispara una llamada real por tecla, agregar debounce.
**¿Bloquea alguna prueba de `to-prove.md`?:** no, es la validación pendiente que ya lista §1.19 (fila "Búsqueda de plugins").
**Estado:** **Resuelto en vivo (2026-09-12), sin bug.** Se interceptó `window.__TAURI_INTERNALS__.invoke` y se escribieron 5 teclas reales en el campo de búsqueda contra la app real — `invokeCount: 0` durante toda la escritura. El filtro es 100% local sobre datos ya cargados en memoria, no dispara ninguna llamada real por tecla. No hace falta debounce. Cerrado.

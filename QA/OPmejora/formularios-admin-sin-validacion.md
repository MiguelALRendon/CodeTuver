# "Agregar marketplace" y "Agregar MCP" sin validación visible antes de enviar

**Área/flujo relacionado:** QA/to-prove.md §1.8 (Panel de administración, FEAT-032)
**Qué se observó en el código (sin ejecución en vivo):** en `AdminSettingsPanel.vue`, el formulario "Agregar marketplace" (líneas ~592-607, un `<input type="text">` + botón `submitAddMarketplace`) y el formulario "Agregar MCP" (líneas ~678-699, 2 `<input type="text">` "Nombre"/"Comando" + botón `submitAddMcp`) no tienen ningún atributo de validación (`required`, `pattern`) ni mensaje de error en el template, a diferencia de "Límite de gasto" en `SessionStartOptionsPanel.vue`, que sí valida con `validateStartOptionsDraft` y muestra `role="alert"`.
**Por qué podría importar:** sin ejecución no se sabe si `submitAddMarketplace`/`submitAddMcp` (funciones de script, no vistas en este grep) validan antes de invocar el comando Tauri real, o si dependen por completo de que el backend/CLI de Claude Code rechace un valor vacío o un nombre de servidor MCP duplicado. Si no validan, un envío vacío o duplicado llega tal cual al proceso real.
**Mejora propuesta:** agregar validación de campo no vacío (y, para MCP, de nombre no duplicado contra `mcpServers` ya listados) antes de habilitar el botón, con el mismo patrón de mensaje de error que ya existe en `SessionStartOptionsPanel.vue`.
**¿Bloquea alguna prueba de `to-prove.md`?:** no, es exactamente lo que hay que ejecutar (§1.19, fila "Agregar marketplace"/"Agregar MCP") para confirmar si el gap es real o si el script lo maneja.
**Estado:** propuesta sin verificar en vivo.

**Corregido:** `AdminSettingsPanel.vue` agrega `marketplaceFormError`/`mcpFormError` (mensaje visible `role="alert"`, mismo patrón que `SessionStartOptionsPanel.vue`) cuando el envío corta por campo vacío; `submitAddMcp` valida el nombre contra `mcpServers` ya cargado antes de invocar el comando real. Ver `specs/correcciones-qa-gauntlet/plan.md` Hito 13.

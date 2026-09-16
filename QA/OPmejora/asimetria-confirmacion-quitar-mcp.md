# Asimetría de confirmación: desinstalar plugin vs. quitar servidor MCP

**Área/flujo relacionado:** QA/to-prove.md §1.8 (Panel de administración — plugins y MCP, FEAT-032)
**Qué se observó en el código (sin ejecución en vivo):** en `AdminSettingsPanel.vue`, "Desinstalar" un plugin (línea ~493) tiene un patrón de confirmación de 2 pasos real: el botón se reemplaza in-place por `"¿Desinstalar <id>?"` + botones "Sí, desinstalar" (clase `--danger`, se deshabilita mientras corre) / "Cancelar" (líneas ~497-521). "Quitar" un servidor MCP (`removeMcp`, línea ~670) es un botón de un solo clic, sin ningún paso de confirmación intermedio ni clase `--danger`.
**Por qué podría importar:** ambas acciones son igual de destructivas (quitan configuración real de `~/.claude` del usuario) pero tienen protección UX distinta. Un clic accidental en la fila equivocada de una lista de varios servidores MCP reales los elimina sin poder deshacer desde la UI — mismo riesgo que ya se decidió mitigar para plugins.
**Mejora propuesta:** aplicar el mismo patrón de confirmación de 2 pasos (o al menos `window.confirm()`/diálogo propio) a "Quitar" servidor MCP.
**¿Bloquea alguna prueba de `to-prove.md`?:** no, pero es la base del caso creativo 16 (romper por accidente en vez de a propósito).
**Estado:** propuesta sin verificar en vivo.

**Corregido:** `AdminSettingsPanel.vue` replica el mismo patrón in-place de 2 pasos ya usado por "Desinstalar" plugin (`pendingRemoveMcpName`/`removingMcpName`/`requestRemoveMcp`/`confirmRemoveMcp`/`cancelRemoveMcp`) — "¿Quitar `<nombre>`?" + "Sí, quitar"/"Cancelar". Ver `specs/correcciones-qa-gauntlet/plan.md` Hito 13.

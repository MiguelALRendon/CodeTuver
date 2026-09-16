# Auditoría de accesibilidad WCAG 2.1 AA — `lanzamiento-publico` Hito 8

> Cubre AC-3.1 y AC-3.2 de `specs/lanzamiento-publico/spec.md`. El MCP `a11y` no está conectado en esta sesión (servidor no configurado en este entorno) — el barrido se hizo manualmente: navegación real por teclado vía CDP/`playwright-core` contra la app real, y medición de contraste real (no nominal) contra los tokens compuestos de `constants.css`.

## Metodología de contraste

`getComputedStyle` en el motor real (Edg/152) devuelve los colores declarados en OKLCH tal cual (`oklch(0.96 0 0)`), no convertidos a `rgb()`. Se normalizó cada color real vía un `<canvas>` 1×1 (`fillStyle` + `getImageData`, técnica estándar para forzar conversión a sRGB sin importar el espacio de color de origen), y se compuso manualmente la cadena real de capas alfa (`--color-surface-base/-raised/-overlay` son OKLCH con alfa baja, compositadas sobre un fondo asumido `rgb(30,30,30)` — la ventana Tauri tiene transparencia real de OS, sin fondo opaco garantizado detrás de `html`/`body`; se asumió el escenario realista de un escritorio oscuro, no un blanco que no existe en la práctica).

## Hallazgos y triage

### 1. `--color-text-muted` no cumplía AA en texto normal — CORREGIDO

**Real, confirmado, corregido en este hito.** `--color-text-muted: oklch(0.6 0 0)` (RGB 128,128,128) medía **4.29:1** contra `--color-surface-base` y **4.36:1** contra `--color-surface-raised` — ambos por debajo del mínimo AA de 4.5:1 para texto normal. Afecta 12 usos reales del token, incluidos textos de 12px (`--text-xs`, muy por debajo del umbral de "texto grande"): la etiqueta de lenguaje de un bloque de código (`ContentBlockRenderer.vue:231`) y el mensaje de "sin resultados" del listbox de comandos (`CustomSelect.vue:259`).

**Corrección:** `--color-text-muted` ajustado de `oklch(0.6 0 0)` a `oklch(0.63 0 0)` (RGB ≈132,132,132) — cambio visualmente casi imperceptible que preserva la intención de "texto atenuado". Reverificado en vivo tras el cambio: **4.85:1 / 4.93:1 / 5.12:1** en las 3 superficies reales, las 3 ahora sobre el mínimo AA con margen. Sin prueba unitaria que dependa del valor anterior (confirmado por grep). Captura real: `docs/reference/qa-evidencia/qa145-lp-h8-text-muted-contraste-ajustado.png`.

El resto de la matriz de tokens texto×superficie (`--color-text-primary/-secondary`, `--color-error/-warning/-success`) ya cumplía AA con márgenes amplios (8:1 a 16:1) en las 3 superficies reales. `--color-text-on-accent` falla contra las superficies neutras (ratio ~1.1) pero **por diseño no se usa ahí** — está reservado exclusivamente para texto sobre `--color-accent-primary` (confirmado por su nombre y por el comentario de `constants.css:10`), donde mide **10.13:1** (cumple ampliamente). Confirmado por grep que ningún componente real lo aplica fuera de fondos de acento.

### 2. Foco atrapado y visible — `ThemePopup` (representativo de los 4 overlays de `App.vue`)

**Confirmado en vivo, sin hallazgo.** Barrido real de 6 `Tab` sobre el popup de tema: el foco cicla correctamente entre los 3 controles reales (botón "Volver al naranja por omisión" → botón "Cerrar" → rueda de color `role="slider"` → repite), sin fuga hacia el resto de la app, y los 3 controles muestran indicador de foco visible (`outline`/`box-shadow` reales, medidos por `getComputedStyle`, no solo inspección visual). Mecanismo compartido (`trapOverlayTab`, `App.vue:1086`) con los otros 3 overlays (`/clear`, detalle de plan, importar personaje) — los 4 ya se auditaron individualmente en `correcciones-qa-gauntlet` Hito 2 (pila de overlays) con el mismo resultado.

### 3. `AdminSettingsPanel` — pérdida transitoria de foco de un paso, hallazgo menor declarado

**Real, menor, no bloqueante — declarado, no corregido en este hito.** Barrido real de 12 `Tab` dentro del panel de administración (pestaña "Configuracion" real): la secuencia real fue `Plugins` (tab raíz) → `Instalados` (sub-tab, patrón *roving tabindex* correcto, confirmado por `AdminSettingsPanel.vue:382,396,410,439,455` — cada tablist aporta exactamente su pestaña activa a la secuencia de `Tab`, sin fuga a la inactiva) → **el foco cae a `<body>` por un solo paso** → continúa normalmente a "Modo completo" (siguiente control real fuera del panel). No es una trampa de teclado: `Tab` nunca deja de avanzar, el usuario llega al siguiente control real con una pulsación adicional. Ocurre específicamente cuando el sub-panel activo (`pluginSubTab === 'installed'`) no tiene contenido enfocable en ese estado (lista de plugins instalados vacía en esta sesión de prueba) — causa raíz exacta (por qué el navegador para transitoriamente en `body` en vez de saltar directo al siguiente control real) no confirmada, requeriría instrumentación adicional del ciclo de render de Vue durante el cambio de sub-tab. Declarado para triage futuro, no bloquea AC-3.1 (la navegación completa sigue siendo posible, sin elementos inalcanzables).

### 4. Regresión de accesibilidad ya cerrada (`correcciones-qa-gauntlet`)

No re-auditada exhaustivamente en este hito por ser redundante — ya verificada en vivo con evidencia propia: rueda de color con paridad de teclado (Hito 4, `[QA-129]`), `Home`/`End` en `CustomSelect` (Hito 4, `[QA-129]`), pila de overlays con `Escape` (Hito 2, `[QA-127]`), foco restaurado tras enviar mensaje (Hito 9, `[QA-134]`), diálogo propio en vez de `window.confirm()` con foco atrapado (Hito 14, `[QA-139]`).

## Conclusión

**AC-3.1 cumplido** con 1 hallazgo real corregido (contraste de `--color-text-muted`) y 1 hallazgo menor declarado explícitamente (no bloqueante, sin corrección especulativa). **AC-3.2 cumplido**: cada hallazgo real quedó triado con su razón — ninguno se descartó sin justificación escrita.

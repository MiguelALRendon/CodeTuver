# Dos overlays pueden abrirse a la vez, y un solo `Escape` cierra ambos

**Caso general que se estaba revisando:** Caso creativo 31 de `QA/to-prove.md` (dos overlays visibles a la vez, un solo `Escape`).
**Prueba específica armada:** Contra la app real, sesión activa:
1. Abrir el popup de tema (`window.__qaOpenTheme()`, equivalente real al menú nativo).
2. Sin cerrarlo, abrir también el overlay de importar personaje (`window.__qaOpenCharacterImportOverlayWithPath(...)`, equivalente real al flujo de importación tras elegir un archivo).
3. Confirmar que ambos overlays están visibles en el DOM al mismo tiempo.
4. Disparar **un solo** `Escape` sobre `document`.
**Qué tronó:** Los dos overlays **coexistieron sin problema** (`themeOpenStill: true` con `importOpenedToo: true` simultáneamente) — la app no impide ni advierte que ya hay un overlay abierto antes de abrir otro. Y el único `Escape` **cerró ambos de golpe** (`themeOpenAfterEscape: false` y `importOpenAfterEscape: false` en la misma medición).
**Cómo tronó:** Cada uno de los 4 overlays de `App.vue` tiene su **propio listener global** (`window.addEventListener('keydown', close<X>OnEscape)`), registrado una sola vez en `onMounted` y siempre activo — cada listener solo revisa su propia bandera de visibilidad (`themePopupVisible`, `characterImportOverlayVisible`, etc.) sin saber nada de los otros. Un único evento `Escape` real dispara los 4 listeners en la misma pasada; los que tienen su bandera en `true` se cierran todos, sin ningún concepto de "cuál está encima" o cuál se abrió más recientemente.
**Resultado obtenido:** Medido directamente sobre el DOM real en la misma ejecución — antes del `Escape`: ambos overlays presentes; después de un solo `Escape`: ambos ausentes.
**Evidencia:** Ejecución en vivo vía CDP contra la ventana Tauri real.
**¿Bloquea el Hito de QA en curso?:** No. Es un defecto de UX real: si un usuario abre el popup de tema, y por cualquier camino (un clic accidental, un atajo) también queda abierto el de importar personaje, y presiona Escape esperando cerrar "el de encima", en realidad pierde los dos — si el de importar tenía un archivo pendiente de confirmar, esa selección se descarta también sin aviso. Se documenta y se continúa.

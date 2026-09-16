---
id: ref-guia-visual
title: Guía visual — tokens y contrato de diseño
type: reference
status: current
source: both
last_verified: 2026-09-11
symbols: []
related: [exp-guia-visual, ref-presentacion-y-ventana, ref-bloques-contenido, ref-avatar-reacciones-voz]
---

# Guía visual — tokens y contrato de diseño

Entregable de FEAT-005, Hito 5 de `specs/investigacion-previa/plan.md`. Cubre AC-005.1 a AC-005.4. Contrato **vinculante**: todo valor de identidad visual sale de `src/assets/styles/constants.css`, nunca quemado — lo aplica `theme-check` (`blocking: hard`).

La intención de dirección está en [`explanation/guia-visual.md`](../explanation/guia-visual.md) y no se repite aquí; este documento es el contrato concreto que de ahí se deriva.

## Fundamentos

### Paleta

**Actualizado (H1 de `revision-ux-sesion-real-3`, 2026-09-06):** base neutra (croma 0 en OKLCH) con un único primario configurable — naranja terracota de Claude por omisión. El violeta/cian de la version anterior quedaba expuesto en cuanto Mica perdía el blur; ver `specs/revision-ux-sesion-real-3/design.md` D1 para la justificación completa. Todos los neutros en OKLCH; el primario se guarda como canales RGB (`--color-primary-rgb`) para que la alfa de 0.75 de las burbujas de chat quede fija por estructura, no por convención.

| Token | Valor | Uso |
|---|---|---|
| `--color-primary-rgb` | `217 119 87` | Canales RGB editables del primario (terracota de Claude, `#D97757`); editable en vivo desde `Window > Theme` (H2 de `revision-ux-sesion-real-3`, `ThemePopup.vue`), persistido en `AppSettings.primaryColorRgb` |
| `--color-accent-primary` | `rgb(var(--color-primary-rgb))` | Acento de marca, derivado — opaco |
| `--color-chat-bubble` | `rgb(var(--color-primary-rgb) / 0.75)` | Fondo de la burbuja de chat de la persona — alfa 0.75 fija, sin control de UI |
| `--color-surface-base` | `oklch(0.1 0 0 / 0.05)` | Fondo principal de la aplicación, sobre Mica (Hito 18 de `revision-ux-modos-presentacion`) |
| `--color-surface-raised` | `oklch(0.14 0 0 / 0.17)` | Tarjetas, paneles elevados |
| `--color-surface-overlay` | `oklch(0.12 0 0 / 0.3)` | Overlays, modales, paneles sobre ventana transparente |
| `--blur-panel` | `32px` (Hito 14 de `revision-ux-sesion-real-5`, D15 — subido desde `24px` para que las superficies de listado no se sientan "perdidas" contra el fondo) | `backdrop-filter` de las superficies normales (paneles, tarjetas, overlays) |
| `--blur-chat` | `36px` | `backdrop-filter` del panel de chat — mayor que `--blur-panel` a propósito, para diferenciarlo visualmente del `.avatar-panel` (pedido explícito del usuario) |
| `--color-text-on-accent` | `oklch(0.16 0 0)` | Texto oscuro **opaco** sobre fondos de acento sólidos (botones, badges) — medido en vivo, 6.23:1 sobre `--color-accent-primary`. **No usar sobre `--color-chat-bubble`** (translúcida): ahí va `--color-text-primary` (4.62:1), el texto oscuro cae a 3.76:1 y no cumple AA |
| `--color-text-primary` | `oklch(0.96 0 0)` | Texto principal; también el texto sobre `--color-chat-bubble` |
| `--color-text-secondary` | `oklch(0.78 0 0)` | Texto secundario, metadatos |
| `--color-text-muted` | `oklch(0.6 0 0)` | Texto deshabilitado/terciario |
| `--color-accent-secondary` | `oklch(0.8 0 0)` | Acento secundario, ahora neutro (era cian con croma) |
| `--color-success` | `oklch(0.75 0.17 155)` | Estados de éxito |
| `--color-error` | `oklch(0.65 0.22 25)` | Estados de error |
| `--color-warning` | `oklch(0.8 0.18 80)` | Advertencias |
| `--color-border-subtle` / `--color-border-strong` | `oklch(0.85 0 0 / 0.16 y 0.35)` | Bordes de baja/alta énfasis |
| `--color-overlay-scrim` | `oklch(0.1 0 0 / 0.6)` | Fondo oscurecido detrás de modales |

**Deliberado:** `--color-success`/`--color-error`/`--color-warning` son los únicos tokens con croma distinto de 0 fuera del primario — un permiso o un error nunca se confunde visualmente con el acento de marca (regla "un permiso que se lee mal es un permiso que se concede mal").

**`accent-color` global:** `:root` fija `accent-color: var(--color-accent-primary)` — sin esto, los controles nativos (`input[type=range]`, checkboxes) se pintan con el azul por omisión del navegador/WebView2, invisible a un grep de `oklch` porque no es un valor de `constants.css` sino el default del user-agent. Hallazgo real de H1, confirmado en vivo.

### Tipografías

- `--font-display`: **Rajdhani** — encabezados, etiquetas HUD, títulos de tarjeta. Geométrica, técnica, encaja con la dirección "consola holográfica" sin caer en las fuentes sobreusadas por interfaces genéricas de IA (Inter, Roboto, Geist, etc. — deliberadamente evitadas).
- `--font-sans`: **Sora** — cuerpo de texto, chat, UI general. Legible, moderna, distintiva.
- `--font-mono`: **JetBrains Mono** (con `Cascadia Code` como alternativa) — código, diffs, consola, comandos. **No negociable**: es la fuente que sostiene la regla de legibilidad técnica.

**Nota de implementación (fuera del alcance de este Hito, para EPIC-003/005):** estas fuentes deben empaquetarse localmente (`@font-face` con archivo bundleado), no cargarse desde una CDN — el proyecto tiene requisitos de funcionar sin conexión en otras partes (TTS, sesión), y la tipografía no debería ser la excepción.

Escala: `--text-xs` (0.75rem) a `--text-2xl` (2rem), pesos `--font-weight-normal/medium/bold`, interlineado `--line-height-tight/normal`.

### Bordes, sombras, transparencias

`--radius-sm/md/lg` (0.25rem/0.5rem/1rem). `--border-width-thin/thick` (1px/2px). `--shadow-md` para elevación estándar; `--shadow-glow-accent` — un resplandor sutil en el acento primario, reservado para estados activos/de atención, **sin abusar** (la regla de "efectos moderados sobre mensajes importantes" aplica también aquí).

Transparencia: las tres superficies (`base`/`raised`/`overlay`) llevan alfa (Hito 18 de `revision-ux-modos-presentacion`, 2026-09-05) — antes solo `overlay` era translúcida. Cada selector que pinta uno de estos tokens como fondo trae también `backdrop-filter: blur(var(--blur-panel))` (o `--blur-chat` en `.chat-panel`), nunca alfa sin blur — texto legible sobre contenido en movimiento detrás (avatar 3D, Mica) exige ambos a la vez, no solo transparencia.

**Regla de `color`/`font-family` en todo panel/overlay (Hito 9 y Hito 16 de `revision-ux-sesion-real-5`, D8/D17):** ningún ancestro global (`html`/`body`/`#app`) fija `color`/`font-family` — cada superficie de panel/overlay debe declarar los suyos explícitamente en su propio contenedor, o el contenido cae al negro/serif por defecto del navegador. Riesgo más alto en contenido inyectado con `v-html` (sin estilo propio) y en modales con `Teleport to="body"` (escapan la herencia de `#app` por completo, ej. `EditorModal.vue`). Auditoría completa (H16): los 4 overlays de `App.vue` comparten `.commands-overlay__panel` (corregido en H9); `DebugPanel.vue` (`.debug-panel`) y `EditorModal.vue` (`.editor-modal__panel`) se corrigieron igual en H16. Único `v-html` fuera de esos overlays es `ContentBlockRenderer.vue`, que ya define `color` en `.content-blocks__item` — sin riesgo.

### Mica (Windows 11)

`src-tauri/tauri.conf.json` → `app.windows[0]`: `"transparent": true` + `"windowEffects": { "effects": ["micaDark"] }`, vía la API pública de `tauri` (`tauri-utils::WindowEffect`), sin declarar `window-vibrancy` como dependencia directa — ya es una dependencia transitiva de `tauri-runtime-wry` que implementa el efecto internamente. `transparent: true` es prerequisito real documentado por la propia API de Tauri (`Window::effects` "Requires the window to be transparent"), no opcional.

**Variantes probadas en vivo, con captura real por handle de ventana (no por region de pantalla):** `micaDark` vs `acrylic`. `DwmGetWindowAttribute(DWMWA_SYSTEMBACKDROP_TYPE)` confirmo que Mica si se activa a nivel de sistema (valor 2), pero en el area de **contenido** de una ventana maximizada el efecto es sutil por diseño de Windows — Mica tiñe el wallpaper de forma discreta; el realce marcado que se ve en la barra de titulo de apps como el Explorador de Windows lo aplica el propio SO solo ahi, no al area de cliente. `acrylic` si mostro una textura claramente visible (blur real del contenido detras), a costa del problema de rendimiento en resize/drag que la propia Tauri documenta para ese efecto. **Decision del usuario:** mantener `micaDark` (mas eficiente) y compensar la sutileza bajando la alfa de las tres superficies muy por debajo del valor inicial (`0.72/0.78/0.85` a `0.2/0.32/0.45`) y subiendo el blur (`16px/28px` a `24px/36px`) — confirmado visualmente con un mensaje de chat real que el texto sigue siendo legible en esos valores.

Solo Windows 11; en cualquier otra plataforma (`windowEffects` no soportado, o `WindowEffect::Mica` ignorado por el SO) la ventana queda genuinamente transparente sin material detrás — la app hoy solo se distribuye para Windows (WebView2 en todo el proyecto), así que este caso no tiene mitigación construida, riesgo aceptado por alcance.

### Animaciones

`--duration-fast` (150ms), `--duration-base` (250ms), `--duration-slow` (400ms), `--ease-standard`. **Bajo `prefers-reduced-motion: reduce`, las tres duraciones colapsan a `0ms`** — declarado y aplicado directamente en `constants.css` con un media query, no delegado a que cada componente lo implemente por su cuenta (AC-005.4).

### Jerarquía visual

`surface-base` < `surface-raised` < `surface-overlay` en elevación percibida (oscuro → progresivamente más presente), reforzada por `--shadow-md` en lo elevado. `--z-panel` (10) < `--z-overlay` (20) < `--z-toast` (30) — tokens de z-index en vez de números sueltos por componente (regla dura de `CLAUDE.md`: "no hardcodear... z-index").

## Componentes

- **Éxito/error:** `--color-success`/`--color-error` sobre `--color-surface-raised`, nunca sobre el acento de marca — evita ambigüedad visual en el momento más sensible (permisos, resultados de comandos).
- **Tarjetas:** `--color-surface-raised` + `--radius-md` + `--shadow-md` + `--color-border-subtle`.
- **Notificaciones:** `--color-surface-overlay` + `--z-toast`, con el color de estado (éxito/error/warning) como acento de borde, no de fondo completo — mantiene legibilidad del texto encima.
- **Solicitudes de permiso:** `--color-surface-raised` + `--color-border-strong` (mayor énfasis que una tarjeta normal — es la interacción más sensible del producto) + `--font-mono` para cualquier comando/ruta citado dentro de la solicitud.
- **Código y diffs:** `--font-mono` obligatorio; adiciones/eliminaciones de diff usan `--color-success`/`--color-error` en el borde izquierdo de la línea, no en todo el fondo (legibilidad del propio código no se sacrifica).
- **Consola:** `--color-surface-base` (se funde con el fondo, es la capa "más honesta" — texto crudo), `--font-mono`, `--text-sm`.
- **Mensajes largos:** colapsables con altura máxima + scroll propio; el punto de colapso no es un token de color, es comportamiento (fuera del alcance de tokens).
- **Listados/selección (`CustomSelect.vue`, H10-H11 de `revision-ux-sesion-real-4`):** patrón estándar para cualquier lista de opciones, reemplazando `<select>` nativo. `role="listbox"`/`role="option"` sobre `--color-surface-raised` + `--blur-panel` + `--color-border-strong`, opción activa en `--color-accent-primary`/`--color-text-on-accent`. Dos modos sobre el mismo markup: `inline` (lista siempre visible, navegación por teclado controlada por el consumidor — así se usa en el listado de comandos del chat) y modo trigger por omisión (botón `session-panel__button` que abre/cierra el panel, con su propia navegación por flechas/Enter/Escape — así se usa en el nivel de esfuerzo del chat, y desde H11 en los 9 selects migrados). El trigger admite `disabled`/`title`/`ariaLabel` como props (fallthrough directo al `<button>` interno, no al wrapper) para paridad con `<select disabled>`/`title`/`aria-label` nativos — necesario en `CharacterEditor.vue` donde la capacidad del personaje puede deshabilitar el control con una razón. Único componente de listado con este estilo aprobado; H11 cerró la migración de los 9 `<select>` nativos restantes del proyecto (`CharacterEditor.vue` ×5, `DebugPanel.vue` ×2, `PoseEditor.vue` ×1, `SessionStartOptionsPanel.vue` ×1, `VoiceControls.vue` ×1) — no queda ningún `<select>` nativo en el proyecto, sin excepciones. Selects cerca de un borde inferior con contenedor `overflow` propio (ej. `PoseEditor.vue`, dentro de `EditorModal.vue`) usan el mismo override `:deep(.commands-inline-list--floating) { top: auto; bottom: 100%; }` que ya validó el nivel de esfuerzo, para abrir hacia arriba y no cortarse. Donde antes había `<optgroup>` (animación/pose por estado en `CharacterEditor.vue`, agrupadas en "Fábrica"/"Guardado"), `CustomSelect` no soporta agrupación nativa — se preserva la distinción con un prefijo de texto en el label (`Fabrica: id` / `Guardado: nombre`) en vez de agregar soporte de grupos al componente.

## Adaptación

### Los tres modos

- **FULL:** todas las superficies visibles, jerarquía completa de `surface-base/raised/overlay`.
- **COMPANION:** paneles ocultos, el avatar centrado sobre `surface-base` con opacidad reducida del resto de la UI (no un token nuevo — es el mismo `surface-overlay` con mayor `--color-overlay-scrim` de fondo).
- **PET:** sin paneles; cuando aparece uno (ej. panel de controles del PoC), usa `--color-surface-overlay` porque la ventana detrás es transparente (confirmado en el Hito 2 — no se puede asumir fondo opaco).

### Señal de petición pendiente

**Corregido (H1, 2026-09-06):** esta linea describia `--color-accent-secondary` (cian) como el token de la señal; el codigo real (`PetView.vue:174-184`, `.pet-stage__indicator`) usa `background: var(--color-warning)` + `box-shadow: var(--shadow-glow-accent)` — `--color-accent-secondary` no interviene aqui, se usa en otros 4 componentes sin relacion con esta señal (bordes/badges de `AdminSettingsPanel.vue`, `AnimationTimelineEditor.vue`, `ContentBlockRenderer.vue`, `App.vue`). El diseño real: color de estado (`--color-warning`, semantico, con croma propio por AC-069) + el resplandor del acento (`--shadow-glow-accent`, ligado al primario) para que sea inequívoca incluso en modo mascota. Esto es lo que FEAT-026 consume.

### Estados sin foco

Cuando la ventana no puede recibir foco (`presentacion-y-ventana.md`), la UI reduce opacidad general (mismo mecanismo que COMPANION) — no hay un token de color distinto, es un estado de interacción, no de identidad.

### Barra de scroll (H3, `revision-ux-sesion-real-3`, 2026-09-06)

`src/assets/styles/scrollbar.css`, hoja global sin wrapper: `--size-scrollbar-track` (10px) reservado siempre, el pulgar (`--color-border-strong`) ocupa solo `--size-scrollbar-track` menos `2 × --size-scrollbar-thumb-inset` (3px) en reposo y crece al ancho completo al pasar el puntero. Cubre cualquier `overflow: auto`/`overflow-y: auto` existente o futuro por selector universal (`*::-webkit-scrollbar`) — no requiere tocar el componente que scrollea.

## Accesibilidad

### Contraste — medido, no declarado

Verificado con la fórmula WCAG de contraste relativo (conversión OKLCH → sRGB → luminancia relativa), no una MCP (ninguna estaba disponible en esta sesión) — cálculo real, reproducible, sobre los valores exactos de arriba:

| Par | Contraste real | Mínimo exigido | Resultado |
|---|---|---|---|
| `text-primary` sobre `surface-base` | 17.27:1 | 4.5:1 | ✅ |
| `text-primary` sobre `surface-raised` | 15.48:1 | 4.5:1 | ✅ |
| `text-secondary` sobre `surface-base` | 9.72:1 | 4.5:1 | ✅ |
| `accent-primary` sobre `surface-base` (texto grande/iconos) | 7.20:1 | 3.0:1 | ✅ |
| `accent-secondary` sobre `surface-base` | 11.37:1 | 3.0:1 | ✅ |
| `success` sobre `surface-base` (texto grande) | 9.32:1 | 3.0:1 | ✅ |
| `error` sobre `surface-base` (texto normal) | 5.43:1 | 4.5:1 | ✅ |
| `warning` sobre `surface-base` (texto normal) | 10.26:1 | 4.5:1 | ✅ |

Los 8 pares pasan con margen real, no ajustado al límite. **Nota (Hito 18, 2026-09-05):** esta tabla usa los valores de color de cada token en su canal RGB propio, ignorando su alfa. Tras bajar la alfa de las superficies a 0.2/0.32/0.45 (ver "Mica" arriba), el token propio ya NO domina tan claramente el compuesto final como con los valores altos originales (0.72-0.85) — un fondo real detrás muy claro podría, en el peor caso teórico, reducir el contraste efectivo por debajo del mínimo. Verificado en la práctica (captura real de la ventana con un mensaje de chat real, Hito 18): el texto se ve claramente legible con el `micaDark` real del sistema, porque ese material está diseñado para mantenerse oscuro incluso variando el fondo. El caso extremo (ventana no maximizada sobre un fondo de escritorio muy claro) no está verificado y queda como riesgo residual conocido, no medido — no bloqueante porque la ventana se abre maximizada por defecto (`tauri.conf.json`).

### Reducción de movimiento

Ver "Animaciones" arriba — `prefers-reduced-motion: reduce` colapsa las tres duraciones a `0ms` a nivel de token, aplica a toda animación que use esas variables sin que cada componente tenga que implementarlo.

### Modo oscuro y temas

**Solo tema oscuro en este Hito** — la dirección visual (consola holográfica, HUD de anime) es intrínsecamente oscura; un tema claro completo no está en el alcance de EPIC-001 ni se pidió en `02_entendimiento.md`. Se declara como **no implementado, no como olvidado**: si se pide en el futuro, la estructura de tokens (todo en variables CSS) ya lo permite sin rediseñar componentes.

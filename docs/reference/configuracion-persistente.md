---
id: ref-configuracion-persistente
title: Configuración persistente
type: reference
status: current
source: both
last_verified: 2026-09-08
symbols: [AppSettings, resolve_settings, applyPersistedSettings, setGlobalAppSettings, PetWindowPosition]
related: [ref-presentacion-y-ventana]
---

# Configuración persistente

> **Estado: implementado (Hito 2 de `robustez-distribucion`, 2026-08-28; correcciones de un `fresh-verifier` de cierre posterior, 2026-08-29)** para las 11 preferencias de AC-028.1. Mecanismo real: `src-tauri/src/app_settings.rs` (`AppSettings`, archivo JSON en `app_data_dir()`, sin dependencia nueva — mismo patrón que `session_preferences.rs` desde EPIC-002) para 7 de las 11; "tamaño de avatar" se satisface con el mecanismo ya existente de `character-editor-storage.ts` (EPIC-004 Hito 5), que persiste por personaje — más correcto que un factor de escala global único, porque distintos personajes pueden necesitar tamaños por defecto distintos; no es un campo de `AppSettings`. Las otras 3 (personaje elegido, ajustes de voz, comportamiento ante peticiones) ya persistían desde EPIC-004/EPIC-005 vía `localStorage`. Ambos mecanismos sobreviven al cierre/reapertura de la aplicación — es una inconsistencia de backend conocida y declarada, no un déficit funcional. `alwaysOnTop` se persiste y tiene efecto real: `presentation-manager.ts` lo aplica como override sobre el valor fijo de `MODE_PROFILES`, solo en modo mascota (PET), único modo donde "siempre encima" tiene sentido como preferencia de usuario. Ver `docs/ARCHITECTURE.md` fila FEAT-028 para el detalle completo, incluida la corrección real aplicada sobre AC-028.3 (el arranque degradado ahora informa a la persona, `usedDefaults`).
>
> **Lo que queda `proposed` dentro de este documento, sin implementar todavía:** opacidad se persiste pero no tiene efecto real (`DesktopWindowManager` no expone `setOpacity`, capacidad ausente hoy) — único hueco real que queda; no existe una pantalla de "Ajustes" dedicada — las preferencias se leen/aplican al arranque, pero cambiarlas hoy requiere código o el panel de depuración, no una UI de usuario final; "reacción al entorno" (cambio de monitor, bloqueo/desbloqueo) y todo lo de la sección "Proyectos y sesiones" de más abajo, más allá del alcance por proyecto ya cerrado (AUT-13).

## Regla que no se dobla

**La configuración persistida no incluye secretos, tokens ni credenciales.**

## Opciones configurables

### Apariencia del avatar y de la ventana

Esquina donde aparece la VTuber · tamaño del avatar (hasta 800px — subido de 400px, Hito 8 de `specs/revision-ux-sesion-real-4/plan.md`, 2026-09-08) · tamaño de la ventana en modo mascota · opacidad · siempre encima · margen respecto al área de trabajo · monitor donde aparece · **posición absoluta arrastrada de la mascota** (`petWindowPosition`, nuevo — Hito 8, 2026-09-08) · **ancho de la columna de chat en Modo Completo** (`chatColumnWidthPx`, Hito 7 de `specs/revision-ux-modos-presentacion/plan.md`, 2026-09-05) · **color primario de la app** (`primaryColorRgb`, nuevo — H2 de `specs/revision-ux-sesion-real-3/plan.md`, 2026-09-06).

> **Gap cerrado (primer escritor real de `AppSettings` — Hito 7, 2026-09-05):** hasta este hito, `setGlobalAppSettings`/`setProjectAppSettings` no tenían ningún llamador real en `src/` — la app solo LEÍA configuración persistida, nunca escribía (confirmado por grep, declarado en el Hallazgo 17 de `correcciones-qa-sesion-real-2`). El divisor arrastrable entre la columna de chat y el avatar en Modo Completo (`App.vue`, `.full-layout__resizer`) es el primer punto de escritura real: al soltar el arrastre (mouse o flechas de teclado), persiste `chatColumnWidthPx` vía `setGlobalAppSettings` sobre el objeto `AppSettings` completo ya cargado al inicio. `chat_column_width_px` es `Option<u32>` en el struct de Rust (a diferencia de la mayoría de los demás campos, que no son opcionales) — su ausencia significa explícitamente "usa el ancho de columna fijo por token CSS (`--size-chat-column`), no un valor numérico guardado".
>
> **`primaryColorRgb` (H2, 2026-09-06):** mismo mecanismo y mismo patrón `Option<[u8; 3]>` — ausencia significa "usa el naranja de Claude por omisión" (`DEFAULT_PRIMARY_COLOR_RGB` en `src/theme-color.ts`). Se escribe desde `ThemePopup.vue` (`iro.ColorPicker`, sin slider de alfa — D2 de ese plan) en el evento `input:end` de la rueda de color, y se aplica en vivo en cada `color:change` escribiendo `--color-primary-rgb` en `document.documentElement.style` (sin esperar el roundtrip de persistencia). Verificado con un reload real de la app: el valor sobrevive.
>
> **`petWindowPosition` (Hito 8, D8, 2026-09-08):** `Option<PetWindowPosition>` (`{x: i32, y: i32}`, `#[serde(default)]`) junto a `corner` — ausencia significa "calcula la esquina de siempre" (`petWindowCorner` + `calculateCornerPosition`); presencia significa "usa este punto absoluto, ignora la esquina". Se escribe desde `PetView.vue` (la ventana pet es un proceso Tauri separado de la ventana principal, `src/main.ts`) justo después de que `startDragging()` resuelve — en Windows esa promesa no resuelve hasta soltar el botón, así que leer `outerPosition()` en ese punto ya es la posición final arrastrada, sin necesitar el evento `onMoved`. `PresentationManager.resolvePetPosition()` (`src/presentation-manager.ts`) prefiere esta posición sobre el cálculo de esquina cuando existe; `App.vue` la relee de disco (`getAppSettings`) antes de cada `switchToPetMode()`, porque el arrastre ocurre en el proceso de la ventana pet y no comparte memoria con la ventana principal. Botón "Restaurar posición" (panel de Modo Compañera, junto al control de tamaño) limpia el campo y fuerza `refreshPetGeometry()` si PET está activo.

### Comportamiento

Activar y desactivar voz · reproducir voz en modo mascota · animaciones · sensibilidad de las reacciones · comportamiento cuando Claude necesita atención · mostrar notificaciones del sistema · entrar automáticamente en modo mascota cuando Claude trabaja sin interacción · robar el foco al restaurar la interfaz · ignorar clics fuera del avatar.

### Estado inicial

Preferencia de modo inicial · visibilidad inicial de la actividad.

> **Gap cerrado (Hito 9 de `specs/revision-ux-modos-presentacion/plan.md`, 2026-09-05):** "visibilidad inicial del chat" dejó de ser una preferencia — el chat ya no tiene un control para ocultarse (AC-047), así que `chatVisibility`/`chat_visibility` se quitó de `AppSettings` (TS y Rust) y de `PresentationState`. `activityVisibility` no cambió.

### Reacción al entorno

Comportamiento al cambiar de monitor · comportamiento al bloquear o desbloquear el sistema.

### Alcance de la preferencia

Preferencias por proyecto o sesión, además de las globales.

## Proyectos y sesiones

La arquitectura debe permitir después —sin que sea obligatorio en el MVP—: seleccionar directorio de trabajo · crear una sesión · continuar una sesión · tener varias sesiones · ver el proyecto actual · recordar la configuración del avatar por proyecto · recordar la configuración de presentación por proyecto · restaurar el último modo utilizado si la persona lo permite · mantener eventos pendientes al cambiar de presentación · asociar el monitor y la posición de la mascota a un proyecto o a la configuración global.

**No diseñes la arquitectura de forma que impida agregarlas.**

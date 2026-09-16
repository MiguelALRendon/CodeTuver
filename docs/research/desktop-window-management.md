---
id: research-desktop-window-management
title: Capacidades de ventana de escritorio (Tauri 2 + Windows 11)
type: reference
status: current
source: both
last_verified: 2026-08-27
symbols: []
related: [how-to-investigar-ventanas-y-modo-pet, ref-entregables-investigacion, ref-presentacion-y-ventana, ref-taxonomia-errores, adr-0005]
---

# Capacidades de ventana de escritorio (Tauri 2 + Windows 11)

Entregable de FEAT-002, Hito 2 de `specs/investigacion-previa/plan.md`. Cubre AC-002.1 a AC-002.4.

**Etiquetas de cada hallazgo (las 6 generales + las 6 de ventana que exige `entregables-investigacion.md`):** [OFICIAL] · [OBSERVADO] · [INFERENCIA] · [NO-DISPONIBLE] · [NATIVO] · [FALLBACK] — y para ventana: **garantizada por Tauri** · **disponible mediante plugins** · **requiere código Rust específico** · **requiere APIs nativas del SO** · **experimental o no garantizada** · **debe tener fallback**.

## 1-2. Fuentes y fecha de consulta

- `claude` no aplica aquí. Fuente primaria: **la propia prueba de concepto real**, corriendo en este equipo (`src/App.vue`, `src/monitor-position.ts`, `src-tauri/tauri.conf.json`), consultada/ejecutada el 2026-08-27.
- Documentación oficial de Tauri 2 (`v2.tauri.app`), consultada el 2026-08-27 — parcialmente truncada al momento de la consulta (ver limitaciones); donde faltó, se resolvió por observación directa en vez de asumir.
- Inspección directa de la ventana viva vía Win32 (`user32.dll`: `GetWindowLongPtr`, `GetWindowRect`) desde PowerShell, 2026-08-27.

## 3. Versión de Claude Code analizada

No aplica a este informe.

## 4. Versión de Tauri analizada

**Tauri 2** (`tauri = "2"` en `Cargo.toml`, `@tauri-apps/api ^2`, CLI `@tauri-apps/cli ^2`).

## 5. Sistema operativo y versión utilizados en las pruebas

Windows 11, build 26200. Una sola pantalla física disponible: 1920×1080, 100% de escala (confirmado con `System.Windows.Forms.Screen`).

## 6. Capacidades confirmadas

### 6.1 Forma de la ventana

- **Sin bordes:** `decorations: false` en `tauri.conf.json` — **garantizada por Tauri**, propiedad de configuración estándar. [OFICIAL]
- **Fondo transparente:** `transparent: true` + `shadow: false` en `tauri.conf.json`, más `background: transparent` en CSS (`html`, `body`, `#app`) — **garantizada por Tauri en Windows** vía composición de WebView2, sin necesitar el truco clásico Win32 de `WS_EX_LAYERED` (se confirmó que ese bit **no** está presente en la ventana viva y aun así el proceso corre con `transparent: true` sin error — la transparencia moderna en Windows 10/11 con WebView2 se compone a través de DWM, no del mecanismo legacy). [OBSERVADO] **garantizada por Tauri**, con el matiz de que depende de DWM/WebView2, no de una API que la aplicación controle directamente.
- **Siempre encima:** confirmado en la ventana viva — el bit `WS_EX_TOPMOST` (`0x8`) está presente en el `ExStyle` real de la ventana (`0x40118`), leído con `GetWindowLongPtr` mientras el proceso corría. [OBSERVADO] **garantizada por Tauri** (`alwaysOnTop: true` en config + `setAlwaysOnTop()` en runtime, ambos disponibles).
- **Diferencia transparencia real vs. semitransparencia:** no se probó semitransparencia (opacidad parcial fija) porque el diseño no la pide; la vía disponible sería un color de fondo con canal alfa vía `setBackgroundColor([r,g,b,a])`, confirmada como comando real (se usó en la función `restore()` del PoC). [OBSERVADO]

### 6.2 Posición y pantalla

- **Posicionamiento en esquina, verificado en la ventana viva, no solo en la prueba unitaria:** con un monitor de 1920×1080 sin barra de tareas detectada por el sistema en el momento de la prueba, el PoC calculó y aplicó `top-right` con margen 24px, y la ventana real apareció exactamente en `(1576, 24)`–`(1896, 344)` — coincide en un 100% con el cálculo manual esperado (`x = 1920 - 24 - 320 = 1576`, `y = 24`). [OBSERVADO] **garantizada por Tauri** para `setPosition`; el cálculo de esquina es lógica propia (`monitor-position.ts`), no de Tauri.
- **Múltiples monitores:** no hay una segunda pantalla física en este equipo (confirmado, igual que en el Hito 0 de investigación). Por decisión **D2**/ADR-0005, esto se verifica con la enumeración real de `availableMonitors()`/`primaryMonitor()` (un monitor real observado) más las 10 pruebas unitarias reales que cubren monitores sintéticos con coordenadas negativas, densidades distintas y bordes de barra de tareas en las cuatro orientaciones — **todas pasan** (`npx vitest run`, 10/10). [OBSERVADO]
- **DPI y escalado:** el monitor real reportó `scaleFactor` vía la API de Tauri (no se registró aquí el valor exacto porque el sistema está al 100%); la lógica de `toMonitorInfoList` preserva `scaleFactor` por monitor sin mezclarlo entre monitores, confirmado por prueba unitaria con dos densidades distintas. **Cambiar la escala del sistema en caliente y observar el efecto en una ventana ya abierta no se probó** — requeriría cambiar la configuración de pantalla de Windows durante la sesión, lo cual no se ejecutó por ser una acción que reconfigura el entorno del usuario más allá del alcance de esta prueba. Se declara **no observado**, con la alternativa ya documentada en ADR-0005 (ligado a FEAT-029). [NO-DISPONIBLE en este informe, alternativa documentada]
- **Área de trabajo excluyendo la barra de tareas:** el contrato (`MonitorInfo.workArea`) se llena directamente desde `Monitor.workArea` de `@tauri-apps/api/window`, que en esta versión de Tauri **sí lo expone de forma nativa** (posición y tamaño ya excluyen la barra de tareas) — no hizo falta código Rust adicional, contra lo que el plan anticipaba como posible. [OBSERVADO] **garantizada por Tauri**.

### 6.3 Foco y ratón

- **Click-through (`setIgnoreCursorEvents`):** el comando existe, está permitido en `capabilities/default.json`, compila y el build pasa. **No se pudo verificar visualmente que el clic realmente atraviese la zona transparente**, porque (a) la sesión de Windows de este equipo estaba bloqueada durante la ventana de prueba —confirmado al intentar una captura de pantalla, que devolvió la pantalla de bloqueo, no el escritorio— y (b) este agente no tiene una herramienta de automatización de mouse/GUI para simular el clic de forma controlada. **Esto se declara explícitamente como no observado, no como confirmado.** [NO-DISPONIBLE — limitación del entorno de verificación, no de Tauri] **debe tener fallback**: si en pruebas futuras (con sesión desbloqueada y control de mouse real) el click-through resultara no confiable, el fallback ya está: dejar `ignoreMouseEvents` en `false` y aceptar que la mascota consume clics en toda su ventana, documentado en `presentacion-y-ventana.md` ("no se asume que el modo mascota siempre pueda capturar clics de forma perfecta").
- **Foco:** no se probó `onFocusChanged`/`setFocus` de forma interactiva por la misma limitación de automatización de mouse. El método existe y es oficial. [OFICIAL, no verificado interactivamente]

### 6.4 Ciclo de la ventana

- **Restauración, cambio de tamaño, cambio de posición:** los tres comandos (`setSize`, `setPosition`, y la secuencia de "restaurar" que quita decoraciones/always-on-top/click-through) compilan, están permitidos y se invocan desde botones reales del PoC. La aplicación real del tamaño/posición inicial (esquina) sí se verificó en la ventana viva (ver 6.2). El cambio disparado por clic de usuario no se verificó interactivamente por la misma limitación de automatización. [OBSERVADO parcialmente — aplicación programática confirmada, interacción de usuario no]
- **Hallazgo importante, no anticipado por el contrato:** **Tauri 2 no expone un método para desactivar `transparent` en tiempo de ejecución.** La transparencia es una propiedad de creación de la ventana (`tauri.conf.json` o `WindowBuilder` al construirla), no un `setTransparent(bool)` en runtime. La función "Restaurar" del PoC no puede realmente quitar la transparencia de una ventana ya creada — solo puede simular opacidad pintando un color de fondo sólido (`setBackgroundColor([255,255,255,255])`). **Esto es relevante para el diseño de `PresentationManager`**: la transición `PET → FULL` no puede implementarse cambiando `window.transparent` de la misma ventana en runtime; debe, o bien vivir siempre con `transparent: true` y simular opacidad con `setBackgroundColor`, o crear una ventana nueva al cambiar de modo. **Se registra como hallazgo para el diseño del Hito 6 / EPIC-005**, no se decide aquí (fuera de alcance de EPIC-001). [OBSERVADO] **requiere código Rust específico o rediseño** — no está garantizado por la API de alto nivel tal como el contrato lo asumía.

### 6.5 Convivencia con el escritorio

- **Bloqueo y desbloqueo de Windows — verificado de forma no planeada pero real:** durante esta misma sesión de pruebas, la sesión de Windows del equipo se bloqueó (confirmado: una captura de pantalla tomada mientras el proceso corría mostró la pantalla de bloqueo de Windows, no el escritorio). El proceso `tauri-app.exe` **siguió vivo** (confirmado con `tasklist`) y sus propiedades de ventana siguieron siendo consultables vía Win32 (`GetWindowLongPtr`/`GetWindowRect` respondieron con datos válidos) mientras la sesión estaba bloqueada. **No se derivó un error, no se cerró el proceso.** [OBSERVADO, hallazgo real no planeado] **garantizada por Tauri/Windows** (el proceso no depende de que la sesión esté desbloqueada para seguir corriendo).
- **La captura de pantalla que reveló el bloqueo contenía información personal de la persona propietaria de este equipo (ubicación, franja horaria de PIN). Se eliminó inmediatamamente tras confirmarlo y no se usó como fixture ni se conservó en ninguna forma** — coherente con la regla de este mismo Epic de no guardar información sensible.
- **Alt+Tab, barra de tareas, cambio de aplicación, pantalla completa, suspensión, escritorios virtuales, desconexión de monitor:** **no verificados** en esta sesión — requieren interacción real de teclado/mouse con el escritorio o hardware que cambia de estado (suspender el equipo, desconectar un monitor), acciones que este agente no ejecuta sobre la sesión real de un usuario sin su presencia activa. Se declaran explícitamente como no observados. [NO-DISPONIBLE en este informe]

### 6.6 Rendimiento y accesibilidad

- **Aceleración gráfica / rendimiento con avatar animado:** el avatar de prueba del PoC es estático (un círculo CSS), no animado — medir rendimiento de animación no aplica todavía; se pospone a cuando exista un avatar real animado (EPIC-004). [FUERA DE ALCANCE de este Hito, declarado]
- **Reducción de movimiento:** no aplica todavía — el PoC no tiene animaciones. Se resuelve en el Hito 5 (guía visual).

## 7. Limitaciones conocidas

- **La sesión de Windows de este equipo estaba bloqueada durante buena parte de la ventana de prueba**, y este agente no cuenta con herramientas de automatización de mouse/teclado sobre la sesión real del usuario. Esto limitó la verificación a lo que es observable por API (Win32, `tasklist`) y por configuración/compilación, no por inspección visual directa ni por interacción de clic real.
- La documentación oficial de Tauri 2 consultada por `WebFetch` llegó truncada en varias secciones (`WindowConfig` completo, propiedades de transparencia). Se resolvió confiando en la observación directa del PoC real en vez de en una fuente incompleta.
- Ningún hallazgo de este informe se probó en una segunda pantalla física real (no hay una disponible) — mitigado por ADR-0005, tal como se aplicó también en el Hito 1.

## 8. Riesgos de compatibilidad

- El hallazgo de 6.4 (transparencia no desactivable en runtime) es el riesgo más grande de este Hito para el diseño posterior: si `PresentationManager` asume que puede alternar `window.transparent` como cualquier otro booleano de `PresentationState.window`, el diseño estará mal. Debe registrarse en el Hito 6 como corrección al contrato o como nota de implementación para EPIC-005.
- `WS_EX_LAYERED` ausente pese a `transparent: true` funcionando: si en el futuro se necesita opacidad variable por píxel (no solo canal alfa uniforme), puede que WebView2/DWM impongan un límite que la vía clásica Win32 no tendría — no se investigó más a fondo por estar fuera del alcance de EPIC-001 (PoC mínimo, no producto final).

## 9. Recomendación de arquitectura

Confirma el contrato ya escrito en `presentacion-y-ventana.md` (`DesktopWindowManager`, `MonitorInfo`, `WindowPosition`) como diseño correcto — la implementación real de este Hito lo satisfizo sin necesitar cambiarlo, salvo la corrección de 6.4 sobre transparencia en runtime, que se registra para cuando `PresentationManager` se implemente (EPIC-005), no aquí.

## 10. Qué debe probarse localmente (antes de EPIC-005)

1. Click-through real, con sesión desbloqueada y una prueba manual de clic (o una herramienta de automatización de UI que hoy no está disponible en este entorno).
2. Comportamiento real ante Alt+Tab, cambio de escala en caliente, suspensión y bloqueo/desbloqueo con interacción real.
3. Cómo implementar la transición `PET → FULL` dado que la transparencia no es togglable en runtime (6.4).

## 11. Qué partes pueden implementarse en el MVP

`WindowsWindowManager` sobre lo ya confirmado: borderless, transparent (fijo a la creación), always-on-top, posicionamiento por esquina con el cálculo de `monitor-position.ts` (ya con 10 pruebas unitarias reales), enumeración de monitores con fallback al primario.

## 12. Qué partes deben posponerse

Todo lo de 6.3 (click-through, foco) hasta poder verificarlo con interacción real. El manejo de escritorios virtuales/monitor desconectado/suspensión, hasta EPIC-005 con pruebas manuales reales de escritorio (US-029 lo cubre explícitamente, ver ADR-0005).

## 13. Qué capacidades del modo mascota requieren APIs nativas

Todas las de 6.1 y 6.3 (transparencia real, siempre-encima, click-through) requieren la capa nativa de Windows vía Tauri — ninguna es simulable solo con CSS/JS de Vue, confirmando la frontera no negociable de `ARCHITECTURE.md` ("la presentación no sabe que es escritorio").

## 14. Qué fallbacks deben existir

- Si el click-through no resulta confiable (pendiente de verificar, §10.1): fallback ya documentado en `presentacion-y-ventana.md` — la mascota captura clic en toda su ventana en vez de solo el avatar.
- Si la transparencia en runtime sigue sin ser togglable (confirmado, 6.4): el fallback es simular opacidad con `setBackgroundColor` en vez de crear/destruir ventanas al cambiar de modo — decisión que le corresponde a EPIC-005, no a este Epic.

## 15. Qué comportamiento no puede garantizarse en todas las plataformas

Todo este informe es específico de Windows 11 — `WindowsWindowManager` es la única implementación en alcance (ver `presentacion-y-ventana.md` §"Alcance"). `WS_EX_TOPMOST`, el comportamiento de DWM para transparencia, y el nombre de las APIs Win32 usadas para verificar no aplican a macOS/Linux.

## Corrección de AC-002.3

**Ya estaba corregido** antes de este Hito: `03_requerimientos.md:185` y `ADR-0005` (aceptado, 2026-08-26) ya reformulan el criterio para no exigir una segunda pantalla física, separando el requisito real (comportamiento ante cambios de configuración de pantalla) del vehículo de verificación (enumeración de monitores + prueba automatizada). Se verificó que sigue vigente y no contradice nada de lo observado en este Hito — no fue necesario un nuevo paso por `/workflow-update-docs`.

## Contrato corregido

[`presentacion-y-ventana.md`](../reference/presentacion-y-ventana.md) pasa a `status: current` en lo que este Hito confirmó, con la corrección de 6.4 (transparencia no togglable en runtime) documentada ahí mismo.

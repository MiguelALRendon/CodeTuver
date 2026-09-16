---
id: ref-presentacion-y-ventana
title: Modos de presentación y gestión de ventana
type: reference
status: current
source: both
last_verified: 2026-09-06
symbols: []
related: [adr-0004, ref-configuracion-persistente, how-to-investigar-ventanas-y-modo-pet, exp-capa-de-presentacion, research-desktop-window-management]
---

# Modos de presentación y gestión de ventana

> **Estado: confirmado por FEAT-002 (Hito 2 de `investigacion-previa`)** en lo que el PoC real cubrió — ver `docs/research/desktop-window-management.md`. **Corrección real sobre este mismo contrato, no anticipada al escribirlo:** la transparencia de la ventana **no es togglable en tiempo de ejecución** en Tauri 2 — se fija solo al crear la ventana. La transición `PET → FULL` de `PresentationState.window.transparent` (abajo) **no puede implementarse como un simple `setTransparent(bool)`**; debe simular opacidad con un color de fondo sólido (`setBackgroundColor`) o gestionar la creación/destrucción de la ventana. Queda registrado aquí para que EPIC-005 lo implemente ya con esta información, no lo descubra de nuevo. No verificado interactivamente (sesión bloqueada durante la prueba, sin herramienta de automatización de mouse disponible): click-through real sobre región transparente, captura de clic solo sobre el avatar, y comportamiento ante Alt+Tab/suspensión/escritorios virtuales — quedan `[NO-VERIFICADO]`, con los fallbacks ya declarados abajo vigentes hasta confirmarlo.

```typescript
type PresentationMode = "FULL" | "COMPANION" | "PET";
```

En la documentación de negocio se llaman **modo completo**, **modo compañera** y **mascota de escritorio**.

## Los tres modos

### FULL — modo completo

Interfaz principal. Muestra la VTuber, el chat, la actividad o consola, los controles de la aplicación, el estado actual de Claude, los indicadores de interacción pendiente, los controles de cambio de modo, y el acceso a la salida cruda y a la configuración.

La consola (actividad/salida cruda) puede ocultarse de forma independiente. El chat ya no tiene un control para ocultarse dentro de modo completo (ver nota de Hito 9 más abajo).

**Layout real (Hito 6 de `presentacion-escritorio`, reapertura 2026-08-29):** columna izquierda fija con el chat, columna derecha mayoritaria con la VTuber en grande. Actividad, salida cruda, configuración y editor de personaje viven detrás de un panel de pestañas (`role="tablist"`, navegación por flechas y roving `tabindex`, ver `src/tab-navigation.ts`) en esa misma columna derecha, en vez de apilados verticalmente. Los controles de cambio de modo y el indicador de peticiones pendientes quedan **siempre visibles, fuera de cualquier pestaña** — no dependen de cuál esté activa.

### COMPANION — modo compañera

Minimalista: la interfaz de trabajo prácticamente desaparece y la VTuber queda como protagonista, centrada y completamente animada. Permite ocultar chat y consola, atenuar o difuminar la interfaz, centrar el avatar, y volver al modo completo con una interacción sencilla restaurando la visibilidad previa de los paneles.

**Sigue siendo una ventana normal de la aplicación.** No se confunde con minimizar ni con el modo mascota. Claude y sus eventos siguen corriendo, y las notificaciones importantes se mantienen.

### PET — mascota de escritorio

La ventana deja de ocupar espacio significativo y la VTuber aparece en una esquina del escritorio, sobre fondo transparente cuando la plataforma y el renderizador lo permitan. Sin paneles, sin chat, sin consola.

- El avatar sigue animándose y reaccionando a los eventos reales.
- Claude sigue trabajando; la persona sigue usando otras aplicaciones con normalidad.
- **La VTuber no roba el foco innecesariamente.**
- Hacer clic en la VTuber restaura la interfaz principal, con las peticiones pendientes intactas.
- El modo se desactiva sin detener la sesión.

Cuando Claude requiere atención, el aviso se compone —de forma configurable— de cambio de expresión, animación, indicador visual, burbuja o notificación, voz si el TTS está habilitado, cambio de iluminación, icono de estado, notificación del sistema si la persona la permite, y otras señales no intrusivas.

> **Implementado (Hito 5 de `presentacion-escritorio`, 2026-08-28, último Hito de EPIC-005):** las seis señales de AC-026.2 son `src/attention-signals.ts` (`resolveAttentionSignal`, función pura: `pendingInteractionCount > 0 && mode === 'PET'`) + `src/attention-signal-settings.ts` (configuración interina, pendiente de FEAT-028) + `src/system-notification.ts` (envoltura sobre `@tauri-apps/plugin-notification`, nuevo, mismo patrón que `tauri-plugin-dialog`). Por omisión solo se activan cambio de expresión + indicador visual (no las seis a la vez) — confirmado contra `casos/TC-080.md`. **Cambio de expresión, animación y voz no son configurables todavía**: siempre activas/dependientes del mecanismo general de `ReactionEngine` (EPIC-004), que decide una reacción completa sin granularidad para apagar/activar selectivamente su efecto visual o hablado. Para `voz` en particular, conectar el toggle a un anuncio real violaría R7 (`ReactionEngine.emit()` es el único punto que llama `speak()`) — limitación real declarada, no oculta. Ver `docs/ARCHITECTURE.md` fila FEAT-026 para el detalle completo.

> **Gap cerrado (PET nunca reproducia pose ni animacion de fondo — Hito 2 de `specs/revision-ux-modos-presentacion/plan.md`, 2026-09-05):** pese a que esta seccion ya documentaba "el avatar sigue animandose" como comportamiento esperado, `PetView.vue` nunca recibia `animationPoolUrls`/`poseUrl` — `PetSyncPayload` (`pet-sync.ts`) no los incluia, asi que el avatar en modo mascota quedaba fijo en el bind T-pose del VRM sin importar el estado real. Fix: `PetSyncPayload` gana `animationPoolUrls?`/`poseUrl?`; `App.vue` los llena desde el mismo `activeStateAssignment` ya usado por Completo/Compañera (una unica fuente, sin calculo paralelo); `PetView.vue` los reenvia a `AvatarStage` sin logica propia. PET queda alineado con el mismo mecanismo que los otros 2 modos.

> **Limitación real confirmada en el cierre del Hito 3 de `robustez-distribucion` (2026-08-29):** ante otra aplicación en pantalla completa, el personaje permanece visible por estar `alwaysOnTop: true` (comportamiento estándar de Windows para ventanas siempre-encima), con la excepción conocida de aplicaciones a pantalla completa **exclusiva** (típicamente juegos), donde Windows/DWM puede desactivar temporalmente ese comportamiento para todas las ventanas del sistema — no verificado interactivamente, fundamentado en el comportamiento ya construido, no en observación directa. La investigación original de EPIC-001 (`docs/research/desktop-window-management.md` §6.5) nunca documentó un hallazgo para esta condición; queda corregido aquí y en `casos/TC-095.md`.

**No se asume que el modo mascota siempre pueda capturar clics de forma perfecta.** Si la plataforma no permite click-through en regiones transparentes con captura solo sobre el avatar, debe existir un fallback documentado y usable.

> **Decisión D5 tomada (Hito 4 de `presentacion-escritorio`, 2026-08-28): Rama A completa, sin necesitar Rama B.** El PoC (`docs/research/desktop-window-management.md` §6.1-6.4) confirma como oficial/garantizado todo lo estructural (sin bordes, transparencia, siempre-encima, posicionamiento por esquina). El click-through por región nunca se verificó interactivamente (§6.3, limitación del entorno de prueba, no de Tauri) — pero quedó resuelto igual: Tauri no soporta click-through por región (confirmado como hecho técnico en el Hito 1, `desktop-window-manager.ts`), y como la ventana de mascota se dimensiona exactamente al tamaño del avatar (200×200 por omisión, ver nota de tamaño ajustable más abajo), el fallback ya documentado arriba ("la ventana captura todo el clic") **es** literalmente "clic en el personaje restaura la ventana completa" — no hay región transparente adicional donde la granularidad importe. Implementado en `src/presentation-manager.ts` (`applyModeGeometry`) y `src/App.vue` (`pet-stage`).

> **Tamaño ajustable y borde real corregido (Hito 8 de `revision-ux-sesion-real-3`, 2026-09-06).** El tamaño ya no es fijo: un control en Modo Compañera (`App.vue`, junto a "Enviar al escritorio") ajusta 100-400px, persistido en `AppSettings.windowSize` (el mismo campo que ya se leía al arrancar) vía `PresentationManager.setPetWindowSize()`. El borde reportado tenía **dos** causas, no una: `decorations: false` no evita que Windows dibuje sombra (corregido con `shadow: false`) **ni** que el menú nativo de la app (`menu.setAsAppMenu()` en `native-menu.ts`, aplicado por Tauri a toda ventana nueva por omisión) quede adjunto de forma invisible a la mascota — corregido con `window.remove_menu()` (comando `clear_pet_window_menu`). Verificado en vivo (CDP) que además existían dos fallas de timing no documentadas antes: `setSize`/`setPosition` corrían contra el webview antes de que Tauri terminara de crearlo (silenciosamente ignorados en la primera apertura de cada sesión) y un recargo del frontend no destruye el webview real, así que reintentar crearlo con la misma etiqueta fallaba en vez de reusarlo — ambos corregidos en `src/pet-window.ts`. **Hallazgo abierto, no bloqueante:** el alto real queda consistentemente +20px por encima del solicitado (el ancho siempre coincide exacto); no genera borde ni scroll visibles, ver D10 en `specs/revision-ux-sesion-real-3/design.md` para el detalle.

## Minimizar no es enviar al escritorio

| Acción | Significado |
|---|---|
| **Minimizar** | Quitar la aplicación de la vista con el comportamiento normal del sistema operativo |
| **Enviar al escritorio** | Convertir la aplicación en la mascota VTuber mientras Claude sigue trabajando |

Minimizar **no** cambia el modo de presentación salvo configuración explícita. Enviar al escritorio **no** detiene Claude, no cierra la sesión y no equivale a ocultar el proceso.

## Estado de presentación

La presentación está centralizada en un `PresentationManager`. **No se dispersan condiciones como `if (mode === "pet")` por la aplicación** — ver [ADR-0004](../adr/0004-presentacion-centralizada.md).

Modo y visibilidad de paneles son estados **independientes**, para permitir combinaciones futuras sin rediseñar la interfaz:

```typescript
interface PresentationState {
  mode: PresentationMode;
  activityVisibility: "VISIBLE" | "HIDDEN";
  avatarPosition: "CENTER" | "CORNER";
  window: {
    transparent: boolean;
    borderless: boolean;
    alwaysOnTop: boolean;
    focusable: boolean;
    ignoreMouseEvents: boolean;
  };
  pendingInteractionCount: number;
}
```

> **Gap cerrado (control de "ocultar chat" eliminado — Hito 9 de `specs/revision-ux-modos-presentacion/plan.md`, 2026-09-05):** en modo completo el chat ocupa ahora siempre todo su contenedor; no aportaba valor real ocultarlo (AC-047). `chatVisibility` se quitó por completo de `PresentationState`, `PanelVisibilitySnapshot`, `AppSettings` (TS y Rust) y de `App.vue` (botón "Ocultar chat"/"Mostrar chat" y el `v-if` que condicionaba `.chat-panel__body`). `activityVisibility` no se tocó y sigue funcionando igual — la consola (actividad/salida cruda) todavía puede ocultarse de forma independiente. El gesto `'ocultar chat'` de la tabla de transiciones de abajo es solo la etiqueta histórica de la transición `FULL → COMPANION`; nunca estuvo ligado al campo `chatVisibility` que se quitó aquí.

> **Corrección real sobre este mismo contrato, cerrada en el Hito 2 de `presentacion-escritorio`:** el diagrama de abajo dibujaba solo 3 transiciones, pero `TC-068` exige las 6 posibles entre los tres modos, en ambos sentidos — AC-023.4 obliga a que las 6 estén definidas para que ninguna deje la ventana inalcanzable. Tabla real, tal como quedó implementada en `PRESENTATION_TRANSITIONS` (`src/presentation-manager.ts`):

| Desde | Hacia | Gesto |
|---|---|---|
| FULL | COMPANION | Ocultar chat |
| COMPANION | PET | Enviar al escritorio |
| PET | FULL | Clic en la VTuber |
| COMPANION | FULL | Volver a la interfaz completa |
| FULL | PET | Cambio directo de modo (sin gesto de UI dedicado documentado — solo alcanzable llamando `setPresentationMode('PET')` explícitamente, p. ej. desde un menú de modos) |
| PET | COMPANION | Cambio directo de modo (misma nota que arriba) |

`avatarPosition` para `FULL` (no declarado originalmente): **`CORNER`**. Razón: `COMPANION` es el único modo donde el avatar es protagonista exclusivo ("queda como protagonista, centrada" → `CENTER`); en `FULL` el avatar comparte espacio con chat/actividad/controles, estructuralmente más cercano a `PET` (`CORNER`, explícito) que al protagonismo central de `COMPANION`.

El `PresentationManager` recibe cambios de modo, valida transiciones, coordina la visibilidad de los paneles y el `DesktopWindowManager`, mantiene el estado de sesión intacto, restaura la configuración anterior, notifica al avatar y a la interfaz, gestiona fallbacks cuando una plataforma no soporta una capacidad, y **evita que una transición incompleta deje la aplicación en un estado inconsistente**.

No depende de detalles internos del transporte: recibe estado y eventos por interfaces públicas.

## Abstracción de ventana

```text
DesktopWindowManager
        ├── WindowsWindowManager
        ├── MacOSWindowManager
        └── LinuxWindowManager
```

> **Alcance:** solo se implementa y prueba `WindowsWindowManager` (Windows 11). macOS y Linux quedan como puntos de extensión de la interfaz, sin implementación — ver `flujo_projects/codetuver-avatar/02_entendimiento.md` §6.

```typescript
interface DesktopWindowManager {
  setPresentationMode(mode: PresentationMode): Promise<void>;
  setAlwaysOnTop(enabled: boolean): Promise<void>;
  setTransparent(enabled: boolean): Promise<void>;
  setBorderless(enabled: boolean): Promise<void>;
  setPosition(position: WindowPosition): Promise<void>;
  setSize(size: WindowSize): Promise<void>;
  setIgnoreMouseEvents(enabled: boolean, options?: MouseEventOptions): Promise<void>;
  setFocusable(enabled: boolean): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  minimize(): Promise<void>;
  restore(): Promise<void>;
  focus(): Promise<void>;
  getMonitors(): Promise<MonitorInfo[]>;
  getCurrentMonitor(): Promise<MonitorInfo | null>;
}

type WindowPosition =
  | { type: "absolute"; x: number; y: number }
  | {
      type: "screen_corner";
      corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
      marginX: number;
      marginY: number;
    }
  | { type: "monitor_relative"; monitorId: string; x: number; y: number };

interface WindowSize {
  width: number;
  height: number;
}

interface MouseEventOptions {
  forwardToUnderlyingWindow?: boolean;
  hitTestAvatarOnly?: boolean;
}

interface MonitorInfo {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  isPrimary: boolean;
}
```

**Si una capacidad no está disponible, el adaptador devuelve un error tipado o aplica un fallback documentado. Nunca falla en silencio.**

> **Implementado:** `src/desktop-window-manager.ts` (`TauriDesktopWindowManager`, Hito 1 de `presentacion-escritorio`, 2026-08-28) — ver `docs/ARCHITECTURE.md` §"Mapa de módulos" (fila FEAT-022) para el detalle real, incluida la corrección aplicada sobre `tauri.conf.json` (`transparent: true`, ADR-0008). `src/presentation-manager.ts` (`PresentationManager`, Hito 2, mismo día) implementa la máquina de estados de este documento. Los modos FULL y COMPANION están montados en `src/App.vue` (Hito 3, mismo día) — ver fila FEAT-024 en `ARCHITECTURE.md`; PET queda para el Hito 4.

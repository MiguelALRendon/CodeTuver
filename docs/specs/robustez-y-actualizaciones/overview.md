# Robustez y actualizaciones

Cubre tres mecanismos transversales: la taxonomía de fallas con aislamiento por capa, el panel de depuración con su modo de inyección de fallos, y la actualización automática de la aplicación.

## Taxonomía de fallas

`src/failure-taxonomy.ts` define 8 orígenes reales (`FailureOrigin`) y 12 clases reales (`FailureClass`), mapeadas 1:1 en `FAILURE_CLASS_ORIGIN`:

| Clase | Origen |
|---|---|
| `claude-code-error` | `agente` |
| `process-error` | `proceso` |
| `communication-error` | `comunicacion` |
| `parsing-error` | `interpretacion` |
| `tts-error` | `voz` |
| `avatar-error` | `avatar` |
| `interface-error` | `interfaz` |
| `window-management-error` | `ventana` |
| `unsupported-capability` | `ventana` |
| `mode-change-error` | `ventana` |
| `window-restore-error` | `ventana` |
| `monitor-query-error` | `ventana` |

El registro (`registerFailure`) vive en memoria del proceso (`reactive<FailureLogEntry[]>`) — nunca toca disco, red ni telemetría. Un array plano no dispara los efectos de Vue, por eso el log es explícitamente `reactive()`: el panel de depuración necesita ver `listFailures()` en vivo mientras está abierto.

**Sitios reales de captura hoy** (confirmado por grep directo, no asumido):

| Clase | Archivo:función real |
|---|---|
| `avatar-error` | `App.vue` (fallo de dibujo del avatar) |
| `claude-code-error` | `App.vue` (arranque de sesión fallido, 2 sitios) |
| `tts-error` | `reaction-engine.ts::speakIfAuthorized` |
| `parsing-error` | `content-interpreter.ts::parseSegmentSafely` |
| `mode-change-error` | `presentation-manager.ts` (protocolo de fallo de transición) |

Las otras 7 clases (`process-error`, `communication-error`, `interface-error`, `window-management-error`, `unsupported-capability`, `window-restore-error`, `monitor-query-error`) están **declaradas en el vocabulario pero sin ningún sitio de captura real en código de producción hoy** — confirmado por grep, `desktop-window-manager.ts` nunca llama `registerFailure`. Solo son alcanzables a través del modo de inyección del panel de depuración (ver abajo), nunca por un fallo real disparado en uso normal.

## Panel de depuración e inyección de fallos

`src/components/DebugPanel.vue`, gateado por `import.meta.env.DEV` en su `onMounted` — fuera de `DEV` nunca registra el listener de teclado, así que nunca se monta funcionalmente. Atajo real: `Ctrl+Shift+Alt+D` alterna abierto/cerrado; `Escape` con el panel abierto lo cierra. Overlay con `role="dialog"`, `aria-modal="true"`, foco atrapado (`trapFocus`, ciclo Tab manual sobre los elementos enfocables reales del panel) y devolución de foco al elemento que tenía el foco antes de abrir.

Inyectores reales, cada uno arma un "fallo pendiente" que se dispara en el próximo evento real correspondiente (no dispara el fallo inmediatamente él mismo):
- **Fallo de dibujo del avatar** — `armAvatarDrawFault()`.
- **Fallo del motor de voz** — `armVoiceFault()`.
- **Fallo del intérprete sobre un fragmento** — `armParseFault(indice)`, con un campo numérico real para elegir qué fragmento falla.
- **Fallo de gestión de ventana** — `armMissingWindowCapability('setPosition')` como proxy (no existe un mecanismo genérico propio en `desktop-window-manager.ts` para esta clase; se reutiliza la ausencia de una capacidad concreta como vehículo).
- **Fallo de transición de modo** — `armPresentationTransitionFault(modo)`, con un `CustomSelect` real para elegir el modo destino (`FULL`/`COMPANION`/`PET`).
- **Simular capacidad de ventana ausente** — `armMissingWindowCapability(capacidad)`, con un `CustomSelect` real listando las 15 capacidades reales de `DesktopWindowManager`.
- **Inyectar muestra de salida** — llama directo `props.onIncomingEvent` con un `NormalizedEvent` de tipo `assistant_message` fijo, simulando actividad real sin necesitar una sesión de Claude Code activa.
- **Simular monitores** (1/2/desconectar secundario/desarmar) — `armSimulatedMonitors(...)`, sobrescribe lo que devuelve `getCurrentMonitor()`/`getMonitors()` real.
- **Recalcular posición de modo mascota** — botón de diagnóstico puro: recalcula con la misma geometría real de `presentation-manager.ts::applyModeGeometry`, no lee la posición real del sistema operativo (el propio texto de la UI lo aclara).
- **Limpiar registro de fallas** — `clearFailureLog()`, deshabilitado si el log ya está vacío.

## Actualización automática

`src-tauri/tauri.conf.json` (bloque `plugins.updater`) trae una `pubkey` Ed25519 real ya generada, e `bundle.createUpdaterArtifacts: true`. **Estado real verificado ahora mismo**: el endpoint apunta al repositorio real, `https://github.com/MiguelALRendon/CodeTuver/releases/latest/download/latest.json`. Hasta que ese repositorio tenga al menos una release publicada con su `latest.json`, el chequeo de actualización sigue fallando en silencio (no hay manifest que descargar todavía) — el ciclo completo no se ha ejercitado en vivo.

No hay ningún bloque `bundle.windows` (certificado/firma) en `tauri.conf.json` — la aplicación se distribuye **sin firma Authenticode**, decisión explícita: la consecuencia real es que Windows SmartScreen muestra la advertencia "Se protegió su PC" / "Editor desconocido" en la instalación, igual que la mayoría de instaladores de proyectos de código abierto sin firma comercial. La firma Ed25519 del actualizador es un mecanismo completamente independiente del Authenticode — cubre la integridad de las actualizaciones, no la advertencia de SmartScreen en la instalación inicial.

Identificador real de la app: `com.codetuver.avatar` (`tauri.conf.json`, campo `identifier`) — define dónde Windows guarda su configuración (`AppData/Roaming/com.codetuver.avatar/`).

**Flujo real, paso a paso:**
1. Al montar `App.vue`, después de `initializeAppSettings()`, se llama `checkForUpdateSilently()` sin esperarlo (`void`) — nunca bloquea el arranque de la UI.
2. `checkForUpdateSilently` importa dinámicamente `@tauri-apps/plugin-updater`, llama `check()`. Si el resultado no tiene `available`, no hace nada. Si sí, guarda el resultado en `pendingUpdate` (variable de módulo, no reactiva), arma el texto del aviso con `buildUpdateNoticeText` (función pura) y normaliza las release notes del release de GitHub (`result.body`) con `normalizeReleaseNotes` — recorta espacios y convierte body ausente/vacío/solo-espacios en `null` (nunca muestra una caja vacía).
3. Si `check()` lanza (sin red, endpoint inalcanzable, manifest ausente — el caso real hoy porque `MiguelALRendon/CodeTuver` aún no tiene releases publicadas), el `catch` solo hace `console.error`, sin registrar una falla en la taxonomía y sin mostrar ningún aviso — la sesión sigue intacta.
4. Si hay aviso, aparece un `<p class="session-panel__notice">` con el texto (solo el número de versión) y un botón "Descargar e instalar". Si además hay release notes normalizadas, debajo aparece un `<div class="update-notes activity-console__markdown">` con el body del release renderizado como markdown (mismo renderer sanitizado que el resto del chat, `renderChatDraftMarkdown`, `html:false`) y con el mismo interceptor de enlaces externos (`openExternalLinkOnClick`) que el resto de contenido markdown de la app — un enlace en el changelog nunca navega dentro del webview.
5. Al hacer clic, `downloadAndInstallUpdate` llama `pendingUpdate.downloadAndInstall()` y, si tiene éxito, importa `@tauri-apps/plugin-process` y llama `relaunch()`. Si falla, reemplaza el texto del aviso con el mensaje de error real (`errorMessage(err)`), sin lanzar. Las release notes ya mostradas no se ocultan al fallar la instalación (siguen describiendo la misma versión pendiente).

## Modelo de datos real

```ts
// failure-taxonomy.ts
interface FailureLogEntry {
  origin: FailureOrigin;
  failureClass: FailureClass;
  message: string;
  timestamp: number;
}

// update-check.ts
interface UpdateCheckOutcome {
  available: boolean;
  version: string | null;
}
```

`buildUpdateNoticeText` es una función pura: sin `available` o sin `version`, devuelve `null` (nunca inventa un texto con datos incompletos). `normalizeReleaseNotes(body: string | null | undefined): string | null` es la misma clase de función pura para el body del release: recorta y colapsa a `null` cualquier valor sin contenido real.

## Huecos reales vigentes hoy

- 7 de las 12 clases de falla no tienen ningún sitio de captura real en producción (solo alcanzables por inyección de DebugPanel) — ver tabla arriba.
- El endpoint del actualizador ya apunta al repositorio real, pero el ciclo completo de detectar/descargar/instalar una release real (incluidas las release notes) nunca se ha ejercitado contra una release publicada de verdad.
- Sin firma Authenticode: cualquier instalación real dispara la advertencia de SmartScreen.

## Referencias cruzadas

- [ui-compartida](../ui-compartida/overview.md) — `CustomSelect` que usa `DebugPanel.vue` para elegir modo/capacidad.
- [chat-y-contenido](../chat-y-contenido/overview.md) — `NormalizedEvent`, tipo real que consume el inyector de muestra de salida.
- [arquitectura-general](../arquitectura-general/overview.md) — mapa completo de plugins de Tauri registrados.

# Arquitectura general — Codetuver Avatar

> Punto de entrada de toda la documentación técnica del proyecto. Si es la primera vez que ves este código, empieza aquí.

## Qué es

Codetuver Avatar es una aplicación de escritorio para Windows (Tauri 2 + Vue 3 + Rust) que presenta visualmente una sesión real de Claude Code: un avatar VTuber que reacciona en tiempo real a lo que el agente hace (lee archivos, ejecuta comandos, piensa, pide permiso), con voz opcional, un chat legible del intercambio, y modos de presentación que van desde una ventana de trabajo completa hasta una mascota de escritorio siempre encima.

**Claude Code es el único agente real.** La aplicación nunca implementa un agente propio, nunca decide qué hacer ni genera respuestas — es una capa de presentación sobre un proceso externo (`claude`, el CLI real) que se lanza, se le escribe por `stdin` en formato `stream-json`, y se lee su `stdout` línea por línea. Ver [sesion-y-transporte](../sesion-y-transporte/overview.md) para el mecanismo completo.

## Principios que gobiernan todo el código

Estas reglas están vigentes y se aplican sin excepción — no son aspiración, son restricciones reales que el código actual respeta (verificado dominio por dominio en esta documentación):

- **Ninguna capa puede matar la sesión.** Un fallo del avatar, la voz, el intérprete de contenido o la ventana degrada esa capa sola; la sesión real de Claude Code sigue viva. Ver [robustez-y-actualizaciones](../robustez-y-actualizaciones/overview.md) para el mecanismo de aislamiento de fallas.
- **Ninguna señal de la aplicación concede ni deniega un permiso por sí sola.** Ni un cambio de modo, ni el cierre de un overlay, ni una señal de atención, ni un vencimiento de tiempo resuelven una petición de interacción pendiente — solo la persona, con un clic explícito. Ver [chat-y-contenido](../chat-y-contenido/overview.md).
- **La salida cruda sobrevive siempre.** Cada línea real que el proceso de Claude Code escribe se guarda en disco (`raw-sessions/`, un archivo NDJSON por sesión) antes de que cualquier intérprete la toque — un fallo de interpretación nunca hace desaparecer el dato original. Ver [sesion-y-transporte](../sesion-y-transporte/overview.md).
- **La presentación no sabe que es de escritorio.** El acceso nativo (ventanas, menú, diálogos de archivo, notificaciones) vive aislado detrás de módulos delgados sobre `@tauri-apps/api`/`invoke` — los componentes Vue nunca llaman a Tauri directamente. Ver [presentacion-y-ventana](../presentacion-y-ventana/overview.md).
- **Theme-first, sin excepción.** Todo color, tamaño y sombra visual sale de un token en `src/assets/styles/constants.css` (OKLCH). Cero valores quemados en componentes.
- **Privacidad como frontera, no como opción.** Nada de lo que la persona importa o configura sale de su equipo. Ningún archivo que la app escribe (`AppSettings`, preferencias, registro de fallas) puede contener nada con forma de credencial.
- **Cambiar de personaje o de modo de presentación nunca interrumpe la sesión real.** Un solo `AvatarController`/`PresentationManager` vive independiente de qué personaje o modo esté activo.
- **El motor de reacciones es determinista y auditable**, no un modelo de IA decidiendo — cada reacción sale de una tabla de datos con reglas de prioridad fijas. Ver [reacciones-y-voz](../reacciones-y-voz/overview.md).
- **Windows 11 es la única plataforma construida y probada.** macOS, Linux y Windows 10 quedan fuera de alcance a propósito (ver `docs/adr/0002-stack-tauri-rust-vue.md`).
- **Distribución gratuita, sin firma de código comercial.** El instalable se publica sin certificado Authenticode (decisión explícita: el costo recurrente no se justifica para una publicación estilo proyecto de código abierto en GitHub Releases) — Windows SmartScreen muestra "editor desconocido" al instalar, riesgo aceptado y documentado. Sí existe actualización automática (mecanismo propio, independiente de cualquier firma comercial). Ver [robustez-y-actualizaciones](../robustez-y-actualizaciones/overview.md).

## Stack real

| Capa | Tecnología real |
|---|---|
| Núcleo nativo | Rust estable, Tauri 2 |
| Presentación | Vue 3 (Composition API, `<script setup>`), TypeScript, Vite |
| Render 3D del avatar | Three.js + `@pixiv/three-vrm` (formato VRM) |
| Edición de pose/animación | `@theatre/core` (gizmo, línea de tiempo) |
| Voz | Web Speech API del navegador/WebView (`window.speechSynthesis`), sin dependencia nueva |
| Estilos | CSS puro con tokens OKLCH, sin framework de utilidades |
| Pruebas TS | Vitest, junto al código fuente (`src/**/*.spec.ts`) |
| Pruebas Rust | `cargo test`, junto al código fuente (`#[cfg(test)]`) |
| Actualización | `tauri-plugin-updater` sobre GitHub Releases, firma Ed25519 propia |

## Puntos de entrada reales

- **`src/main.ts`** — único punto de entrada de Vite. Resuelve la etiqueta real de la ventana actual (`getCurrentWindowLabel()`, con `catch` a `'main'` si no hay runtime de Tauri — ej. `npm run dev` en un navegador puro) y monta **`App.vue`** para la ventana principal o **`PetView.vue`** para la ventana de mascota. No hay enrutador ni build separado por ventana: es el mismo bundle, la decisión es en tiempo de ejecución.
- **`src/dev-harness-main.ts`** + **`DevHarness.vue`** — segundo punto de entrada de Vite (`harness.html`, no `index.html`), monta un banco de pruebas aislado para `PoseEditor`/`AnimationTimelineEditor` sin necesitar una sesión real de Claude Code ni un personaje del catálogo cargado.
- **`src-tauri/src/main.rs`** — arranca el binario nativo, delega todo a `lib.rs`.
- **`src-tauri/src/lib.rs`** — registra los plugins de Tauri reales (`opener`, `dialog`, `notification`, `updater`, `process`), gestiona el estado compartido (`ClaudeSessionState`, `PendingRequestsState`), y registra los 32 comandos invocables reales (ver `reference.md` de este mismo documento para la lista completa).

## Mapa de dominios

Cada carpeta hermana de esta documenta un área funcional completa, verificada contra el código real de hoy:

| Dominio | Qué cubre |
|---|---|
| [sesion-y-transporte](../sesion-y-transporte/overview.md) | Proceso real de Claude Code, normalización de eventos, historial de sesiones, opciones de arranque |
| [chat-y-contenido](../chat-y-contenido/overview.md) | Composer, intérprete de bloques de contenido, comandos slash, peticiones de interacción |
| [gestion-de-personajes](../gestion-de-personajes/overview.md) | Catálogo, importación, editor de personaje, gate de licencia |
| [animacion-y-render](../animacion-y-render/overview.md) | Render VRM, controlador de avatar, editor de timeline/pose, exportación VRMA |
| [reacciones-y-voz](../reacciones-y-voz/overview.md) | Motor de reacciones deterministas, síntesis de voz, sincronización de boca |
| [presentacion-y-ventana](../presentacion-y-ventana/overview.md) | Modos FULL/COMPANION/PET, gestor de ventana, mascota de escritorio, señales de atención |
| [administracion-y-configuracion](../administracion-y-configuracion/overview.md) | Panel de administración (plugins/MCP), configuración persistente, tema |
| [ui-compartida](../ui-compartida/overview.md) | Componentes reusables: selector, modal, panel de lista, iconos |
| [robustez-y-actualizaciones](../robustez-y-actualizaciones/overview.md) | Taxonomía de fallas, panel de depuración, actualización automática |
| [orquestacion-app](../orquestacion-app/overview.md) | `App.vue`: el componente raíz que conecta todos los dominios anteriores |

## Decisiones de arquitectura registradas

Cada decisión de arquitectura grande tiene su propio registro fechado en `docs/adr/` (formato MADR: contexto, opciones consideradas, consecuencias) — son registros históricos legítimos, **no se reescriben** aquí. Índice completo en `docs/adr/`; las más relevantes para orientarse:

- `0002-stack-tauri-rust-vue.md` — por qué Tauri+Rust+Vue y no Electron u otra combinación; Windows-exclusivo.
- `0003-reacciones-deterministas.md` — por qué el motor de reacciones es una tabla de datos, no un modelo.
- `0004-presentacion-centralizada.md` — por qué existe un único `PresentationManager`.
- `0005-verificacion-sin-hardware-dedicado.md` — un criterio de QA que exige hardware para verificarse es un criterio defectuoso, no una limitación real.
- `0006-transporte-claude-code-stream-json.md` — por qué `stream-json` sobre `stdin`/`stdout` y no otro protocolo.
- `0008-transparencia-fija-en-creacion-de-ventana.md` — por qué la ventana nace transparente y no se alterna en runtime.
- `0009-formato-avatar-vrm.md` — por qué VRM como formato de avatar.
- `0014-windows-exclusivo-para-distribucion-publica.md` — confirma que no hay bloqueo estructural para otras plataformas, pero la distribución pública es Windows-exclusiva por decisión.

## Qué NO es este proyecto

- No es un editor de creación de personajes desde cero — el editor incluido **ajusta** personajes VRM/Live2D ya existentes.
- No implementa un segundo agente de IA para decidir reacciones ni contenido — todo lo que "decide" el avatar sale de datos deterministas.
- No abre ninguna terminal externa como mecanismo de visualización.
- No simula pulsaciones ni clics sobre el menú interactivo real de Claude Code.

## Qué reemplaza esta documentación

`docs/specs/` (esta carpeta) es el único conjunto de documentos técnicos mantenido como espejo directo del código real, sin narrativa histórica. La carpeta `flujo_projects/` (documentación de negocio: Epics/Features/User Stories) y la carpeta raíz `specs/` (planes y diseños por feature, con hitos y fechas de cierre) fueron artefactos del proceso de construcción — se retiraron del repositorio una vez esta documentación quedó completa y validada contra el código; no forman parte del árbol actual. Ante cualquier discrepancia con material más antiguo que sobreviva en otro lugar (`docs/reference/` histórico, `docs/adr/`), esta documentación (`docs/specs/`) manda.

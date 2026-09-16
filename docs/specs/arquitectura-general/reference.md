# Arquitectura general — referencia

## Registro completo de comandos Tauri (`src-tauri/src/lib.rs`)

Los 32 comandos reales invocables desde el frontend (`tauri::generate_handler!`), en el orden exacto en que están registrados. Cada uno se documenta en detalle en el `reference.md` del dominio al que pertenece — esta tabla es el índice completo para no perder ninguno.

| Comando | Módulo Rust real | Dominio donde está documentado en detalle |
|---|---|---|
| `start_claude_session` | `claude_transport.rs` | [sesion-y-transporte](../sesion-y-transporte/reference.md) |
| `send_claude_instruction` | `claude_transport.rs` | [sesion-y-transporte](../sesion-y-transporte/reference.md) |
| `interrupt_claude_session` | `claude_transport.rs` | [sesion-y-transporte](../sesion-y-transporte/reference.md) |
| `close_claude_session` | `claude_transport.rs` | [sesion-y-transporte](../sesion-y-transporte/reference.md) |
| `respond_to_permission_request` | `claude_transport.rs` | [chat-y-contenido](../chat-y-contenido/reference.md) |
| `get_last_session_preference` | `session_preferences.rs` | [sesion-y-transporte](../sesion-y-transporte/reference.md) |
| `list_plugins` | `claude_admin.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `set_plugin_enabled` | `claude_admin.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `list_available_plugins` | `claude_admin.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `install_plugin` | `claude_admin.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `uninstall_plugin` | `claude_admin.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `get_plugin_details` | `claude_admin.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `add_plugin_marketplace` | `claude_admin.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `list_mcp_servers` | `claude_admin.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `add_mcp_server` | `claude_admin.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `remove_mcp_server` | `claude_admin.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `authenticate_mcp` | `claude_admin.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `clear_mcp_authentication` | `claude_admin.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `read_admin_settings` | `claude_admin.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `import_character_file` | `character_import.rs` | [gestion-de-personajes](../gestion-de-personajes/reference.md) |
| `list_imported_characters` | `character_import.rs` | [gestion-de-personajes](../gestion-de-personajes/reference.md) |
| `import_animation_file` | `animation_import.rs` | [animacion-y-render](../animacion-y-render/reference.md) |
| `list_imported_animations` | `animation_import.rs` | [animacion-y-render](../animacion-y-render/reference.md) |
| `save_created_animation_file` | `animation_import.rs` | [animacion-y-render](../animacion-y-render/reference.md) |
| `get_app_settings` | `app_settings.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `set_global_app_settings` | `app_settings.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `set_project_app_settings` | `app_settings.rs` | [administracion-y-configuracion](../administracion-y-configuracion/reference.md) |
| `clear_pet_window_menu` | `lib.rs` | [presentacion-y-ventana](../presentacion-y-ventana/reference.md) |
| `list_project_folders` | `session_history.rs` | [sesion-y-transporte](../sesion-y-transporte/reference.md) |
| `list_project_sessions` | `session_history.rs` | [sesion-y-transporte](../sesion-y-transporte/reference.md) |
| `read_session_transcript` | `session_history.rs` | [sesion-y-transporte](../sesion-y-transporte/reference.md) |
| `read_session_activity_events` | `session_history.rs` | [sesion-y-transporte](../sesion-y-transporte/reference.md) |

## Plugins de Tauri reales registrados (`lib.rs`)

En el orden exacto de registro:

1. `tauri_plugin_opener::init()` — abrir URLs/archivos con la aplicación por defecto del sistema (usado por el interceptor de enlaces externos, ver [ui-compartida](../ui-compartida/overview.md)).
2. `tauri_plugin_dialog::init()` — diálogos nativos de archivo (importar personaje, importar animación).
3. `tauri_plugin_notification::init()` — notificaciones del sistema operativo (señales de atención en modo mascota).
4. `tauri_plugin_updater::Builder::new().build()` — actualización automática sobre GitHub Releases.
5. `tauri_plugin_process::init()` — `relaunch()` tras instalar una actualización.

## Estado compartido real (`.manage(...)`)

- `ClaudeSessionState` — el proceso hijo activo de Claude Code (a lo sumo uno), su `stdin` y su canal de control.
- `PendingRequestsState` — mapa en memoria de peticiones de permiso reales pendientes de respuesta, correlacionadas por `request_id`.

## Módulos Rust reales (`src-tauri/src/`)

| Archivo | Responsabilidad real |
|---|---|
| `main.rs` | Arranque del binario, delega a `lib.rs` |
| `lib.rs` | Registro de plugins, estado compartido, los 32 comandos, manejo de cierre de ventana |
| `claude_transport.rs` | Ciclo de vida del proceso real de Claude Code |
| `event_normalizer.rs` | JSON crudo del proceso → `ClaudeEvent` normalizado |
| `raw_log.rs` | Registro NDJSON append-only de la salida cruda |
| `session_preferences.rs` | Última carpeta/sesión usada, para "Retomar" |
| `session_history.rs` | Lectura de sesiones pasadas reales desde `~/.claude/projects/` |
| `app_settings.rs` | `AppSettings` persistido, alcance global y por proyecto |
| `claude_admin.rs` | Comandos reales `claude plugin`/`claude mcp` contra el binario `claude` |
| `character_import.rs` | Validación e importación de archivos de personaje |
| `animation_import.rs` | Validación e importación/exportación de archivos `.vrma` |
| `interaction_request.rs` | Tipo `InteractionRequest` y su parseo desde `control_request` |

## Convenciones de código verificadas en el repositorio real

- **Comentarios**: tolerancia cero a bloques o comentarios que expliquen QUÉ hace el código; solo se permite una línea cuando el POR QUÉ no es deducible del código mismo. Aplicado de forma determinista por un hook de pre-escritura (`scan-comments`) en este entorno de desarrollo — no es una convención solo de estilo, el propio flujo de trabajo la bloquea.
- **Estilos**: cero valores visuales (`color`, tamaño, sombra) escritos directamente en un componente — todo sale de `src/assets/styles/constants.css`.
- **Pruebas junto al código fuente**: cada `archivo.ts` con lógica de negocio real tiene su `archivo.spec.ts` hermano en la misma carpeta (no una carpeta `__tests__/` separada). Lado Rust: `#[cfg(test)] mod tests` al final del mismo archivo.
- **Exención real de pruebas de componente**: `vitest.config.ts` usa `environment: 'node'` sin `@vue/test-utils` ni `jsdom` instalados — **ningún componente `.vue` del proyecto tiene una prueba unitaria propia** por esta razón estructural (confirmado: es la misma exención citada de forma repetida en cada dominio con componentes). La verificación de comportamiento de UI real se hace en vivo (Playwright/CDP contra la aplicación real), no con pruebas unitarias de componente.

mod animation_import;
mod app_settings;
mod character_import;
mod claude_admin;
pub mod claude_transport;
mod event_normalizer;
mod interaction_request;
mod raw_log;
mod session_history;
mod session_preferences;

use animation_import::{
    import_animation_file, list_imported_animations, save_created_animation_file,
};
use app_settings::{get_app_settings, set_global_app_settings, set_project_app_settings};
use character_import::{import_character_file, list_imported_characters};
use claude_admin::{
    add_mcp_server, add_plugin_marketplace, authenticate_mcp, clear_mcp_authentication,
    get_plugin_details, install_plugin, list_available_plugins, list_mcp_servers, list_plugins,
    read_admin_settings, remove_mcp_server, set_plugin_enabled, uninstall_plugin,
};
use claude_transport::{
    close_claude_session, interrupt_claude_session, respond_to_permission_request,
    send_claude_instruction, start_claude_session, ClaudeSessionState, PendingRequestsState,
};
use session_history::{
    list_project_folders, list_project_sessions, read_session_activity_events,
    read_session_transcript,
};
use session_preferences::get_last_session_preference;
use tauri::Manager;

// AC-090: `menu.setAsAppMenu()` (native-menu.ts) aplica el menu nativo a toda ventana nueva por omision en Windows/Linux, incluida la mascota sin decoracion -- confirmado en vivo: reservaba ~20px de alto pese a `decorations: false`. Idempotente: no falla si la ventana aun no existe.
#[tauri::command]
fn clear_pet_window_menu(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("pet") {
        window.remove_menu().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ClaudeSessionState::default())
        .manage(PendingRequestsState::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app_handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = app_handle.state::<ClaudeSessionState>();
                    let _ = close_claude_session(state).await;
                    app_handle.exit(0);
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            start_claude_session,
            send_claude_instruction,
            interrupt_claude_session,
            close_claude_session,
            respond_to_permission_request,
            get_last_session_preference,
            list_plugins,
            set_plugin_enabled,
            list_available_plugins,
            install_plugin,
            uninstall_plugin,
            get_plugin_details,
            add_plugin_marketplace,
            list_mcp_servers,
            add_mcp_server,
            remove_mcp_server,
            authenticate_mcp,
            clear_mcp_authentication,
            read_admin_settings,
            import_character_file,
            list_imported_characters,
            import_animation_file,
            list_imported_animations,
            save_created_animation_file,
            get_app_settings,
            set_global_app_settings,
            set_project_app_settings,
            clear_pet_window_menu,
            list_project_folders,
            list_project_sessions,
            read_session_transcript,
            read_session_activity_events
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

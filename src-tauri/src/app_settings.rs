use crate::claude_transport::SessionStartOptions;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::io;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

const GLOBAL_SETTINGS_FILE: &str = "app-settings.json";
const PROJECT_SETTINGS_PREFIX: &str = "app-settings.project-";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowSize {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetWindowPosition {
    pub x: i32,
    pub y: i32,
}

// presentation-manager.ts::PET_WINDOW_SIZE/PET_WINDOW_CORNER/DEFAULT_STATE; character-editor.ts::DEFAULT_CHARACTER_SIZE.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub corner: String,
    pub window_size: WindowSize,
    pub opacity: f32,
    pub always_on_top: bool,
    pub monitor: String,
    pub initial_mode: String,
    pub activity_visibility: String,
    // None = usa el token CSS por defecto, no un ancho fijo en px.
    pub chat_column_width_px: Option<u32>,
    // None = usa el naranja de Claude por defecto (--color-primary-rgb en constants.css).
    pub primary_color_rgb: Option<[u8; 3]>,
    // None = arranca con los 6 flags fijos de siempre (build_startup_args), sin ninguna opcion extra.
    pub session_start_options: Option<SessionStartOptions>,
    // None = usa el calculo de esquina (corner) en vez de un punto arrastrado; #[serde(default)] tolera JSON escrito antes de este campo o sin la clave (undefined en el lado TS).
    #[serde(default)]
    pub pet_window_position: Option<PetWindowPosition>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            corner: "bottom-right".to_string(),
            window_size: WindowSize {
                width: 200,
                height: 200,
            },
            opacity: 1.0,
            always_on_top: true,
            monitor: String::new(),
            initial_mode: "FULL".to_string(),
            activity_visibility: "VISIBLE".to_string(),
            chat_column_width_px: None,
            primary_color_rgb: None,
            session_start_options: None,
            pet_window_position: None,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsPartial {
    pub corner: Option<String>,
    pub window_size: Option<WindowSize>,
    pub opacity: Option<f32>,
    pub always_on_top: Option<bool>,
    pub monitor: Option<String>,
    pub initial_mode: Option<String>,
    pub activity_visibility: Option<String>,
    pub chat_column_width_px: Option<u32>,
    pub primary_color_rgb: Option<[u8; 3]>,
    pub session_start_options: Option<SessionStartOptions>,
    pub pet_window_position: Option<PetWindowPosition>,
}

fn merge(global: AppSettings, partial: AppSettingsPartial) -> AppSettings {
    AppSettings {
        corner: partial.corner.unwrap_or(global.corner),
        window_size: partial.window_size.unwrap_or(global.window_size),
        opacity: partial.opacity.unwrap_or(global.opacity),
        always_on_top: partial.always_on_top.unwrap_or(global.always_on_top),
        monitor: partial.monitor.unwrap_or(global.monitor),
        initial_mode: partial.initial_mode.unwrap_or(global.initial_mode),
        activity_visibility: partial
            .activity_visibility
            .unwrap_or(global.activity_visibility),
        chat_column_width_px: partial
            .chat_column_width_px
            .or(global.chat_column_width_px),
        primary_color_rgb: partial.primary_color_rgb.or(global.primary_color_rgb),
        session_start_options: partial
            .session_start_options
            .or(global.session_start_options),
        pet_window_position: partial.pet_window_position.or(global.pet_window_position),
    }
}

// DefaultHasher::new() usa claves fijas (0, 0): mismo cwd produce siempre el mismo hash entre arranques.
fn project_hash(cwd: &str) -> String {
    let mut hasher = DefaultHasher::new();
    cwd.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn global_settings_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(GLOBAL_SETTINGS_FILE)
}

fn project_settings_path(app_data_dir: &Path, cwd: &str) -> PathBuf {
    app_data_dir.join(format!("{PROJECT_SETTINGS_PREFIX}{}.json", project_hash(cwd)))
}

enum ReadOutcome<T> {
    Loaded(T),
    Missing,
    Invalid,
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> ReadOutcome<T> {
    let content = match std::fs::read_to_string(path) {
        Ok(content) => content,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return ReadOutcome::Missing,
        Err(_) => return ReadOutcome::Invalid,
    };
    match serde_json::from_str(&content) {
        Ok(value) => ReadOutcome::Loaded(value),
        Err(_) => ReadOutcome::Invalid,
    }
}

fn write_json<T: Serialize>(app_data_dir: &Path, path: &Path, value: &T) -> io::Result<()> {
    std::fs::create_dir_all(app_data_dir)?;
    let serialized = serde_json::to_string(value)
        .map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))?;
    std::fs::write(path, serialized)
}

// bool = used_defaults: true solo si el archivo global existia pero no se pudo usar (parseo invalido u otro error real); un archivo ausente es primer uso legitimo, no una falla.
pub fn read_global_settings(app_data_dir: &Path) -> (AppSettings, bool) {
    match read_json(&global_settings_path(app_data_dir)) {
        ReadOutcome::Loaded(settings) => (settings, false),
        ReadOutcome::Missing => (AppSettings::default(), false),
        ReadOutcome::Invalid => (AppSettings::default(), true),
    }
}

pub fn write_global_settings(app_data_dir: &Path, settings: &AppSettings) -> io::Result<()> {
    write_json(app_data_dir, &global_settings_path(app_data_dir), settings)
}

// bool = used_defaults: true solo si el archivo de proyecto existia pero no se pudo usar; ver read_global_settings.
pub fn read_project_settings(app_data_dir: &Path, cwd: &str) -> (Option<AppSettingsPartial>, bool) {
    match read_json(&project_settings_path(app_data_dir, cwd)) {
        ReadOutcome::Loaded(partial) => (Some(partial), false),
        ReadOutcome::Missing => (None, false),
        ReadOutcome::Invalid => (None, true),
    }
}

pub fn write_project_settings(
    app_data_dir: &Path,
    cwd: &str,
    partial: &AppSettingsPartial,
) -> io::Result<()> {
    write_json(app_data_dir, &project_settings_path(app_data_dir, cwd), partial)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsResolution {
    pub settings: AppSettings,
    pub used_defaults: bool,
}

pub fn resolve_settings(app_data_dir: &Path, project_cwd: Option<&str>) -> AppSettingsResolution {
    let (global, global_used_defaults) = read_global_settings(app_data_dir);
    let (partial, project_used_defaults) = match project_cwd {
        Some(cwd) => read_project_settings(app_data_dir, cwd),
        None => (None, false),
    };
    let settings = match partial {
        Some(partial) => merge(global, partial),
        None => global,
    };
    AppSettingsResolution {
        settings,
        used_defaults: global_used_defaults || project_used_defaults,
    }
}

fn resolve_app_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_app_settings<R: Runtime>(
    app: AppHandle<R>,
    cwd: Option<String>,
) -> AppSettingsResolution {
    let Ok(dir) = resolve_app_data_dir(&app) else {
        return AppSettingsResolution {
            settings: AppSettings::default(),
            used_defaults: true,
        };
    };
    resolve_settings(&dir, cwd.as_deref())
}

#[tauri::command]
pub fn set_global_app_settings<R: Runtime>(
    app: AppHandle<R>,
    settings: AppSettings,
) -> Result<(), String> {
    let dir = resolve_app_data_dir(&app)?;
    write_global_settings(&dir, &settings).map_err(|err| err.to_string())
}

#[tauri::command]
pub fn set_project_app_settings<R: Runtime>(
    app: AppHandle<R>,
    cwd: String,
    partial_settings: AppSettingsPartial,
) -> Result<(), String> {
    let dir = resolve_app_data_dir(&app)?;
    write_project_settings(&dir, &cwd, &partial_settings).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "app-settings-test-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn archivo_global_ausente_devuelve_los_valores_por_omision_sin_marcarlo_como_fallo() {
        let dir = temp_dir("global-ausente");
        let resolved = resolve_settings(&dir, None);
        assert_eq!(resolved.settings, AppSettings::default());
        assert!(
            !resolved.used_defaults,
            "primer uso legitimo (archivo ausente) no deberia marcarse como fallo de lectura"
        );
    }

    #[test]
    fn archivo_de_proyecto_ausente_no_marca_used_defaults_si_el_global_esta_bien() {
        let dir = temp_dir("proyecto-ausente");
        let mut global = AppSettings::default();
        global.corner = "top-left".to_string();
        write_global_settings(&dir, &global).expect("escribir global");

        let resolved = resolve_settings(&dir, Some("C:\\proyecto\\sin\\archivo\\propio"));

        assert_eq!(resolved.settings, global);
        assert!(
            !resolved.used_defaults,
            "un archivo de proyecto ausente es tan legitimo como uno global ausente"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn archivo_de_proyecto_corrupto_si_marca_used_defaults_aunque_el_global_este_bien() {
        let dir = temp_dir("proyecto-corrupto");
        let global = AppSettings::default();
        write_global_settings(&dir, &global).expect("escribir global");

        let cwd = "C:\\proyecto\\con\\archivo\\corrupto";
        std::fs::write(project_settings_path(&dir, cwd), "esto no es json {{{")
            .expect("escribir proyecto corrupto");

        let resolved = resolve_settings(&dir, Some(cwd));

        assert_eq!(resolved.settings, global);
        assert!(
            resolved.used_defaults,
            "un archivo de proyecto que existe pero no parsea SI es un fallo real"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn archivo_global_vacio_devuelve_los_valores_por_omision_y_lo_senala() {
        let dir = temp_dir("global-vacio");
        std::fs::create_dir_all(&dir).expect("crear dir de prueba");
        std::fs::write(global_settings_path(&dir), "").expect("escribir archivo vacio");

        let resolved = resolve_settings(&dir, None);
        assert_eq!(resolved.settings, AppSettings::default());
        assert!(resolved.used_defaults);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn archivo_global_corrupto_devuelve_los_valores_por_omision_y_lo_senala() {
        let dir = temp_dir("global-corrupto");
        std::fs::create_dir_all(&dir).expect("crear dir de prueba");
        std::fs::write(global_settings_path(&dir), "esto no es json {{{")
            .expect("escribir corrupto");

        let resolved = resolve_settings(&dir, None);
        assert_eq!(resolved.settings, AppSettings::default());
        assert!(resolved.used_defaults);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn escribir_y_leer_una_preferencia_global_real_es_el_camino_feliz_y_no_marca_defaults() {
        let dir = temp_dir("camino-feliz-global");
        let mut settings = AppSettings::default();
        settings.corner = "top-left".to_string();
        settings.opacity = 0.5;

        write_global_settings(&dir, &settings).expect("escribir configuracion global");
        let resolved = resolve_settings(&dir, None);

        assert_eq!(resolved.settings, settings);
        assert!(!resolved.used_defaults);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn override_parcial_de_proyecto_gana_solo_en_los_campos_presentes() {
        let dir = temp_dir("override-parcial");
        let mut global = AppSettings::default();
        global.corner = "top-left".to_string();
        global.opacity = 0.8;
        write_global_settings(&dir, &global).expect("escribir global");

        let cwd = "C:\\Users\\ejemplo\\proyecto";
        let partial = AppSettingsPartial {
            opacity: Some(0.3),
            ..Default::default()
        };
        write_project_settings(&dir, cwd, &partial).expect("escribir proyecto");

        let resolved = resolve_settings(&dir, Some(cwd));

        assert_eq!(resolved.settings.opacity, 0.3);
        assert_eq!(resolved.settings.corner, "top-left");
        assert!(!resolved.used_defaults);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn chat_column_width_px_ausente_por_omision_y_el_override_de_proyecto_lo_fija() {
        let dir = temp_dir("chat-column-width");
        let global = AppSettings::default();
        write_global_settings(&dir, &global).expect("escribir global");

        let resolved_sin_override = resolve_settings(&dir, None);
        assert_eq!(resolved_sin_override.settings.chat_column_width_px, None);

        let cwd = "C:\\Users\\ejemplo\\proyecto-ancho";
        let partial = AppSettingsPartial {
            chat_column_width_px: Some(500),
            ..Default::default()
        };
        write_project_settings(&dir, cwd, &partial).expect("escribir proyecto");

        let resolved_con_override = resolve_settings(&dir, Some(cwd));
        assert_eq!(
            resolved_con_override.settings.chat_column_width_px,
            Some(500)
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn primary_color_rgb_ausente_por_omision_y_el_global_lo_fija() {
        let dir = temp_dir("primary-color-rgb");
        let global = AppSettings::default();
        write_global_settings(&dir, &global).expect("escribir global");

        let resolved_sin_override = resolve_settings(&dir, None);
        assert_eq!(resolved_sin_override.settings.primary_color_rgb, None);

        let mut global_con_color = AppSettings::default();
        global_con_color.primary_color_rgb = Some([100, 150, 200]);
        write_global_settings(&dir, &global_con_color).expect("escribir global");

        let resolved_con_color = resolve_settings(&dir, None);
        assert_eq!(
            resolved_con_color.settings.primary_color_rgb,
            Some([100, 150, 200])
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pet_window_position_ausente_por_omision_y_el_global_lo_fija() {
        let dir = temp_dir("pet-window-position");
        let global = AppSettings::default();
        write_global_settings(&dir, &global).expect("escribir global");

        let resolved_sin_override = resolve_settings(&dir, None);
        assert_eq!(resolved_sin_override.settings.pet_window_position, None);

        let mut global_con_posicion = AppSettings::default();
        global_con_posicion.pet_window_position = Some(PetWindowPosition { x: 1200, y: 640 });
        write_global_settings(&dir, &global_con_posicion).expect("escribir global");

        let resolved_con_posicion = resolve_settings(&dir, None);
        assert_eq!(
            resolved_con_posicion.settings.pet_window_position,
            Some(PetWindowPosition { x: 1200, y: 640 })
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pet_window_position_sin_la_clave_en_el_json_se_deserializa_como_none_por_serde_default() {
        let dir = temp_dir("pet-window-position-json-sin-clave");
        std::fs::create_dir_all(&dir).expect("crear dir de prueba");
        let mut value = serde_json::to_value(AppSettings::default()).expect("serializar default");
        value
            .as_object_mut()
            .expect("objeto json")
            .remove("petWindowPosition");
        std::fs::write(global_settings_path(&dir), value.to_string())
            .expect("escribir json sin la clave");

        let resolved = resolve_settings(&dir, None);

        assert_eq!(resolved.settings.pet_window_position, None);
        assert!(
            !resolved.used_defaults,
            "un JSON escrito antes de este campo no deberia tratarse como corrupto"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn proyecto_sin_archivo_propio_usa_el_global_completo() {
        let dir = temp_dir("proyecto-sin-archivo");
        let mut global = AppSettings::default();
        global.monitor = "monitor-1".to_string();
        write_global_settings(&dir, &global).expect("escribir global");

        let resolved = resolve_settings(&dir, Some("C:\\otro\\proyecto\\sin\\override"));

        assert_eq!(resolved.settings, global);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn dos_cwd_con_caracteres_no_ascii_o_separadores_distintos_no_colisionan() {
        let dir = temp_dir("cwd-raros");
        let cwd_a = "C:\\Users\\<usuario>\\Proyecto ñ 日本語 (copia)";
        let cwd_b = "C:/Users/<usuario>/Proyecto n 日本語";

        let partial_a = AppSettingsPartial {
            corner: Some("top-left".to_string()),
            ..Default::default()
        };
        let partial_b = AppSettingsPartial {
            corner: Some("bottom-left".to_string()),
            ..Default::default()
        };
        write_project_settings(&dir, cwd_a, &partial_a).expect("escribir proyecto a");
        write_project_settings(&dir, cwd_b, &partial_b).expect("escribir proyecto b");

        assert_eq!(resolve_settings(&dir, Some(cwd_a)).settings.corner, "top-left");
        assert_eq!(resolve_settings(&dir, Some(cwd_b)).settings.corner, "bottom-left");
        assert_ne!(
            project_settings_path(&dir, cwd_a),
            project_settings_path(&dir, cwd_b)
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}

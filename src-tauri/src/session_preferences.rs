use serde::{Deserialize, Serialize};
use std::io;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

const PREFERENCES_FILE: &str = "preferences.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPreference {
    pub last_working_directory: String,
    pub last_session_id: String,
}

fn preferences_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(PREFERENCES_FILE)
}

pub fn read_preference(app_data_dir: &Path) -> Option<SessionPreference> {
    let content = std::fs::read_to_string(preferences_path(app_data_dir)).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn write_preference(app_data_dir: &Path, preference: &SessionPreference) -> io::Result<()> {
    std::fs::create_dir_all(app_data_dir)?;
    let serialized = serde_json::to_string(preference)
        .map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))?;
    std::fs::write(preferences_path(app_data_dir), serialized)
}

#[tauri::command]
pub fn get_last_session_preference<R: Runtime>(app: AppHandle<R>) -> Option<SessionPreference> {
    let dir = app.path().app_data_dir().ok()?;
    read_preference(&dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "session-prefs-test-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn primer_arranque_sin_archivo_de_preferencias_devuelve_none() {
        let dir = temp_dir("primer-arranque");
        assert!(read_preference(&dir).is_none());
    }

    #[test]
    fn archivo_de_preferencias_vacio_devuelve_none_sin_fallar() {
        let dir = temp_dir("vacio");
        std::fs::create_dir_all(&dir).expect("crear dir de prueba");
        std::fs::write(preferences_path(&dir), "").expect("escribir archivo vacio");

        assert!(read_preference(&dir).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn archivo_de_preferencias_corrupto_devuelve_none_sin_fallar() {
        let dir = temp_dir("corrupto");
        std::fs::create_dir_all(&dir).expect("crear dir de prueba");
        std::fs::write(preferences_path(&dir), "esto no es json {{{").expect("escribir corrupto");

        assert!(read_preference(&dir).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn ruta_guardada_que_ya_no_existe_en_disco_se_lee_igual_sin_validarla_aqui() {
        let dir = temp_dir("ruta-inexistente");
        let preference = SessionPreference {
            last_working_directory: "C:\\una-ruta-que-nunca-existio-12345".to_string(),
            last_session_id: "sess-1".to_string(),
        };
        write_preference(&dir, &preference).expect("escribir preferencia");

        let read = read_preference(&dir);

        assert_eq!(read, Some(preference));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn ruta_con_caracteres_no_habituales_se_conserva_intacta() {
        let dir = temp_dir("caracteres-raros");
        let preference = SessionPreference {
            last_working_directory: "C:\\Users\\<usuario>\\Proyecto ñ 日本語 (copia)".to_string(),
            last_session_id: "sess-\"con-comillas\"".to_string(),
        };
        write_preference(&dir, &preference).expect("escribir preferencia");

        let read = read_preference(&dir);

        assert_eq!(read, Some(preference));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn escribir_y_leer_una_preferencia_real_es_el_camino_feliz() {
        let dir = temp_dir("camino-feliz");
        let preference = SessionPreference {
            last_working_directory: "C:\\Users\\ejemplo\\proyecto".to_string(),
            last_session_id: "sess-abc-123".to_string(),
        };

        write_preference(&dir, &preference).expect("escribir preferencia");
        let read = read_preference(&dir).expect("la preferencia recien escrita se lee");

        assert_eq!(read, preference);
        let _ = std::fs::remove_dir_all(&dir);
    }
}

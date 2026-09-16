use serde::Serialize;
use std::fs::{File, OpenOptions};
use std::io;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

const RAW_SESSIONS_DIR: &str = "raw-sessions";

#[derive(Serialize)]
struct RawLogEntry<'a> {
    #[serde(rename = "receivedAt")]
    received_at_ms: u128,
    raw: &'a str,
}

pub struct RawLogWriter {
    file: Arc<Mutex<File>>,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or(0)
}

fn session_log_path(app_data_dir: &Path, session_started_at_ms: u128) -> PathBuf {
    app_data_dir
        .join(RAW_SESSIONS_DIR)
        .join(format!("session-{session_started_at_ms}.ndjson"))
}

fn write_entry(file: &Mutex<File>, raw_line: &str) -> io::Result<()> {
    let entry = RawLogEntry {
        received_at_ms: now_ms(),
        raw: raw_line,
    };
    let mut serialized = serde_json::to_vec(&entry)
        .map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))?;
    serialized.push(b'\n');
    let mut guard = file.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    guard.write_all(&serialized)?;
    guard.flush()
}

impl RawLogWriter {
    pub fn create(app_data_dir: &Path) -> io::Result<Self> {
        let dir = app_data_dir.join(RAW_SESSIONS_DIR);
        std::fs::create_dir_all(&dir)?;
        let path = session_log_path(app_data_dir, now_ms());
        let file = OpenOptions::new().create(true).append(true).open(path)?;
        Ok(Self {
            file: Arc::new(Mutex::new(file)),
        })
    }

    pub async fn append(&self, raw_line: &str) -> io::Result<()> {
        let file = Arc::clone(&self.file);
        let raw_line = raw_line.to_owned();
        tokio::task::spawn_blocking(move || write_entry(&file, &raw_line))
            .await
            .unwrap_or_else(|join_err| {
                Err(io::Error::other(format!(
                    "tarea de escritura del registro crudo no completo: {join_err}"
                )))
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("raw-log-test-{name}-{}", now_ms()));
        dir
    }

    fn read_entries(app_data_dir: &Path) -> Vec<serde_json::Value> {
        let sessions_dir = app_data_dir.join(RAW_SESSIONS_DIR);
        let file_path = std::fs::read_dir(&sessions_dir)
            .expect("raw-sessions dir existe")
            .next()
            .expect("hay al menos un archivo de sesion")
            .expect("entrada de directorio legible")
            .path();
        std::fs::read_to_string(file_path)
            .expect("archivo de log legible")
            .lines()
            .map(|line| serde_json::from_str(line).expect("cada linea es JSON valido"))
            .collect()
    }

    #[tokio::test]
    async fn crear_con_ruta_invalida_devuelve_error_sin_panico() {
        let blocking_file = temp_dir("ruta-invalida-base");
        std::fs::write(&blocking_file, b"esto es un archivo, no un directorio")
            .expect("crear archivo bloqueante");
        let app_data_dir = blocking_file.join("no-puede-existir-dentro-de-un-archivo");

        let result = RawLogWriter::create(&app_data_dir);

        assert!(result.is_err());
        let _ = std::fs::remove_file(&blocking_file);
    }

    #[tokio::test]
    async fn escribir_una_linea_vacia_produce_una_entrada_valida() {
        let app_data_dir = temp_dir("linea-vacia");
        let writer = RawLogWriter::create(&app_data_dir).expect("writer se crea");

        writer.append("").await.expect("escribir vacio no falla");

        let entries = read_entries(&app_data_dir);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0]["raw"], "");
        let _ = std::fs::remove_dir_all(&app_data_dir);
    }

    #[tokio::test]
    async fn contenido_con_comillas_backslashes_y_saltos_de_linea_se_conserva_intacto() {
        let app_data_dir = temp_dir("caracteres-especiales");
        let writer = RawLogWriter::create(&app_data_dir).expect("writer se crea");
        let original = "linea con \"comillas\", \\barras\\ y un \n salto de linea embebido";

        writer.append(original).await.expect("escribir no falla");

        let entries = read_entries(&app_data_dir);
        assert_eq!(entries[0]["raw"].as_str().unwrap(), original);
        let _ = std::fs::remove_dir_all(&app_data_dir);
    }

    #[tokio::test]
    async fn escrituras_concurrentes_no_se_corrompen_entre_si() {
        let app_data_dir = temp_dir("concurrentes");
        let writer = Arc::new(RawLogWriter::create(&app_data_dir).expect("writer se crea"));

        let mut handles = Vec::new();
        for i in 0..20 {
            let writer = Arc::clone(&writer);
            handles.push(tokio::spawn(async move {
                writer.append(&format!("entrada-{i}")).await
            }));
        }
        for handle in handles {
            handle
                .await
                .expect("tarea termina")
                .expect("escritura no falla");
        }

        let entries = read_entries(&app_data_dir);
        assert_eq!(entries.len(), 20);
        let mut seen: Vec<String> = entries
            .iter()
            .map(|e| e["raw"].as_str().unwrap().to_string())
            .collect();
        seen.sort();
        let mut expected: Vec<String> = (0..20).map(|i| format!("entrada-{i}")).collect();
        expected.sort();
        assert_eq!(seen, expected);
        let _ = std::fs::remove_dir_all(&app_data_dir);
    }

    #[tokio::test]
    async fn sesion_completa_queda_en_orden_con_marca_de_tiempo_no_decreciente() {
        let app_data_dir = temp_dir("sesion-completa");
        let writer = RawLogWriter::create(&app_data_dir).expect("writer se crea");

        for i in 0..5 {
            writer
                .append(&format!("{{\"type\":\"evento\",\"n\":{i}}}"))
                .await
                .expect("escritura secuencial no falla");
        }

        let entries = read_entries(&app_data_dir);
        assert_eq!(entries.len(), 5);
        for (i, entry) in entries.iter().enumerate() {
            assert!(entry["raw"]
                .as_str()
                .unwrap()
                .contains(&format!("\"n\":{i}")));
        }
        for pair in entries.windows(2) {
            let earlier = pair[0]["receivedAt"].as_u64().unwrap();
            let later = pair[1]["receivedAt"].as_u64().unwrap();
            assert!(later >= earlier);
        }
        let _ = std::fs::remove_dir_all(&app_data_dir);
    }
}

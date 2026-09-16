use crate::event_normalizer::{normalize, ClaudeEvent};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

// Nunca se carga un archivo entero (hay sesiones de hasta 3MB): esta cota alcanza de sobra para una sola linea de cost-state, incluso con varios modelos.
const TAIL_READ_CAP_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cache_read_input_tokens: Option<u64>,
    pub cache_creation_input_tokens: Option<u64>,
    pub cost_usd: Option<f64>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub title: Option<String>,
    pub cwd: Option<String>,
    pub git_branch: Option<String>,
    pub cli_version: Option<String>,
    pub total_cost_usd: Option<f64>,
    pub total_duration_ms: Option<i64>,
    pub start_time_ms: Option<i64>,
    pub model_usage: Option<HashMap<String, ModelUsage>>,
}

// CLAUDE_CONFIG_DIR puede mover el historial (D15); vacio se trata como no definido.
fn claude_config_dir<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("CLAUDE_CONFIG_DIR") {
        if !dir.trim().is_empty() {
            return Some(PathBuf::from(dir));
        }
    }
    app.path().home_dir().ok().map(|home| home.join(".claude"))
}

fn projects_dir<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    claude_config_dir(app).map(|dir| dir.join("projects"))
}

const SCRATCHPAD_PROJECT_TEMP_MARKER: &str = "AppData-Local-Temp-claude-";
const SCRATCHPAD_PROJECT_SUFFIX_MARKER: &str = "-scratchpad";

// D5/H4: el propio scratchpad de una sesion aparece como una "carpeta de proyecto" mas (su cwd real vive bajo el temp de Claude Code) sin serlo.
fn is_scratchpad_project_folder(name: &str) -> bool {
    name.contains(SCRATCHPAD_PROJECT_TEMP_MARKER) && name.contains(SCRATCHPAD_PROJECT_SUFFIX_MARKER)
}

fn list_project_folders_in(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut folders: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| !is_scratchpad_project_folder(name))
        .collect();
    folders.sort();
    folders
}

#[tauri::command]
pub fn list_project_folders<R: Runtime>(app: AppHandle<R>) -> Vec<String> {
    let Some(dir) = projects_dir(&app) else {
        return Vec::new();
    };
    list_project_folders_in(&dir)
}

fn list_session_files_in(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("jsonl"))
        .collect();
    files.sort();
    files
}

#[tauri::command]
pub fn list_project_sessions<R: Runtime>(app: AppHandle<R>, folder: String) -> Vec<SessionSummary> {
    let Some(base) = projects_dir(&app) else {
        return Vec::new();
    };
    list_session_files_in(&base.join(folder))
        .iter()
        .map(|path| read_session_summary(path))
        .collect()
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptEntry {
    pub role: String,
    pub text: String,
}

// El content real trae dos formas segun el origen: string plano (sesion interactiva tecleada) o arreglo de bloques (protocolo stream-json del SDK, el que usa esta app) -- ambas se ven en produccion.
fn extract_text_content(content: &Value) -> Option<String> {
    if let Some(text) = content.as_str() {
        let trimmed = text.trim();
        return (!trimmed.is_empty()).then(|| trimmed.to_string());
    }
    let blocks = content.as_array()?;
    let text = blocks
        .iter()
        .filter(|block| block.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|block| block.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n");
    (!text.trim().is_empty()).then_some(text)
}

fn transcript_role(message_role: &str) -> Option<&'static str> {
    match message_role {
        "user" => Some("person"),
        "assistant" => Some("agent"),
        _ => None,
    }
}

// AC-113 paso 3: solo los turnos de texto de la conversacion principal -- ni subagentes (isSidechain) ni resultados de herramientas sin texto, alcanza con que no se vea en blanco.
fn read_transcript_entries(path: &Path) -> Vec<TranscriptEntry> {
    let Ok(file) = std::fs::File::open(path) else {
        return Vec::new();
    };
    let reader = std::io::BufReader::new(file);
    std::io::BufRead::lines(reader)
        .map_while(Result::ok)
        .filter_map(|line| serde_json::from_str::<Value>(&line).ok())
        .filter(|value| value.get("isSidechain").and_then(Value::as_bool) != Some(true))
        .filter(|value| value.get("isMeta").and_then(Value::as_bool) != Some(true))
        .filter_map(|value| {
            let message = value.get("message")?;
            let role = transcript_role(message.get("role")?.as_str()?)?;
            let text = extract_text_content(message.get("content")?)?;
            Some(TranscriptEntry {
                role: role.to_string(),
                text,
            })
        })
        .collect()
}

#[tauri::command]
pub fn read_session_transcript<R: Runtime>(
    app: AppHandle<R>,
    folder: String,
    session_id: String,
) -> Vec<TranscriptEntry> {
    let Some(base) = projects_dir(&app) else {
        return Vec::new();
    };
    read_transcript_entries(&base.join(folder).join(format!("{session_id}.jsonl")))
}

fn is_main_thread_line(line: &str) -> bool {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return true;
    };
    value.get("isSidechain").and_then(Value::as_bool) != Some(true)
        && value.get("isMeta").and_then(Value::as_bool) != Some(true)
}

// Mismo parser que el streaming en vivo (event_normalizer::normalize): la consola de Actividad al reanudar reusa el reductor de activity-console.ts en vez de un segundo camino.
fn read_activity_events(path: &Path) -> Vec<ClaudeEvent> {
    let Ok(file) = std::fs::File::open(path) else {
        return Vec::new();
    };
    let reader = std::io::BufReader::new(file);
    std::io::BufRead::lines(reader)
        .map_while(Result::ok)
        .filter(|line| is_main_thread_line(line))
        .map(|line| normalize(&line))
        .collect()
}

#[tauri::command]
pub fn read_session_activity_events<R: Runtime>(
    app: AppHandle<R>,
    folder: String,
    session_id: String,
) -> Vec<ClaudeEvent> {
    let Some(base) = projects_dir(&app) else {
        return Vec::new();
    };
    read_activity_events(&base.join(folder).join(format!("{session_id}.jsonl")))
}

fn session_id_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or_default()
        .to_string()
}

// AC-106: nunca propaga un fallo de parseo -- cada campo cae a None por su cuenta, la sesion nunca deja de listarse por eso.
fn read_session_summary(path: &Path) -> SessionSummary {
    let user_line = find_first_useful_user_line(path);
    let cost_state = find_last_cost_state(path);
    SessionSummary {
        id: session_id_from_path(path),
        title: user_line.as_ref().and_then(extract_title),
        cwd: user_line
            .as_ref()
            .and_then(|line| line.get("cwd"))
            .and_then(Value::as_str)
            .map(String::from),
        git_branch: user_line
            .as_ref()
            .and_then(|line| line.get("gitBranch"))
            .and_then(Value::as_str)
            .map(String::from),
        cli_version: user_line
            .as_ref()
            .and_then(|line| line.get("version"))
            .and_then(Value::as_str)
            .map(String::from),
        total_cost_usd: cost_state
            .as_ref()
            .and_then(|state| state.get("totalCostUSD"))
            .and_then(Value::as_f64),
        total_duration_ms: cost_state
            .as_ref()
            .and_then(|state| state.get("totalDuration"))
            .and_then(Value::as_i64),
        start_time_ms: cost_state
            .as_ref()
            .and_then(|state| state.get("startTime"))
            .and_then(Value::as_i64),
        model_usage: cost_state
            .as_ref()
            .and_then(|state| state.get("modelUsage"))
            .and_then(extract_model_usage),
    }
}

fn extract_title(user_line: &Value) -> Option<String> {
    let content = user_line.get("message")?.get("content")?.as_str()?;
    if content.trim().is_empty() {
        return None;
    }
    Some(content.to_string())
}

fn extract_model_usage(value: &Value) -> Option<HashMap<String, ModelUsage>> {
    let map = value.as_object()?;
    Some(
        map.iter()
            .map(|(model, usage)| {
                let parsed = ModelUsage {
                    input_tokens: usage.get("inputTokens").and_then(Value::as_u64),
                    output_tokens: usage.get("outputTokens").and_then(Value::as_u64),
                    cache_read_input_tokens: usage
                        .get("cacheReadInputTokens")
                        .and_then(Value::as_u64),
                    cache_creation_input_tokens: usage
                        .get("cacheCreationInputTokens")
                        .and_then(Value::as_u64),
                    cost_usd: usage.get("costUSD").and_then(Value::as_f64),
                };
                (model.clone(), parsed)
            })
            .collect(),
    )
}

fn is_useful_user_line(line: &Value) -> bool {
    line.get("type").and_then(Value::as_str) == Some("user")
        && line.get("isMeta").and_then(Value::as_bool) != Some(true)
}

// Avanza desde el principio y se detiene en la primera linea util -- nunca lee el archivo completo si no hace falta.
fn find_first_useful_user_line(path: &Path) -> Option<Value> {
    let file = std::fs::File::open(path).ok()?;
    let reader = std::io::BufReader::new(file);
    for line in std::io::BufRead::lines(reader) {
        let Ok(line) = line else { continue };
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if is_useful_user_line(&value) {
            return Some(value);
        }
    }
    None
}

// Lee solo la cola del archivo (TAIL_READ_CAP_BYTES) para no cargar sesiones de hasta 3MB enteras.
fn find_last_cost_state(path: &Path) -> Option<Value> {
    let mut file = std::fs::File::open(path).ok()?;
    let file_len = file.metadata().ok()?.len();
    let read_len = file_len.min(TAIL_READ_CAP_BYTES);
    file.seek(SeekFrom::End(-(read_len as i64))).ok()?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;
    // lossy: el punto de corte puede caer a mitad de un caracter multibyte al principio del buffer, que queda descartado con la primera linea parcial.
    let text = String::from_utf8_lossy(&buf);
    let last_line = text.lines().rev().find(|line| !line.trim().is_empty())?;
    let value: Value = serde_json::from_str(last_line).ok()?;
    if value.get("type").and_then(Value::as_str) == Some("cost-state") {
        Some(value)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "session-history-test-{name}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn write_session(dir: &Path, id: &str, content: &str) -> PathBuf {
        std::fs::create_dir_all(dir).expect("crear dir de prueba");
        let path = dir.join(format!("{id}.jsonl"));
        std::fs::write(&path, content).expect("escribir sesion de prueba");
        path
    }

    const USER_LINE: &str = r#"{"type":"user","message":{"role":"user","content":"hola, prueba real"},"cwd":"C:\\proyecto","gitBranch":"master","version":"2.1.258","sessionId":"s1"}"#;
    const META_LINE: &str = r#"{"type":"user","message":{"role":"user","content":"<local-command-caveat>...</local-command-caveat>"},"isMeta":true,"sessionId":"s1"}"#;
    const COST_LINE: &str = r#"{"type":"cost-state","totalCostUSD":1.5,"totalDuration":1000,"startTime":1700000000000,"modelUsage":{"claude-sonnet-5":{"inputTokens":10,"outputTokens":20,"costUSD":1.5}}}"#;

    #[test]
    fn carpeta_inexistente_devuelve_lista_vacia_sin_panico() {
        let dir = temp_dir("carpeta-inexistente");
        assert!(list_project_folders_in(&dir).is_empty());
    }

    #[test]
    fn carpeta_vacia_devuelve_lista_vacia() {
        let dir = temp_dir("carpeta-vacia");
        std::fs::create_dir_all(&dir).expect("crear dir de prueba");
        assert!(list_session_files_in(&dir).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn excluye_una_carpeta_de_scratchpad_sintetica_pero_conserva_un_proyecto_real() {
        let dir = temp_dir("scratchpad-filter");
        std::fs::create_dir_all(
            dir.join("C--Users-spook-AppData-Local-Temp-claude-C--Users-spook-OneDrive-Documents-VtuberXD-abc-scratchpad"),
        )
        .expect("crear dir scratchpad de prueba");
        std::fs::create_dir_all(dir.join("C--Users-spook-OneDrive-Documents-VtuberXD"))
            .expect("crear dir de proyecto real de prueba");

        let folders = list_project_folders_in(&dir);

        assert_eq!(folders, vec!["C--Users-spook-OneDrive-Documents-VtuberXD"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn jsonl_vacio_produce_una_sesion_sin_datos_por_su_id_de_archivo() {
        let dir = temp_dir("jsonl-vacio");
        let path = write_session(&dir, "sesion-vacia", "");

        let summary = read_session_summary(&path);

        assert_eq!(summary.id, "sesion-vacia");
        assert_eq!(summary.title, None);
        assert_eq!(summary.total_cost_usd, None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn jsonl_corrupto_a_media_linea_no_rompe_la_lectura_de_las_lineas_validas() {
        let dir = temp_dir("jsonl-corrupto");
        let content = format!("{USER_LINE}\nesto no es json {{{{{{\n{COST_LINE}\n");
        let path = write_session(&dir, "sesion-corrupta", &content);

        let summary = read_session_summary(&path);

        assert_eq!(summary.title, Some("hola, prueba real".to_string()));
        assert_eq!(summary.total_cost_usd, Some(1.5));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sesion_sin_cost_state_deja_costo_duracion_y_tokens_en_none_sin_fallar() {
        let dir = temp_dir("sin-cost-state");
        let content = format!("{USER_LINE}\n{{\"type\":\"mode\",\"mode\":\"normal\"}}\n");
        let path = write_session(&dir, "sesion-sin-costo", &content);

        let summary = read_session_summary(&path);

        assert_eq!(summary.title, Some("hola, prueba real".to_string()));
        assert_eq!(summary.total_cost_usd, None);
        assert_eq!(summary.total_duration_ms, None);
        assert_eq!(summary.model_usage, None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn sesion_cuyo_unico_mensaje_de_usuario_es_meta_no_produce_titulo() {
        let dir = temp_dir("solo-meta");
        let content = format!("{META_LINE}\n{COST_LINE}\n");
        let path = write_session(&dir, "sesion-solo-meta", &content);

        let summary = read_session_summary(&path);

        assert_eq!(summary.title, None);
        assert_eq!(summary.cwd, None);
        assert_eq!(summary.total_cost_usd, Some(1.5));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn model_usage_vacio_se_distingue_de_ausente() {
        let dir = temp_dir("model-usage-vacio");
        let content = format!(
            "{USER_LINE}\n{{\"type\":\"cost-state\",\"totalCostUSD\":0.0,\"modelUsage\":{{}}}}\n"
        );
        let path = write_session(&dir, "sesion-sin-modelos", &content);

        let summary = read_session_summary(&path);

        assert_eq!(summary.model_usage, Some(HashMap::new()));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn camino_feliz_con_dos_modelos_extrae_todos_los_campos() {
        let dir = temp_dir("camino-feliz");
        let content = format!(
            "{USER_LINE}\n{{\"type\":\"cost-state\",\"totalCostUSD\":2.75,\"totalDuration\":5000,\"startTime\":1700000000000,\"modelUsage\":{{\"claude-haiku-4-5-20251001\":{{\"inputTokens\":100,\"outputTokens\":50,\"costUSD\":0.25}},\"claude-sonnet-5\":{{\"inputTokens\":1000,\"outputTokens\":500,\"cacheReadInputTokens\":2000,\"costUSD\":2.5}}}}}}\n"
        );
        let path = write_session(&dir, "sesion-completa", &content);

        let summary = read_session_summary(&path);

        assert_eq!(summary.id, "sesion-completa");
        assert_eq!(summary.title, Some("hola, prueba real".to_string()));
        assert_eq!(summary.cwd, Some("C:\\proyecto".to_string()));
        assert_eq!(summary.git_branch, Some("master".to_string()));
        assert_eq!(summary.cli_version, Some("2.1.258".to_string()));
        assert_eq!(summary.total_cost_usd, Some(2.75));
        assert_eq!(summary.total_duration_ms, Some(5000));
        assert_eq!(summary.start_time_ms, Some(1700000000000));
        let usage = summary.model_usage.expect("modelUsage presente");
        assert_eq!(usage.len(), 2);
        assert_eq!(usage["claude-sonnet-5"].input_tokens, Some(1000));
        assert_eq!(usage["claude-sonnet-5"].cache_read_input_tokens, Some(2000));
        assert_eq!(usage["claude-haiku-4-5-20251001"].cost_usd, Some(0.25));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn transcript_extrae_texto_plano_y_bloques_por_igual() {
        let dir = temp_dir("transcript-formas-mixtas");
        let content = concat!(
            r#"{"message":{"role":"user","content":"hola en texto plano"}}"#,
            "\n",
            r#"{"message":{"role":"assistant","content":[{"type":"text","text":"respuesta en bloque"}]}}"#,
            "\n",
        );
        let path = write_session(&dir, "sesion-mixta", content);

        let entries = read_transcript_entries(&path);

        assert_eq!(
            entries,
            vec![
                TranscriptEntry {
                    role: "person".to_string(),
                    text: "hola en texto plano".to_string(),
                },
                TranscriptEntry {
                    role: "agent".to_string(),
                    text: "respuesta en bloque".to_string(),
                },
            ]
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn transcript_omite_subagentes_meta_y_turnos_sin_texto() {
        let dir = temp_dir("transcript-omitidos");
        let content = concat!(
            r#"{"isSidechain":true,"message":{"role":"user","content":"trabajo de subagente"}}"#,
            "\n",
            r#"{"isMeta":true,"message":{"role":"user","content":"aviso interno"}}"#,
            "\n",
            r#"{"message":{"role":"user","content":[{"type":"tool_result","content":"salida"}]}}"#,
            "\n",
            r#"{"message":{"role":"user","content":"turno real"}}"#,
            "\n",
        );
        let path = write_session(&dir, "sesion-con-ruido", content);

        let entries = read_transcript_entries(&path);

        assert_eq!(
            entries,
            vec![TranscriptEntry {
                role: "person".to_string(),
                text: "turno real".to_string(),
            }]
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn activity_events_normaliza_uso_de_herramienta_y_omite_subagentes() {
        let dir = temp_dir("activity-events");
        let content = concat!(
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","id":"toolu_1","input":{"command":"npm test"}}]}}"#,
            "\n",
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","is_error":false}]}}"#,
            "\n",
            r#"{"isSidechain":true,"type":"assistant","message":{"content":[{"type":"tool_use","name":"Grep","id":"toolu_2","input":{}}]}}"#,
            "\n",
        );
        let path = write_session(&dir, "sesion-con-actividad", content);

        let events = read_activity_events(&path);

        assert_eq!(
            events,
            vec![
                ClaudeEvent::CommandStarted {
                    command: "npm test".to_string(),
                    id: "toolu_1".to_string(),
                },
                ClaudeEvent::ToolFinished {
                    success: true,
                    tool_use_id: "toolu_1".to_string(),
                },
            ]
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn transcript_de_archivo_inexistente_devuelve_lista_vacia() {
        let dir = temp_dir("transcript-inexistente");
        let path = dir.join("no-existe.jsonl");

        assert!(read_transcript_entries(&path).is_empty());
    }

    #[test]
    fn no_carga_el_archivo_entero_para_leer_solo_la_cola() {
        let dir = temp_dir("no-carga-entero");
        // Un cuerpo mucho mas grande que TAIL_READ_CAP_BYTES para probar que la busqueda del cost-state solo toca la cola.
        let padding = "x".repeat((TAIL_READ_CAP_BYTES as usize) * 2);
        let content = format!("{USER_LINE}\n{padding}\n{COST_LINE}\n");
        let path = write_session(&dir, "sesion-grande", &content);

        let summary = read_session_summary(&path);

        assert_eq!(summary.total_cost_usd, Some(1.5));
        let _ = std::fs::remove_dir_all(&dir);
    }
}

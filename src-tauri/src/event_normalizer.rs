use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClaudeEvent {
    SessionStarted {
        session_id: String,
        sendable_commands: Vec<String>,
    },
    SessionFinished {
        session_id: String,
        is_error: bool,
        stop_reason: Option<String>,
        total_cost_usd: f64,
        input_tokens: u64,
        output_tokens: u64,
        cache_creation_input_tokens: u64,
        cache_read_input_tokens: u64,
    },
    AssistantMessage {
        text: String,
    },
    Thinking,
    FileRead {
        path: String,
    },
    FileModified {
        path: String,
    },
    CommandStarted {
        command: String,
        id: String,
    },
    ToolStarted {
        name: String,
        id: String,
    },
    ToolFinished {
        success: bool,
        tool_use_id: String,
    },
    // sin constructor: peticiones-interaccion.md sigue `proposed`, ningun evento crudo confirmado la dispara
    #[allow(dead_code)]
    InteractionRequired {
        text: String,
    },
    PermissionDenied {
        tool_name: String,
    },
    Unclassified {
        raw: String,
    },
}

const READ_TOOLS: &[&str] = &["Read"];
const WRITE_TOOLS: &[&str] = &["Write", "Edit", "MultiEdit", "NotebookEdit"];
const COMMAND_TOOLS: &[&str] = &["Bash", "PowerShell"];

/// Pura y sincrona: parsear+mapear no tiene forma de fallar, cualquier caso no reconocido cae en Unclassified.
pub fn normalize(raw_line: &str) -> ClaudeEvent {
    match serde_json::from_str::<Value>(raw_line) {
        Ok(value) => normalize_value(&value, raw_line),
        Err(_) => unclassified(raw_line),
    }
}

fn unclassified(raw_line: &str) -> ClaudeEvent {
    ClaudeEvent::Unclassified {
        raw: raw_line.to_string(),
    }
}

fn normalize_value(value: &Value, raw_line: &str) -> ClaudeEvent {
    match value.get("type").and_then(Value::as_str) {
        Some("system") => normalize_system(value, raw_line),
        Some("result") => normalize_result(value, raw_line),
        Some("assistant") => normalize_assistant(value, raw_line),
        Some("user") => normalize_user(value, raw_line),
        _ => unclassified(raw_line),
    }
}

fn normalize_system(value: &Value, raw_line: &str) -> ClaudeEvent {
    match value.get("subtype").and_then(Value::as_str) {
        Some("init") => match value.get("session_id").and_then(Value::as_str) {
            Some(session_id) => ClaudeEvent::SessionStarted {
                session_id: session_id.to_string(),
                sendable_commands: sendable_commands(value),
            },
            None => unclassified(raw_line),
        },
        Some("permission_denied") => match value.get("tool_name").and_then(Value::as_str) {
            Some(tool_name) => ClaudeEvent::PermissionDenied {
                tool_name: tool_name.to_string(),
            },
            None => unclassified(raw_line),
        },
        _ => unclassified(raw_line),
    }
}

fn string_array(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// AC-031.5/R12: los comandos de cliente (terminal_slash_commands) nunca son enviables a la sesion.
fn sendable_commands(value: &Value) -> Vec<String> {
    let terminal: std::collections::HashSet<String> =
        string_array(value, "terminal_slash_commands")
            .into_iter()
            .collect();
    let mut sendable: Vec<String> = string_array(value, "slash_commands")
        .into_iter()
        .filter(|cmd| !terminal.contains(cmd))
        .collect();
    sendable.sort();
    sendable
}

fn normalize_result(value: &Value, raw_line: &str) -> ClaudeEvent {
    let session_id = value.get("session_id").and_then(Value::as_str);
    let is_error = value.get("is_error").and_then(Value::as_bool);
    match (session_id, is_error) {
        (Some(session_id), Some(is_error)) => {
            let usage = value.get("usage");
            ClaudeEvent::SessionFinished {
                session_id: session_id.to_string(),
                is_error,
                stop_reason: value
                    .get("stop_reason")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                total_cost_usd: value
                    .get("total_cost_usd")
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0),
                input_tokens: usage_field(usage, "input_tokens"),
                output_tokens: usage_field(usage, "output_tokens"),
                cache_creation_input_tokens: usage_field(usage, "cache_creation_input_tokens"),
                cache_read_input_tokens: usage_field(usage, "cache_read_input_tokens"),
            }
        }
        _ => unclassified(raw_line),
    }
}

fn usage_field(usage: Option<&Value>, key: &str) -> u64 {
    usage
        .and_then(|u| u.get(key))
        .and_then(Value::as_u64)
        .unwrap_or(0)
}

fn normalize_assistant(value: &Value, raw_line: &str) -> ClaudeEvent {
    let blocks = value.pointer("/message/content").and_then(Value::as_array);
    match blocks.and_then(|blocks| blocks.iter().find_map(normalize_assistant_block)) {
        Some(event) => event,
        None => unclassified(raw_line),
    }
}

fn normalize_assistant_block(block: &Value) -> Option<ClaudeEvent> {
    match block.get("type").and_then(Value::as_str) {
        Some("text") => {
            block
                .get("text")
                .and_then(Value::as_str)
                .map(|text| ClaudeEvent::AssistantMessage {
                    text: text.to_string(),
                })
        }
        Some("thinking") => Some(ClaudeEvent::Thinking),
        Some("tool_use") => normalize_tool_use(block),
        _ => None,
    }
}

fn normalize_tool_use(block: &Value) -> Option<ClaudeEvent> {
    let name = block.get("name").and_then(Value::as_str)?;
    let input = block.get("input");
    if READ_TOOLS.contains(&name) {
        return tool_input_path(input).map(|path| ClaudeEvent::FileRead { path });
    }
    if WRITE_TOOLS.contains(&name) {
        return tool_input_path(input).map(|path| ClaudeEvent::FileModified { path });
    }
    let id = block.get("id").and_then(Value::as_str)?.to_string();
    if COMMAND_TOOLS.contains(&name) {
        return tool_input_command(input)
            .map(|command| ClaudeEvent::CommandStarted { command, id });
    }
    Some(ClaudeEvent::ToolStarted {
        name: name.to_string(),
        id,
    })
}

fn tool_input_path(input: Option<&Value>) -> Option<String> {
    input
        .and_then(|i| i.get("file_path"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn tool_input_command(input: Option<&Value>) -> Option<String> {
    input
        .and_then(|i| i.get("command"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn normalize_user(value: &Value, raw_line: &str) -> ClaudeEvent {
    let blocks = value.pointer("/message/content").and_then(Value::as_array);
    match blocks.and_then(|blocks| blocks.iter().find_map(normalize_user_block)) {
        Some(event) => event,
        None => unclassified(raw_line),
    }
}

fn normalize_user_block(block: &Value) -> Option<ClaudeEvent> {
    if block.get("type").and_then(Value::as_str) != Some("tool_result") {
        return None;
    }
    let tool_use_id = block.get("tool_use_id").and_then(Value::as_str)?.to_string();
    let is_error = block
        .get("is_error")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    Some(ClaudeEvent::ToolFinished {
        success: !is_error,
        tool_use_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixtures_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri tiene un padre")
            .join("docs/research/fixtures")
    }

    fn collect_event_lines(value: &Value, out: &mut Vec<String>) {
        match value {
            Value::Object(map) if map.contains_key("type") => {
                out.push(value.to_string());
            }
            Value::Object(map) => {
                for v in map.values() {
                    collect_event_lines(v, out);
                }
            }
            Value::Array(arr) => {
                for v in arr {
                    collect_event_lines(v, out);
                }
            }
            _ => {}
        }
    }

    fn all_fixture_lines() -> Vec<String> {
        let mut lines = Vec::new();
        for entry in std::fs::read_dir(fixtures_dir()).expect("directorio de fixtures existe") {
            let path = entry.expect("entrada legible").path();
            match path.extension().and_then(|e| e.to_str()) {
                Some("json") => {
                    let text = std::fs::read_to_string(&path).expect("fixture .json legible");
                    let value: Value =
                        serde_json::from_str(&text).expect("fixture .json es JSON valido");
                    collect_event_lines(&value, &mut lines);
                }
                Some("jsonl") => {
                    let text = std::fs::read_to_string(&path).expect("fixture .jsonl legible");
                    for line in text.lines().filter(|l| !l.trim().is_empty()) {
                        lines.push(line.to_string());
                    }
                }
                _ => {}
            }
        }
        lines
    }

    #[test]
    fn normalizar_un_json_invalido_no_hace_panico_y_cae_en_unclassified() {
        let event = normalize("esto no es json {{{");
        assert!(matches!(event, ClaudeEvent::Unclassified { raw } if raw == "esto no es json {{{"));
    }

    #[test]
    fn normalizar_una_linea_vacia_no_hace_panico() {
        let event = normalize("");
        assert!(matches!(event, ClaudeEvent::Unclassified { .. }));
    }

    #[test]
    fn un_subtype_de_sistema_no_reconocido_sigue_cayendo_en_unclassified() {
        let event = normalize(
            r#"{"type":"system","subtype":"hook_started","hook_id":"x","session_id":"s1"}"#,
        );
        assert!(matches!(event, ClaudeEvent::Unclassified { .. }));
    }

    #[test]
    fn permission_denied_sin_tool_name_no_inventa_una_herramienta() {
        let event = normalize(r#"{"type":"system","subtype":"permission_denied"}"#);
        assert!(matches!(event, ClaudeEvent::Unclassified { .. }));
    }

    #[test]
    fn permission_denied_con_tool_name_se_distingue_del_ruido_de_infraestructura() {
        let event =
            normalize(r#"{"type":"system","subtype":"permission_denied","tool_name":"Bash"}"#);
        assert!(matches!(
            event,
            ClaudeEvent::PermissionDenied { tool_name } if tool_name == "Bash"
        ));
    }

    #[test]
    fn evento_de_tipo_desconocido_no_se_descarta_se_conserva_como_unclassified() {
        let event = normalize(r#"{"type":"un_tipo_que_nunca_ha_existido","dato":42}"#);
        match event {
            ClaudeEvent::Unclassified { raw } => {
                assert!(raw.contains("un_tipo_que_nunca_ha_existido"));
            }
            other => panic!("se esperaba Unclassified, se obtuvo {other:?}"),
        }
    }

    #[test]
    fn tool_use_de_una_herramienta_de_archivo_sin_file_path_no_inventa_una_ruta() {
        let event = normalize(
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{}}]}}"#,
        );
        assert!(matches!(event, ClaudeEvent::Unclassified { .. }));
    }

    #[test]
    fn tool_use_de_comando_sin_id_no_inventa_un_identificador() {
        let event = normalize(
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"ls"}}]}}"#,
        );
        assert!(matches!(event, ClaudeEvent::Unclassified { .. }));
    }

    #[test]
    fn tool_use_de_comando_con_id_real_lo_propaga_en_command_started() {
        let event = normalize(
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","id":"toolu_1","input":{"command":"ls"}}]}}"#,
        );
        assert!(matches!(
            event,
            ClaudeEvent::CommandStarted { command, id }
                if command == "ls" && id == "toolu_1"
        ));
    }

    #[test]
    fn tool_use_generico_sin_id_no_inventa_un_identificador() {
        let event = normalize(
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Grep","input":{}}]}}"#,
        );
        assert!(matches!(event, ClaudeEvent::Unclassified { .. }));
    }

    #[test]
    fn tool_use_generico_con_id_real_lo_propaga_en_tool_started() {
        let event = normalize(
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Grep","id":"toolu_2","input":{}}]}}"#,
        );
        assert!(matches!(
            event,
            ClaudeEvent::ToolStarted { name, id }
                if name == "Grep" && id == "toolu_2"
        ));
    }

    #[test]
    fn tool_result_sin_tool_use_id_no_inventa_un_identificador() {
        let event = normalize(
            r#"{"type":"user","message":{"content":[{"type":"tool_result","is_error":false}]}}"#,
        );
        assert!(matches!(event, ClaudeEvent::Unclassified { .. }));
    }

    #[test]
    fn tool_result_con_tool_use_id_real_lo_propaga_en_tool_finished() {
        let event = normalize(
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","is_error":false}]}}"#,
        );
        assert!(matches!(
            event,
            ClaudeEvent::ToolFinished { success: true, tool_use_id }
                if tool_use_id == "toolu_1"
        ));
    }

    #[test]
    fn dos_muestras_identicas_seguidas_producen_el_mismo_resultado_sin_estado_compartido() {
        let raw = r#"{"type":"system","subtype":"init","session_id":"abc"}"#;
        assert_eq!(normalize(raw), normalize(raw));
    }

    #[test]
    fn aut02_cada_muestra_real_guardada_se_normaliza_sin_perder_informacion_ni_lanzar_excepcion() {
        let lines = all_fixture_lines();
        assert!(
            lines.len() > 20,
            "se esperaban decenas de eventos reales en las fixtures, se encontraron {}",
            lines.len()
        );
        for line in &lines {
            let event = normalize(line);
            match &event {
                ClaudeEvent::Unclassified { raw } => assert!(
                    !raw.is_empty() || line.is_empty(),
                    "Unclassified perdio el contenido crudo de: {line}"
                ),
                _ => {}
            }
        }
    }

    #[test]
    fn aut01_el_modelo_cubre_las_familias_de_eventos_confirmadas_sobre_datos_reales() {
        let lines = all_fixture_lines();
        let events: Vec<ClaudeEvent> = lines.iter().map(|l| normalize(l)).collect();

        let has = |pred: &dyn Fn(&ClaudeEvent) -> bool| events.iter().any(|e| pred(e));

        assert!(
            has(&|e| matches!(e, ClaudeEvent::SessionStarted { .. })),
            "familia 'inicio de sesion' no cubierta por ningun fixture real"
        );
        assert!(
            has(&|e| matches!(e, ClaudeEvent::SessionFinished { .. })),
            "familia 'fin de sesion' no cubierta"
        );
        assert!(
            has(&|e| matches!(e, ClaudeEvent::AssistantMessage { .. })),
            "familia 'mensajes del asistente' (texto) no cubierta"
        );
        assert!(
            has(&|e| matches!(e, ClaudeEvent::Thinking)),
            "familia 'mensajes del asistente' (thinking) no cubierta"
        );
        assert!(
            has(&|e| matches!(
                e,
                ClaudeEvent::ToolStarted { .. } | ClaudeEvent::FileRead { .. }
            )),
            "familia 'uso de herramientas' no cubierta"
        );
        assert!(
            has(&|e| matches!(
                e,
                ClaudeEvent::FileModified { .. } | ClaudeEvent::FileRead { .. }
            )),
            "familia 'lectura y modificacion de archivos' no cubierta"
        );
        assert!(
            has(&|e| matches!(e, ClaudeEvent::CommandStarted { .. })),
            "familia 'ejecucion de comandos' no cubierta"
        );
        assert!(
            has(
                &|e| matches!(e, ClaudeEvent::SessionFinished { is_error: true, .. })
                    || matches!(e, ClaudeEvent::ToolFinished { success: false, .. })
            ),
            "familia 'errores' no cubierta"
        );
    }

    #[test]
    fn listado_vacio_de_comandos_no_falla() {
        let raw = serde_json::json!({
            "type": "system", "subtype": "init", "session_id": "s1"
        });
        let event = normalize(&raw.to_string());
        assert!(matches!(
            event,
            ClaudeEvent::SessionStarted { sendable_commands, .. } if sendable_commands.is_empty()
        ));
    }

    #[test]
    fn un_comando_de_cliente_nunca_aparece_como_enviable() {
        let raw = serde_json::json!({
            "type": "system", "subtype": "init", "session_id": "s1",
            "slash_commands": ["doctor", "color", "flujo-core:flujo-implement"],
            "terminal_slash_commands": ["doctor", "color"]
        });
        let event = normalize(&raw.to_string());
        match event {
            ClaudeEvent::SessionStarted {
                sendable_commands, ..
            } => {
                assert!(!sendable_commands.contains(&"doctor".to_string()));
                assert!(!sendable_commands.contains(&"color".to_string()));
                assert_eq!(sendable_commands, vec!["flujo-core:flujo-implement"]);
            }
            other => panic!("se esperaba SessionStarted, se obtuvo {other:?}"),
        }
    }

    #[test]
    fn un_comando_repetido_en_la_lista_cruda_persiste_tras_el_orden_alfabetico() {
        let raw = serde_json::json!({
            "type": "system", "subtype": "init", "session_id": "s1",
            "slash_commands": ["doctor", "doctor"],
            "terminal_slash_commands": []
        });
        let event = normalize(&raw.to_string());
        assert!(matches!(
            event,
            ClaudeEvent::SessionStarted { sendable_commands, .. }
                if sendable_commands == vec!["doctor".to_string(), "doctor".to_string()]
        ));
    }

    #[test]
    fn comandos_enviables_quedan_ordenados_alfabeticamente() {
        let raw = serde_json::json!({
            "type": "system", "subtype": "init", "session_id": "s1",
            "slash_commands": ["zeta", "alfa", "beta"],
            "terminal_slash_commands": []
        });
        let event = normalize(&raw.to_string());
        assert!(matches!(
            event,
            ClaudeEvent::SessionStarted { sendable_commands, .. }
                if sendable_commands == vec!["alfa", "beta", "zeta"]
        ));
    }

    #[test]
    fn sesion_real_con_105_comandos_excluye_solo_los_de_cliente_camino_feliz() {
        let raw = serde_json::json!({
            "type": "system", "subtype": "init", "session_id": "s1",
            "slash_commands": ["flujo-core:flujo-implement", "doctor", "color", "ultrareview"],
            "terminal_slash_commands": ["doctor", "color"]
        });
        let event = normalize(&raw.to_string());
        assert!(matches!(
            event,
            ClaudeEvent::SessionStarted { sendable_commands, .. }
                if sendable_commands == vec!["flujo-core:flujo-implement".to_string(), "ultrareview".to_string()]
        ));
    }

    #[test]
    fn result_sin_usage_ni_costo_no_inventa_valores() {
        let raw = serde_json::json!({
            "type": "result", "session_id": "s1", "is_error": false, "stop_reason": "end_turn"
        });
        let event = normalize(&raw.to_string());
        assert!(matches!(
            event,
            ClaudeEvent::SessionFinished {
                total_cost_usd,
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
                ..
            } if total_cost_usd == 0.0
        ));
    }

    #[test]
    fn result_con_fixture_real_extrae_usage_y_costo_reales() {
        let text = std::fs::read_to_string(fixtures_dir().join("01-resultado-simple-json.json"))
            .expect("fixture real legible");
        let event = normalize(&text);
        assert!(matches!(
            event,
            ClaudeEvent::SessionFinished {
                total_cost_usd,
                input_tokens: 10,
                output_tokens: 78,
                cache_creation_input_tokens: 14479,
                cache_read_input_tokens: 16245,
                ..
            } if (total_cost_usd - 0.030982500000000003).abs() < f64::EPSILON
        ));
    }

    #[test]
    fn formato_real_2_1_263_incluye_clear_y_compact_como_enviables() {
        let raw = serde_json::json!({
            "type": "system", "subtype": "init", "session_id": "s1",
            "slash_commands": [
                "flujo-core:workflow-plan", "clear", "compact", "effort",
                "usage", "model", "mcp"
            ],
            "terminal_slash_commands": ["doctor", "color", "reload-plugins"]
        });
        let event = normalize(&raw.to_string());
        match event {
            ClaudeEvent::SessionStarted {
                sendable_commands, ..
            } => {
                assert!(sendable_commands.contains(&"clear".to_string()));
                assert!(sendable_commands.contains(&"compact".to_string()));
                assert!(!sendable_commands.contains(&"doctor".to_string()));
                assert!(!sendable_commands.contains(&"color".to_string()));
                assert!(!sendable_commands.contains(&"reload-plugins".to_string()));
            }
            other => panic!("se esperaba SessionStarted, se obtuvo {other:?}"),
        }
    }
}

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum InteractionRequest {
    Permission {
        request_id: String,
        tool_name: String,
        input: Value,
    },
    // sin constructor: ningun evento crudo confirmado dispara una eleccion entre opciones
    #[allow(dead_code)]
    Choice {
        request_id: String,
        title: String,
        options: Vec<String>,
    },
    // sin constructor: en modo -p una pregunta abierta se resolvio como texto plano dentro de `result`, sin evento propio
    #[allow(dead_code)]
    OpenQuestion { request_id: String, prompt: String },
    // sin constructor: ningun evento crudo confirmado distingue una confirmacion de una autorizacion generica
    #[allow(dead_code)]
    Confirmation { request_id: String, title: String },
    // sin constructor: ningun evento crudo confirmado modela un formulario de varios campos
    #[allow(dead_code)]
    Form {
        request_id: String,
        title: String,
        fields: Vec<String>,
    },
}

impl InteractionRequest {
    pub fn request_id(&self) -> &str {
        match self {
            InteractionRequest::Permission { request_id, .. } => request_id,
            InteractionRequest::Choice { request_id, .. } => request_id,
            InteractionRequest::OpenQuestion { request_id, .. } => request_id,
            InteractionRequest::Confirmation { request_id, .. } => request_id,
            InteractionRequest::Form { request_id, .. } => request_id,
        }
    }
}

// Inferido de strings del binario de `claude` (patron del SDK); nunca se vio disparar en vivo (siempre anidado).
pub fn parse_can_use_tool_request(value: &Value) -> Option<InteractionRequest> {
    if value.get("type").and_then(Value::as_str) != Some("control_request") {
        return None;
    }
    let request = value.get("request")?;
    if request.get("subtype").and_then(Value::as_str) != Some("can_use_tool") {
        return None;
    }
    let request_id = value.get("request_id").and_then(Value::as_str)?.to_string();
    let tool_name = request
        .get("tool_name")
        .and_then(Value::as_str)?
        .to_string();
    let input = request.get("input").cloned().unwrap_or(Value::Null);
    Some(InteractionRequest::Permission {
        request_id,
        tool_name,
        input,
    })
}

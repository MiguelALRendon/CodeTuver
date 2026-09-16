use crate::claude_transport::{resolve_claude_executable, CREATE_NO_WINDOW};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};
use tokio::io::AsyncReadExt;
use tokio::process::{Child, Command};

// D7: lista de permitidos en el nucleo. Solo estas claves de nivel superior cruzan a la presentacion.
const ALLOWED_SETTINGS_KEYS: &[&str] = &["permissions"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
// El postfijo "Failed" es parte del contrato serializado que consume src/claude-transport.ts, no redundancia de nombres.
#[allow(clippy::enum_variant_names)]
enum AdminErrorKind {
    ProcessSpawnFailed,
    CommandFailed,
    ParseFailed,
}

#[derive(Debug, Serialize)]
pub struct AdminError {
    kind: AdminErrorKind,
    message: String,
}

impl AdminError {
    fn new(kind: AdminErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminOperationResult {
    pub requires_restart: bool,
}

// Filtrado por tipo: los campos que no estan aqui (installPath, mcpServers, etc.) nunca se deserializan. projectPath se conserva solo para filtrar por proyecto, nunca se expone en PluginSummary.
#[derive(Debug, Deserialize)]
struct RawPlugin {
    id: String,
    version: String,
    scope: String,
    enabled: bool,
    #[serde(rename = "projectPath")]
    project_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSummary {
    pub id: String,
    pub version: String,
    pub scope: String,
    pub enabled: bool,
}

// `claude plugin list --json` no se acota por directorio de trabajo: siempre devuelve las instalaciones de scope `project` de TODOS los proyectos del usuario (Hallazgo 8). Se filtra aqui por projectPath, no en el CLI.
// Windows no distingue mayusculas en la letra de unidad ("C:\..." vs "c:\..."): comparar sin normalizar produciria falsos negativos que excluyen un proyecto real.
fn belongs_to_project(plugin: &RawPlugin, cwd: Option<&str>) -> bool {
    if plugin.scope != "project" {
        return true;
    }
    match (plugin.project_path.as_deref(), cwd) {
        (Some(project_path), Some(cwd)) => project_path.eq_ignore_ascii_case(cwd),
        _ => false,
    }
}

fn parse_plugin_list(
    json: &str,
    cwd: Option<&str>,
) -> Result<Vec<PluginSummary>, serde_json::Error> {
    let raw: Vec<RawPlugin> = serde_json::from_str(json)?;
    Ok(raw
        .into_iter()
        .filter(|p| belongs_to_project(p, cwd))
        .map(|p| PluginSummary {
            id: p.id,
            version: p.version,
            scope: p.scope,
            enabled: p.enabled,
        })
        .collect())
}

fn plugin_toggle_args(id: &str, enable: bool) -> [String; 3] {
    [
        "plugin".to_string(),
        if enable { "enable" } else { "disable" }.to_string(),
        id.to_string(),
    ]
}

// Filtrado por tipo: `source` (URLs/SHA internos) nunca se deserializa, solo lo que la UI necesita para buscar e instalar.
#[derive(Debug, Deserialize)]
struct RawAvailablePlugin {
    #[serde(rename = "pluginId")]
    plugin_id: String,
    name: String,
    description: Option<String>,
    #[serde(rename = "marketplaceName")]
    marketplace_name: String,
    #[serde(rename = "installCount")]
    install_count: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct AvailablePluginsResponse {
    available: Vec<RawAvailablePlugin>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailablePlugin {
    pub plugin_id: String,
    pub name: String,
    pub description: String,
    pub marketplace_name: String,
    pub install_count: u64,
}

fn parse_available_plugins(json: &str) -> Result<Vec<AvailablePlugin>, serde_json::Error> {
    let raw: AvailablePluginsResponse = serde_json::from_str(json)?;
    Ok(raw
        .available
        .into_iter()
        .map(|p| AvailablePlugin {
            plugin_id: p.plugin_id,
            name: p.name,
            description: p.description.unwrap_or_default(),
            marketplace_name: p.marketplace_name,
            install_count: p.install_count.unwrap_or(0),
        })
        .collect())
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum McpStatus {
    Connected,
    NeedsAuthentication,
    PendingApproval,
    Failed { reason: String },
    Unknown { raw: String },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerSummary {
    pub name: String,
    pub status: McpStatus,
}

// "claude mcp list" no tiene --json: se parsea texto plano como respaldo, linea malformada se descarta sin panic.
fn parse_mcp_list(output: &str) -> Vec<McpServerSummary> {
    output.lines().filter_map(parse_mcp_line).collect()
}

fn parse_mcp_line(line: &str) -> Option<McpServerSummary> {
    let (name, rest) = line.split_once(": ")?;
    let (_command, status_part) = rest.rsplit_once(" - ")?;
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    Some(McpServerSummary {
        name: name.to_string(),
        status: parse_mcp_status(status_part.trim()),
    })
}

fn parse_mcp_status(status_part: &str) -> McpStatus {
    let (symbol, text) = status_part.split_once(' ').unwrap_or((status_part, ""));
    match symbol {
        "\u{2714}" => McpStatus::Connected,
        "!" => McpStatus::NeedsAuthentication,
        "\u{23f8}" => McpStatus::PendingApproval,
        "\u{2718}" => McpStatus::Failed {
            reason: text.to_string(),
        },
        _ => McpStatus::Unknown {
            raw: status_part.to_string(),
        },
    }
}

fn mcp_add_args(name: &str, command: &str) -> Vec<String> {
    let mut args = vec!["mcp".to_string(), "add".to_string(), name.to_string()];
    args.extend(command.split_whitespace().map(str::to_string));
    args
}

fn mcp_remove_args(name: &str) -> [String; 3] {
    ["mcp".to_string(), "remove".to_string(), name.to_string()]
}

fn filter_allowed_keys(value: &serde_json::Value) -> serde_json::Map<String, serde_json::Value> {
    let mut filtered = serde_json::Map::new();
    let Some(object) = value.as_object() else {
        return filtered;
    };
    for key in ALLOWED_SETTINGS_KEYS {
        if let Some(found) = object.get(*key) {
            filtered.insert((*key).to_string(), found.clone());
        }
    }
    filtered
}

fn read_settings_file(path: &Path) -> Option<serde_json::Map<String, serde_json::Value>> {
    let content = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&content).ok()?;
    Some(filter_allowed_keys(&value))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopedSettings {
    pub global: Option<serde_json::Map<String, serde_json::Value>>,
    pub project: Option<serde_json::Map<String, serde_json::Value>>,
}

fn settings_path(base_dir: &Path) -> PathBuf {
    base_dir.join(".claude").join("settings.json")
}

// Ruta absoluta resuelta (no un nombre relativo): combinar nombre relativo + current_dir() produce os error 267 en Windows, mismo bug del Hito 1 de qa-sesion-real-hallazgos.md.
async fn run_claude(args: &[&str], cwd: Option<&str>) -> Result<std::process::Output, AdminError> {
    // Sin fallback a un nombre relativo: combinado con cwd Some, reintroduciria el mismo os error 267 que esta resolucion corrige.
    let program = resolve_claude_executable().ok_or_else(|| {
        AdminError::new(
            AdminErrorKind::ProcessSpawnFailed,
            "no se encontro claude en PATH",
        )
    })?;
    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = cwd {
        cmd.current_dir(cwd);
    }
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.output().await.map_err(|err| {
        AdminError::new(
            AdminErrorKind::ProcessSpawnFailed,
            format!("no se pudo iniciar claude: {err}"),
        )
    })
}

// Ventana corta para detectar un fallo inmediato del subcomando sin convertir el spawn en bloqueante: el login real (OAuth en el navegador) sigue sin poder esperarse completo.
const EARLY_DETECTION_WINDOW: Duration = Duration::from_secs(4);

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum McpLoginOutcome {
    Confirmed,
    FailedEarly { message: String },
    StillInProgress,
}

async fn read_all<T: tokio::io::AsyncRead + Unpin>(pipe: Option<T>) -> String {
    let Some(mut pipe) = pipe else {
        return String::new();
    };
    let mut buf = Vec::new();
    let _ = pipe.read_to_end(&mut buf).await;
    String::from_utf8_lossy(&buf).trim().to_string()
}

fn early_failure_message(stdout_text: &str, stderr_text: &str) -> String {
    if !stderr_text.is_empty() {
        return stderr_text.to_string();
    }
    if !stdout_text.is_empty() {
        return stdout_text.to_string();
    }
    "claude termino de inmediato sin mensaje de error".to_string()
}

// Corre wait() y la lectura de stdout/stderr en paralelo (nunca wait() solo antes de leer): evita el deadlock clasico si el hijo llena el buffer del pipe antes de salir.
async fn detect_early_login_outcome(child: &mut Child, window: Duration) -> McpLoginOutcome {
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let result = tokio::time::timeout(window, async {
        tokio::join!(child.wait(), read_all(stdout), read_all(stderr))
    })
    .await;

    match result {
        Ok((Ok(status), _, _)) if status.success() => McpLoginOutcome::Confirmed,
        Ok((Ok(_), stdout_text, stderr_text)) => McpLoginOutcome::FailedEarly {
            message: early_failure_message(&stdout_text, &stderr_text),
        },
        Ok((Err(err), _, _)) => McpLoginOutcome::FailedEarly {
            message: format!("no se pudo esperar el proceso: {err}"),
        },
        Err(_) => McpLoginOutcome::StillInProgress,
    }
}

// `claude mcp login` es interactivo de verdad (abre un navegador real y espera el callback de OAuth, o con --no-browser imprime una URL y espera a que se pegue la respuesta) — no puede completarse desde un subprocess sin TTY. Por eso esto no espera a que el login termine (a diferencia de run_claude): solo observa una ventana corta tras el spawn para distinguir un fallo inmediato de un login que sigue en curso; el usuario completa el login en su navegador real y luego refresca el panel.
async fn spawn_claude_detached(args: &[&str]) -> Result<McpLoginOutcome, AdminError> {
    let program = resolve_claude_executable().ok_or_else(|| {
        AdminError::new(
            AdminErrorKind::ProcessSpawnFailed,
            "no se encontro claude en PATH",
        )
    })?;
    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    let mut child = cmd.spawn().map_err(|err| {
        AdminError::new(
            AdminErrorKind::ProcessSpawnFailed,
            format!("no se pudo iniciar claude: {err}"),
        )
    })?;
    Ok(detect_early_login_outcome(&mut child, EARLY_DETECTION_WINDOW).await)
}

fn command_output_to_text(output: &std::process::Output) -> Result<String, AdminError> {
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let message = if stderr.is_empty() {
            "claude devolvio un error sin detalle".to_string()
        } else {
            stderr
        };
        return Err(AdminError::new(AdminErrorKind::CommandFailed, message));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// Acotado al proyecto de la sesion (Hallazgo 8): sin cwd, claude plugin list devuelve instalaciones de TODOS los proyectos del usuario, indistinguibles entre si porque projectPath se descarta al parsear.
#[tauri::command]
pub async fn list_plugins(cwd: Option<String>) -> Result<Vec<PluginSummary>, AdminError> {
    let output = run_claude(&["plugin", "list", "--json"], cwd.as_deref()).await?;
    let text = command_output_to_text(&output)?;
    parse_plugin_list(&text, cwd.as_deref()).map_err(|err| {
        AdminError::new(
            AdminErrorKind::ParseFailed,
            format!("no se pudo interpretar la lista de plugins: {err}"),
        )
    })
}

#[tauri::command]
pub async fn list_available_plugins(
    cwd: Option<String>,
) -> Result<Vec<AvailablePlugin>, AdminError> {
    let output = run_claude(&["plugin", "list", "--available", "--json"], cwd.as_deref()).await?;
    let text = command_output_to_text(&output)?;
    parse_available_plugins(&text).map_err(|err| {
        AdminError::new(
            AdminErrorKind::ParseFailed,
            format!("no se pudo interpretar los plugins disponibles: {err}"),
        )
    })
}

#[tauri::command]
pub async fn install_plugin(plugin_id: String) -> Result<AdminOperationResult, AdminError> {
    let output = run_claude(&["plugin", "install", plugin_id.as_str()], None).await?;
    command_output_to_text(&output)?;
    Ok(AdminOperationResult {
        requires_restart: true,
    })
}

#[tauri::command]
pub async fn add_plugin_marketplace(source: String) -> Result<AdminOperationResult, AdminError> {
    let output = run_claude(&["plugin", "marketplace", "add", source.as_str()], None).await?;
    command_output_to_text(&output)?;
    Ok(AdminOperationResult {
        requires_restart: false,
    })
}

#[tauri::command]
pub async fn set_plugin_enabled(
    id: String,
    enabled: bool,
) -> Result<AdminOperationResult, AdminError> {
    let args = plugin_toggle_args(&id, enabled);
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = run_claude(&args_ref, None).await?;
    command_output_to_text(&output)?;
    Ok(AdminOperationResult {
        requires_restart: true,
    })
}

// -y es obligatorio: sin TTY (stdin Stdio::null en run_claude), el prompt interactivo de "deshabilitar solo para ti o desinstalar para todos" se quedaria esperando una respuesta que nunca llega.
#[tauri::command]
pub async fn uninstall_plugin(id: String) -> Result<AdminOperationResult, AdminError> {
    let output = run_claude(&["plugin", "uninstall", id.as_str(), "-y"], None).await?;
    command_output_to_text(&output)?;
    Ok(AdminOperationResult {
        requires_restart: true,
    })
}

// `claude plugin details` no soporta --json (confirmado): se expone el texto crudo tal cual, sin inventar un esquema estructurado que el CLI no garantiza.
#[tauri::command]
pub async fn get_plugin_details(id: String) -> Result<String, AdminError> {
    let output = run_claude(&["plugin", "details", id.as_str()], None).await?;
    let text = command_output_to_text(&output)?;
    Ok(text.trim().to_string())
}

#[tauri::command]
pub async fn list_mcp_servers() -> Result<Vec<McpServerSummary>, AdminError> {
    let output = run_claude(&["mcp", "list"], None).await?;
    let text = command_output_to_text(&output)?;
    Ok(parse_mcp_list(&text))
}

#[tauri::command]
pub async fn add_mcp_server(
    name: String,
    command: String,
) -> Result<AdminOperationResult, AdminError> {
    let args = mcp_add_args(&name, &command);
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = run_claude(&args_ref, None).await?;
    command_output_to_text(&output)?;
    Ok(AdminOperationResult {
        requires_restart: true,
    })
}

#[tauri::command]
pub async fn remove_mcp_server(name: String) -> Result<AdminOperationResult, AdminError> {
    let args = mcp_remove_args(&name);
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = run_claude(&args_ref, None).await?;
    command_output_to_text(&output)?;
    Ok(AdminOperationResult {
        requires_restart: true,
    })
}

// Abre el flujo real de OAuth en el navegador del usuario; no espera a que termine (ver spawn_claude_detached).
#[tauri::command]
pub async fn authenticate_mcp(name: String) -> Result<McpLoginOutcome, AdminError> {
    spawn_claude_detached(&["mcp", "login", name.as_str()]).await
}

#[tauri::command]
// Confirmado en vivo (2026-09-05): "claude mcp logout" sobre un conector claude.ai (Wrike, Gmail, Drive, Calendar) sale con exit 0 pero NO limpia nada real — sus credenciales viven en claude.ai, no en esta maquina. Sin este chequeo, el frontend reportaria exito falso.
fn is_claude_ai_connector_no_op(text: &str) -> bool {
    text.contains("claude.ai connector")
}

#[tauri::command]
pub async fn clear_mcp_authentication(name: String) -> Result<AdminOperationResult, AdminError> {
    let output = run_claude(&["mcp", "logout", name.as_str()], None).await?;
    let text = command_output_to_text(&output)?;
    if is_claude_ai_connector_no_op(&text) {
        return Err(AdminError::new(
            AdminErrorKind::CommandFailed,
            format!(
                "\"{name}\" es un conector de claude.ai: su autenticacion se administra en claude.ai/customize/connectors, no desde esta app."
            ),
        ));
    }
    Ok(AdminOperationResult {
        requires_restart: false,
    })
}

#[tauri::command]
pub fn read_admin_settings<R: Runtime>(
    app: AppHandle<R>,
    project_dir: Option<String>,
) -> ScopedSettings {
    let global = app
        .path()
        .home_dir()
        .ok()
        .and_then(|dir| read_settings_file(&settings_path(&dir)));
    let project = project_dir
        .map(PathBuf::from)
        .and_then(|dir| read_settings_file(&settings_path(&dir)));
    ScopedSettings { global, project }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn run_claude_con_cwd_inexistente_falla_por_directorio_no_por_ejecutable_ausente() {
        let result = run_claude(
            &["--version"],
            Some("C:\\ruta-que-no-existe-en-disco-nunca-jamas-98765"),
        )
        .await;

        assert!(
            result.is_err(),
            "un cwd inexistente debe impedir el spawn, confirmando que .current_dir() se aplico"
        );
    }

    #[tokio::test]
    async fn run_claude_sin_cwd_no_intenta_cambiar_de_directorio() {
        let result = run_claude(&["--version"], None).await;

        assert!(
            result.is_ok(),
            "sin cwd, run_claude debe usar el directorio del proceso actual sin fallar: {:?}",
            result.err()
        );
    }

    const ID_PLUGIN_INEXISTENTE: &str = "un-plugin-que-no-existe-jamas@marketplace-falso";

    // No desinstala nada real: un id inexistente confirma el manejo de error sin necesitar un plugin real de prueba (destructivo).
    #[tokio::test]
    async fn uninstall_plugin_con_id_inexistente_devuelve_error_sin_panic() {
        let result = uninstall_plugin(ID_PLUGIN_INEXISTENTE.to_string()).await;

        assert!(
            result.is_err(),
            "un id de plugin que no existe debe fallar limpiamente, sin panic"
        );
    }

    #[tokio::test]
    async fn get_plugin_details_con_id_inexistente_devuelve_error_sin_panic() {
        let result = get_plugin_details(ID_PLUGIN_INEXISTENTE.to_string()).await;

        assert!(
            result.is_err(),
            "un id de plugin que no existe debe fallar limpiamente, sin panic"
        );
    }

    const NOMBRE_MCP_INEXISTENTE: &str = "un-servidor-mcp-que-no-existe-jamas-98765";

    #[tokio::test]
    async fn clear_mcp_authentication_con_nombre_inexistente_devuelve_error_sin_panic() {
        let result = clear_mcp_authentication(NOMBRE_MCP_INEXISTENTE.to_string()).await;

        assert!(
            result.is_err(),
            "un servidor MCP que no existe debe fallar limpiamente, sin panic"
        );
    }

    // Texto real capturado en vivo (2026-09-05) de "claude mcp logout" sobre "claude.ai Wrike".
    const TEXTO_REAL_NO_OP_CONECTOR: &str = "\"claude.ai Wrike\" is a claude.ai connector \u{2014} its credentials live on claude.ai, not this machine. Disconnect it at https://claude.ai/customize/connectors";

    #[test]
    fn detecta_el_mensaje_de_no_op_de_un_conector_claude_ai() {
        assert!(is_claude_ai_connector_no_op(TEXTO_REAL_NO_OP_CONECTOR));
    }

    #[test]
    fn no_confunde_un_logout_real_exitoso_con_el_no_op_de_conector() {
        assert!(!is_claude_ai_connector_no_op(
            "Cleared stored OAuth credentials for figma"
        ));
    }

    // authenticate_mcp no espera a que el login termine (es interactivo, ver spawn_claude_detached): con un nombre inexistente el spawn en si mismo debe reportar exito igual, aunque el CLI real termine reportando un McpLoginOutcome::FailedEarly.
    #[tokio::test]
    async fn authenticate_mcp_confirma_el_spawn_incluso_con_nombre_inexistente() {
        let result = authenticate_mcp(NOMBRE_MCP_INEXISTENTE.to_string()).await;

        assert!(
            result.is_ok(),
            "el spawn en si debe tener exito aunque el CLI luego falle internamente por el nombre: {:?}",
            result.err()
        );
    }

    fn spawn_fake_child_with_args(args: &[&str]) -> Child {
        Command::new("cmd")
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("cmd.exe is always available on Windows")
    }

    #[tokio::test]
    async fn detecta_un_fallo_temprano_por_codigo_de_salida_distinto_de_cero() {
        let mut child = spawn_fake_child_with_args(&["/c", "echo fallo-simulado 1>&2 && exit 1"]);

        let outcome = detect_early_login_outcome(&mut child, Duration::from_secs(3)).await;

        assert_eq!(
            outcome,
            McpLoginOutcome::FailedEarly {
                message: "fallo-simulado".to_string(),
            }
        );
    }

    #[tokio::test]
    async fn un_proceso_que_sigue_corriendo_al_expirar_la_ventana_no_se_confunde_con_un_fallo() {
        let mut child = spawn_fake_child_with_args(&["/c", "ping -n 6 127.0.0.1"]);

        let outcome = detect_early_login_outcome(&mut child, Duration::from_millis(200)).await;

        assert_eq!(outcome, McpLoginOutcome::StillInProgress);
        let _ = child.start_kill();
    }

    #[tokio::test]
    async fn un_proceso_que_sale_exitosamente_dentro_de_la_ventana_se_confirma() {
        let mut child = spawn_fake_child_with_args(&["/c", "exit 0"]);

        let outcome = detect_early_login_outcome(&mut child, Duration::from_secs(3)).await;

        assert_eq!(outcome, McpLoginOutcome::Confirmed);
    }

    const SAMPLE_PLUGIN_JSON: &str = r#"[
        {
            "id": "example@marketplace",
            "version": "1.0.0",
            "scope": "user",
            "enabled": true,
            "installPath": "C:\\Users\\alguien\\.claude\\plugins\\cache\\marketplace\\example\\1.0.0",
            "installedAt": "2026-01-01T00:00:00.000Z",
            "lastUpdated": "2026-01-01T00:00:00.000Z",
            "mcpServers": {
                "example": {
                    "type": "http",
                    "url": "https://example.test/mcp",
                    "headers": { "Authorization": "Bearer secreto-no-debe-cruzar" }
                }
            }
        }
    ]"#;

    #[test]
    fn parsear_lista_de_plugins_descarta_installpath_y_mcpservers() {
        let plugins = parse_plugin_list(SAMPLE_PLUGIN_JSON, None).expect("json valido");

        assert_eq!(
            plugins,
            vec![PluginSummary {
                id: "example@marketplace".to_string(),
                version: "1.0.0".to_string(),
                scope: "user".to_string(),
                enabled: true,
            }]
        );
        let serialized = serde_json::to_string(&plugins).expect("serializable");
        assert!(!serialized.contains("secreto-no-debe-cruzar"));
        assert!(!serialized.contains("installPath"));
        assert!(!serialized.contains("projectPath"));
    }

    #[test]
    fn json_de_plugins_invalido_no_entra_en_panico_y_devuelve_error() {
        assert!(parse_plugin_list("esto no es json", None).is_err());
    }

    // Reproduce el Hallazgo 8: claude plugin list --json (corrida real contra este entorno) devuelve instalaciones de scope "project" de proyectos SIN relacion, indistinguibles hasta que se filtra por projectPath.
    const MULTI_PROJECT_PLUGIN_JSON: &str = r#"[
        {
            "id": "flujo-core@flujo",
            "version": "0.13.0",
            "scope": "project",
            "enabled": true,
            "projectPath": "C:\\Users\\alguien\\OneDrive\\Escritorio\\Valoren Framework"
        },
        {
            "id": "flujo-core@flujo",
            "version": "0.13.0",
            "scope": "project",
            "enabled": true,
            "projectPath": "C:\\Users\\alguien\\OneDrive\\Documents\\VtuberXD"
        },
        {
            "id": "chrome-devtools-mcp@claude-plugins-official",
            "version": "1.8.0",
            "scope": "user",
            "enabled": true
        }
    ]"#;

    #[test]
    fn sin_cwd_las_entradas_de_scope_project_se_excluyen_por_no_poder_atribuirse() {
        let plugins = parse_plugin_list(MULTI_PROJECT_PLUGIN_JSON, None).expect("json valido");

        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].scope, "user");
    }

    #[test]
    fn con_cwd_solo_quedan_las_entradas_project_del_mismo_proyecto_mas_las_de_scope_no_project() {
        let plugins = parse_plugin_list(
            MULTI_PROJECT_PLUGIN_JSON,
            Some("C:\\Users\\alguien\\OneDrive\\Documents\\VtuberXD"),
        )
        .expect("json valido");

        assert_eq!(plugins.len(), 2);
        assert!(plugins
            .iter()
            .all(|p| p.scope != "project" || p.id == "flujo-core@flujo" && p.version == "0.13.0"));
        assert_eq!(plugins.iter().filter(|p| p.scope == "project").count(), 1);
    }

    const SAMPLE_AVAILABLE_JSON: &str = r#"{
        "installed": [],
        "available": [
            {
                "pluginId": "example@marketplace",
                "name": "example",
                "description": "Un plugin de ejemplo",
                "marketplaceName": "marketplace",
                "source": { "source": "git-subdir", "url": "https://secreto-no-debe-cruzar.test" },
                "installCount": 42
            },
            {
                "pluginId": "sin-descripcion@marketplace",
                "name": "sin-descripcion",
                "marketplaceName": "marketplace",
                "source": "./plugins/sin-descripcion"
            }
        ]
    }"#;

    #[test]
    fn parsear_plugins_disponibles_descarta_source_y_usa_valores_por_omision() {
        let plugins = parse_available_plugins(SAMPLE_AVAILABLE_JSON).expect("json valido");

        assert_eq!(
            plugins,
            vec![
                AvailablePlugin {
                    plugin_id: "example@marketplace".to_string(),
                    name: "example".to_string(),
                    description: "Un plugin de ejemplo".to_string(),
                    marketplace_name: "marketplace".to_string(),
                    install_count: 42,
                },
                AvailablePlugin {
                    plugin_id: "sin-descripcion@marketplace".to_string(),
                    name: "sin-descripcion".to_string(),
                    description: String::new(),
                    marketplace_name: "marketplace".to_string(),
                    install_count: 0,
                },
            ]
        );
        let serialized = serde_json::to_string(&plugins).expect("serializable");
        assert!(!serialized.contains("secreto-no-debe-cruzar"));
        assert!(!serialized.contains("\"source\""));
    }

    #[test]
    fn json_de_plugins_disponibles_invalido_no_entra_en_panico_y_devuelve_error() {
        assert!(parse_available_plugins("esto no es json").is_err());
    }

    #[test]
    fn construir_argumentos_de_activar_y_desactivar_plugin_no_ejecuta_nada() {
        assert_eq!(
            plugin_toggle_args("example@marketplace", true),
            ["plugin", "enable", "example@marketplace"]
        );
        assert_eq!(
            plugin_toggle_args("example@marketplace", false),
            ["plugin", "disable", "example@marketplace"]
        );
    }

    #[test]
    fn parsear_mcp_list_reconoce_los_cuatro_estados_documentados() {
        let text = "Checking MCP server health…\n\
             conectado: npx algo-mcp - \u{2714} Connected\n\
             sin-auth: https://x.test/mcp (HTTP) - ! Needs authentication\n\
             caido: npx otro-mcp - \u{2718} Failed to connect \u{2014} CONNECTION_CLOSED: Connection closed\n\
             en-cola: npx tercero-mcp - \u{23f8} Pending approval\n";

        let servers = parse_mcp_list(text);

        assert_eq!(
            servers,
            vec![
                McpServerSummary {
                    name: "conectado".to_string(),
                    status: McpStatus::Connected,
                },
                McpServerSummary {
                    name: "sin-auth".to_string(),
                    status: McpStatus::NeedsAuthentication,
                },
                McpServerSummary {
                    name: "caido".to_string(),
                    status: McpStatus::Failed {
                        reason: "Failed to connect \u{2014} CONNECTION_CLOSED: Connection closed"
                            .to_string(),
                    },
                },
                McpServerSummary {
                    name: "en-cola".to_string(),
                    status: McpStatus::PendingApproval,
                },
            ]
        );
    }

    #[test]
    fn parsear_mcp_list_nunca_expone_la_url_o_comando_completo() {
        let text =
            "con-token: https://x.test/mcp?token=secreto-no-debe-cruzar - \u{2714} Connected\n";
        let servers = parse_mcp_list(text);
        let serialized = serde_json::to_string(&servers).expect("serializable");
        assert!(!serialized.contains("secreto-no-debe-cruzar"));
    }

    #[test]
    fn una_linea_con_formato_inesperado_se_descarta_sin_panico() {
        let text = "esto no tiene el formato esperado en absoluto\n";
        assert!(parse_mcp_list(text).is_empty());
    }

    #[test]
    fn un_simbolo_de_estado_desconocido_se_marca_como_desconocido_no_panica() {
        let text = "raro: npx raro-mcp - ? Estado nunca antes visto\n";
        let servers = parse_mcp_list(text);
        assert_eq!(
            servers,
            vec![McpServerSummary {
                name: "raro".to_string(),
                status: McpStatus::Unknown {
                    raw: "? Estado nunca antes visto".to_string(),
                },
            }]
        );
    }

    #[test]
    fn construir_argumentos_de_agregar_y_quitar_mcp_no_ejecuta_nada() {
        assert_eq!(
            mcp_add_args("mi-server", "npx mi-server-mcp --flag"),
            vec!["mcp", "add", "mi-server", "npx", "mi-server-mcp", "--flag"]
        );
        assert_eq!(mcp_remove_args("mi-server"), ["mcp", "remove", "mi-server"]);
    }

    #[test]
    fn filtrar_claves_de_ajustes_solo_deja_pasar_la_lista_de_permitidos() {
        let value = serde_json::json!({
            "permissions": { "allow": ["Bash(npm run*)"] },
            "hooks": { "PreToolUse": [] },
            "enabledPlugins": { "flujo-core@flujo": true }
        });

        let filtered = filter_allowed_keys(&value);

        assert!(filtered.contains_key("permissions"));
        assert!(!filtered.contains_key("hooks"));
        assert!(!filtered.contains_key("enabledPlugins"));
    }

    #[test]
    fn una_clave_no_prevista_que_pretende_ser_permissions_dentro_de_otra_seccion_no_cruza() {
        let value = serde_json::json!({
            "hooks": { "permissions": { "esto": "no cuenta, no es de nivel superior" } }
        });

        let filtered = filter_allowed_keys(&value);

        assert!(filtered.is_empty());
    }

    #[test]
    fn un_valor_de_ajustes_que_no_es_un_objeto_no_hace_panico_y_devuelve_vacio() {
        let value = serde_json::json!("esto no es un objeto json");
        assert!(filter_allowed_keys(&value).is_empty());
    }

    #[test]
    fn leer_un_archivo_de_ajustes_que_no_existe_devuelve_none_sin_fallar() {
        let path = std::env::temp_dir().join("vtuberxd-settings-que-no-existe-nunca-jamas.json");
        assert!(read_settings_file(&path).is_none());
    }

    #[test]
    fn leer_un_archivo_de_ajustes_corrupto_devuelve_none_sin_fallar() {
        let dir = std::env::temp_dir().join(format!(
            "vtuberxd-settings-corrupto-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).expect("crear dir de prueba");
        let path = settings_path(&dir);
        std::fs::create_dir_all(path.parent().unwrap()).expect("crear .claude");
        std::fs::write(&path, "esto no es json {{{").expect("escribir corrupto");

        assert!(read_settings_file(&path).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

use crate::event_normalizer::{normalize, ClaudeEvent};
use crate::interaction_request::{self, InteractionRequest};
use crate::raw_log::RawLogWriter;
use crate::session_preferences::{self, SessionPreference};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};
use tokio::sync::{mpsc, Mutex};

#[cfg(windows)]
pub(crate) const CREATE_NO_WINDOW: u32 = 0x08000000;

const EVENT_ACTIVITY: &str = "claude-activity";
const EVENT_NORMALIZED: &str = "claude-normalized-event";
const EVENT_STDERR: &str = "claude-stderr";
const EVENT_SESSION_CLOSED: &str = "session-closed";
const EVENT_PERMISSION_PENDING: &str = "permission-request-pending";

static REQUEST_SEQ: AtomicU64 = AtomicU64::new(0);

fn next_request_id() -> String {
    format!("req-{}", REQUEST_SEQ.fetch_add(1, Ordering::Relaxed))
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum ActivityEvent {
    Raw { line: String },
    InvalidLine { line: String, error: String },
}

#[derive(Debug, Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
struct SessionClosedEvent {
    expected: bool,
    exit_code: Option<i32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
enum TransportErrorKind {
    ProcessSpawnFailed,
    ClaudeCodeNotFound,
    SessionAlreadyActive,
    SessionNotActive,
    WriteFailed,
    RequestNotPending,
    InvalidStartupOptions,
}

#[derive(Debug, Serialize)]
pub struct TransportError {
    kind: TransportErrorKind,
    message: String,
}

impl TransportError {
    fn new(kind: TransportErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

enum Control {
    Close,
}

struct ActiveSession {
    stdin: ChildStdin,
    control_tx: mpsc::Sender<Control>,
}

#[derive(Default)]
pub struct ClaudeSessionState(Mutex<Option<ActiveSession>>);

// Sobrevive al cierre de sesion a proposito: las peticiones sin responder quedan huerfanas aqui, nunca se resuelven solas.
#[derive(Default)]
pub struct PendingRequestsState(Mutex<HashMap<String, InteractionRequest>>);

// Resuelve la ruta absoluta antes de spawnear: nombre relativo + current_dir() produce os error 267 en Windows (qa-sesion-real-hallazgos.md Hallazgo 10).
pub(crate) fn resolve_claude_executable() -> Option<PathBuf> {
    static RESOLVED: OnceLock<Option<PathBuf>> = OnceLock::new();
    RESOLVED.get_or_init(find_claude_on_path).clone()
}

fn claude_candidate_names() -> &'static [&'static str] {
    if cfg!(windows) {
        &["claude.exe", "claude.cmd", "claude"]
    } else {
        &["claude"]
    }
}

fn find_claude_on_path() -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    find_executable_in_dirs(std::env::split_paths(&path_var), claude_candidate_names())
}

fn find_executable_in_dirs(dirs: impl Iterator<Item = PathBuf>, names: &[&str]) -> Option<PathBuf> {
    dirs.filter_map(|dir| {
        names
            .iter()
            .map(|name| dir.join(name))
            .find(|candidate| candidate.is_file())
    })
    .next()
}

// H19 (revision-ux-sesion-real-3): estos 6 son los modos reales confirmados contra `claude --help` (2.1.263); cualquier otro valor se rechaza antes de llegar al proceso.
const VALID_PERMISSION_MODES: &[&str] = &[
    "acceptEdits",
    "auto",
    "bypassPermissions",
    "manual",
    "dontAsk",
    "plan",
];

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStartOptions {
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    pub add_dir: Option<Vec<String>>,
    pub allowed_tools: Option<Vec<String>>,
    pub disallowed_tools: Option<Vec<String>>,
    pub max_budget_usd: Option<f64>,
}

fn invalid_startup_options(message: impl Into<String>) -> TransportError {
    TransportError::new(TransportErrorKind::InvalidStartupOptions, message)
}

// Frontera de confianza: esto se convierte en argumentos de linea de comandos de un subproceso real, no en un fragmento de shell -- CLAUDE.md, "validacion en trust boundaries nunca es lazy-away".
fn validate_startup_options(options: &SessionStartOptions) -> Result<(), TransportError> {
    if let Some(mode) = &options.permission_mode {
        if !VALID_PERMISSION_MODES.contains(&mode.as_str()) {
            return Err(invalid_startup_options(format!(
                "modo de permisos invalido: {mode}"
            )));
        }
    }
    if let Some(model) = &options.model {
        if model.trim().is_empty() {
            return Err(invalid_startup_options("el modelo no puede estar vacio"));
        }
    }
    if let Some(budget) = options.max_budget_usd {
        if !budget.is_finite() || budget <= 0.0 {
            return Err(invalid_startup_options(
                "el limite de gasto debe ser un numero positivo",
            ));
        }
    }
    for dir in options.add_dir.iter().flatten() {
        if dir.trim().is_empty() {
            return Err(invalid_startup_options(
                "un directorio adicional no puede estar vacio",
            ));
        }
    }
    for tool in options
        .allowed_tools
        .iter()
        .flatten()
        .chain(options.disallowed_tools.iter().flatten())
    {
        if tool.trim().is_empty() {
            return Err(invalid_startup_options(
                "un nombre de herramienta no puede estar vacio",
            ));
        }
    }
    Ok(())
}

// H22: separado de SessionStartOptions a proposito -- eso se persiste y se reaplica en cada arranque (app-settings.ts), y "reanudar la sesion X" nunca deberia recordarse para el proximo arranque normal.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeOptions {
    pub session_id: String,
    pub fork: bool,
}

// Sin ninguna opcion, produce exactamente los mismos 6 flags fijos de siempre -- extender esta funcion no cambia el comportamiento por omision.
fn build_startup_args(
    options: &SessionStartOptions,
    resume: Option<&ResumeOptions>,
) -> Vec<String> {
    let mut args: Vec<String> = [
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    if let Some(model) = &options.model {
        args.push("--model".to_string());
        args.push(model.clone());
    }
    if let Some(mode) = &options.permission_mode {
        args.push("--permission-mode".to_string());
        args.push(mode.clone());
    }
    if let Some(dirs) = options.add_dir.as_ref().filter(|d| !d.is_empty()) {
        args.push("--add-dir".to_string());
        args.extend(dirs.iter().cloned());
    }
    if let Some(tools) = options.allowed_tools.as_ref().filter(|t| !t.is_empty()) {
        args.push("--allowedTools".to_string());
        args.extend(tools.iter().cloned());
    }
    if let Some(tools) = options.disallowed_tools.as_ref().filter(|t| !t.is_empty()) {
        args.push("--disallowedTools".to_string());
        args.extend(tools.iter().cloned());
    }
    if let Some(budget) = options.max_budget_usd {
        args.push("--max-budget-usd".to_string());
        args.push(budget.to_string());
    }
    if let Some(resume) = resume {
        args.push("--resume".to_string());
        args.push(resume.session_id.clone());
        if resume.fork {
            args.push("--fork-session".to_string());
        }
    }
    args
}

fn spawn_claude(
    cwd: &str,
    options: &SessionStartOptions,
    resume: Option<&ResumeOptions>,
) -> std::io::Result<Child> {
    let program = resolve_claude_executable()
        .ok_or_else(|| std::io::Error::new(ErrorKind::NotFound, "claude no encontrado en PATH"))?;
    let mut cmd = Command::new(program);
    cmd.args(build_startup_args(options, resume))
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // sin este flag, claude.exe abriria una consola visible sobre un padre sin consola propia (prohibido)
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.spawn()
}

fn spawn_error(err: std::io::Error) -> TransportError {
    if err.kind() == ErrorKind::NotFound {
        return TransportError::new(
            TransportErrorKind::ClaudeCodeNotFound,
            "No se encontro Claude Code instalado. Instalalo y autenticalo por separado antes de continuar.",
        );
    }
    TransportError::new(
        TransportErrorKind::ProcessSpawnFailed,
        format!("no se pudo iniciar el proceso de claude: {err}"),
    )
}

fn write_error(err: std::io::Error) -> TransportError {
    TransportError::new(
        TransportErrorKind::WriteFailed,
        format!("no se pudo escribir en stdin: {err}"),
    )
}

fn not_active_error() -> TransportError {
    TransportError::new(TransportErrorKind::SessionNotActive, "no hay sesion activa")
}

fn request_not_pending_error() -> TransportError {
    TransportError::new(
        TransportErrorKind::RequestNotPending,
        "la peticion ya no esta pendiente o no existe",
    )
}

fn emit_activity_line<R: Runtime>(app: &AppHandle<R>, line: String) {
    if line.trim().is_empty() {
        return;
    }
    // Solo se valida que la linea sea JSON completo; interpretar su contenido es del Hito 3.
    let event = match serde_json::from_str::<serde_json::Value>(&line) {
        Ok(_) => ActivityEvent::Raw { line },
        Err(err) => ActivityEvent::InvalidLine {
            line,
            error: err.to_string(),
        },
    };
    let _ = app.emit(EVENT_ACTIVITY, event);
}

fn open_raw_log<R: Runtime>(app: &AppHandle<R>) -> Option<Arc<RawLogWriter>> {
    let dir = match app.path().app_data_dir() {
        Ok(dir) => dir,
        Err(err) => {
            let _ = app.emit(
                EVENT_STDERR,
                format!("no se pudo resolver el directorio de datos de la app: {err}"),
            );
            return None;
        }
    };
    match RawLogWriter::create(&dir) {
        Ok(writer) => Some(Arc::new(writer)),
        Err(err) => {
            let _ = app.emit(
                EVENT_STDERR,
                format!("no se pudo abrir el registro crudo: {err}"),
            );
            None
        }
    }
}

async fn read_stdout<R: Runtime>(
    app: AppHandle<R>,
    stdout: ChildStdout,
    raw_log: Option<Arc<RawLogWriter>>,
    cwd: String,
) {
    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if let Some(writer) = raw_log.as_ref() {
            if let Err(err) = writer.append(&line).await {
                let _ = app.emit(
                    EVENT_STDERR,
                    format!("no se pudo escribir en el registro crudo: {err}"),
                );
            }
        }
        let event = normalize(&line);
        let _ = app.emit(EVENT_NORMALIZED, event.clone());
        persist_session_started(&app, &cwd, &event).await;
        register_permission_request_if_present(&app, &line).await;
        emit_activity_line(&app, line);
    }
}

async fn persist_session_started<R: Runtime>(app: &AppHandle<R>, cwd: &str, event: &ClaudeEvent) {
    let ClaudeEvent::SessionStarted { session_id, .. } = event else {
        return;
    };
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let preference = SessionPreference {
        last_working_directory: cwd.to_string(),
        last_session_id: session_id.clone(),
    };
    // misma razon que raw_log.rs: la escritura de disco no debe bloquear el hilo async del lector de stdout
    let result = tokio::task::spawn_blocking(move || {
        session_preferences::write_preference(&dir, &preference)
    })
    .await;
    if let Err(err) = result.unwrap_or_else(|join_err| {
        Err(std::io::Error::other(format!(
            "tarea de escritura de preferencias no completo: {join_err}"
        )))
    }) {
        let _ = app.emit(
            EVENT_STDERR,
            format!("no se pudo guardar la preferencia de sesion: {err}"),
        );
    }
}

async fn register_permission_request_if_present<R: Runtime>(app: &AppHandle<R>, line: &str) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
        return;
    };
    let Some(request) = interaction_request::parse_can_use_tool_request(&value) else {
        return;
    };
    let request_id = request.request_id().to_string();
    let pending = app.state::<PendingRequestsState>();
    pending.0.lock().await.insert(request_id, request.clone());
    let _ = app.emit(EVENT_PERMISSION_PENDING, request);
}

async fn read_stderr<R: Runtime>(app: AppHandle<R>, stderr: ChildStderr) {
    let mut lines = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if !line.trim().is_empty() {
            let _ = app.emit(EVENT_STDERR, line);
        }
    }
}

async fn supervise<R: Runtime>(
    app: AppHandle<R>,
    mut child: Child,
    mut control_rx: mpsc::Receiver<Control>,
) {
    let mut expected = false;
    let status = loop {
        tokio::select! {
            status = child.wait() => break status,
            Some(Control::Close) = control_rx.recv() => {
                expected = true;
                let _ = child.start_kill();
            }
        }
    };
    let exit_code = status.ok().and_then(|s| s.code());
    let _ = app.emit(
        EVENT_SESSION_CLOSED,
        SessionClosedEvent {
            expected,
            exit_code,
        },
    );
}

async fn write_line(state: &ClaudeSessionState, payload: String) -> Result<(), TransportError> {
    let mut guard = state.0.lock().await;
    let session = guard.as_mut().ok_or_else(not_active_error)?;
    session
        .stdin
        .write_all(payload.as_bytes())
        .await
        .map_err(write_error)?;
    session.stdin.write_all(b"\n").await.map_err(write_error)?;
    session.stdin.flush().await.map_err(write_error)
}

fn user_turn_json(text: &str) -> String {
    serde_json::json!({
        "type": "user",
        "message": { "role": "user", "content": [{ "type": "text", "text": text }] }
    })
    .to_string()
}

fn interrupt_request_json() -> String {
    serde_json::json!({
        "type": "control_request",
        "request_id": next_request_id(),
        "request": { "subtype": "interrupt" }
    })
    .to_string()
}

fn control_response_json(
    request_id: &str,
    allow: bool,
    updated_input: Option<serde_json::Value>,
    message: Option<String>,
) -> String {
    let mut response = serde_json::json!({
        "request_id": request_id,
        "behavior": if allow { "allow" } else { "deny" },
    });
    if allow {
        response["updatedInput"] = updated_input.unwrap_or_else(|| serde_json::json!({}));
    } else if let Some(message) = message {
        response["message"] = serde_json::Value::String(message);
    }
    serde_json::json!({ "type": "control_response", "response": response }).to_string()
}

async fn take_pending_request(
    pending: &PendingRequestsState,
    request_id: &str,
) -> Result<InteractionRequest, TransportError> {
    pending
        .0
        .lock()
        .await
        .remove(request_id)
        .ok_or_else(request_not_pending_error)
}

async fn restore_pending_request(
    pending: &PendingRequestsState,
    request_id: String,
    request: InteractionRequest,
) {
    pending.0.lock().await.insert(request_id, request);
}

struct SpawnedProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: ChildStdout,
    stderr: ChildStderr,
}

/// No necesita AppHandle: es la parte de start_claude_session que se puede probar sin un runtime de Tauri.
async fn check_active_then_spawn(
    guard: &mut Option<ActiveSession>,
    cwd: &str,
    options: &SessionStartOptions,
    resume: Option<&ResumeOptions>,
) -> Result<SpawnedProcess, TransportError> {
    if guard.is_some() {
        return Err(TransportError::new(
            TransportErrorKind::SessionAlreadyActive,
            "ya hay una sesion activa",
        ));
    }
    validate_startup_options(options)?;
    if let Some(resume) = resume {
        if resume.session_id.trim().is_empty() {
            return Err(invalid_startup_options(
                "el id de sesion a reanudar no puede estar vacio",
            ));
        }
    }
    let mut child = spawn_claude(cwd, options, resume).map_err(spawn_error)?;
    let stdin = child.stdin.take().expect("stdin piped at spawn");
    let stdout = child.stdout.take().expect("stdout piped at spawn");
    let stderr = child.stderr.take().expect("stderr piped at spawn");
    Ok(SpawnedProcess {
        child,
        stdin,
        stdout,
        stderr,
    })
}

#[tauri::command]
pub async fn start_claude_session<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ClaudeSessionState>,
    cwd: String,
    options: SessionStartOptions,
    resume: Option<ResumeOptions>,
) -> Result<(), TransportError> {
    let mut guard = state.inner().0.lock().await;
    let spawned = check_active_then_spawn(&mut guard, &cwd, &options, resume.as_ref()).await?;
    let raw_log = open_raw_log(&app);
    let (control_tx, control_rx) = mpsc::channel(4);
    tokio::spawn(read_stdout(app.clone(), spawned.stdout, raw_log, cwd));
    tokio::spawn(read_stderr(app.clone(), spawned.stderr));
    tokio::spawn(supervise(app.clone(), spawned.child, control_rx));
    *guard = Some(ActiveSession {
        stdin: spawned.stdin,
        control_tx,
    });
    Ok(())
}

#[tauri::command]
pub async fn send_claude_instruction(
    state: State<'_, ClaudeSessionState>,
    text: String,
) -> Result<(), TransportError> {
    write_line(state.inner(), user_turn_json(&text)).await
}

#[tauri::command]
pub async fn interrupt_claude_session(
    state: State<'_, ClaudeSessionState>,
) -> Result<(), TransportError> {
    write_line(state.inner(), interrupt_request_json()).await
}

#[tauri::command]
pub async fn respond_to_permission_request(
    state: State<'_, ClaudeSessionState>,
    pending: State<'_, PendingRequestsState>,
    request_id: String,
    allow: bool,
    updated_input: Option<serde_json::Value>,
    message: Option<String>,
) -> Result<(), TransportError> {
    let request = take_pending_request(pending.inner(), &request_id).await?;
    let payload = control_response_json(&request_id, allow, updated_input, message);
    if let Err(err) = write_line(state.inner(), payload).await {
        restore_pending_request(pending.inner(), request_id, request).await;
        return Err(err);
    }
    Ok(())
}

#[tauri::command]
pub async fn close_claude_session(
    state: State<'_, ClaudeSessionState>,
) -> Result<(), TransportError> {
    close_session_internal(state.inner()).await
}

// No toca PendingRequestsState a proposito: cerrar la sesion nunca concede ni deniega una peticion pendiente.
async fn close_session_internal(state: &ClaudeSessionState) -> Result<(), TransportError> {
    let mut guard = state.0.lock().await;
    let session = guard.take().ok_or_else(not_active_error)?;
    let mut stdin = session.stdin;
    let _ = stdin.shutdown().await;
    let _ = session.control_tx.send(Control::Close).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Prueba las funciones internas (sin AppHandle): tauri::test::mock_builder() falla en este entorno (ver docs/TECH_DEBT.md).

    const FIXED_ARGS: [&str; 6] = [
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
    ];

    #[test]
    fn sin_ninguna_opcion_los_argumentos_son_identicos_a_los_de_siempre() {
        let args = build_startup_args(&SessionStartOptions::default(), None);
        assert_eq!(args, FIXED_ARGS.map(String::from).to_vec());
    }

    #[test]
    fn cada_opcion_por_separado_agrega_su_flag() {
        let model_args = build_startup_args(
            &SessionStartOptions {
                model: Some("sonnet".to_string()),
                ..Default::default()
            },
            None,
        );
        assert_eq!(&model_args[6..], ["--model", "sonnet"]);

        let mode_args = build_startup_args(
            &SessionStartOptions {
                permission_mode: Some("plan".to_string()),
                ..Default::default()
            },
            None,
        );
        assert_eq!(&mode_args[6..], ["--permission-mode", "plan"]);

        let dir_args = build_startup_args(
            &SessionStartOptions {
                add_dir: Some(vec!["C:\\a".to_string(), "C:\\b".to_string()]),
                ..Default::default()
            },
            None,
        );
        assert_eq!(&dir_args[6..], ["--add-dir", "C:\\a", "C:\\b"]);

        let allowed_args = build_startup_args(
            &SessionStartOptions {
                allowed_tools: Some(vec!["Bash".to_string()]),
                ..Default::default()
            },
            None,
        );
        assert_eq!(&allowed_args[6..], ["--allowedTools", "Bash"]);

        let disallowed_args = build_startup_args(
            &SessionStartOptions {
                disallowed_tools: Some(vec!["Edit".to_string()]),
                ..Default::default()
            },
            None,
        );
        assert_eq!(&disallowed_args[6..], ["--disallowedTools", "Edit"]);

        let budget_args = build_startup_args(
            &SessionStartOptions {
                max_budget_usd: Some(5.5),
                ..Default::default()
            },
            None,
        );
        assert_eq!(&budget_args[6..], ["--max-budget-usd", "5.5"]);
    }

    #[test]
    fn reanudar_agrega_resume_y_fork_session_solo_si_corresponde() {
        let resume_args = build_startup_args(
            &SessionStartOptions::default(),
            Some(&ResumeOptions {
                session_id: "sesion-real-123".to_string(),
                fork: false,
            }),
        );
        assert_eq!(&resume_args[6..], ["--resume", "sesion-real-123"]);

        let fork_args = build_startup_args(
            &SessionStartOptions::default(),
            Some(&ResumeOptions {
                session_id: "sesion-real-123".to_string(),
                fork: true,
            }),
        );
        assert_eq!(
            &fork_args[6..],
            ["--resume", "sesion-real-123", "--fork-session"]
        );
    }

    #[test]
    fn todas_las_opciones_juntas_se_agregan_todas() {
        let options = SessionStartOptions {
            model: Some("opus".to_string()),
            permission_mode: Some("auto".to_string()),
            add_dir: Some(vec!["C:\\extra".to_string()]),
            allowed_tools: Some(vec!["Bash".to_string()]),
            disallowed_tools: Some(vec!["Edit".to_string()]),
            max_budget_usd: Some(10.0),
        };
        let args = build_startup_args(&options, None);
        assert_eq!(
            args,
            vec![
                "-p",
                "--input-format",
                "stream-json",
                "--output-format",
                "stream-json",
                "--verbose",
                "--model",
                "opus",
                "--permission-mode",
                "auto",
                "--add-dir",
                "C:\\extra",
                "--allowedTools",
                "Bash",
                "--disallowedTools",
                "Edit",
                "--max-budget-usd",
                "10",
            ]
        );
    }

    #[test]
    fn listas_vacias_no_agregan_su_flag() {
        let args = build_startup_args(
            &SessionStartOptions {
                add_dir: Some(vec![]),
                allowed_tools: Some(vec![]),
                ..Default::default()
            },
            None,
        );
        assert_eq!(args, FIXED_ARGS.map(String::from).to_vec());
    }

    #[test]
    fn modo_de_permisos_invalido_se_rechaza_antes_de_llegar_al_proceso() {
        let result = validate_startup_options(&SessionStartOptions {
            permission_mode: Some("modo-inventado".to_string()),
            ..Default::default()
        });
        assert!(matches!(
            result,
            Err(TransportError {
                kind: TransportErrorKind::InvalidStartupOptions,
                ..
            })
        ));
    }

    #[test]
    fn limite_de_gasto_no_positivo_o_no_finito_se_rechaza() {
        for invalid in [0.0, -5.0, f64::NAN, f64::INFINITY] {
            let result = validate_startup_options(&SessionStartOptions {
                max_budget_usd: Some(invalid),
                ..Default::default()
            });
            assert!(matches!(
                result,
                Err(TransportError {
                    kind: TransportErrorKind::InvalidStartupOptions,
                    ..
                })
            ));
        }
    }

    #[test]
    fn modelo_o_directorio_o_herramienta_vacios_se_rechazan() {
        assert!(validate_startup_options(&SessionStartOptions {
            model: Some("  ".to_string()),
            ..Default::default()
        })
        .is_err());
        assert!(validate_startup_options(&SessionStartOptions {
            add_dir: Some(vec!["".to_string()]),
            ..Default::default()
        })
        .is_err());
        assert!(validate_startup_options(&SessionStartOptions {
            allowed_tools: Some(vec!["   ".to_string()]),
            ..Default::default()
        })
        .is_err());
    }

    #[test]
    fn opciones_validas_completas_pasan_la_validacion() {
        let options = SessionStartOptions {
            model: Some("sonnet".to_string()),
            permission_mode: Some("acceptEdits".to_string()),
            add_dir: Some(vec!["C:\\proyecto".to_string()]),
            allowed_tools: Some(vec!["Bash".to_string()]),
            disallowed_tools: Some(vec!["Edit".to_string()]),
            max_budget_usd: Some(25.0),
        };
        assert!(validate_startup_options(&options).is_ok());
    }

    fn spawn_fake_child() -> Child {
        Command::new("cmd")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("cmd.exe is always available on Windows")
    }

    fn fake_active_session() -> (ActiveSession, Child) {
        let mut child = spawn_fake_child();
        let stdin = child.stdin.take().expect("stdin piped at spawn");
        let (control_tx, _control_rx) = mpsc::channel(4);
        (ActiveSession { stdin, control_tx }, child)
    }

    #[test]
    fn buscar_ejecutable_sin_directorios_no_encuentra_nada() {
        let result = find_executable_in_dirs(std::iter::empty(), &["claude.exe"]);
        assert!(result.is_none());
    }

    #[test]
    fn buscar_ejecutable_en_directorio_sin_coincidencia_no_encuentra_nada() {
        let dir = std::env::temp_dir().join("qa-hito1-dir-vacio");
        std::fs::create_dir_all(&dir).expect("crear directorio de prueba");
        let result =
            find_executable_in_dirs(std::iter::once(dir.clone()), &["claude.exe", "claude"]);
        assert!(result.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn buscar_ejecutable_encuentra_el_primer_nombre_candidato_presente() {
        let dir = std::env::temp_dir().join("qa-hito1-dir-con-claude");
        std::fs::create_dir_all(&dir).expect("crear directorio de prueba");
        let fake_claude = dir.join("claude.exe");
        std::fs::write(&fake_claude, b"").expect("escribir ejecutable falso");
        let result =
            find_executable_in_dirs(std::iter::once(dir.clone()), &["claude.exe", "claude"]);
        assert_eq!(result, Some(fake_claude));
        let _ = std::fs::remove_dir_all(&dir);
    }

    // Precondicion de entorno (no del codigo bajo prueba): CI publico no tiene Claude Code CLI instalado -- confirmado real solo cuando esta presente, se omite sin fallar cuando no.
    fn require_claude_on_path() -> bool {
        if resolve_claude_executable().is_some() {
            return true;
        }
        eprintln!(
            "[omitida] claude no esta en PATH de este entorno -- requiere Claude Code CLI real instalado"
        );
        false
    }

    // Supuesto compartido con el resto de este archivo (ver ejecutable_presente_arranca_sin_producir_el_error_de_ausencia): la maquina de pruebas tiene claude.exe real instalado y en PATH.
    #[test]
    fn resolve_claude_executable_encuentra_el_ejecutable_real_de_este_entorno() {
        if !require_claude_on_path() {
            return;
        }
        let resolved = resolve_claude_executable();
        assert!(
            resolved.as_ref().is_some_and(|path| path.is_file()),
            "se esperaba encontrar claude en PATH en este entorno de pruebas"
        );
    }

    #[tokio::test]
    async fn comando_ausente_en_path_produce_el_mensaje_de_claude_code_no_encontrado() {
        let err = Command::new("comando-que-nunca-existira-en-esta-maquina-98765")
            .spawn()
            .expect_err("este comando no debe existir en PATH de la maquina de pruebas");
        assert_eq!(err.kind(), ErrorKind::NotFound);

        let transport_err = spawn_error(err);

        assert!(matches!(
            transport_err,
            TransportError {
                kind: TransportErrorKind::ClaudeCodeNotFound,
                ..
            }
        ));
        assert!(transport_err.message.contains("Claude Code"));
    }

    // Windows reporta el mismo ErrorKind::PermissionDenied para un directorio-como-binario que para un ejecutable sin permiso real; spawn_error no debe confundirlo con "ausente".
    #[tokio::test]
    async fn sin_permisos_de_ejecucion_no_se_confunde_con_claude_code_ausente() {
        let sin_permiso = std::env::temp_dir().join("directorio-sin-slash-final");
        std::fs::create_dir_all(&sin_permiso).expect("crear directorio de prueba");
        let err = Command::new(&sin_permiso)
            .spawn()
            .expect_err("un directorio no es un ejecutable valido");
        assert_eq!(err.kind(), ErrorKind::PermissionDenied);

        let transport_err = spawn_error(err);

        assert!(matches!(
            transport_err,
            TransportError {
                kind: TransportErrorKind::ProcessSpawnFailed,
                ..
            }
        ));
    }

    // presente y autenticado (happy path): un ejecutable que si existe en PATH arranca sin
    // pasar nunca por spawn_error, el mismo comando que ya usa fake_active_session.
    #[tokio::test]
    async fn ejecutable_presente_arranca_sin_producir_el_error_de_ausencia() {
        let result = Command::new("cmd")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();
        assert!(result.is_ok());
        let _ = result.unwrap().start_kill();
    }

    #[tokio::test]
    async fn iniciar_sesion_con_carpeta_de_trabajo_inexistente_no_arranca_el_proceso() {
        if !require_claude_on_path() {
            return;
        }
        let mut slot: Option<ActiveSession> = None;
        let result = check_active_then_spawn(
            &mut slot,
            "C:\\ruta-que-no-existe-en-disco-nunca-jamas-12345",
            &SessionStartOptions::default(),
            None,
        )
        .await;
        assert!(matches!(
            result,
            Err(TransportError {
                kind: TransportErrorKind::ProcessSpawnFailed,
                ..
            })
        ));
        assert!(slot.is_none());
    }

    #[tokio::test]
    async fn enviar_instruccion_sin_sesion_activa_no_escribe_a_ningun_proceso() {
        let state = ClaudeSessionState::default();
        let result = write_line(&state, user_turn_json("hola")).await;
        assert!(matches!(
            result,
            Err(TransportError {
                kind: TransportErrorKind::SessionNotActive,
                ..
            })
        ));
    }

    #[tokio::test]
    async fn interrumpir_sin_sesion_activa_no_bloquea_ni_entra_en_panico() {
        let state = ClaudeSessionState::default();
        let result = write_line(&state, interrupt_request_json()).await;
        assert!(matches!(
            result,
            Err(TransportError {
                kind: TransportErrorKind::SessionNotActive,
                ..
            })
        ));
    }

    #[tokio::test]
    async fn iniciar_una_segunda_sesion_sin_cerrar_la_primera_se_rechaza() {
        let (session, mut child) = fake_active_session();
        let mut slot = Some(session);
        let result =
            check_active_then_spawn(&mut slot, ".", &SessionStartOptions::default(), None).await;
        assert!(matches!(
            result,
            Err(TransportError {
                kind: TransportErrorKind::SessionAlreadyActive,
                ..
            })
        ));
        let _ = child.start_kill();
    }

    #[tokio::test]
    async fn cerrar_dos_veces_seguidas_la_segunda_no_encuentra_sesion() {
        let (session, mut child) = fake_active_session();
        let state = ClaudeSessionState::default();
        *state.0.lock().await = Some(session);
        close_session_internal(&state)
            .await
            .expect("primera sesion si estaba activa");
        let result = close_session_internal(&state).await;
        assert!(matches!(
            result,
            Err(TransportError {
                kind: TransportErrorKind::SessionNotActive,
                ..
            })
        ));
        let _ = child.start_kill();
    }

    #[tokio::test]
    async fn sesion_activa_permite_enviar_una_instruccion_y_cerrar_dejando_el_estado_vacio() {
        let (session, mut child) = fake_active_session();
        let state = ClaudeSessionState::default();
        *state.0.lock().await = Some(session);
        write_line(&state, user_turn_json("hola desde la prueba"))
            .await
            .expect("la sesion esta activa, la escritura debe tener exito");
        close_session_internal(&state)
            .await
            .expect("la sesion sigue activa antes de cerrarla");
        assert!(state.0.lock().await.is_none());
        let _ = child.start_kill();
    }

    fn fake_permission_request(request_id: &str) -> InteractionRequest {
        InteractionRequest::Permission {
            request_id: request_id.to_string(),
            tool_name: "Bash".to_string(),
            input: serde_json::json!({ "command": "echo hola" }),
        }
    }

    async fn respond(
        session_state: &ClaudeSessionState,
        pending: &PendingRequestsState,
        request_id: &str,
        allow: bool,
    ) -> Result<(), TransportError> {
        let request = take_pending_request(pending, request_id).await?;
        let payload = control_response_json(request_id, allow, None, None);
        if let Err(err) = write_line(session_state, payload).await {
            restore_pending_request(pending, request_id.to_string(), request).await;
            return Err(err);
        }
        Ok(())
    }

    #[test]
    fn una_peticion_can_use_tool_sin_request_id_no_se_registra() {
        let raw = serde_json::json!({
            "type": "control_request",
            "request": { "subtype": "can_use_tool", "tool_name": "Bash", "input": {} }
        });
        assert!(interaction_request::parse_can_use_tool_request(&raw).is_none());
    }

    #[test]
    fn una_peticion_can_use_tool_sin_tool_name_no_se_registra() {
        let raw = serde_json::json!({
            "type": "control_request",
            "request_id": "req-1",
            "request": { "subtype": "can_use_tool", "input": {} }
        });
        assert!(interaction_request::parse_can_use_tool_request(&raw).is_none());
    }

    #[tokio::test]
    async fn responder_a_una_peticion_que_no_existe_no_se_confunde_con_una_autorizacion() {
        let (session, mut child) = fake_active_session();
        let session_state = ClaudeSessionState::default();
        *session_state.0.lock().await = Some(session);
        let pending = PendingRequestsState::default();

        let result = respond(&session_state, &pending, "req-jamas-existio", true).await;

        assert!(matches!(
            result,
            Err(TransportError {
                kind: TransportErrorKind::RequestNotPending,
                ..
            })
        ));
        let _ = child.start_kill();
    }

    #[tokio::test]
    async fn responder_dos_veces_a_la_misma_peticion_la_segunda_vez_falla() {
        let (session, mut child) = fake_active_session();
        let session_state = ClaudeSessionState::default();
        *session_state.0.lock().await = Some(session);
        let pending = PendingRequestsState::default();
        pending
            .0
            .lock()
            .await
            .insert("req-1".to_string(), fake_permission_request("req-1"));

        respond(&session_state, &pending, "req-1", true)
            .await
            .expect("la primera respuesta si tiene una peticion pendiente");
        let second = respond(&session_state, &pending, "req-1", true).await;

        assert!(matches!(
            second,
            Err(TransportError {
                kind: TransportErrorKind::RequestNotPending,
                ..
            })
        ));
        let _ = child.start_kill();
    }

    #[tokio::test]
    async fn dos_peticiones_pendientes_a_la_vez_se_resuelven_por_separado_sin_confundirse() {
        let (session, mut child) = fake_active_session();
        let session_state = ClaudeSessionState::default();
        *session_state.0.lock().await = Some(session);
        let pending = PendingRequestsState::default();
        pending
            .0
            .lock()
            .await
            .insert("req-a".to_string(), fake_permission_request("req-a"));
        pending
            .0
            .lock()
            .await
            .insert("req-b".to_string(), fake_permission_request("req-b"));

        respond(&session_state, &pending, "req-a", true)
            .await
            .expect("req-a tiene una peticion pendiente");

        assert!(pending.0.lock().await.get("req-a").is_none());
        assert!(pending.0.lock().await.get("req-b").is_some());
        let _ = child.start_kill();
    }

    #[tokio::test]
    async fn cerrar_la_sesion_no_resuelve_las_peticiones_pendientes() {
        let (session, mut child) = fake_active_session();
        let session_state = ClaudeSessionState::default();
        *session_state.0.lock().await = Some(session);
        let pending = PendingRequestsState::default();
        pending.0.lock().await.insert(
            "req-huerfana".to_string(),
            fake_permission_request("req-huerfana"),
        );

        close_session_internal(&session_state)
            .await
            .expect("la sesion estaba activa");

        assert!(pending.0.lock().await.get("req-huerfana").is_some());
        let _ = child.start_kill();
    }

    #[tokio::test]
    async fn conceder_una_peticion_pendiente_envia_la_respuesta_y_la_deja_de_estar_pendiente() {
        let (session, mut child) = fake_active_session();
        let session_state = ClaudeSessionState::default();
        *session_state.0.lock().await = Some(session);
        let pending = PendingRequestsState::default();
        pending.0.lock().await.insert(
            "req-feliz".to_string(),
            fake_permission_request("req-feliz"),
        );

        respond(&session_state, &pending, "req-feliz", true)
            .await
            .expect("la peticion estaba pendiente, la respuesta debe tener exito");

        assert!(pending.0.lock().await.is_empty());
        let _ = child.start_kill();
    }
}

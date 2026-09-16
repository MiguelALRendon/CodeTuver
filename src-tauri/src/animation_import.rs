use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

const IMPORTED_ANIMATIONS_DIR: &str = "imported-animations";
const GLTF_MAGIC: u32 = 0x4654_6C67;
const GLTF_HEADER_LEN: usize = 12;
const VRMA_EXTENSION: &str = "vrma";

#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AnimationImportErrorKind {
    FileNotFound,
    UnsupportedFormat,
    CorruptVrmaHeader,
    InvalidKind,
    IoError,
}

#[derive(Debug, Serialize)]
pub struct AnimationImportError {
    kind: AnimationImportErrorKind,
    message: String,
}

impl AnimationImportError {
    fn new(kind: AnimationImportErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AnimationKind {
    Animation,
    Pose,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedAnimationSummary {
    pub id: String,
    pub name: String,
    pub saved_path: String,
    pub kind: AnimationKind,
}

// Mismo header glTF binario que character_import.rs valida para .vrm — un .vrma es el mismo contenedor con la extension VRMC_vrm_animation, sin dependencia entre los dos modulos paralelos (D5).
pub fn validate_vrma_header(bytes: &[u8]) -> Result<(), AnimationImportError> {
    if bytes.len() < GLTF_HEADER_LEN {
        return Err(AnimationImportError::new(
            AnimationImportErrorKind::CorruptVrmaHeader,
            format!(
                "el archivo tiene {} bytes, se requieren al menos {GLTF_HEADER_LEN} de header glTF",
                bytes.len()
            ),
        ));
    }
    let magic = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
    if magic != GLTF_MAGIC {
        return Err(AnimationImportError::new(
            AnimationImportErrorKind::CorruptVrmaHeader,
            "los primeros 4 bytes no coinciden con el magic glTF (\"glTF\")",
        ));
    }
    let declared_length = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize;
    if declared_length != bytes.len() {
        return Err(AnimationImportError::new(
            AnimationImportErrorKind::CorruptVrmaHeader,
            format!(
                "el header declara {declared_length} bytes pero el archivo tiene {}",
                bytes.len()
            ),
        ));
    }
    Ok(())
}

fn validate_extension(path: &Path) -> Result<(), AnimationImportError> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if extension == VRMA_EXTENSION {
        return Ok(());
    }
    Err(AnimationImportError::new(
        AnimationImportErrorKind::UnsupportedFormat,
        format!("formato no soportado, se esperaba .vrma: {}", path.display()),
    ))
}

fn parse_kind(kind: &str) -> Result<AnimationKind, AnimationImportError> {
    match kind {
        "animation" => Ok(AnimationKind::Animation),
        "pose" => Ok(AnimationKind::Pose),
        other => Err(AnimationImportError::new(
            AnimationImportErrorKind::InvalidKind,
            format!("kind desconocido: \"{other}\", se esperaba \"animation\" o \"pose\""),
        )),
    }
}

fn display_name(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("animacion")
        .to_string()
}

fn build_summary(
    source_path: &Path,
    kind: AnimationKind,
    saved_path: &Path,
) -> ImportedAnimationSummary {
    let id = saved_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("animacion")
        .to_string();
    ImportedAnimationSummary {
        id,
        name: display_name(source_path),
        saved_path: saved_path.display().to_string(),
        kind,
    }
}

fn imported_animations_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(IMPORTED_ANIMATIONS_DIR)
}

fn kind_dir_name(kind: AnimationKind) -> &'static str {
    match kind {
        AnimationKind::Animation => "animation",
        AnimationKind::Pose => "pose",
    }
}

// El kind no es derivable de la extension (siempre .vrma): se codifica en la subcarpeta para poder reconstruirlo al listar.
fn imported_kind_dir(app_data_dir: &Path, kind: AnimationKind) -> PathBuf {
    imported_animations_dir(app_data_dir).join(kind_dir_name(kind))
}

fn io_error(err: std::io::Error) -> AnimationImportError {
    AnimationImportError::new(AnimationImportErrorKind::IoError, format!("error de E/S: {err}"))
}

fn join_error(err: tokio::task::JoinError) -> AnimationImportError {
    AnimationImportError::new(
        AnimationImportErrorKind::IoError,
        format!("la tarea de importacion no completo: {err}"),
    )
}

// Nunca depende de la red: solo lectura/escritura de disco (mismo patron que character_import.rs).
fn save_imported_file(
    app_data_dir: &Path,
    source_path: &Path,
    kind: AnimationKind,
    bytes: &[u8],
) -> Result<PathBuf, AnimationImportError> {
    let dir = imported_kind_dir(app_data_dir, kind);
    std::fs::create_dir_all(&dir).map_err(io_error)?;
    let file_name = source_path.file_name().ok_or_else(|| {
        AnimationImportError::new(
            AnimationImportErrorKind::IoError,
            "la ruta no tiene nombre de archivo",
        )
    })?;
    // Reimportar el mismo nombre lo sobrescribe: es idempotente, no un error.
    let destination = dir.join(file_name);
    std::fs::write(&destination, bytes).map_err(io_error)?;
    Ok(destination)
}

fn import_animation_sync(
    app_data_dir: &Path,
    source_path: &Path,
    kind: &str,
) -> Result<ImportedAnimationSummary, AnimationImportError> {
    if !source_path.is_file() {
        return Err(AnimationImportError::new(
            AnimationImportErrorKind::FileNotFound,
            format!("no se encontro el archivo: {}", source_path.display()),
        ));
    }
    validate_extension(source_path)?;
    let parsed_kind = parse_kind(kind)?;
    let bytes = std::fs::read(source_path).map_err(io_error)?;
    validate_vrma_header(&bytes)?;
    let saved_path = save_imported_file(app_data_dir, source_path, parsed_kind, &bytes)?;
    Ok(build_summary(source_path, parsed_kind, &saved_path))
}

// 5.6: hermana de import_animation_sync — mismo directorio/validacion, la fuente es un nombre+bytes en memoria en vez de una ruta en disco.
fn save_created_sync(
    app_data_dir: &Path,
    file_name: &str,
    kind: &str,
    bytes: &[u8],
) -> Result<ImportedAnimationSummary, AnimationImportError> {
    let source_path = PathBuf::from(file_name);
    validate_extension(&source_path)?;
    let parsed_kind = parse_kind(kind)?;
    validate_vrma_header(bytes)?;
    let saved_path = save_imported_file(app_data_dir, &source_path, parsed_kind, bytes)?;
    Ok(build_summary(&source_path, parsed_kind, &saved_path))
}

fn summarize_existing_file(path: &Path, kind: AnimationKind) -> Option<ImportedAnimationSummary> {
    validate_extension(path).ok()?;
    Some(build_summary(path, kind, path))
}

fn list_imported_sync(
    app_data_dir: &Path,
) -> Result<Vec<ImportedAnimationSummary>, AnimationImportError> {
    let mut summaries = Vec::new();
    for kind in [AnimationKind::Animation, AnimationKind::Pose] {
        let dir = imported_kind_dir(app_data_dir, kind);
        if !dir.is_dir() {
            continue;
        }
        let entries = std::fs::read_dir(&dir).map_err(io_error)?;
        summaries.extend(
            entries
                .filter_map(Result::ok)
                .filter_map(|entry| summarize_existing_file(&entry.path(), kind)),
        );
    }
    Ok(summaries)
}

fn resolve_app_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, AnimationImportError> {
    app.path().app_data_dir().map_err(|err| {
        AnimationImportError::new(
            AnimationImportErrorKind::IoError,
            format!("no se pudo resolver el directorio de datos de la app: {err}"),
        )
    })
}

#[tauri::command]
pub async fn import_animation_file<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    kind: String,
) -> Result<ImportedAnimationSummary, AnimationImportError> {
    let app_data_dir = resolve_app_data_dir(&app)?;
    let source_path = PathBuf::from(path);
    tokio::task::spawn_blocking(move || {
        import_animation_sync(&app_data_dir, &source_path, &kind)
    })
    .await
    .unwrap_or_else(|join_err| Err(join_error(join_err)))
}

#[tauri::command]
pub async fn save_created_animation_file<R: Runtime>(
    app: AppHandle<R>,
    bytes: Vec<u8>,
    kind: String,
    file_name: String,
) -> Result<ImportedAnimationSummary, AnimationImportError> {
    let app_data_dir = resolve_app_data_dir(&app)?;
    tokio::task::spawn_blocking(move || {
        save_created_sync(&app_data_dir, &file_name, &kind, &bytes)
    })
    .await
    .unwrap_or_else(|join_err| Err(join_error(join_err)))
}

#[tauri::command]
pub async fn list_imported_animations<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<ImportedAnimationSummary>, AnimationImportError> {
    let app_data_dir = resolve_app_data_dir(&app)?;
    tokio::task::spawn_blocking(move || list_imported_sync(&app_data_dir))
        .await
        .unwrap_or_else(|join_err| Err(join_error(join_err)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_glb_bytes(payload_len: u32) -> Vec<u8> {
        let total_len = GLTF_HEADER_LEN as u32 + payload_len;
        let mut bytes = Vec::with_capacity(total_len as usize);
        bytes.extend_from_slice(&GLTF_MAGIC.to_le_bytes());
        bytes.extend_from_slice(&2u32.to_le_bytes());
        bytes.extend_from_slice(&total_len.to_le_bytes());
        bytes.extend(std::iter::repeat(0u8).take(payload_len as usize));
        bytes
    }

    #[test]
    fn header_truncado_menos_de_doce_bytes_se_rechaza() {
        let bytes = vec![0x67, 0x6c, 0x54];
        let err = validate_vrma_header(&bytes).unwrap_err();
        assert!(matches!(err.kind, AnimationImportErrorKind::CorruptVrmaHeader));
    }

    #[test]
    fn magic_bytes_incorrectos_se_rechazan() {
        let mut bytes = valid_glb_bytes(0);
        bytes[0] = 0x00;
        let err = validate_vrma_header(&bytes).unwrap_err();
        assert!(matches!(err.kind, AnimationImportErrorKind::CorruptVrmaHeader));
    }

    #[test]
    fn length_declarado_que_no_coincide_con_el_tamano_real_se_rechaza() {
        let mut bytes = valid_glb_bytes(4);
        bytes[8..12].copy_from_slice(&999u32.to_le_bytes());
        let err = validate_vrma_header(&bytes).unwrap_err();
        assert!(matches!(err.kind, AnimationImportErrorKind::CorruptVrmaHeader));
    }

    #[test]
    fn extension_incorrecta_se_rechaza_sin_leer_el_archivo() {
        let err = validate_extension(Path::new("modelo.vrm")).unwrap_err();
        assert!(matches!(
            err.kind,
            AnimationImportErrorKind::UnsupportedFormat
        ));
    }

    #[test]
    fn kind_desconocido_se_rechaza() {
        let err = parse_kind("gesto").unwrap_err();
        assert!(matches!(err.kind, AnimationImportErrorKind::InvalidKind));
    }

    #[test]
    fn archivo_inexistente_se_rechaza_como_file_not_found() {
        let dir = std::env::temp_dir().join("codetuver-avatar-animation-import-test-inexistente");
        let source = dir.join("no-existe.vrma");
        let err = import_animation_sync(&dir, &source, "animation").unwrap_err();
        assert!(matches!(err.kind, AnimationImportErrorKind::FileNotFound));
    }

    #[test]
    fn header_vrma_valido_se_acepta() {
        let bytes = valid_glb_bytes(8);
        assert!(validate_vrma_header(&bytes).is_ok());
    }

    #[test]
    fn kind_animation_y_pose_se_aceptan() {
        assert!(matches!(parse_kind("animation").unwrap(), AnimationKind::Animation));
        assert!(matches!(parse_kind("pose").unwrap(), AnimationKind::Pose));
    }

    #[test]
    fn import_completo_copia_el_archivo_y_devuelve_el_resumen() {
        let temp = std::env::temp_dir().join(format!(
            "codetuver-avatar-animation-import-test-{}",
            std::process::id()
        ));
        let app_data_dir = temp.join("app-data");
        let source_dir = temp.join("source");
        std::fs::create_dir_all(&source_dir).unwrap();
        let source_path = source_dir.join("saludo.vrma");
        std::fs::write(&source_path, valid_glb_bytes(4)).unwrap();

        let summary = import_animation_sync(&app_data_dir, &source_path, "pose").unwrap();

        assert_eq!(summary.name, "saludo");
        assert!(matches!(summary.kind, AnimationKind::Pose));
        assert!(Path::new(&summary.saved_path).is_file());

        std::fs::remove_dir_all(&temp).ok();
    }

    fn temp_app_data_dir(test_name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "codetuver-avatar-animation-import-list-{test_name}-{}",
            std::process::id()
        ))
    }

    #[test]
    fn listar_sin_directorio_devuelve_lista_vacia() {
        let app_data_dir = temp_app_data_dir("directorio-vacio");
        std::fs::remove_dir_all(&app_data_dir).ok();

        let result = list_imported_sync(&app_data_dir).unwrap();

        assert!(result.is_empty());
    }

    #[test]
    fn listar_incluye_animaciones_y_poses_guardadas() {
        let app_data_dir = temp_app_data_dir("con-archivos");
        std::fs::remove_dir_all(&app_data_dir).ok();
        let animation_dir = imported_kind_dir(&app_data_dir, AnimationKind::Animation);
        let pose_dir = imported_kind_dir(&app_data_dir, AnimationKind::Pose);
        std::fs::create_dir_all(&animation_dir).unwrap();
        std::fs::create_dir_all(&pose_dir).unwrap();
        std::fs::write(animation_dir.join("baile.vrma"), valid_glb_bytes(4)).unwrap();
        std::fs::write(pose_dir.join("saludo.vrma"), valid_glb_bytes(4)).unwrap();

        let mut result = list_imported_sync(&app_data_dir).unwrap();
        result.sort_by(|a, b| a.name.cmp(&b.name));

        assert_eq!(result.len(), 2);
        assert_eq!(result[0].name, "baile");
        assert!(matches!(result[0].kind, AnimationKind::Animation));
        assert_eq!(result[1].name, "saludo");
        assert!(matches!(result[1].kind, AnimationKind::Pose));

        std::fs::remove_dir_all(&app_data_dir).ok();
    }

    #[test]
    fn listar_omite_archivo_con_extension_invalida_sin_tumbar_el_resto() {
        let app_data_dir = temp_app_data_dir("archivo-corrupto");
        std::fs::remove_dir_all(&app_data_dir).ok();
        let pose_dir = imported_kind_dir(&app_data_dir, AnimationKind::Pose);
        std::fs::create_dir_all(&pose_dir).unwrap();
        std::fs::write(pose_dir.join("saludo.vrma"), valid_glb_bytes(4)).unwrap();
        std::fs::write(pose_dir.join("no-es-una-animacion.txt"), b"basura").unwrap();

        let result = list_imported_sync(&app_data_dir).unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "saludo");

        std::fs::remove_dir_all(&app_data_dir).ok();
    }

    #[test]
    fn guardar_creado_con_bytes_vacios_se_rechaza() {
        let app_data_dir = temp_app_data_dir("creado-bytes-vacios");
        std::fs::remove_dir_all(&app_data_dir).ok();

        let err = save_created_sync(&app_data_dir, "pose.vrma", "pose", &[]).unwrap_err();

        assert!(matches!(err.kind, AnimationImportErrorKind::CorruptVrmaHeader));
        std::fs::remove_dir_all(&app_data_dir).ok();
    }

    #[test]
    fn guardar_creado_sin_poder_crear_el_directorio_destino_se_rechaza() {
        let app_data_dir = temp_app_data_dir("creado-sin-permisos");
        std::fs::remove_dir_all(&app_data_dir).ok();
        std::fs::create_dir_all(imported_animations_dir(&app_data_dir)).unwrap();
        // Un archivo regular ocupando el nombre de la carpeta destino hace que create_dir_all falle, igual que un directorio sin permiso de escritura.
        std::fs::write(imported_animations_dir(&app_data_dir).join("pose"), b"ocupado").unwrap();

        let err =
            save_created_sync(&app_data_dir, "pose.vrma", "pose", &valid_glb_bytes(4)).unwrap_err();

        assert!(matches!(err.kind, AnimationImportErrorKind::IoError));
        std::fs::remove_dir_all(&app_data_dir).ok();
    }

    #[test]
    fn guardar_creado_completo_escribe_el_archivo_y_devuelve_el_resumen() {
        let app_data_dir = temp_app_data_dir("creado-happy-path");
        std::fs::remove_dir_all(&app_data_dir).ok();

        let summary =
            save_created_sync(&app_data_dir, "pose-creada.vrma", "pose", &valid_glb_bytes(4))
                .unwrap();

        assert_eq!(summary.name, "pose-creada");
        assert!(matches!(summary.kind, AnimationKind::Pose));
        assert!(Path::new(&summary.saved_path).is_file());
        std::fs::remove_dir_all(&app_data_dir).ok();
    }
}

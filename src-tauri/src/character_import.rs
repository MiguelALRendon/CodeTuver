use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

const IMPORTED_CHARACTERS_DIR: &str = "imported-characters";
const GLTF_MAGIC: u32 = 0x4654_6C67;
const GLTF_HEADER_LEN: usize = 12;
const LIVE2D_MANIFEST_SUFFIX: &str = ".model3.json";

#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
enum CharacterImportErrorKind {
    FileNotFound,
    UnsupportedFormat,
    CorruptVrmHeader,
    InvalidLive2dManifest,
    IoError,
}

#[derive(Debug, Serialize)]
pub struct CharacterImportError {
    kind: CharacterImportErrorKind,
    message: String,
}

impl CharacterImportError {
    fn new(kind: CharacterImportErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CharacterFormat {
    Vrm,
    Live2d,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterCapabilities {
    pub expression: bool,
    pub mouth: bool,
    pub eyebrows: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedCharacterSummary {
    pub id: String,
    pub name: String,
    pub format: CharacterFormat,
    pub saved_path: String,
    pub capabilities: CharacterCapabilities,
}

pub fn validate_vrm_header(bytes: &[u8]) -> Result<(), CharacterImportError> {
    if bytes.len() < GLTF_HEADER_LEN {
        return Err(CharacterImportError::new(
            CharacterImportErrorKind::CorruptVrmHeader,
            format!(
                "el archivo tiene {} bytes, se requieren al menos {GLTF_HEADER_LEN} de header glTF",
                bytes.len()
            ),
        ));
    }
    let magic = u32::from_le_bytes(bytes[0..4].try_into().unwrap());
    if magic != GLTF_MAGIC {
        return Err(CharacterImportError::new(
            CharacterImportErrorKind::CorruptVrmHeader,
            "los primeros 4 bytes no coinciden con el magic glTF (\"glTF\")",
        ));
    }
    let declared_length = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize;
    if declared_length != bytes.len() {
        return Err(CharacterImportError::new(
            CharacterImportErrorKind::CorruptVrmHeader,
            format!(
                "el header declara {declared_length} bytes pero el archivo tiene {}",
                bytes.len()
            ),
        ));
    }
    Ok(())
}

pub fn validate_live2d_manifest(bytes: &[u8]) -> Result<(), CharacterImportError> {
    let value: serde_json::Value = serde_json::from_slice(bytes).map_err(|err| {
        CharacterImportError::new(
            CharacterImportErrorKind::InvalidLive2dManifest,
            format!("el manifiesto Live2D no es JSON valido: {err}"),
        )
    })?;
    let object = value.as_object().ok_or_else(|| {
        CharacterImportError::new(
            CharacterImportErrorKind::InvalidLive2dManifest,
            "el manifiesto Live2D no es un objeto JSON",
        )
    })?;
    if !object.contains_key("Version") || !object.contains_key("FileReferences") {
        return Err(CharacterImportError::new(
            CharacterImportErrorKind::InvalidLive2dManifest,
            "el manifiesto Live2D no tiene las claves 'Version' y 'FileReferences'",
        ));
    }
    Ok(())
}

fn detect_format(path: &Path) -> Result<CharacterFormat, CharacterImportError> {
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match extension.as_str() {
        "vrm" | "glb" => Ok(CharacterFormat::Vrm),
        "json" if file_name.to_lowercase().ends_with(LIVE2D_MANIFEST_SUFFIX) => {
            Ok(CharacterFormat::Live2d)
        }
        _ => Err(CharacterImportError::new(
            CharacterImportErrorKind::UnsupportedFormat,
            format!("formato no soportado: {}", path.display()),
        )),
    }
}

// Sin parsear la escena/moc3 completa (fuera de alcance), las capacidades se declaran por formato, no por archivo: VRM tiene visemas y blendshapes estandar pero cejas no estandarizadas; Live2D es indeterminado sin parsear el .moc3 de cada modelo.
fn capabilities_for(format: CharacterFormat) -> CharacterCapabilities {
    match format {
        CharacterFormat::Vrm => CharacterCapabilities {
            expression: true,
            mouth: true,
            eyebrows: false,
        },
        CharacterFormat::Live2d => CharacterCapabilities {
            expression: false,
            mouth: false,
            eyebrows: false,
        },
    }
}

fn display_name(path: &Path, format: CharacterFormat) -> String {
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("personaje");
    match format {
        CharacterFormat::Vrm => path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(file_name)
            .to_string(),
        CharacterFormat::Live2d => {
            let suffix_len = LIVE2D_MANIFEST_SUFFIX.len();
            if file_name.to_lowercase().ends_with(LIVE2D_MANIFEST_SUFFIX) && file_name.len() > suffix_len {
                file_name[..file_name.len() - suffix_len].to_string()
            } else {
                file_name.to_string()
            }
        }
    }
}

fn build_summary(
    source_path: &Path,
    format: CharacterFormat,
    saved_path: &Path,
) -> ImportedCharacterSummary {
    let id = saved_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("personaje")
        .to_string();
    ImportedCharacterSummary {
        id,
        name: display_name(source_path, format),
        format,
        saved_path: saved_path.display().to_string(),
        capabilities: capabilities_for(format),
    }
}

fn imported_characters_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(IMPORTED_CHARACTERS_DIR)
}

fn io_error(err: std::io::Error) -> CharacterImportError {
    CharacterImportError::new(CharacterImportErrorKind::IoError, format!("error de E/S: {err}"))
}

fn join_error(err: tokio::task::JoinError) -> CharacterImportError {
    CharacterImportError::new(
        CharacterImportErrorKind::IoError,
        format!("la tarea de importacion no completo: {err}"),
    )
}

// Nunca depende de la red: solo lectura/escritura de disco (mismo patron que raw_log.rs/session_preferences.rs).
fn save_imported_file(
    app_data_dir: &Path,
    source_path: &Path,
    bytes: &[u8],
) -> Result<PathBuf, CharacterImportError> {
    let dir = imported_characters_dir(app_data_dir);
    std::fs::create_dir_all(&dir).map_err(io_error)?;
    let file_name = source_path.file_name().ok_or_else(|| {
        CharacterImportError::new(
            CharacterImportErrorKind::IoError,
            "la ruta no tiene nombre de archivo",
        )
    })?;
    // Reimportar el mismo nombre lo sobrescribe: es idempotente, no un error.
    let destination = dir.join(file_name);
    std::fs::write(&destination, bytes).map_err(io_error)?;
    Ok(destination)
}

fn import_character_sync(
    app_data_dir: &Path,
    source_path: &Path,
) -> Result<ImportedCharacterSummary, CharacterImportError> {
    if !source_path.is_file() {
        return Err(CharacterImportError::new(
            CharacterImportErrorKind::FileNotFound,
            format!("no se encontro el archivo: {}", source_path.display()),
        ));
    }
    let format = detect_format(source_path)?;
    let bytes = std::fs::read(source_path).map_err(io_error)?;
    match format {
        CharacterFormat::Vrm => validate_vrm_header(&bytes)?,
        CharacterFormat::Live2d => validate_live2d_manifest(&bytes)?,
    }
    let saved_path = save_imported_file(app_data_dir, source_path, &bytes)?;
    Ok(build_summary(source_path, format, &saved_path))
}

fn summarize_existing_file(path: &Path) -> Option<ImportedCharacterSummary> {
    let format = detect_format(path).ok()?;
    Some(build_summary(path, format, path))
}

fn list_imported_sync(
    app_data_dir: &Path,
) -> Result<Vec<ImportedCharacterSummary>, CharacterImportError> {
    let dir = imported_characters_dir(app_data_dir);
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let entries = std::fs::read_dir(&dir).map_err(io_error)?;
    Ok(entries
        .filter_map(Result::ok)
        .filter_map(|entry| summarize_existing_file(&entry.path()))
        .collect())
}

fn resolve_app_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, CharacterImportError> {
    app.path().app_data_dir().map_err(|err| {
        CharacterImportError::new(
            CharacterImportErrorKind::IoError,
            format!("no se pudo resolver el directorio de datos de la app: {err}"),
        )
    })
}

#[tauri::command]
pub async fn import_character_file<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<ImportedCharacterSummary, CharacterImportError> {
    let app_data_dir = resolve_app_data_dir(&app)?;
    let source_path = PathBuf::from(path);
    tokio::task::spawn_blocking(move || import_character_sync(&app_data_dir, &source_path))
        .await
        .unwrap_or_else(|join_err| Err(join_error(join_err)))
}

#[tauri::command]
pub async fn list_imported_characters<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<ImportedCharacterSummary>, CharacterImportError> {
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
        let err = validate_vrm_header(&bytes).unwrap_err();
        assert!(matches!(err.kind, CharacterImportErrorKind::CorruptVrmHeader));
    }

    #[test]
    fn magic_bytes_incorrectos_se_rechazan() {
        let mut bytes = valid_glb_bytes(0);
        bytes[0] = 0x00;
        let err = validate_vrm_header(&bytes).unwrap_err();
        assert!(matches!(err.kind, CharacterImportErrorKind::CorruptVrmHeader));
    }

    #[test]
    fn length_declarado_que_no_coincide_con_el_tamano_real_se_rechaza() {
        let mut bytes = valid_glb_bytes(4);
        bytes[8..12].copy_from_slice(&999u32.to_le_bytes());
        let err = validate_vrm_header(&bytes).unwrap_err();
        assert!(matches!(err.kind, CharacterImportErrorKind::CorruptVrmHeader));
    }

    #[test]
    fn archivo_vacio_se_rechaza_como_header_corrupto() {
        let err = validate_vrm_header(&[]).unwrap_err();
        assert!(matches!(err.kind, CharacterImportErrorKind::CorruptVrmHeader));
    }

    #[test]
    fn header_vrm_valido_se_acepta() {
        let bytes = valid_glb_bytes(8);
        assert!(validate_vrm_header(&bytes).is_ok());
    }

    #[test]
    fn json_que_no_parsea_se_rechaza() {
        let err = validate_live2d_manifest(b"esto no es json {{{").unwrap_err();
        assert!(matches!(
            err.kind,
            CharacterImportErrorKind::InvalidLive2dManifest
        ));
    }

    #[test]
    fn json_valido_sin_filereferences_se_rechaza() {
        let json = br#"{"Version": 3}"#;
        let err = validate_live2d_manifest(json).unwrap_err();
        assert!(matches!(
            err.kind,
            CharacterImportErrorKind::InvalidLive2dManifest
        ));
    }

    #[test]
    fn manifiesto_live2d_valido_se_acepta() {
        let json = br#"{"Version": 3, "FileReferences": {"Moc": "modelo.moc3"}}"#;
        assert!(validate_live2d_manifest(json).is_ok());
    }
}

import { invoke } from '@tauri-apps/api/core';

export type AnimationImportErrorKind =
  | 'file-not-found'
  | 'unsupported-format'
  | 'corrupt-vrma-header'
  | 'invalid-kind'
  | 'invalid-response'
  | 'io-error';

export interface AnimationImportError {
  kind: AnimationImportErrorKind;
  message: string;
}

export type ImportedAnimationKind = 'animation' | 'pose';

export interface ImportedAnimationSummary {
  id: string;
  name: string;
  savedPath: string;
  kind: ImportedAnimationKind;
}

const KNOWN_KINDS: readonly ImportedAnimationKind[] = ['animation', 'pose'];

// Revalida en runtime: el tipo TS no protege si el backend cambia sin recompilar el frontend.
function assertKnownKind(
  summary: ImportedAnimationSummary,
): ImportedAnimationSummary {
  if ((KNOWN_KINDS as readonly string[]).includes(summary.kind)) {
    return summary;
  }
  const error: AnimationImportError = {
    kind: 'invalid-response',
    message: `el backend devolvio un kind desconocido: "${summary.kind}"`,
  };
  throw error;
}

export async function importAnimationFile(
  path: string,
  kind: ImportedAnimationKind,
): Promise<ImportedAnimationSummary> {
  const summary = await invoke<ImportedAnimationSummary>(
    'import_animation_file',
    { path, kind },
  );
  return assertKnownKind(summary);
}

export async function listImportedAnimations(): Promise<
  ImportedAnimationSummary[]
> {
  const summaries = await invoke<ImportedAnimationSummary[]>(
    'list_imported_animations',
  );
  return summaries.map(assertKnownKind);
}

// 5.7: hermana de importAnimationFile — misma validacion/directorio en Rust, la fuente es un .vrma ya serializado en memoria (PoseEditor), no una ruta en disco.
export async function saveCreatedAnimationFile(
  bytes: Uint8Array,
  kind: ImportedAnimationKind,
  fileName: string,
): Promise<ImportedAnimationSummary> {
  const summary = await invoke<ImportedAnimationSummary>(
    'save_created_animation_file',
    { bytes: Array.from(bytes), kind, fileName },
  );
  return assertKnownKind(summary);
}

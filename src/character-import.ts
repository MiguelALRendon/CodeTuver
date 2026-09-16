import { invoke } from '@tauri-apps/api/core';

export type CharacterImportErrorKind =
  | 'file-not-found'
  | 'unsupported-format'
  | 'corrupt-vrm-header'
  | 'invalid-live2d-manifest'
  | 'io-error';

export interface CharacterImportError {
  kind: CharacterImportErrorKind;
  message: string;
}

export type ImportedCharacterFormat = 'vrm' | 'live2d';

export interface CharacterCapabilities {
  expression: boolean;
  mouth: boolean;
  eyebrows: boolean;
}

export interface ImportedCharacterSummary {
  id: string;
  name: string;
  format: ImportedCharacterFormat;
  savedPath: string;
  capabilities: CharacterCapabilities;
}

export function importCharacterFile(
  path: string,
): Promise<ImportedCharacterSummary> {
  return invoke<ImportedCharacterSummary>('import_character_file', { path });
}

export function listImportedCharacters(): Promise<ImportedCharacterSummary[]> {
  return invoke<ImportedCharacterSummary[]>('list_imported_characters');
}

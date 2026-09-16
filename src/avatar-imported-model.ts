import type { ImportedCharacterSummary } from './character-import';

// D2/H6: funcion pura testeable, convertFileSrc inyectado en vez de importado directo (requiere el runtime real de Tauri).
export function resolveImportedVrmModelUrl(
  character: ImportedCharacterSummary | null,
  convertFileSrc: (path: string) => string,
): string | null {
  if (character?.format !== 'vrm') return null;
  return convertFileSrc(character.savedPath);
}

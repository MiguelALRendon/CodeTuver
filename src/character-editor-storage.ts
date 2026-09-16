import type {
  CharacterEditorSettings,
  StateAssignment,
} from './character-editor';

// Interino: FEAT-028 (EPIC-006) reemplazara localStorage por el almacen unificado.
const STORAGE_KEY_PREFIX = 'codetuver-avatar.character-editor.';

function storageKeyFor(characterId: string): string {
  return `${STORAGE_KEY_PREFIX}${characterId}`;
}

// D8: shape previo a esta spec, un solo string en vez de un pool.
interface LegacyStateAssignment extends StateAssignment {
  animation?: string;
}

interface LegacyCharacterEditorSettings extends Omit<
  CharacterEditorSettings,
  'assignments'
> {
  assignments: LegacyStateAssignment[];
}

function migrateAssignment(entry: LegacyStateAssignment): StateAssignment {
  const { animation, ...rest } = entry;
  if (rest.animations !== undefined || animation === undefined) return rest;
  return { ...rest, animations: [animation] };
}

function migrateSettings(
  settings: LegacyCharacterEditorSettings,
): CharacterEditorSettings {
  return {
    ...settings,
    assignments: settings.assignments.map(migrateAssignment),
  };
}

export function persistCharacterEditorSettings(
  characterId: string,
  settings: CharacterEditorSettings,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(storageKeyFor(characterId), JSON.stringify(settings));
}

export function loadCharacterEditorSettings(
  characterId: string,
  storage: Storage = window.localStorage,
): CharacterEditorSettings | null {
  const raw = storage.getItem(storageKeyFor(characterId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LegacyCharacterEditorSettings;
    return migrateSettings(parsed);
  } catch {
    return null;
  }
}

import type { CharacterCatalogEntry } from './character-catalog';

// Interino: FEAT-028 (EPIC-006) reemplazara localStorage por el almacen unificado.
const STORAGE_KEY = 'codetuver-avatar.character-selection';

export function persistCharacterId(
  id: string,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(STORAGE_KEY, id);
}

export function loadPersistedCharacterId(
  storage: Storage = window.localStorage,
): string | null {
  return storage.getItem(STORAGE_KEY);
}

export function resolveActiveCharacter(
  catalog: CharacterCatalogEntry[],
  persistedId: string | null,
): CharacterCatalogEntry | null {
  if (catalog.length === 0) return null;
  const persisted = catalog.find((entry) => entry.id === persistedId);
  return persisted ?? catalog[0];
}

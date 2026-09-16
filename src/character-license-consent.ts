const STORAGE_KEY = 'codetuver-avatar.character-license.accepted';

export function loadAcceptedCharacterLicenses(
  storage: Storage = window.localStorage,
): Set<string> {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function hasAcceptedCharacterLicense(
  id: string,
  storage: Storage = window.localStorage,
): boolean {
  return loadAcceptedCharacterLicenses(storage).has(id);
}

export function persistCharacterLicenseAccepted(
  id: string,
  storage: Storage = window.localStorage,
): void {
  const accepted = loadAcceptedCharacterLicenses(storage);
  accepted.add(id);
  storage.setItem(STORAGE_KEY, JSON.stringify([...accepted]));
}

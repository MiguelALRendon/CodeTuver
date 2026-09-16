import { describe, expect, it } from 'vitest';
import {
  hasAcceptedCharacterLicense,
  loadAcceptedCharacterLicenses,
  persistCharacterLicenseAccepted,
} from './character-license-consent';

function createFakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
}

describe('character-license-consent — casos adversos', () => {
  it('sin preferencia guardada, ningun personaje aparece aceptado', () => {
    const storage = createFakeStorage();

    expect(hasAcceptedCharacterLicense('rabbit', storage)).toBe(false);
  });

  it('un valor guardado que no es JSON valido no lanza y se trata como vacio', () => {
    const storage = createFakeStorage();
    storage.setItem(
      'codetuver-avatar.character-license.accepted',
      'no es json{',
    );

    expect(loadAcceptedCharacterLicenses(storage)).toEqual(new Set());
  });

  it('aceptar un personaje no afecta la aceptacion de otro', () => {
    const storage = createFakeStorage();
    persistCharacterLicenseAccepted('rabbit', storage);

    expect(hasAcceptedCharacterLicense('rabbit', storage)).toBe(true);
    expect(hasAcceptedCharacterLicense('polydancer', storage)).toBe(false);
  });

  it('aceptar el mismo personaje dos veces no duplica la entrada', () => {
    const storage = createFakeStorage();
    persistCharacterLicenseAccepted('rabbit', storage);
    persistCharacterLicenseAccepted('rabbit', storage);

    expect(loadAcceptedCharacterLicenses(storage)).toEqual(new Set(['rabbit']));
  });
});

describe('character-license-consent — happy path', () => {
  it('la aceptacion persiste entre lecturas independientes (misma sesion)', () => {
    const storage = createFakeStorage();
    persistCharacterLicenseAccepted('polydancer', storage);

    expect(hasAcceptedCharacterLicense('polydancer', storage)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  loadCharacterEditorSettings,
  persistCharacterEditorSettings,
} from './character-editor-storage';
import type { CharacterEditorSettings } from './character-editor';

const SETTINGS_A: CharacterEditorSettings = {
  assignments: [{ state: 'idle', expression: 'happy' }],
  anchor: { corner: 'bottom-right', marginX: 24, marginY: 24 },
  size: 1,
};

const SETTINGS_B: CharacterEditorSettings = {
  assignments: [{ state: 'idle', expression: 'sad' }],
  anchor: { corner: 'top-left', marginX: 10, marginY: 10 },
  size: 1.5,
};

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

describe('character-editor-storage — casos adversos', () => {
  it('devuelve null sin lanzar excepcion cuando nunca se persistio nada para ese characterId', () => {
    const storage = createFakeStorage();

    expect(
      loadCharacterEditorSettings('personaje-inexistente', storage),
    ).toBeNull();
  });

  it('devuelve null sin lanzar excepcion cuando el valor almacenado no es JSON valido', () => {
    const storage = createFakeStorage();
    storage.setItem(
      'codetuver-avatar.character-editor.personaje-1',
      'no es json{',
    );

    expect(loadCharacterEditorSettings('personaje-1', storage)).toBeNull();
  });

  it('dos characterId distintos persisten settings independientes sin pisarse entre si', () => {
    const storage = createFakeStorage();

    persistCharacterEditorSettings('personaje-a', SETTINGS_A, storage);
    persistCharacterEditorSettings('personaje-b', SETTINGS_B, storage);

    expect(loadCharacterEditorSettings('personaje-a', storage)).toEqual(
      SETTINGS_A,
    );
  });

  it('D8: migra el shape viejo (animation string singular, sin animations) a un pool de un elemento', () => {
    const storage = createFakeStorage();
    storage.setItem(
      'codetuver-avatar.character-editor.personaje-legacy',
      JSON.stringify({
        assignments: [{ state: 'idle', animation: 'antigua-animacion' }],
        anchor: { corner: 'bottom-right', marginX: 24, marginY: 24 },
        size: 1,
      }),
    );

    const loaded = loadCharacterEditorSettings('personaje-legacy', storage);

    expect(loaded?.assignments).toEqual([
      { state: 'idle', animations: ['antigua-animacion'] },
    ]);
  });

  it('D8: si animations ya existe, el campo animation legado se descarta sin duplicar', () => {
    const storage = createFakeStorage();
    storage.setItem(
      'codetuver-avatar.character-editor.personaje-mixto',
      JSON.stringify({
        assignments: [
          {
            state: 'idle',
            animation: 'antigua-animacion',
            animations: ['animacion-nueva'],
          },
        ],
        anchor: { corner: 'bottom-right', marginX: 24, marginY: 24 },
        size: 1,
      }),
    );

    const loaded = loadCharacterEditorSettings('personaje-mixto', storage);

    expect(loaded?.assignments).toEqual([
      { state: 'idle', animations: ['animacion-nueva'] },
    ]);
  });
});

describe('character-editor-storage — happy path', () => {
  it('persiste y relee las settings de un personaje sin perder datos', () => {
    const storage = createFakeStorage();

    persistCharacterEditorSettings('personaje-c', SETTINGS_A, storage);
    const loaded = loadCharacterEditorSettings('personaje-c', storage);

    expect(loaded).toEqual(SETTINGS_A);
  });
});

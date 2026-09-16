import { describe, expect, it } from 'vitest';
import {
  loadPersistedCharacterId,
  persistCharacterId,
  resolveActiveCharacter,
} from './character-selection';
import type { CharacterCatalogEntry } from './character-catalog';

const TEST_CATALOG: CharacterCatalogEntry[] = [
  {
    id: 'test-avatar',
    name: 'Prueba Violeta',
    kind: 'vrm',
    author: 'Codetuver Avatar (personaje de prueba)',
    license: 'CC0 (dominio publico)',
    attribution: 'Sin atribucion requerida.',
    modelUrl: 'https://example.invalid/test-avatar.vrm',
  },
  {
    id: 'test-avatar-alt',
    name: 'Prueba Verde',
    kind: 'vrm',
    author: 'Codetuver Avatar (personaje de prueba)',
    license: 'CC0 (dominio publico)',
    attribution: 'Sin atribucion requerida.',
    modelUrl: 'https://example.invalid/test-avatar-alt.vrm',
  },
];

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

function createThrowingStorage(): Storage {
  return {
    getItem: () => null,
    setItem: () => {
      throw new Error('almacenamiento lleno o bloqueado');
    },
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage;
}

describe('resolveActiveCharacter — casos adversos', () => {
  it('es idempotente: llamadas repetidas con el mismo catalogo devuelven el mismo resultado sin lanzar excepcion', () => {
    const first = resolveActiveCharacter(TEST_CATALOG, 'test-avatar-alt');
    const second = resolveActiveCharacter(TEST_CATALOG, 'test-avatar-alt');

    expect(second).toEqual(first);
  });

  it('cae al primer personaje del catalogo cuando el id persistido ya no existe', () => {
    const result = resolveActiveCharacter(TEST_CATALOG, 'id-que-no-existe');

    expect(result).toEqual(TEST_CATALOG[0]);
  });

  it('devuelve null sin lanzar excepcion cuando el catalogo esta vacio', () => {
    const result = resolveActiveCharacter([], 'cualquier-id');

    expect(result).toBeNull();
  });
});

describe('persistCharacterId / loadPersistedCharacterId — casos adversos', () => {
  it('persiste y lee de vuelta un id que es un string vacio', () => {
    const storage = createFakeStorage();

    persistCharacterId('', storage);

    expect(loadPersistedCharacterId(storage)).toBe('');
  });

  it('devuelve null cuando nunca se persistio nada en el storage', () => {
    const storage = createFakeStorage();

    expect(loadPersistedCharacterId(storage)).toBeNull();
  });

  it('propaga la excepcion del storage cuando setItem falla (hallazgo: persistCharacterId no la captura)', () => {
    const storage = createThrowingStorage();

    expect(() => persistCharacterId('test-avatar', storage)).toThrow(
      'almacenamiento lleno o bloqueado',
    );
  });
});

describe('character-selection — happy path', () => {
  it('persiste un id, lo relee y resuelve la entrada correcta del catalogo', () => {
    const storage = createFakeStorage();
    persistCharacterId('test-avatar-alt', storage);

    const persistedId = loadPersistedCharacterId(storage);
    const active = resolveActiveCharacter(TEST_CATALOG, persistedId);

    expect(active).toEqual(TEST_CATALOG[1]);
  });
});

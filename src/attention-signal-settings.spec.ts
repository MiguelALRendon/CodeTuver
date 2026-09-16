import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadAttentionSignalSettings,
  persistAttentionSignalSettings,
} from './attention-signal-settings';
import { loadVoiceEnabled } from './text-to-speech';

vi.mock('./text-to-speech', () => ({ loadVoiceEnabled: vi.fn() }));

const STORAGE_KEY = 'codetuver-avatar.attention-signals.settings';

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

beforeEach(() => {
  vi.mocked(loadVoiceEnabled).mockReset().mockReturnValue(false);
});

describe('loadAttentionSignalSettings — casos adversos', () => {
  it('devuelve los defaults documentados cuando el storage esta vacio', () => {
    const storage = createFakeStorage();

    const result = loadAttentionSignalSettings(storage);

    expect(result).toEqual({
      expressionChange: true,
      animation: false,
      visualIndicator: true,
      bubble: false,
      systemNotification: false,
      voice: false,
    });
  });

  it('recae en los defaults sin lanzar excepcion cuando el storage tiene JSON corrupto', () => {
    const storage = createFakeStorage();
    storage.setItem(STORAGE_KEY, '{no-es-json-valido');

    expect(() => loadAttentionSignalSettings(storage)).not.toThrow();
    const result = loadAttentionSignalSettings(storage);
    expect(result).toMatchObject({
      expressionChange: true,
      animation: false,
      visualIndicator: true,
      bubble: false,
      systemNotification: false,
    });
  });

  it('completa con los defaults las claves faltantes de una configuracion parcial guardada', () => {
    const storage = createFakeStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ animation: true, systemNotification: true }),
    );

    const result = loadAttentionSignalSettings(storage);

    expect(result).toMatchObject({
      expressionChange: true,
      animation: true,
      visualIndicator: true,
      bubble: false,
      systemNotification: true,
    });
  });

  it('toma voice de loadVoiceEnabled() ignorando cualquier campo voice presente en el storage', () => {
    const storage = createFakeStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ voice: false }));
    vi.mocked(loadVoiceEnabled).mockReturnValue(true);

    const result = loadAttentionSignalSettings(storage);

    expect(result.voice).toBe(true);
  });
});

describe('persistAttentionSignalSettings — casos adversos', () => {
  it('escribe exactamente los campos recibidos, sin agregar voice', () => {
    const storage = createFakeStorage();

    persistAttentionSignalSettings(
      {
        expressionChange: false,
        animation: false,
        visualIndicator: false,
        bubble: false,
        systemNotification: false,
      },
      storage,
    );

    const raw = storage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw as string)).toEqual({
      expressionChange: false,
      animation: false,
      visualIndicator: false,
      bubble: false,
      systemNotification: false,
    });
  });
});

describe('attention-signal-settings — happy path', () => {
  it('persiste una configuracion completa y al releerla devuelve los mismos valores, con voice de loadVoiceEnabled', () => {
    const storage = createFakeStorage();
    vi.mocked(loadVoiceEnabled).mockReturnValue(true);

    persistAttentionSignalSettings(
      {
        expressionChange: false,
        animation: true,
        visualIndicator: false,
        bubble: true,
        systemNotification: false,
      },
      storage,
    );
    const result = loadAttentionSignalSettings(storage);

    expect(result).toEqual({
      expressionChange: false,
      animation: true,
      visualIndicator: false,
      bubble: true,
      systemNotification: false,
      voice: true,
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  acceptPhrase,
  clearSpeechQueue,
  createSpeechQueueState,
  DEFAULT_VOICE_SETTINGS,
  dequeuePhrase,
  loadAllowVoiceInPetMode,
  loadVoiceEnabled,
  loadVoiceSettings,
  persistAllowVoiceInPetMode,
  persistVoiceEnabled,
  persistVoiceSettings,
} from './text-to-speech';

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

describe('speech queue — casos adversos', () => {
  it('AUT-10: descarta una frase identica a la ultima aceptada consecutivamente', () => {
    const afterFirst = acceptPhrase(createSpeechQueueState(), 'Hola')!;

    const rejected = acceptPhrase(afterFirst, 'Hola');

    expect(rejected).toBeNull();
  });

  it('acepta de nuevo una frase que ya sono si dejo de ser la ultima aceptada', () => {
    const afterA = acceptPhrase(createSpeechQueueState(), 'A')!;
    const afterB = acceptPhrase(afterA, 'B')!;

    const afterASecondTime = acceptPhrase(afterB, 'A');

    expect(afterASecondTime).not.toBeNull();
  });

  it('desencolar sobre una cola vacia no lanza excepcion y devuelve phrase null', () => {
    const { phrase } = dequeuePhrase(createSpeechQueueState());

    expect(phrase).toBeNull();
  });

  it('clearSpeechQueue resetea tambien lastAccepted, permitiendo re-aceptar la misma frase', () => {
    acceptPhrase(createSpeechQueueState(), 'Hola');
    const cleared = clearSpeechQueue();

    const reaccepted = acceptPhrase(cleared, 'Hola');

    expect(reaccepted).not.toBeNull();
  });
});

describe('persistencia de voz — casos adversos', () => {
  it('AC-020.1: sin preferencia guardada loadVoiceEnabled devuelve false', () => {
    const storage = createFakeStorage();

    expect(loadVoiceEnabled(storage)).toBe(false);
  });

  it('loadVoiceSettings cae a los defaults cuando el valor guardado no es JSON valido', () => {
    const storage = createFakeStorage();
    storage.setItem('codetuver-avatar.voice.settings', 'no es json{');

    expect(loadVoiceSettings(storage)).toEqual(DEFAULT_VOICE_SETTINGS);
  });

  it('loadVoiceSettings completa con defaults los campos ausentes de un JSON parcial', () => {
    const storage = createFakeStorage();
    storage.setItem(
      'codetuver-avatar.voice.settings',
      JSON.stringify({ volume: 0.5 }),
    );

    expect(loadVoiceSettings(storage)).toEqual({
      ...DEFAULT_VOICE_SETTINGS,
      volume: 0.5,
    });
  });

  it('sin pitch guardado (preferencia previa a H15) cae al default 1, no a undefined (D16)', () => {
    const storage = createFakeStorage();
    storage.setItem(
      'codetuver-avatar.voice.settings',
      JSON.stringify({ volume: 0.5, rate: 1.3, voiceURI: null }),
    );

    expect(loadVoiceSettings(storage).pitch).toBe(1);
  });

  it('AC-020.6: sin preferencia guardada loadAllowVoiceInPetMode devuelve false', () => {
    const storage = createFakeStorage();

    expect(loadAllowVoiceInPetMode(storage)).toBe(false);
  });
});

describe('text-to-speech — happy path', () => {
  it('persiste y relee enabled y settings custom, y procesa una secuencia de cola realista en orden FIFO', () => {
    const storage = createFakeStorage();
    const customSettings = {
      volume: 0.7,
      rate: 1.3,
      pitch: 1.5,
      voiceURI: 'voz-custom',
    };
    persistVoiceEnabled(true, storage);
    persistVoiceSettings(customSettings, storage);
    persistAllowVoiceInPetMode(true, storage);

    const rereadStorage = createFakeStorage();
    rereadStorage.setItem(
      'codetuver-avatar.voice.enabled',
      storage.getItem('codetuver-avatar.voice.enabled')!,
    );
    rereadStorage.setItem(
      'codetuver-avatar.voice.settings',
      storage.getItem('codetuver-avatar.voice.settings')!,
    );

    let queueState = createSpeechQueueState();
    queueState = acceptPhrase(queueState, 'Hola')!;
    acceptPhrase(queueState, 'Hola');
    queueState = acceptPhrase(queueState, 'Adios')!;
    queueState = acceptPhrase(queueState, 'Hola')!;

    const first = dequeuePhrase(queueState);
    const second = dequeuePhrase(first.next);
    const third = dequeuePhrase(second.next);

    expect({
      enabled: loadVoiceEnabled(rereadStorage),
      settings: loadVoiceSettings(rereadStorage),
      queueOrder: [first.phrase, second.phrase, third.phrase],
    }).toEqual({
      enabled: true,
      settings: customSettings,
      queueOrder: ['Hola', 'Adios', 'Hola'],
    });
  });
});

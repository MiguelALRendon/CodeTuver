import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MouthSyncController } from './mouth-sync';
import type { MouthSyncSource } from './mouth-sync';

const CLOSE_DELAY_MS = 180;

function createFakeSource(): {
  source: MouthSyncSource;
  triggerBoundary: () => void;
  triggerSpeechEnd: () => void;
} {
  let boundaryCallback: (() => void) | null = null;
  let speechEndCallback: (() => void) | null = null;
  const source: MouthSyncSource = {
    onBoundary(callback) {
      boundaryCallback = callback;
      return () => {
        boundaryCallback = null;
      };
    },
    onSpeechEnd(callback) {
      speechEndCallback = callback;
      return () => {
        speechEndCallback = null;
      };
    },
  };
  return {
    source,
    triggerBoundary: () => boundaryCallback?.(),
    triggerSpeechEnd: () => speechEndCallback?.(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mouth-sync — casos adversos', () => {
  it('audio en silencio nunca abre la boca', () => {
    const { source } = createFakeSource();
    const controller = new MouthSyncController(source, CLOSE_DELAY_MS);

    expect(controller.snapshot.mouthOpen).toBe(false);
  });

  it('audio que termina de forma abrupta deja la boca cerrada y no revive con el timeout pendiente', () => {
    const { source, triggerBoundary, triggerSpeechEnd } = createFakeSource();
    const controller = new MouthSyncController(source, CLOSE_DELAY_MS);
    triggerBoundary();
    triggerSpeechEnd();
    const closedRightAfter = controller.snapshot.mouthOpen;

    vi.advanceTimersByTime(CLOSE_DELAY_MS);

    expect({
      closedRightAfter,
      closedAfterOriginalTimeout: controller.snapshot.mouthOpen,
    }).toEqual({
      closedRightAfter: false,
      closedAfterOriginalTimeout: false,
    });
  });

  it('cancelar a mitad de frase (speechEnd indistinguible de fin normal) detiene el movimiento de la boca', () => {
    const { source, triggerBoundary, triggerSpeechEnd } = createFakeSource();
    const controller = new MouthSyncController(source, CLOSE_DELAY_MS);
    triggerBoundary();

    triggerSpeechEnd();

    expect(controller.snapshot.mouthOpen).toBe(false);
  });

  it('personaje sin control de boca (fuente inerte) no lanza excepcion ni deja timers colgados', () => {
    const { source } = createFakeSource();
    const controller = new MouthSyncController(source, CLOSE_DELAY_MS);

    expect(() => controller.dispose()).not.toThrow();
  });

  it('boundary repetido muy rapido sin esperar entre pulsos mantiene la boca abierta de forma estable, sin parpadeo', () => {
    const { source, triggerBoundary } = createFakeSource();
    const controller = new MouthSyncController(source, CLOSE_DELAY_MS);

    triggerBoundary();
    triggerBoundary();
    triggerBoundary();
    triggerBoundary();
    triggerBoundary();
    vi.advanceTimersByTime(CLOSE_DELAY_MS - 1);
    const stillOpenJustBeforeDelay = controller.snapshot.mouthOpen;
    vi.advanceTimersByTime(1);

    expect({
      stillOpenJustBeforeDelay,
      closedExactlyAtDelay: controller.snapshot.mouthOpen,
    }).toEqual({
      stillOpenJustBeforeDelay: true,
      closedExactlyAtDelay: false,
    });
  });

  it('speechEnd de una frase que ya habia cerrado la boca por inactividad es idempotente, no lanza excepcion', () => {
    const { source, triggerBoundary, triggerSpeechEnd } = createFakeSource();
    const controller = new MouthSyncController(source, CLOSE_DELAY_MS);
    triggerBoundary();
    vi.advanceTimersByTime(CLOSE_DELAY_MS);

    expect(() => triggerSpeechEnd()).not.toThrow();
    expect(controller.snapshot.mouthOpen).toBe(false);
  });

  it('dispose() antes de cualquier evento desuscribe la fuente, un boundary posterior ya no abre la boca', () => {
    const { source, triggerBoundary } = createFakeSource();
    const controller = new MouthSyncController(source, CLOSE_DELAY_MS);
    controller.dispose();

    triggerBoundary();

    expect(controller.snapshot.mouthOpen).toBe(false);
  });
});

describe('mouth-sync — happy path', () => {
  it('encadena boundaries que refrescan el cierre, cierra sola por inactividad, reabre y cierra con speechEnd', () => {
    const { source, triggerBoundary, triggerSpeechEnd } = createFakeSource();
    const controller = new MouthSyncController(source, CLOSE_DELAY_MS);

    triggerBoundary();
    vi.advanceTimersByTime(CLOSE_DELAY_MS - 1);
    triggerBoundary();
    vi.advanceTimersByTime(CLOSE_DELAY_MS - 1);
    const stillOpenBeforeDelay = controller.snapshot.mouthOpen;
    vi.advanceTimersByTime(1);
    const closedByInactivity = controller.snapshot.mouthOpen;
    triggerBoundary();
    const reopened = controller.snapshot.mouthOpen;
    triggerSpeechEnd();

    expect({
      stillOpenBeforeDelay,
      closedByInactivity,
      reopened,
      closedBySpeechEnd: controller.snapshot.mouthOpen,
    }).toEqual({
      stillOpenBeforeDelay: true,
      closedByInactivity: false,
      reopened: true,
      closedBySpeechEnd: false,
    });
  });
});

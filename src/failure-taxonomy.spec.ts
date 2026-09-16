import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearFailureLog,
  FAILURE_CLASS_ORIGIN,
  listFailures,
  registerFailure,
  type FailureClass,
} from './failure-taxonomy';

beforeEach(() => {
  clearFailureLog();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('registerFailure — casos adversos', () => {
  it.each(Object.entries(FAILURE_CLASS_ORIGIN) as [FailureClass, string][])(
    'deriva el origen "%s" -> "%s" desde FAILURE_CLASS_ORIGIN',
    (failureClass, expectedOrigin) => {
      const entry = registerFailure(failureClass, 'mensaje de prueba');

      expect(entry.origin).toBe(expectedOrigin);
    },
  );

  it('conserva dos fallas de clases distintas en orden sin que la segunda sobrescriba la primera', () => {
    registerFailure('tts-error', 'primera falla');
    registerFailure('avatar-error', 'segunda falla');

    const failures = listFailures();

    expect(failures).toHaveLength(2);
    expect(failures[0].message).toBe('primera falla');
    expect(failures[1].message).toBe('segunda falla');
  });

  it('no lanza ni pierde la falla cuando message es una cadena vacia', () => {
    expect(() => registerFailure('parsing-error', '')).not.toThrow();
    expect(listFailures()).toHaveLength(1);
    expect(listFailures()[0].message).toBe('');
  });

  it('clearFailureLog no deja basura: una falla registrada despues de limpiar aparece sola', () => {
    registerFailure('process-error', 'antes de limpiar');
    clearFailureLog();
    expect(listFailures()).toHaveLength(0);

    registerFailure('communication-error', 'despues de limpiar');

    expect(listFailures()).toHaveLength(1);
    expect(listFailures()[0].message).toBe('despues de limpiar');
  });

  it('asigna un timestamp real (Date.now()) determinista, no NaN ni undefined', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    const entry = registerFailure('mode-change-error', 'con reloj fijo');

    expect(entry.timestamp).toBe(1_700_000_000_000);

    vi.useRealTimers();
  });
});

describe('registerFailure — happy path', () => {
  it('registra una falla real y la expone completa via listFailures (happy path)', () => {
    const entry = registerFailure('window-management-error', 'fallo simulado');

    expect(listFailures()).toEqual([entry]);
    expect(entry.origin).toBe('ventana');
    expect(entry.failureClass).toBe('window-management-error');
    expect(entry.message).toBe('fallo simulado');
    expect(Number.isFinite(entry.timestamp)).toBe(true);
  });
});

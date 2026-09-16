import { describe, expect, it } from 'vitest';
import { errorMessage } from './error-message';

describe('errorMessage — casos adversos', () => {
  it('un objeto con referencia circular cae a String(err), sin lanzar excepcion', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => errorMessage(circular)).not.toThrow();
    expect(errorMessage(circular)).toBe(String(circular));
  });

  it('undefined no produce el valor undefined (JSON.stringify lo devolveria tal cual, no un string)', () => {
    expect(errorMessage(undefined)).toBe('undefined');
    expect(typeof errorMessage(undefined)).toBe('string');
  });

  it('una instancia real de Error sigue devolviendo su .message, sin pasar por JSON.stringify', () => {
    expect(errorMessage(new Error('fallo real'))).toBe('fallo real');
  });

  it('un objeto con campo message sigue devolviendo ese mensaje, sin pasar por JSON.stringify', () => {
    expect(errorMessage({ message: 'mensaje de transporte' })).toBe(
      'mensaje de transporte',
    );
  });
});

describe('errorMessage — happy path', () => {
  it('un objeto plano serializable produce su JSON en vez de "[object Object]" (Hallazgo 7)', () => {
    const result = errorMessage({ kind: 'transition-fault', code: 42 });

    expect(result).not.toBe('[object Object]');
    expect(result).toBe('{"kind":"transition-fault","code":42}');
  });
});

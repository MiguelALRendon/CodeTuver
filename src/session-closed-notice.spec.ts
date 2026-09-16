import { describe, expect, it } from 'vitest';
import { buildUnexpectedCloseMessage } from './session-closed-notice';

describe('buildUnexpectedCloseMessage — casos adversos', () => {
  it('cierre esperado (el usuario cerro la sesion) no genera aviso', () => {
    expect(
      buildUnexpectedCloseMessage({ expected: true, exitCode: 0 }, null),
    ).toBeNull();
  });

  it('cierre esperado con exit code distinto de 0 tampoco genera aviso', () => {
    expect(
      buildUnexpectedCloseMessage({ expected: true, exitCode: 1 }, 'algo'),
    ).toBeNull();
  });
});

describe('buildUnexpectedCloseMessage — happy path', () => {
  it('cierre inesperado sin stderr ni exit code deja el mensaje generico, sin inventar datos', () => {
    const message = buildUnexpectedCloseMessage(
      { expected: false, exitCode: null },
      null,
    );

    expect(message).toContain('se cerro inesperadamente');
    expect(message).toContain('claude login');
    expect(message).not.toMatch(/codigo|:/);
  });

  it('cierre inesperado con exit code (sin stderr) incluye el codigo real', () => {
    const message = buildUnexpectedCloseMessage(
      { expected: false, exitCode: 1 },
      null,
    );

    expect(message).toContain('codigo 1');
  });

  it('cierre inesperado con ultima linea de stderr la incluye tal cual, sobre el exit code', () => {
    const message = buildUnexpectedCloseMessage(
      { expected: false, exitCode: 1 },
      'Invalid API key · Run /login',
    );

    expect(message).toContain('Invalid API key · Run /login');
    expect(message).not.toContain('codigo 1');
  });
});

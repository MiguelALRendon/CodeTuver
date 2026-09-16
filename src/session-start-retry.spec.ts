import { describe, expect, it, vi } from 'vitest';
import {
  isSessionAlreadyActive,
  startSessionWithRetry,
} from './session-start-retry';

describe('isSessionAlreadyActive', () => {
  it('reconoce el TransportError real de kind session-already-active', () => {
    expect(
      isSessionAlreadyActive({ kind: 'session-already-active', message: 'x' }),
    ).toBe(true);
  });

  it('rechaza otros kinds de TransportError', () => {
    expect(
      isSessionAlreadyActive({ kind: 'claude-code-not-found', message: 'x' }),
    ).toBe(false);
  });

  it('rechaza errores que no son TransportError', () => {
    expect(isSessionAlreadyActive(new Error('boom'))).toBe(false);
    expect(isSessionAlreadyActive(null)).toBe(false);
  });
});

describe('startSessionWithRetry', () => {
  it('no reintenta si el primer arranque tiene exito', async () => {
    const attemptStart = vi.fn().mockResolvedValue(undefined);
    const closeStaleSession = vi.fn().mockResolvedValue(undefined);
    await startSessionWithRetry(attemptStart, closeStaleSession);
    expect(attemptStart).toHaveBeenCalledTimes(1);
    expect(closeStaleSession).not.toHaveBeenCalled();
  });

  it('cierra la sesion vieja y reintenta una vez ante session-already-active', async () => {
    const attemptStart = vi
      .fn()
      .mockRejectedValueOnce({ kind: 'session-already-active', message: 'x' })
      .mockResolvedValueOnce(undefined);
    const closeStaleSession = vi.fn().mockResolvedValue(undefined);
    await startSessionWithRetry(attemptStart, closeStaleSession);
    expect(closeStaleSession).toHaveBeenCalledTimes(1);
    expect(attemptStart).toHaveBeenCalledTimes(2);
  });

  it('propaga el error si el reintento tambien falla', async () => {
    const retryError = { kind: 'process-spawn-failed', message: 'y' };
    const attemptStart = vi
      .fn()
      .mockRejectedValueOnce({ kind: 'session-already-active', message: 'x' })
      .mockRejectedValueOnce(retryError);
    const closeStaleSession = vi.fn().mockResolvedValue(undefined);
    await expect(
      startSessionWithRetry(attemptStart, closeStaleSession),
    ).rejects.toBe(retryError);
    expect(attemptStart).toHaveBeenCalledTimes(2);
  });

  it('propaga sin reintentar si el error original no es session-already-active', async () => {
    const originalError = { kind: 'invalid-startup-options', message: 'z' };
    const attemptStart = vi.fn().mockRejectedValueOnce(originalError);
    const closeStaleSession = vi.fn().mockResolvedValue(undefined);
    await expect(
      startSessionWithRetry(attemptStart, closeStaleSession),
    ).rejects.toBe(originalError);
    expect(closeStaleSession).not.toHaveBeenCalled();
    expect(attemptStart).toHaveBeenCalledTimes(1);
  });
});

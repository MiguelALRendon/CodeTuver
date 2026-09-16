import type { TransportError } from './claude-transport';

export function isSessionAlreadyActive(err: unknown): err is TransportError {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as Partial<TransportError>).kind === 'session-already-active'
  );
}

// D3: el backend modela "un proceso a la vez" como regla real, no como limitacion a exponer -- cerrar la sesion vieja y reintentar una vez es la lectura mas simple de "abrir una sesion reemplaza a la anterior".
export async function startSessionWithRetry(
  attemptStart: () => Promise<void>,
  closeStaleSession: () => Promise<void>,
): Promise<void> {
  try {
    await attemptStart();
  } catch (err) {
    if (!isSessionAlreadyActive(err)) throw err;
    await closeStaleSession();
    await attemptStart();
  }
}

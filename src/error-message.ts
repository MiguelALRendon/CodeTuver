export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  try {
    const serialized = JSON.stringify(err);
    // JSON.stringify(undefined) / de una funcion devuelve undefined (no un string) — mismo fallback que un error real de serializacion.
    return serialized === undefined ? String(err) : serialized;
  } catch {
    return String(err);
  }
}

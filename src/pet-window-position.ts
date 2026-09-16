export interface PetWindowPosition {
  x: number;
  y: number;
}

function sanitizeCoordinate(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value);
}

// Corrupta o ausente -> null (cae al calculo de esquina default), misma tolerancia que el resto de las preferencias del proyecto.
export function sanitizePetWindowPosition(
  value: unknown,
): PetWindowPosition | null {
  if (typeof value !== 'object' || value === null) return null;
  const { x, y } = value as Record<string, unknown>;
  const sanitizedX = sanitizeCoordinate(x);
  const sanitizedY = sanitizeCoordinate(y);
  if (sanitizedX === null || sanitizedY === null) return null;
  return { x: sanitizedX, y: sanitizedY };
}

export function describePetWindowPosition(
  position: PetWindowPosition | null,
): string {
  if (!position) return 'Default (esquina inferior derecha)';
  return `Personalizada (${position.x}, ${position.y})`;
}

// AC-091: tamaño ajustable de la ventana mascota. Reusa AppSettings.windowSize (ya persistido, Hito 2 de robustez-distribucion) en vez de inventar un campo/mecanismo nuevo -- D10 solo pedia que existiera un control, no una representacion nueva.
export const PET_WINDOW_SIZE_MIN_PX = 100;
// 800px: mismo orden de magnitud que una ventana completa por omision (Hito 8, D8) -- por debajo de 1280px (ancho minimo real de referencia, resolucion 1366x768) para dejar margen de arrastre visible en el monitor mas chico contemplado.
export const PET_WINDOW_SIZE_MAX_PX = 800;
export const DEFAULT_PET_WINDOW_SIZE_PX = 200;

export function clampPetWindowSizePx(px: number): number {
  return Math.min(
    PET_WINDOW_SIZE_MAX_PX,
    Math.max(PET_WINDOW_SIZE_MIN_PX, Math.round(px)),
  );
}

// Un valor guardado corrupto (NaN, string, negativo, Infinity) cae al tamaño por omision sin lanzar -- misma tolerancia que el resto de las preferencias del proyecto.
export function sanitizePetWindowSizePx(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_PET_WINDOW_SIZE_PX;
  }
  return clampPetWindowSizePx(value);
}

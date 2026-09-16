export type PrimaryColorRgb = [number, number, number];

// #D97757, terracota de Claude -- confirmado en H1 (revision-ux-sesion-real-3) contra la marca real, no de memoria.
export const DEFAULT_PRIMARY_COLOR_RGB: PrimaryColorRgb = [217, 119, 87];

function clampChannel(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(255, Math.max(0, Math.round(value)));
}

// Corrupta o ausente -> el naranja por omision, sin lanzar (misma tolerancia que el resto de las preferencias del proyecto).
export function sanitizePrimaryColorRgb(value: unknown): PrimaryColorRgb {
  if (!Array.isArray(value) || value.length !== 3) {
    return DEFAULT_PRIMARY_COLOR_RGB;
  }
  const channels = value.map(clampChannel);
  if (channels.some((c) => c === null)) return DEFAULT_PRIMARY_COLOR_RGB;
  return channels as PrimaryColorRgb;
}

export function primaryColorRgbToCssValue(rgb: PrimaryColorRgb): string {
  return `${rgb[0]} ${rgb[1]} ${rgb[2]}`;
}

export function applyPrimaryColorRgb(rgb: PrimaryColorRgb): void {
  document.documentElement.style.setProperty(
    '--color-primary-rgb',
    primaryColorRgbToCssValue(rgb),
  );
}

export function primaryColorRgbToHex(rgb: PrimaryColorRgb): string {
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToPrimaryColorRgb(hex: string): PrimaryColorRgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

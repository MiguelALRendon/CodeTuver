// H19/H21: /effort es la unica opcion del carril caliente con un cambio de estado real demostrado contra un proceso real ("Set effort level to medium (this session only): ..."). El resto de candidatas del inventario (/model cambio, /permissions, /add-dir) o no se confirmaron o se rechazan de verdad -- no se exponen aqui (AC-112).
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export function buildEffortCommand(level: EffortLevel): string {
  return `/effort ${level}`;
}

export type EffortChangeConfirmation = 'confirmed' | 'unknown';

// Heuristica sobre la respuesta real del proceso, no un estado inventado: si el texto no confirma explicitamente, se declara 'unknown' en vez de asumir exito (AC-112, "no exponerla como si funcionara").
export function parseEffortChangeConfirmation(
  responseText: string,
): EffortChangeConfirmation {
  return /set effort level to/i.test(responseText) ? 'confirmed' : 'unknown';
}

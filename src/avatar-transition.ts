// Minimo pedido por el usuario (Fallo 2, revision-ux-sesion-real-3 H6): 0.75s.
export const DEFAULT_TRANSITION_DURATION_MS = 750;

export type TransitionDecision = 'crossfade' | 'stop-immediately' | 'none';

// AC-082: duracion 0 (o sin saliente) es corte inmediato, nunca una fase de fundido con pesos intermedios.
export function decideTransition(
  hasPreviousAction: boolean,
  durationSeconds: number,
): TransitionDecision {
  if (!hasPreviousAction) return 'none';
  return durationSeconds > 0 ? 'crossfade' : 'stop-immediately';
}

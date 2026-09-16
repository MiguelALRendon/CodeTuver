import type { PresentationMode } from './desktop-window-manager';

export interface AttentionSignalState {
  visible: boolean;
}

// R3/AC-026.5: solo lee el numero de peticiones pendientes, nunca interaction-requests.ts — frontera de confianza estructural.
export function resolveAttentionSignal(
  pendingInteractionCount: number,
  mode: PresentationMode,
): AttentionSignalState {
  return { visible: pendingInteractionCount > 0 && mode === 'PET' };
}

export const ATTENTION_SIGNAL_MESSAGE = 'Necesito tu autorizacion';

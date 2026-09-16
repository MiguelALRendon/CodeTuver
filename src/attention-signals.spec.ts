import { describe, expect, it } from 'vitest';
import { resolveAttentionSignal } from './attention-signals';

describe('resolveAttentionSignal — casos adversos', () => {
  it('no muestra la señal cuando no hay peticiones pendientes en modo PET', () => {
    const result = resolveAttentionSignal(0, 'PET');

    expect(result.visible).toBe(false);
  });

  it('no muestra la señal en modo FULL aunque haya peticiones pendientes', () => {
    const result = resolveAttentionSignal(3, 'FULL');

    expect(result.visible).toBe(false);
  });

  it('no muestra la señal en modo COMPANION aunque haya peticiones pendientes', () => {
    const result = resolveAttentionSignal(3, 'COMPANION');

    expect(result.visible).toBe(false);
  });

  // pendingInteractionCount negativo ya lo rechaza PresentationManager.setPendingInteractionCount (RangeError) antes de llegar aqui; no se duplica la prueba.
});

describe('resolveAttentionSignal — happy path', () => {
  it('muestra la señal cuando hay peticiones pendientes en modo PET', () => {
    const result = resolveAttentionSignal(1, 'PET');

    expect(result.visible).toBe(true);
  });
});

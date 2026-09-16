import { describe, expect, it } from 'vitest';
import { capabilityCellProps } from './character-editor-capability-cell';

describe('character-editor-capability-cell — casos adversos', () => {
  it('capacidad no soportada: disabled true y aria-label/title citan la razon, ignorando supportedDetail', () => {
    const result = capabilityCellProps(
      'Animacion',
      'idle',
      { supported: false, reason: 'sin renderizador real' },
      'detalle que no deberia aparecer',
    );

    expect(result).toEqual({
      disabled: true,
      ariaLabel: 'Animacion deshabilitada: sin renderizador real',
      title: 'sin renderizador real',
    });
  });
});

describe('character-editor-capability-cell — happy path', () => {
  it('capacidad soportada sin detalle: disabled false, aria-label solo con estado', () => {
    const result = capabilityCellProps('Pose', 'success', {
      supported: true,
      reason: null,
    });

    expect(result).toEqual({
      disabled: false,
      ariaLabel: 'Pose para success',
      title: undefined,
    });
  });

  it('capacidad soportada con detalle: aria-label incluye el detalle (caso Boca)', () => {
    const result = capabilityCellProps(
      'Boca',
      'speaking',
      { supported: true, reason: null },
      'sincronizada automaticamente con el audio',
    );

    expect(result.ariaLabel).toBe(
      'Boca para speaking: sincronizada automaticamente con el audio',
    );
  });
});

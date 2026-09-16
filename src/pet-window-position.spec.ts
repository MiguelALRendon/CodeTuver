import { describe, expect, it } from 'vitest';
import {
  describePetWindowPosition,
  sanitizePetWindowPosition,
} from './pet-window-position';

describe('sanitizePetWindowPosition', () => {
  it('deja pasar un objeto {x,y} numerico valido, redondeando', () => {
    expect(sanitizePetWindowPosition({ x: 100.4, y: 200.6 })).toEqual({
      x: 100,
      y: 201,
    });
  });

  it('un valor guardado invalido cae en null sin lanzar', () => {
    expect(sanitizePetWindowPosition(null)).toBeNull();
    expect(sanitizePetWindowPosition(undefined)).toBeNull();
    expect(sanitizePetWindowPosition('100,200')).toBeNull();
    expect(sanitizePetWindowPosition({ x: NaN, y: 200 })).toBeNull();
    expect(sanitizePetWindowPosition({ x: 100 })).toBeNull();
  });
});

describe('describePetWindowPosition', () => {
  it('sin posicion describe la esquina default', () => {
    expect(describePetWindowPosition(null)).toBe(
      'Default (esquina inferior derecha)',
    );
  });

  it('con posicion describe las coordenadas personalizadas', () => {
    expect(describePetWindowPosition({ x: 1200, y: 640 })).toBe(
      'Personalizada (1200, 640)',
    );
  });
});

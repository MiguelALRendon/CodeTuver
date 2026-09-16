import { describe, expect, it } from 'vitest';
import { isNearChatBottom } from './chat-scroll';

describe('isNearChatBottom (D11)', () => {
  it('en el fondo exacto es verdadero', () => {
    expect(isNearChatBottom(500, 600, 100)).toBe(true);
  });

  it('lejos del fondo (revisando historial) es falso', () => {
    expect(isNearChatBottom(0, 2000, 400)).toBe(false);
  });

  it('dentro del umbral por defecto sigue contando como cerca del fondo', () => {
    expect(isNearChatBottom(1000 - 400 - 79, 1000, 400)).toBe(true);
  });

  it('justo fuera del umbral por defecto ya no cuenta como cerca del fondo', () => {
    expect(isNearChatBottom(1000 - 400 - 81, 1000, 400)).toBe(false);
  });

  it('respeta un umbral custom', () => {
    expect(isNearChatBottom(0, 100, 50, 10)).toBe(false);
    expect(isNearChatBottom(45, 100, 50, 10)).toBe(true);
  });
});

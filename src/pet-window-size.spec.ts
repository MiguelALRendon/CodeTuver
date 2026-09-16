import { describe, expect, it } from 'vitest';
import {
  clampPetWindowSizePx,
  sanitizePetWindowSizePx,
  DEFAULT_PET_WINDOW_SIZE_PX,
  PET_WINDOW_SIZE_MIN_PX,
  PET_WINDOW_SIZE_MAX_PX,
} from './pet-window-size';

describe('clampPetWindowSizePx', () => {
  it('deja pasar un valor dentro de rango', () => {
    expect(clampPetWindowSizePx(250)).toBe(250);
  });

  it('recorta al minimo', () => {
    expect(clampPetWindowSizePx(1)).toBe(PET_WINDOW_SIZE_MIN_PX);
  });

  it('recorta al maximo', () => {
    expect(clampPetWindowSizePx(9999)).toBe(PET_WINDOW_SIZE_MAX_PX);
  });
});

describe('sanitizePetWindowSizePx', () => {
  it('un valor numerico valido se recorta como clampPetWindowSizePx', () => {
    expect(sanitizePetWindowSizePx(300)).toBe(300);
    expect(sanitizePetWindowSizePx(50)).toBe(PET_WINDOW_SIZE_MIN_PX);
  });

  it('un valor guardado invalido cae en el tamaño por omision sin lanzar', () => {
    expect(sanitizePetWindowSizePx(NaN)).toBe(DEFAULT_PET_WINDOW_SIZE_PX);
    expect(sanitizePetWindowSizePx(Infinity)).toBe(DEFAULT_PET_WINDOW_SIZE_PX);
    expect(sanitizePetWindowSizePx('200')).toBe(DEFAULT_PET_WINDOW_SIZE_PX);
    expect(sanitizePetWindowSizePx(null)).toBe(DEFAULT_PET_WINDOW_SIZE_PX);
    expect(sanitizePetWindowSizePx(undefined)).toBe(DEFAULT_PET_WINDOW_SIZE_PX);
  });
});

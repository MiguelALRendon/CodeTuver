import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRIMARY_COLOR_RGB,
  sanitizePrimaryColorRgb,
  primaryColorRgbToHex,
  hexToPrimaryColorRgb,
} from './theme-color';

describe('sanitizePrimaryColorRgb', () => {
  it('cae al naranja por omision si el valor guardado es undefined', () => {
    expect(sanitizePrimaryColorRgb(undefined)).toEqual(
      DEFAULT_PRIMARY_COLOR_RGB,
    );
  });

  it('cae al naranja por omision si el valor guardado no es un array', () => {
    expect(sanitizePrimaryColorRgb('217 119 87')).toEqual(
      DEFAULT_PRIMARY_COLOR_RGB,
    );
  });

  it('cae al naranja por omision si el array tiene menos de 3 canales', () => {
    expect(sanitizePrimaryColorRgb([217, 119])).toEqual(
      DEFAULT_PRIMARY_COLOR_RGB,
    );
  });

  it('cae al naranja por omision si un canal no es numero finito', () => {
    expect(sanitizePrimaryColorRgb([217, 'x', 87])).toEqual(
      DEFAULT_PRIMARY_COLOR_RGB,
    );
    expect(sanitizePrimaryColorRgb([217, NaN, 87])).toEqual(
      DEFAULT_PRIMARY_COLOR_RGB,
    );
  });

  it('recorta canales fuera de rango a 0-255', () => {
    expect(sanitizePrimaryColorRgb([-10, 300, 128])).toEqual([0, 255, 128]);
  });

  it('redondea canales fraccionarios', () => {
    expect(sanitizePrimaryColorRgb([1.4, 1.5, 1.6])).toEqual([1, 2, 2]);
  });

  it('acepta un valor valido tal cual (happy path)', () => {
    expect(sanitizePrimaryColorRgb([10, 20, 30])).toEqual([10, 20, 30]);
  });
});

describe('primaryColorRgbToHex / hexToPrimaryColorRgb', () => {
  it('hexToPrimaryColorRgb devuelve null para un string invalido', () => {
    expect(hexToPrimaryColorRgb('no-es-un-color')).toBeNull();
    expect(hexToPrimaryColorRgb('#fff')).toBeNull();
  });

  it('hace un roundtrip exacto para el naranja por omision', () => {
    const hex = primaryColorRgbToHex(DEFAULT_PRIMARY_COLOR_RGB);
    expect(hex).toBe('#d97757');
    expect(hexToPrimaryColorRgb(hex)).toEqual(DEFAULT_PRIMARY_COLOR_RGB);
  });

  it('acepta el hex con o sin # y sin distinguir mayusculas', () => {
    expect(hexToPrimaryColorRgb('D97757')).toEqual(DEFAULT_PRIMARY_COLOR_RGB);
    expect(hexToPrimaryColorRgb('#D97757')).toEqual(DEFAULT_PRIMARY_COLOR_RGB);
  });
});

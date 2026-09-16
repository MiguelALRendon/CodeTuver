import { describe, expect, it } from 'vitest';
import { computeFramingDistance } from './vrm-camera-framing';

const FOV = 28;
const BOX = { width: 0.6, height: 1.7, depth: 0.4 };

describe('computeFramingDistance', () => {
  it('contenedor cuadrado (aspect 1): la distancia es finita y positiva', () => {
    const distance = computeFramingDistance(BOX, 1, FOV);
    expect(distance).toBeGreaterThan(0);
    expect(Number.isFinite(distance)).toBe(true);
  });

  it('contenedor alto (aspect < 1): igual o mas cerca que el cuadrado, el alto ya no restringe tanto como el ancho', () => {
    const square = computeFramingDistance(BOX, 1, FOV);
    const tall = computeFramingDistance(BOX, 0.4, FOV);
    expect(tall).toBeGreaterThanOrEqual(square);
  });

  it('contenedor ancho (aspect > 1): la distancia iguala o baja respecto al cuadrado, el ancho deja de restringir', () => {
    const square = computeFramingDistance(BOX, 1, FOV);
    const wide = computeFramingDistance(BOX, 3, FOV);
    expect(wide).toBeLessThanOrEqual(square);
  });

  it('aspect cero no divide por cero: cae al aspect por omision (1) en vez de NaN/Infinity', () => {
    const distance = computeFramingDistance(BOX, 0, FOV);
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBe(computeFramingDistance(BOX, 1, FOV));
  });

  it('aspect negativo o no finito tambien cae al aspect por omision', () => {
    expect(computeFramingDistance(BOX, -1, FOV)).toBe(
      computeFramingDistance(BOX, 1, FOV),
    );
    expect(computeFramingDistance(BOX, NaN, FOV)).toBe(
      computeFramingDistance(BOX, 1, FOV),
    );
    expect(computeFramingDistance(BOX, Infinity, FOV)).toBe(
      computeFramingDistance(BOX, 1, FOV),
    );
  });

  it('caja de dimension cero no produce NaN ni distancia negativa, cae al minimo', () => {
    const distance = computeFramingDistance(
      { width: 0, height: 0, depth: 0 },
      1,
      FOV,
    );
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeGreaterThan(0);
  });

  it('caja mas grande pide mas distancia (happy path, monotonia basica)', () => {
    const near = computeFramingDistance(BOX, 1, FOV);
    const far = computeFramingDistance(
      { width: BOX.width * 2, height: BOX.height * 2, depth: BOX.depth * 2 },
      1,
      FOV,
    );
    expect(far).toBeGreaterThan(near);
  });
});

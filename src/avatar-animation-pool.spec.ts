import { describe, expect, it } from 'vitest';
import {
  advanceAnimationPool,
  ANIMATION_CHANGE_MAX_MS,
  ANIMATION_CHANGE_MIN_MS,
  createAnimationPoolState,
  pickRandomAnimation,
} from './avatar-animation-pool';

describe('pickRandomAnimation — casos adversos', () => {
  it('un pool vacio no tiene nada que elegir', () => {
    expect(pickRandomAnimation([], null)).toBeNull();
  });

  it('un pool de un solo elemento no intenta "cambiar a otra" en bucle infinito: devuelve la misma', () => {
    expect(pickRandomAnimation(['unica'], 'unica', () => 0)).toBe('unica');
    expect(pickRandomAnimation(['unica'], 'unica', () => 0.999)).toBe('unica');
  });

  it('random en el borde superior (1 exclusivo) no se sale del arreglo de candidatos', () => {
    expect(pickRandomAnimation(['a', 'b', 'c'], 'a', () => 0.999999)).toBe('c');
  });

  it('random en el borde exacto 1 (fuera del rango real de Math.random) queda acotado al ultimo candidato', () => {
    expect(pickRandomAnimation(['a', 'b'], null, () => 1)).toBe('b');
  });
});

describe('pickRandomAnimation — happy path', () => {
  it('excluye la animacion actual cuando hay mas de una disponible', () => {
    const result = pickRandomAnimation(['a', 'b'], 'a', () => 0);
    expect(result).toBe('b');
  });

  it('sin exclusion (primera eleccion) puede devolver cualquiera del pool', () => {
    expect(pickRandomAnimation(['a', 'b'], null, () => 0)).toBe('a');
    expect(pickRandomAnimation(['a', 'b'], null, () => 0.999)).toBe('b');
  });
});

describe('createAnimationPoolState / advanceAnimationPool — casos adversos', () => {
  it('un pool vacio arranca sin animacion actual', () => {
    const state = createAnimationPoolState([], () => 0.5);
    expect(state.currentId).toBeNull();
  });

  it('avanzar un pool vacio no lanza, no produce estado invalido, y no avanza su cronometro', () => {
    const state = createAnimationPoolState([]);
    const advanced = advanceAnimationPool(state, 1);
    expect(advanced.currentId).toBeNull();
    expect(advanced.pool).toEqual([]);
    expect(advanced.elapsedMs).toBe(0);
  });

  it('el intervalo de cambio de animacion respeta exactamente sus limites min/max declarados', () => {
    expect(createAnimationPoolState(['a'], () => 0).nextChangeMs).toBe(
      ANIMATION_CHANGE_MIN_MS,
    );
    expect(createAnimationPoolState(['a'], () => 1).nextChangeMs).toBe(
      ANIMATION_CHANGE_MAX_MS,
    );
  });
});

describe('createAnimationPoolState / advanceAnimationPool — happy path', () => {
  it('antes de cumplirse el intervalo, la animacion actual no cambia', () => {
    const state = createAnimationPoolState(['a', 'b', 'c'], () => 0);
    const advanced = advanceAnimationPool(state, 1, () => 0);
    expect(advanced.currentId).toBe(state.currentId);
  });

  it('al cumplirse el intervalo, elige otra animacion distinta a la que sonaba', () => {
    const state = createAnimationPoolState(['a', 'b'], () => 0);
    expect(state.currentId).toBe('a');
    const advanced = advanceAnimationPool(state, state.nextChangeMs, () => 0);
    expect(advanced.currentId).toBe('b');
    expect(advanced.elapsedMs).toBe(0);
  });
});

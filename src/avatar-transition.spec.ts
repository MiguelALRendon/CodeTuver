import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSITION_DURATION_MS,
  decideTransition,
} from './avatar-transition';

describe('DEFAULT_TRANSITION_DURATION_MS', () => {
  it('es al menos 0.75s (pedido literal del usuario, Fallo 2)', () => {
    expect(DEFAULT_TRANSITION_DURATION_MS).toBeGreaterThanOrEqual(750);
  });
});

describe('decideTransition', () => {
  it('sin saliente, no hay nada que fundir', () => {
    expect(decideTransition(false, 0.75)).toBe('none');
    expect(decideTransition(false, 0)).toBe('none');
  });

  it('duracion 0 con saliente es corte inmediato, nunca una fase de fundido (AC-082)', () => {
    expect(decideTransition(true, 0)).toBe('stop-immediately');
  });

  it('duracion negativa (dato corrupto) tambien es corte inmediato, no un fundido con signo invertido', () => {
    expect(decideTransition(true, -1)).toBe('stop-immediately');
  });

  it('duracion positiva con saliente es un fundido real', () => {
    expect(decideTransition(true, 0.75)).toBe('crossfade');
    expect(decideTransition(true, 0.001)).toBe('crossfade');
  });

  it('happy path: la duracion por omision real produce un fundido', () => {
    expect(decideTransition(true, DEFAULT_TRANSITION_DURATION_MS / 1000)).toBe(
      'crossfade',
    );
  });
});

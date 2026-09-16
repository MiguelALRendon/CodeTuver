import { describe, expect, it } from 'vitest';
import {
  mapExpressionToVrm,
  resolveBlinkIntervalMs,
  resolveSupportedVrmExpression,
} from './vrm-expression-mapping';

describe('mapExpressionToVrm — casos adversos', () => {
  it('una expresion desconocida del catalogo cae al fallback neutral', () => {
    expect(mapExpressionToVrm('emocion_que_no_existe')).toBe('neutral');
  });

  it('una entrada vacia cae al fallback neutral', () => {
    expect(mapExpressionToVrm('')).toBe('neutral');
  });
});

describe('mapExpressionToVrm — happy path', () => {
  it('mapea los 8 valores reales de reaction-catalog.ts contra la matriz de avatar-and-tts.md', () => {
    expect(mapExpressionToVrm('neutral')).toBe('neutral');
    expect(mapExpressionToVrm('happy')).toBe('happy');
    expect(mapExpressionToVrm('excited')).toBe('happy');
    expect(mapExpressionToVrm('sad')).toBe('sad');
    expect(mapExpressionToVrm('tired')).toBe('relaxed');
    expect(mapExpressionToVrm('angry')).toBe('angry');
    expect(mapExpressionToVrm('surprised')).toBe('surprised');
    expect(mapExpressionToVrm('confused')).toBe('neutral');
  });
});

describe('resolveSupportedVrmExpression — casos adversos', () => {
  it('un modelo sin ningun blendshape soportado devuelve null', () => {
    expect(resolveSupportedVrmExpression('happy', [])).toBeNull();
  });

  it('la expresion mapeada no esta disponible pero el fallback neutral si, y lo usa', () => {
    expect(resolveSupportedVrmExpression('sad', ['neutral', 'surprised'])).toBe(
      'neutral',
    );
  });

  it('ni la expresion mapeada ni el fallback neutral estan disponibles: devuelve null', () => {
    expect(resolveSupportedVrmExpression('sad', ['surprised'])).toBeNull();
  });
});

describe('resolveSupportedVrmExpression — happy path', () => {
  it('la expresion mapeada esta disponible directamente en el modelo', () => {
    expect(
      resolveSupportedVrmExpression('happy', ['neutral', 'happy', 'sad']),
    ).toBe('happy');
  });
});

describe('resolveBlinkIntervalMs — casos adversos', () => {
  it('un mood desconocido cae al intervalo por defecto de 4000ms', () => {
    expect(resolveBlinkIntervalMs('mood_que_no_existe')).toBe(4000);
  });
});

describe('resolveBlinkIntervalMs — happy path', () => {
  it('cada mood real de resolveMood tiene su propio intervalo de parpadeo', () => {
    expect(resolveBlinkIntervalMs('neutral')).toBe(4000);
    expect(resolveBlinkIntervalMs('active')).toBe(2500);
    expect(resolveBlinkIntervalMs('waiting')).toBe(3500);
    expect(resolveBlinkIntervalMs('positive')).toBe(3000);
    expect(resolveBlinkIntervalMs('negative')).toBe(2000);
    expect(resolveBlinkIntervalMs('resting')).toBe(6000);
  });
});

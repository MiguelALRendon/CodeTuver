import { describe, expect, it } from 'vitest';
import {
  buildEffortCommand,
  parseEffortChangeConfirmation,
  EFFORT_LEVELS,
} from './session-hot-options';

describe('buildEffortCommand', () => {
  it('produce el comando slash real para cada nivel', () => {
    expect(buildEffortCommand('low')).toBe('/effort low');
    expect(buildEffortCommand('medium')).toBe('/effort medium');
    expect(buildEffortCommand('high')).toBe('/effort high');
    expect(buildEffortCommand('xhigh')).toBe('/effort xhigh');
    expect(buildEffortCommand('max')).toBe('/effort max');
  });

  it('EFFORT_LEVELS trae los 5 niveles reales confirmados en claude --help', () => {
    expect(EFFORT_LEVELS).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });
});

describe('parseEffortChangeConfirmation', () => {
  it('la respuesta real confirmada se reconoce (caso real observado en H19)', () => {
    const real =
      'Set effort level to medium (this session only): Balanced approach with standard implementation and testing';
    expect(parseEffortChangeConfirmation(real)).toBe('confirmed');
  });

  it('un texto que no confirma cae en "unknown", no se asume exito', () => {
    expect(parseEffortChangeConfirmation('algo no relacionado')).toBe(
      'unknown',
    );
  });

  it('el caso en que el cambio no prospera: un rechazo explicito tampoco se confirma', () => {
    const rejected = "/effort isn't available in this environment.";
    expect(parseEffortChangeConfirmation(rejected)).toBe('unknown');
  });
});

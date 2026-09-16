import { describe, expect, it } from 'vitest';
import {
  isClearCommandWithExtraContent,
  isClearSessionReset,
} from './clear-command';

describe('isClearSessionReset', () => {
  it('arranque normal (sin session_id previo) no cuenta como confirmacion', () => {
    expect(isClearSessionReset(null, 'abc')).toBe(false);
  });

  it('id previo no-nulo que cambia si cuenta como confirmacion', () => {
    expect(isClearSessionReset('abc', 'def')).toBe(true);
  });

  it('id previo no-nulo identico al nuevo no rompe ni cuenta como confirmacion', () => {
    expect(isClearSessionReset('abc', 'abc')).toBe(false);
  });
});

describe('isClearCommandWithExtraContent (correcciones-qa-gauntlet Hito 6)', () => {
  it('"/clear porfavor" (el caso real del bypass) dispara', () => {
    expect(isClearCommandWithExtraContent('/clear porfavor')).toBe(true);
  });

  it('"/clear my context please" dispara', () => {
    expect(isClearCommandWithExtraContent('/clear my context please')).toBe(
      true,
    );
  });

  it('"/clear" solo NO dispara (lo maneja el flujo existente, no regresionar)', () => {
    expect(isClearCommandWithExtraContent('/clear')).toBe(false);
  });

  it('"/clearly" (no es el token exacto) NO dispara (sin falso positivo)', () => {
    expect(isClearCommandWithExtraContent('/clearly')).toBe(false);
  });

  it('"/clear" con espacio en blanco alrededor sigue sin disparar (trim)', () => {
    expect(isClearCommandWithExtraContent('  /clear  ')).toBe(false);
  });

  it('un mensaje cualquiera sin relacion no dispara', () => {
    expect(isClearCommandWithExtraContent('hola como estas')).toBe(false);
  });
});

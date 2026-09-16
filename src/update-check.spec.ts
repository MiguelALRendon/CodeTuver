import { describe, expect, it } from 'vitest';
import { buildUpdateNoticeText, normalizeReleaseNotes } from './update-check';

describe('buildUpdateNoticeText — casos adversos', () => {
  it('sin actualizacion disponible no genera aviso', () => {
    expect(
      buildUpdateNoticeText({ available: false, version: null }),
    ).toBeNull();
  });

  it('disponible pero sin numero de version no genera aviso (dato incompleto, no se inventa un texto)', () => {
    expect(
      buildUpdateNoticeText({ available: true, version: null }),
    ).toBeNull();
  });

  it('no disponible con version presente (inconsistencia defensiva) tampoco genera aviso', () => {
    expect(
      buildUpdateNoticeText({ available: false, version: '9.9.9' }),
    ).toBeNull();
  });
});

describe('buildUpdateNoticeText — happy path', () => {
  it('disponible con version real incluye el numero exacto en el texto', () => {
    const text = buildUpdateNoticeText({ available: true, version: '0.2.0' });

    expect(text).toContain('0.2.0');
  });
});

describe('normalizeReleaseNotes — casos adversos', () => {
  it('sin body (undefined) no genera notas', () => {
    expect(normalizeReleaseNotes(undefined)).toBeNull();
  });

  it('body null no genera notas', () => {
    expect(normalizeReleaseNotes(null)).toBeNull();
  });

  it('body vacio no genera notas', () => {
    expect(normalizeReleaseNotes('')).toBeNull();
  });

  it('body solo con espacios/saltos de linea no genera notas', () => {
    expect(normalizeReleaseNotes('   \n\t  ')).toBeNull();
  });
});

describe('normalizeReleaseNotes — happy path', () => {
  it('body real se conserva recortando espacios sobrantes', () => {
    expect(normalizeReleaseNotes('  ## Cambios\n- fix real  ')).toBe(
      '## Cambios\n- fix real',
    );
  });
});

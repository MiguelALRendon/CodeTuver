import { describe, expect, it } from 'vitest';
import { resolveImportedVrmModelUrl } from './avatar-imported-model';
import type { ImportedCharacterSummary } from './character-import';

function character(
  format: ImportedCharacterSummary['format'],
): ImportedCharacterSummary {
  return {
    id: 'c1',
    name: 'Personaje',
    format,
    savedPath: 'C:\\datos\\imported-characters\\c1.vrm',
    capabilities: { expression: true, mouth: true, eyebrows: true },
  };
}

describe('resolveImportedVrmModelUrl (D2/H6)', () => {
  it('sin personaje importado, no hay URL que resolver', () => {
    expect(resolveImportedVrmModelUrl(null, (p) => p)).toBeNull();
  });

  it('un personaje live2d no produce URL (placeholder permanece, fuera de alcance)', () => {
    expect(
      resolveImportedVrmModelUrl(character('live2d'), (p) => p),
    ).toBeNull();
  });

  it('un personaje vrm convierte savedPath a la URL real via convertFileSrc', () => {
    const convertFileSrc = (path: string) => `asset://localhost/${path}`;
    expect(resolveImportedVrmModelUrl(character('vrm'), convertFileSrc)).toBe(
      'asset://localhost/C:\\datos\\imported-characters\\c1.vrm',
    );
  });
});

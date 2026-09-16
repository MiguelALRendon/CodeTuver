import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pickCharacterFile } from './character-file-picker';

const openMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openMock,
}));

describe('pickCharacterFile — casos adversos', () => {
  beforeEach(() => {
    openMock.mockReset();
  });

  it('cancelar el dialogo (open devuelve null) resuelve a null, no lanza', async () => {
    openMock.mockResolvedValueOnce(null);

    await expect(pickCharacterFile()).resolves.toBeNull();
  });

  it('seleccion multiple (array, aunque el picker pida multiple:false) no se confunde con una ruta valida', async () => {
    openMock.mockResolvedValueOnce(['C:/a.vrm', 'C:/b.vrm']);

    await expect(pickCharacterFile()).resolves.toBeNull();
  });

  it('el error del SO al abrir el dialogo se propaga tal cual, sin envolverlo', async () => {
    openMock.mockRejectedValueOnce(
      new Error('no se pudo abrir el dialogo nativo'),
    );

    await expect(pickCharacterFile()).rejects.toThrow(
      'no se pudo abrir el dialogo nativo',
    );
  });

  it('filtra por las 3 extensiones reales del catalogo de personajes (vrm/glb/json), sin agregar ni perder ninguna', async () => {
    openMock.mockResolvedValueOnce(null);

    await pickCharacterFile();

    expect(openMock).toHaveBeenCalledWith({
      multiple: false,
      filters: [{ name: 'Personaje', extensions: ['vrm', 'glb', 'json'] }],
    });
  });
});

describe('pickCharacterFile — happy path', () => {
  beforeEach(() => {
    openMock.mockReset();
  });

  it('una ruta real seleccionada se devuelve tal cual', async () => {
    openMock.mockResolvedValueOnce('C:/personajes/alicia.vrm');

    await expect(pickCharacterFile()).resolves.toBe('C:/personajes/alicia.vrm');
  });
});

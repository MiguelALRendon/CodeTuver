import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  importAnimationFile,
  listImportedAnimations,
  saveCreatedAnimationFile,
} from './animation-import';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

describe('importAnimationFile — casos adversos', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('cabecera invalida: propaga el error tal cual lo rechaza el backend', async () => {
    invokeMock.mockRejectedValueOnce({
      kind: 'corrupt-vrma-header',
      message: 'los primeros 4 bytes no coinciden con el magic glTF',
    });

    await expect(
      importAnimationFile('C:/animaciones/rota.vrma', 'animation'),
    ).rejects.toEqual({
      kind: 'corrupt-vrma-header',
      message: 'los primeros 4 bytes no coinciden con el magic glTF',
    });
  });

  it('ruta inexistente: propaga file-not-found tal cual lo rechaza el backend', async () => {
    invokeMock.mockRejectedValueOnce({
      kind: 'file-not-found',
      message: 'no se encontro el archivo',
    });

    await expect(
      importAnimationFile('C:/no-existe.vrma', 'pose'),
    ).rejects.toEqual({
      kind: 'file-not-found',
      message: 'no se encontro el archivo',
    });
  });

  it('kind desconocido en la respuesta del backend: rechaza con invalid-response en vez de devolver el resumen tal cual', async () => {
    invokeMock.mockResolvedValueOnce({
      id: 'saludo.vrma',
      name: 'saludo',
      savedPath: 'C:/datos/imported-animations/saludo.vrma',
      kind: 'gesto',
    });

    await expect(
      importAnimationFile('C:/animaciones/saludo.vrma', 'animation'),
    ).rejects.toEqual({
      kind: 'invalid-response',
      message: 'el backend devolvio un kind desconocido: "gesto"',
    });
  });

  it('importacion valida: devuelve el resumen del backend sin transformarlo', async () => {
    const summary = {
      id: 'saludo.vrma',
      name: 'saludo',
      savedPath: 'C:/datos/imported-animations/saludo.vrma',
      kind: 'pose' as const,
    };
    invokeMock.mockResolvedValueOnce(summary);

    const result = await importAnimationFile(
      'C:/animaciones/saludo.vrma',
      'pose',
    );

    expect(result).toEqual(summary);
    expect(invokeMock).toHaveBeenCalledWith('import_animation_file', {
      path: 'C:/animaciones/saludo.vrma',
      kind: 'pose',
    });
  });
});

describe('listImportedAnimations — casos adversos', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('listado valido: devuelve los resumenes del backend sin transformarlos', async () => {
    const summaries = [
      {
        id: 'saludo.vrma',
        name: 'saludo',
        savedPath: 'C:/datos/imported-animations/pose/saludo.vrma',
        kind: 'pose' as const,
      },
      {
        id: 'baile.vrma',
        name: 'baile',
        savedPath: 'C:/datos/imported-animations/animation/baile.vrma',
        kind: 'animation' as const,
      },
    ];
    invokeMock.mockResolvedValueOnce(summaries);

    const result = await listImportedAnimations();

    expect(result).toEqual(summaries);
    expect(invokeMock).toHaveBeenCalledWith('list_imported_animations');
  });

  it('error de invoke: propaga el error tal cual lo rechaza el backend', async () => {
    invokeMock.mockRejectedValueOnce({
      kind: 'io-error',
      message: 'error de E/S',
    });

    await expect(listImportedAnimations()).rejects.toEqual({
      kind: 'io-error',
      message: 'error de E/S',
    });
  });

  it('kind desconocido en un elemento de la respuesta: rechaza con invalid-response', async () => {
    invokeMock.mockResolvedValueOnce([
      {
        id: 'raro.vrma',
        name: 'raro',
        savedPath: 'C:/datos/imported-animations/gesto/raro.vrma',
        kind: 'gesto',
      },
    ]);

    await expect(listImportedAnimations()).rejects.toEqual({
      kind: 'invalid-response',
      message: 'el backend devolvio un kind desconocido: "gesto"',
    });
  });
});

describe('saveCreatedAnimationFile — casos adversos', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('cabecera invalida (bytes vacios): propaga el error tal cual lo rechaza el backend', async () => {
    invokeMock.mockRejectedValueOnce({
      kind: 'corrupt-vrma-header',
      message: 'se requieren al menos 12 bytes de header glTF',
    });

    await expect(
      saveCreatedAnimationFile(new Uint8Array(), 'pose', 'pose.vrma'),
    ).rejects.toEqual({
      kind: 'corrupt-vrma-header',
      message: 'se requieren al menos 12 bytes de header glTF',
    });
  });

  it('kind desconocido en la respuesta del backend: rechaza con invalid-response', async () => {
    invokeMock.mockResolvedValueOnce({
      id: 'pose-creada.vrma',
      name: 'pose-creada',
      savedPath: 'C:/datos/imported-animations/pose/pose-creada.vrma',
      kind: 'gesto',
    });

    await expect(
      saveCreatedAnimationFile(
        new Uint8Array([1, 2, 3]),
        'pose',
        'pose-creada.vrma',
      ),
    ).rejects.toEqual({
      kind: 'invalid-response',
      message: 'el backend devolvio un kind desconocido: "gesto"',
    });
  });

  it('guardado valido: devuelve el resumen del backend e invoca con los bytes como arreglo', async () => {
    const summary = {
      id: 'pose-creada.vrma',
      name: 'pose-creada',
      savedPath: 'C:/datos/imported-animations/pose/pose-creada.vrma',
      kind: 'pose' as const,
    };
    invokeMock.mockResolvedValueOnce(summary);

    const result = await saveCreatedAnimationFile(
      new Uint8Array([1, 2, 3]),
      'pose',
      'pose-creada.vrma',
    );

    expect(result).toEqual(summary);
    expect(invokeMock).toHaveBeenCalledWith('save_created_animation_file', {
      bytes: [1, 2, 3],
      kind: 'pose',
      fileName: 'pose-creada.vrma',
    });
  });
});

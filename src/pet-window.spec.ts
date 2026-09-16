import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import type { showPetWindow, hidePetWindow } from './pet-window';

const petWindowMock = vi.hoisted(() => ({
  setSize: vi.fn().mockResolvedValue(undefined),
  setPosition: vi.fn().mockResolvedValue(undefined),
  setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
  show: vi.fn().mockResolvedValue(undefined),
  hide: vi.fn().mockResolvedValue(undefined),
  once: vi.fn((event: string, handler: (e: { payload: unknown }) => void) => {
    if (event === 'tauri://created') handler({ payload: undefined });
    return Promise.resolve(() => undefined);
  }),
}));

const WebviewWindowMock = vi.hoisted(() => {
  const ctor = vi.fn(function WebviewWindowMock() {
    return petWindowMock;
  });
  (ctor as unknown as { getByLabel: ReturnType<typeof vi.fn> }).getByLabel = vi
    .fn()
    .mockResolvedValue(null);
  return ctor;
});

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: WebviewWindowMock,
}));

describe('pet-window', () => {
  let showPetWindowFn: typeof showPetWindow;
  let hidePetWindowFn: typeof hidePetWindow;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('./pet-window');
    showPetWindowFn = mod.showPetWindow;
    hidePetWindowFn = mod.hidePetWindow;
  });

  it('crea la ventana pet una sola vez y la reutiliza en llamadas siguientes', async () => {
    await showPetWindowFn({ x: 10, y: 20 }, { width: 200, height: 200 }, true);
    await showPetWindowFn({ x: 30, y: 40 }, { width: 200, height: 200 }, true);

    expect(WebviewWindowMock).toHaveBeenCalledTimes(1);
    expect(WebviewWindowMock).toHaveBeenCalledWith(
      'pet',
      expect.objectContaining({
        url: 'index.html',
        transparent: true,
        decorations: false,
        alwaysOnTop: true,
        focusable: false,
        resizable: false,
        skipTaskbar: true,
        visible: false,
      }),
    );
  });

  it('reposiciona, actualiza siempre-encima y muestra la ventana con las coordenadas fisicas dadas', async () => {
    await showPetWindowFn({ x: 10, y: 20 }, { width: 150, height: 160 }, false);

    expect(petWindowMock.setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(petWindowMock.setSize).toHaveBeenCalledWith(
      new PhysicalSize(150, 160),
    );
    expect(petWindowMock.setPosition).toHaveBeenCalledWith(
      new PhysicalPosition(10, 20),
    );
    expect(petWindowMock.show).toHaveBeenCalledTimes(1);
  });

  it('hidePetWindow no falla si la ventana nunca se creo', async () => {
    await expect(hidePetWindowFn()).resolves.toBeUndefined();
    expect(petWindowMock.hide).not.toHaveBeenCalled();
  });

  it('hidePetWindow oculta la ventana cacheada tras haberla creado', async () => {
    await showPetWindowFn({ x: 0, y: 0 }, { width: 100, height: 100 }, true);

    await hidePetWindowFn();

    expect(petWindowMock.hide).toHaveBeenCalledTimes(1);
  });

  it('espera a que el webview termine de crearse antes de aplicar tamaño/posicion (evita la carrera contra el handle aun no listo)', async () => {
    let resolveCreated!: () => void;
    petWindowMock.once.mockImplementation((event, handler) => {
      if (event === 'tauri://created') {
        resolveCreated = () => handler({ payload: undefined });
      }
      return Promise.resolve(() => undefined);
    });

    const pending = showPetWindowFn(
      { x: 0, y: 0 },
      { width: 100, height: 100 },
      true,
    );
    // getOrCreatePetWindow espera primero a getByLabel (microtask) antes de registrar 'once'; se deja correr esa cola antes de comprobar.
    await Promise.resolve();
    await Promise.resolve();
    expect(petWindowMock.setSize).not.toHaveBeenCalled();

    resolveCreated();
    await pending;

    expect(petWindowMock.setSize).toHaveBeenCalledWith(
      new PhysicalSize(100, 100),
    );
  });

  it('reusa el webview existente por etiqueta en vez de recrearlo (sobrevive a un recargo del frontend)', async () => {
    (
      WebviewWindowMock as unknown as { getByLabel: ReturnType<typeof vi.fn> }
    ).getByLabel.mockResolvedValueOnce(petWindowMock);

    await showPetWindowFn({ x: 5, y: 6 }, { width: 120, height: 120 }, true);

    expect(WebviewWindowMock).not.toHaveBeenCalled();
    expect(petWindowMock.setSize).toHaveBeenCalledWith(
      new PhysicalSize(120, 120),
    );
  });

  it('propaga el error si el webview falla al crearse', async () => {
    petWindowMock.once.mockImplementation((event, handler) => {
      if (event === 'tauri://error') handler({ payload: 'boom' });
      return Promise.resolve(() => undefined);
    });

    await expect(
      showPetWindowFn({ x: 0, y: 0 }, { width: 100, height: 100 }, true),
    ).rejects.toThrow('boom');
  });
});

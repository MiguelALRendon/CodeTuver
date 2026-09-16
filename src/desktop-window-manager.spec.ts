import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import {
  armMissingWindowCapability,
  getCurrentWindowLabel,
  TauriDesktopWindowManager,
} from './desktop-window-manager';

const windowMock = vi.hoisted(() => ({
  label: 'main',
  setAlwaysOnTop: vi.fn(),
  setBackgroundColor: vi.fn(),
  setDecorations: vi.fn(),
  setResizable: vi.fn(),
  maximize: vi.fn(),
  unmaximize: vi.fn(),
  setPosition: vi.fn(),
  setSize: vi.fn(),
  startDragging: vi.fn(),
  setIgnoreCursorEvents: vi.fn(),
  setFocusable: vi.fn(),
  show: vi.fn(),
  hide: vi.fn(),
  minimize: vi.fn(),
  unminimize: vi.fn(),
  setFocus: vi.fn(),
  outerSize: vi.fn(),
  outerPosition: vi.fn(),
}));

const monitorMock = vi.hoisted(() => ({
  getMonitors: vi.fn(),
  getCurrentMonitor: vi.fn(),
  calculateCornerPosition: vi.fn(),
}));

const petWindowMock = vi.hoisted(() => ({
  showPetWindow: vi.fn(),
  hidePetWindow: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', async () => {
  const dpi = await vi.importActual<typeof import('@tauri-apps/api/dpi')>(
    '@tauri-apps/api/dpi',
  );
  return {
    getCurrentWindow: () => windowMock,
    PhysicalPosition: dpi.PhysicalPosition,
    PhysicalSize: dpi.PhysicalSize,
  };
});

vi.mock('./monitor-position', () => monitorMock);
vi.mock('./pet-window', () => petWindowMock);

describe('TauriDesktopWindowManager', () => {
  let manager: TauriDesktopWindowManager;

  beforeEach(() => {
    vi.resetAllMocks();
    armMissingWindowCapability(null);
    manager = new TauriDesktopWindowManager();
  });

  describe('casos adversos', () => {
    it.each([
      [
        'setAlwaysOnTop',
        () => manager.setAlwaysOnTop(true),
        windowMock.setAlwaysOnTop,
      ],
      [
        'setBorderless',
        () => manager.setBorderless(true),
        windowMock.setDecorations,
      ],
      [
        'setResizable',
        () => manager.setResizable(true),
        windowMock.setResizable,
      ],
      [
        'setMaximized(true)',
        () => manager.setMaximized(true),
        windowMock.maximize,
      ],
      [
        'setMaximized(false)',
        () => manager.setMaximized(false),
        windowMock.unmaximize,
      ],
      [
        'startDragging',
        () => manager.startDragging(),
        windowMock.startDragging,
      ],
      [
        'setFocusable',
        () => manager.setFocusable(true),
        windowMock.setFocusable,
      ],
      [
        'setSize',
        () => manager.setSize({ width: 100, height: 100 }),
        windowMock.setSize,
      ],
      [
        'setPosition (absolute)',
        () => manager.setPosition({ type: 'absolute', x: 1, y: 2 }),
        windowMock.setPosition,
      ],
      ['getPosition', () => manager.getPosition(), windowMock.outerPosition],
      [
        'setTransparent(false)',
        () => manager.setTransparent(false),
        windowMock.setBackgroundColor,
      ],
      [
        'showPetWindow',
        () =>
          manager.showPetWindow(
            { type: 'absolute', x: 1, y: 2 },
            { width: 100, height: 100 },
            true,
          ),
        petWindowMock.showPetWindow,
      ],
      [
        'hidePetWindow',
        () => manager.hidePetWindow(),
        petWindowMock.hidePetWindow,
      ],
      [
        'setIgnoreMouseEvents',
        () => manager.setIgnoreMouseEvents(true),
        windowMock.setIgnoreCursorEvents,
      ],
      ['show', () => manager.show(), windowMock.show],
      ['hide', () => manager.hide(), windowMock.hide],
      ['minimize', () => manager.minimize(), windowMock.minimize],
      ['focus', () => manager.focus(), windowMock.setFocus],
    ])(
      '%s rechaza con window-management-error (no con el error crudo) cuando la llamada de Tauri subyacente falla',
      async (_name, invoke, tauriFn) => {
        tauriFn.mockRejectedValueOnce(new Error('fallo nativo de tauri'));

        await expect(invoke()).rejects.toEqual({
          kind: 'window-management-error',
          message: 'fallo nativo de tauri',
        });
      },
    );

    it.each([
      ['getMonitors', () => manager.getMonitors(), monitorMock.getMonitors],
      [
        'getCurrentMonitor',
        () => manager.getCurrentMonitor(),
        monitorMock.getCurrentMonitor,
      ],
    ])(
      '%s rechaza con monitor-query-error cuando la consulta de monitores subyacente falla',
      async (_name, invoke, tauriFn) => {
        tauriFn.mockRejectedValueOnce(new Error('fallo de consulta'));

        await expect(invoke()).rejects.toEqual({
          kind: 'monitor-query-error',
          message: 'fallo de consulta',
        });
      },
    );

    it('armMissingWindowCapability(show) hace que show rechace sin invocar a window.show, y se consume una sola vez', async () => {
      armMissingWindowCapability('show');

      await expect(manager.show()).rejects.toEqual({
        kind: 'window-management-error',
        message: 'mostrar ventana simulado como ausente',
      });
      expect(windowMock.show).not.toHaveBeenCalled();

      await expect(manager.show()).resolves.toBeUndefined();
      expect(windowMock.show).toHaveBeenCalledTimes(1);
    });

    it.each([
      [
        'setPresentationMode',
        () => manager.setPresentationMode('FULL'),
        undefined,
      ] as const,
      [
        'setAlwaysOnTop',
        () => manager.setAlwaysOnTop(true),
        windowMock.setAlwaysOnTop,
      ] as const,
      [
        'setBorderless',
        () => manager.setBorderless(true),
        windowMock.setDecorations,
      ] as const,
      [
        'setResizable',
        () => manager.setResizable(true),
        windowMock.setResizable,
      ] as const,
      [
        'setMaximized',
        () => manager.setMaximized(true),
        windowMock.maximize,
      ] as const,
      [
        'startDragging',
        () => manager.startDragging(),
        windowMock.startDragging,
      ] as const,
      [
        'setPosition',
        () => manager.setPosition({ type: 'absolute', x: 0, y: 0 }),
        windowMock.setPosition,
      ] as const,
      [
        'setSize',
        () => manager.setSize({ width: 100, height: 100 }),
        windowMock.setSize,
      ] as const,
      [
        'setIgnoreMouseEvents',
        () => manager.setIgnoreMouseEvents(true),
        windowMock.setIgnoreCursorEvents,
      ] as const,
      [
        'setFocusable',
        () => manager.setFocusable(true),
        windowMock.setFocusable,
      ] as const,
      [
        'showPetWindow',
        () =>
          manager.showPetWindow(
            { type: 'absolute', x: 0, y: 0 },
            { width: 100, height: 100 },
            true,
          ),
        petWindowMock.showPetWindow,
      ] as const,
      [
        'hidePetWindow',
        () => manager.hidePetWindow(),
        petWindowMock.hidePetWindow,
      ] as const,
      ['hide', () => manager.hide(), windowMock.hide] as const,
      ['minimize', () => manager.minimize(), windowMock.minimize] as const,
      ['restore', () => manager.restore(), windowMock.unminimize] as const,
      ['focus', () => manager.focus(), windowMock.setFocus] as const,
      [
        'getMonitors',
        () => manager.getMonitors(),
        monitorMock.getMonitors,
      ] as const,
      [
        'getCurrentMonitor',
        () => manager.getCurrentMonitor(),
        monitorMock.getCurrentMonitor,
      ] as const,
    ])(
      'armMissingWindowCapability(%s) hace que ese metodo rechace sin invocar la operacion real, y se consume una sola vez',
      async (_name, invoke, tauriFn) => {
        armMissingWindowCapability(_name);

        await expect(invoke()).rejects.toMatchObject({
          message: expect.any(String),
        });
        if (tauriFn) expect(tauriFn).not.toHaveBeenCalled();

        await expect(invoke()).resolves.toBeUndefined();
      },
    );

    it('armMissingWindowCapability(getPosition) hace que getPosition rechace sin invocar a window.outerPosition, y se consume una sola vez', async () => {
      armMissingWindowCapability('getPosition');

      await expect(manager.getPosition()).rejects.toEqual({
        kind: 'window-management-error',
        message: 'posicion actual simulada como ausente',
      });
      expect(windowMock.outerPosition).not.toHaveBeenCalled();

      windowMock.outerPosition.mockResolvedValueOnce({ x: 10, y: 20 });
      await expect(manager.getPosition()).resolves.toEqual({ x: 10, y: 20 });
    });

    it('setTransparent(true) llama a setBackgroundColor con el color transparente (ADR-0008: la ventana ya se crea con transparent:true)', async () => {
      windowMock.setBackgroundColor.mockResolvedValueOnce(undefined);

      await manager.setTransparent(true);

      expect(windowMock.setBackgroundColor).toHaveBeenCalledWith([0, 0, 0, 0]);
    });

    it('setTransparent(true) rechaza con unsupported-capability cuando setTransparent esta armado como ausente', async () => {
      armMissingWindowCapability('setTransparent');

      await expect(manager.setTransparent(true)).rejects.toEqual({
        kind: 'unsupported-capability',
        message: 'simulacion de transparencia no disponible',
      });
      expect(windowMock.setBackgroundColor).not.toHaveBeenCalled();
    });

    it('setTransparent(false) llama a setBackgroundColor con el color opaco de respaldo documentado', async () => {
      windowMock.setBackgroundColor.mockResolvedValueOnce(undefined);

      await manager.setTransparent(false);

      expect(windowMock.setBackgroundColor).toHaveBeenCalledWith([
        255, 255, 255, 255,
      ]);
    });

    it('setIgnoreMouseEvents con hitTestAvatarOnly rechaza sin invocar setIgnoreCursorEvents (no soportado por Tauri)', async () => {
      await expect(
        manager.setIgnoreMouseEvents(true, { hitTestAvatarOnly: true }),
      ).rejects.toEqual({
        kind: 'window-management-error',
        message:
          'clic solo sobre el avatar no soportado por Tauri; fallback documentado: la ventana captura todo el clic',
      });
      expect(windowMock.setIgnoreCursorEvents).not.toHaveBeenCalled();
    });

    it('setPosition tipo screen_corner rechaza con monitor-query-error cuando no hay monitor actual, sin llamar a window.setPosition', async () => {
      monitorMock.getCurrentMonitor.mockResolvedValueOnce(null);
      windowMock.outerSize.mockResolvedValueOnce({ width: 100, height: 100 });

      await expect(
        manager.setPosition({
          type: 'screen_corner',
          corner: 'top-left',
          marginX: 0,
          marginY: 0,
        }),
      ).rejects.toEqual({
        kind: 'monitor-query-error',
        message: 'no hay monitor actual disponible',
      });
      expect(windowMock.setPosition).not.toHaveBeenCalled();
    });

    it('setPosition tipo monitor_relative rechaza con monitor-query-error mencionando el id cuando el monitor no existe', async () => {
      monitorMock.getMonitors.mockResolvedValueOnce([]);

      await expect(
        manager.setPosition({
          type: 'monitor_relative',
          monitorId: 'monitor-fantasma',
          x: 0,
          y: 0,
        }),
      ).rejects.toEqual({
        kind: 'monitor-query-error',
        message: 'el monitor persistido "monitor-fantasma" ya no existe',
      });
      expect(windowMock.setPosition).not.toHaveBeenCalled();
    });

    it('restore rechaza con window-restore-error cuando unminimize falla, sin llegar a llamar a show', async () => {
      windowMock.unminimize.mockRejectedValueOnce(
        new Error('fallo al desminimizar'),
      );

      await expect(manager.restore()).rejects.toEqual({
        kind: 'window-restore-error',
        message: 'fallo al desminimizar',
      });
      expect(windowMock.show).not.toHaveBeenCalled();
    });

    it('restore rechaza con window-restore-error cuando show falla despues de que unminimize tuvo exito', async () => {
      windowMock.unminimize.mockResolvedValueOnce(undefined);
      windowMock.show.mockRejectedValueOnce(
        new Error('fallo al mostrar tras restaurar'),
      );

      await expect(manager.restore()).rejects.toEqual({
        kind: 'window-restore-error',
        message: 'fallo al mostrar tras restaurar',
      });
      expect(windowMock.unminimize).toHaveBeenCalledTimes(1);
    });

    it('restore llama a unminimize y luego a show en ese orden', async () => {
      const callOrder: string[] = [];
      windowMock.unminimize.mockImplementationOnce(async () => {
        callOrder.push('unminimize');
      });
      windowMock.show.mockImplementationOnce(async () => {
        callOrder.push('show');
      });

      await manager.restore();

      expect(callOrder).toEqual(['unminimize', 'show']);
    });
  });

  describe('happy path', () => {
    it('setPosition tipo absolute resuelve directo sin consultar monitores y llama a window.setPosition con las coordenadas exactas', async () => {
      windowMock.setPosition.mockResolvedValueOnce(undefined);

      await manager.setPosition({ type: 'absolute', x: 123, y: 456 });

      expect(windowMock.setPosition).toHaveBeenCalledWith(
        new PhysicalPosition(123, 456),
      );
      expect(monitorMock.getMonitors).not.toHaveBeenCalled();
      expect(monitorMock.getCurrentMonitor).not.toHaveBeenCalled();
    });

    it('showPetWindow resuelve la posicion (screen_corner incluido) antes de delegar a la ventana pet', async () => {
      monitorMock.getCurrentMonitor.mockResolvedValueOnce({
        id: 'monitor-a',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        scaleFactor: 1,
        isPrimary: true,
      });
      monitorMock.calculateCornerPosition.mockReturnValueOnce({
        x: 1700,
        y: 820,
      });
      petWindowMock.showPetWindow.mockResolvedValueOnce(undefined);

      await manager.showPetWindow(
        {
          type: 'screen_corner',
          corner: 'bottom-right',
          marginX: 20,
          marginY: 20,
        },
        { width: 200, height: 200 },
        true,
      );

      expect(petWindowMock.showPetWindow).toHaveBeenCalledWith(
        { x: 1700, y: 820 },
        { width: 200, height: 200 },
        true,
      );
    });

    it('getPosition devuelve x/y desde window.outerPosition', async () => {
      windowMock.outerPosition.mockResolvedValueOnce({ x: 1234, y: 567 });

      await expect(manager.getPosition()).resolves.toEqual({
        x: 1234,
        y: 567,
      });
    });

    it('getCurrentWindowLabel devuelve el label de la ventana actual', async () => {
      await expect(getCurrentWindowLabel()).resolves.toBe('main');
    });
  });
});

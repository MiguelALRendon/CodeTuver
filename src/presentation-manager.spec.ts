import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DesktopWindowManager,
  MonitorInfo,
  PresentationMode,
} from './desktop-window-manager';
import { calculateCornerPosition } from './monitor-position';
import { clearFailureLog, listFailures } from './failure-taxonomy';
import {
  armPresentationTransitionFault,
  PresentationManager,
  type PersistedPresentationSettings,
} from './presentation-manager';

function defaultPersistedSettings(
  overrides: Partial<PersistedPresentationSettings> = {},
): PersistedPresentationSettings {
  return {
    corner: 'bottom-right',
    windowSize: { width: 200, height: 200 },
    alwaysOnTop: true,
    monitor: '',
    initialMode: 'FULL',
    activityVisibility: 'VISIBLE',
    ...overrides,
  };
}

const MONITOR_A: MonitorInfo = {
  id: 'monitor-a',
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 1,
  isPrimary: true,
};

const MONITOR_B: MonitorInfo = {
  id: 'monitor-b',
  bounds: { x: 1920, y: 0, width: 1280, height: 1024 },
  workArea: { x: 1920, y: 0, width: 1280, height: 984 },
  scaleFactor: 1,
  isPrimary: false,
};

function createFakeWindowManager(): DesktopWindowManager {
  return {
    setPresentationMode: vi.fn().mockResolvedValue(undefined),
    setAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
    setTransparent: vi.fn().mockResolvedValue(undefined),
    setBorderless: vi.fn().mockResolvedValue(undefined),
    setResizable: vi.fn().mockResolvedValue(undefined),
    setMaximized: vi.fn().mockResolvedValue(undefined),
    setPosition: vi.fn().mockResolvedValue(undefined),
    getPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
    setSize: vi.fn().mockResolvedValue(undefined),
    startDragging: vi.fn().mockResolvedValue(undefined),
    setIgnoreMouseEvents: vi.fn().mockResolvedValue(undefined),
    setFocusable: vi.fn().mockResolvedValue(undefined),
    showPetWindow: vi.fn().mockResolvedValue(undefined),
    hidePetWindow: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined),
    hide: vi.fn().mockResolvedValue(undefined),
    minimize: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    focus: vi.fn().mockResolvedValue(undefined),
    getMonitors: vi.fn().mockResolvedValue([]),
    getCurrentMonitor: vi.fn().mockResolvedValue(null),
  };
}

describe('PresentationManager', () => {
  let windowManager: DesktopWindowManager;
  let manager: PresentationManager;

  beforeEach(() => {
    windowManager = createFakeWindowManager();
    manager = new PresentationManager(windowManager);
    armPresentationTransitionFault(null);
    clearFailureLog();
  });

  describe('casos adversos', () => {
    it('rechaza una transicion no declarada en la tabla sin tocar el estado', async () => {
      const before = manager.getState();

      await expect(
        manager.transitionTo('GHOST' as PresentationMode),
      ).rejects.toEqual({
        kind: 'invalid-transition',
        mode: 'GHOST',
        message: expect.any(String),
      });
      expect(manager.getState()).toEqual(before);
    });

    it('un fallo a mitad de transicion deja el estado en el modo seguro previo, no en un hibrido', async () => {
      vi.mocked(windowManager.setBorderless).mockRejectedValueOnce(
        new Error('fallo simulado en setBorderless'),
      );

      await manager.transitionTo('COMPANION');

      expect(manager.getState().mode).toBe('FULL');
      expect(manager.getState().avatarPosition).toBe('CORNER');
    });

    it('un fallo que rechaza con un objeto plano (no Error) produce un mensaje real, no "[object Object]" (Hallazgo 7)', async () => {
      const faultHandler = vi.fn();
      manager.onTransitionFault(faultHandler);
      vi.mocked(windowManager.setBorderless).mockRejectedValueOnce({
        code: 'window-creation-failed',
      });

      await manager.transitionTo('COMPANION');

      expect(faultHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '{"code":"window-creation-failed"}',
        }),
      );
    });

    it('pendingInteractionCount sobrevive a las seis transiciones declaradas', async () => {
      manager.setPendingInteractionCount(7);

      const path: PresentationMode[] = [
        'COMPANION',
        'PET',
        'FULL',
        'PET',
        'COMPANION',
        'FULL',
      ];
      for (const mode of path) {
        await manager.transitionTo(mode);
        expect(manager.getState().pendingInteractionCount).toBe(7);
      }
    });

    it('la instantanea de visibilidad se restaura al volver a FULL sin pisarse por un modo intermedio', async () => {
      manager.setActivityVisibility('HIDDEN');

      await manager.transitionTo('COMPANION');
      await manager.transitionTo('PET');
      await manager.transitionTo('FULL');

      expect(manager.getState().activityVisibility).toBe('HIDDEN');
    });

    it('una transicion al mismo modo en el que ya se esta es un no-op exitoso sin llamar al windowManager', async () => {
      await manager.transitionTo('FULL');

      expect(windowManager.setPresentationMode).not.toHaveBeenCalled();
      expect(windowManager.setTransparent).not.toHaveBeenCalled();
    });

    it('dos transiciones solicitadas a la vez se serializan sin condicion de carrera', async () => {
      const first = manager.transitionTo('COMPANION');
      const second = manager.transitionTo('PET');

      await expect(first).resolves.toBeUndefined();
      await expect(second).resolves.toBeUndefined();
      expect(manager.getState().mode).toBe('PET');

      const calls = vi
        .mocked(windowManager.setPresentationMode)
        .mock.calls.map((call) => call[0]);
      expect(calls).toEqual(['COMPANION', 'PET']);
    });

    it('una segunda transicion pedida mientras la primera ya esta en curso se ignora en vez de encolarse (Hallazgo 15)', async () => {
      let resolveHide: () => void = () => {};
      const hidePending = new Promise<void>((resolve) => {
        resolveHide = resolve;
      });
      vi.mocked(windowManager.hide).mockReturnValueOnce(hidePending);

      const first = manager.transitionTo('PET');
      await Promise.resolve();
      await Promise.resolve();

      const second = manager.transitionTo('FULL');
      resolveHide();
      await first;
      await second;

      expect(windowManager.showPetWindow).toHaveBeenCalledTimes(1);
      expect(windowManager.hidePetWindow).not.toHaveBeenCalled();
      expect(manager.getState().mode).toBe('PET');
    });

    it('armPresentationTransitionFault dispara el protocolo de fallo completo y se consume una sola vez', async () => {
      const faultHandler = vi.fn();
      manager.onTransitionFault(faultHandler);
      armPresentationTransitionFault('COMPANION');

      await manager.transitionTo('COMPANION');

      expect(faultHandler).toHaveBeenCalledWith({
        kind: 'transition-failed',
        mode: 'COMPANION',
        message: expect.any(String),
      });
      expect(manager.getState().mode).toBe('FULL');
      expect(windowManager.setPresentationMode).toHaveBeenCalledWith('FULL');

      faultHandler.mockClear();
      vi.mocked(windowManager.setPresentationMode).mockClear();
      await manager.transitionTo('COMPANION');

      expect(faultHandler).not.toHaveBeenCalled();
      expect(manager.getState().mode).toBe('COMPANION');
    });

    it('setActivityVisibility fuera de FULL es no-op', async () => {
      await manager.transitionTo('COMPANION');
      const before = { ...manager.getState() };

      manager.setActivityVisibility('HIDDEN');

      expect(manager.getState()).toEqual(before);
    });

    it('PET ya no ignora eventos de mouse de la ventana main (la ventana pet es otra WebviewWindow, esta bandera ya no aplica a la ventana actual)', async () => {
      await manager.transitionTo('PET');

      expect(windowManager.setIgnoreMouseEvents).not.toHaveBeenCalled();
    });

    it('entrar en PET oculta la ventana main y muestra la ventana pet en la esquina configurada', async () => {
      await manager.transitionTo('PET');

      expect(windowManager.hide).toHaveBeenCalledTimes(1);
      expect(windowManager.showPetWindow).toHaveBeenCalledWith(
        {
          type: 'screen_corner',
          corner: 'bottom-right',
          marginX: 20,
          marginY: 20,
        },
        { width: 200, height: 200 },
        true,
      );
    });

    it('volver a FULL oculta la ventana pet, maximiza main y la muestra/enfoca', async () => {
      await manager.transitionTo('COMPANION');
      vi.mocked(windowManager.setMaximized).mockClear();
      vi.mocked(windowManager.show).mockClear();
      vi.mocked(windowManager.focus).mockClear();

      await manager.transitionTo('FULL');

      expect(windowManager.hidePetWindow).toHaveBeenCalled();
      expect(windowManager.setMaximized).toHaveBeenCalledWith(true);
      expect(windowManager.show).toHaveBeenCalledTimes(1);
      expect(windowManager.focus).toHaveBeenCalledTimes(1);
    });

    it('COMPANION no fuerza maximizado, deja la geometria como esta, y oculta la ventana pet por si venia de PET', async () => {
      await manager.transitionTo('COMPANION');

      expect(windowManager.setMaximized).not.toHaveBeenCalled();
      expect(windowManager.hidePetWindow).toHaveBeenCalled();
      expect(windowManager.show).toHaveBeenCalled();
    });

    it('startWindowDrag no invoca al window manager fuera de modo PET', async () => {
      await manager.startWindowDrag();

      expect(windowManager.startDragging).not.toHaveBeenCalled();
    });

    it('un fallo en showPetWindow durante la geometria de PET dispara el mismo protocolo de recuperacion que un fallo de bandera', async () => {
      vi.mocked(windowManager.showPetWindow).mockRejectedValueOnce(
        new Error('fallo simulado en showPetWindow'),
      );

      await manager.transitionTo('PET');

      expect(manager.getState().mode).toBe('FULL');
    });
  });

  describe('happy path', () => {
    it('el recorrido FULL -> COMPANION -> PET -> FULL conserva la visibilidad de paneles y el contador de interacciones pendientes', async () => {
      manager.setPendingInteractionCount(3);
      manager.setActivityVisibility('HIDDEN');

      await manager.transitionTo('COMPANION');
      await manager.transitionTo('PET');
      await manager.transitionTo('FULL');

      expect(manager.getState()).toMatchObject({
        mode: 'FULL',
        activityVisibility: 'HIDDEN',
        pendingInteractionCount: 3,
      });
    });

    it('startWindowDrag delega a windowManager.startDragging en modo PET', async () => {
      await manager.transitionTo('PET');

      await manager.startWindowDrag();

      expect(windowManager.startDragging).toHaveBeenCalledTimes(1);
    });
  });

  describe('posicion persistida de la mascota (Hito 8/D8)', () => {
    it('sin posicion persistida, entrar en PET calcula la esquina default de siempre', async () => {
      await manager.transitionTo('PET');

      expect(windowManager.showPetWindow).toHaveBeenCalledWith(
        {
          type: 'screen_corner',
          corner: 'bottom-right',
          marginX: 20,
          marginY: 20,
        },
        { width: 200, height: 200 },
        true,
      );
    });

    it('con posicion persistida, entrar en PET usa esas coordenadas absolutas en vez de recalcular la esquina', async () => {
      manager.setPetWindowPosition({ x: 640, y: 480 });

      await manager.transitionTo('PET');

      expect(windowManager.showPetWindow).toHaveBeenCalledWith(
        { type: 'absolute', x: 640, y: 480 },
        { width: 200, height: 200 },
        true,
      );
      expect(windowManager.getMonitors).not.toHaveBeenCalled();
    });

    it('applyPersistedSettings con petWindowPosition la usa ya en la primera entrada a PET', async () => {
      await manager.applyPersistedSettings(
        defaultPersistedSettings({
          initialMode: 'PET',
          petWindowPosition: { x: 100, y: 200 },
        }),
      );

      expect(windowManager.showPetWindow).toHaveBeenCalledWith(
        { type: 'absolute', x: 100, y: 200 },
        { width: 200, height: 200 },
        true,
      );
    });

    it('restaurar (setPetWindowPosition(null)) vuelve a calcular la esquina default en la siguiente entrada a PET', async () => {
      manager.setPetWindowPosition({ x: 640, y: 480 });
      await manager.transitionTo('PET');
      await manager.transitionTo('FULL');

      manager.setPetWindowPosition(null);
      await manager.transitionTo('PET');

      expect(windowManager.showPetWindow).toHaveBeenLastCalledWith(
        {
          type: 'screen_corner',
          corner: 'bottom-right',
          marginX: 20,
          marginY: 20,
        },
        { width: 200, height: 200 },
        true,
      );
    });

    it('refreshPetGeometry es un no-op fuera de PET', async () => {
      await manager.refreshPetGeometry();

      expect(windowManager.showPetWindow).not.toHaveBeenCalled();
    });

    it('refreshPetGeometry vuelve a mostrar la ventana pet con la geometria actual cuando PET esta activo', async () => {
      await manager.transitionTo('PET');
      vi.mocked(windowManager.showPetWindow).mockClear();
      manager.setPetWindowPosition(null);

      await manager.refreshPetGeometry();

      expect(windowManager.showPetWindow).toHaveBeenCalledWith(
        {
          type: 'screen_corner',
          corner: 'bottom-right',
          marginX: 20,
          marginY: 20,
        },
        { width: 200, height: 200 },
        true,
      );
    });
  });

  describe('applyPersistedSettings (FEAT-028)', () => {
    it('con el modo inicial igual al default (FULL) igual pinta la ventana real de opaco (regresion: la ventana se crea transparent:true, ADR-0008, y sin esta llamada quedaba genuinamente transparente al arrancar)', async () => {
      await manager.applyPersistedSettings(defaultPersistedSettings({}));

      expect(windowManager.setTransparent).toHaveBeenCalledWith(false);
      expect(windowManager.setAlwaysOnTop).toHaveBeenCalled();
    });

    it('un modo inicial persistido distinto de FULL se aplica al arrancar', async () => {
      await manager.applyPersistedSettings(
        defaultPersistedSettings({ initialMode: 'COMPANION' }),
      );

      expect(manager.getState().mode).toBe('COMPANION');
      expect(manager.getState().avatarPosition).toBe('CENTER');
    });

    it('la visibilidad de paneles persistida se aplica sin resetearse a VISIBLE', async () => {
      await manager.applyPersistedSettings(
        defaultPersistedSettings({
          initialMode: 'FULL',
          activityVisibility: 'HIDDEN',
        }),
      );

      expect(manager.getState().activityVisibility).toBe('HIDDEN');
    });

    it('un monitor persistido que ya no existe en la enumeracion cae a la esquina sobre el monitor actual sin lanzar', async () => {
      vi.mocked(windowManager.getMonitors).mockResolvedValue([MONITOR_A]);

      await expect(
        manager.applyPersistedSettings(
          defaultPersistedSettings({
            initialMode: 'PET',
            monitor: 'monitor-fantasma',
          }),
        ),
      ).resolves.toBeUndefined();

      expect(manager.getState().mode).toBe('PET');
      expect(windowManager.showPetWindow).toHaveBeenCalledWith(
        {
          type: 'screen_corner',
          corner: 'bottom-right',
          marginX: 20,
          marginY: 20,
        },
        { width: 200, height: 200 },
        true,
      );
    });

    it('un monitor persistido que si existe se usa para resolver la posicion la siguiente vez que se entra en PET', async () => {
      vi.mocked(windowManager.getMonitors).mockResolvedValue([
        MONITOR_A,
        MONITOR_B,
      ]);
      await manager.applyPersistedSettings(
        defaultPersistedSettings({ initialMode: 'FULL', monitor: 'monitor-b' }),
      );

      await manager.transitionTo('PET');

      const expected = calculateCornerPosition(
        MONITOR_B,
        { corner: 'bottom-right', marginX: 20, marginY: 20 },
        { width: 200, height: 200 },
      );
      expect(windowManager.showPetWindow).toHaveBeenCalledWith(
        { type: 'absolute', x: expected.x, y: expected.y },
        { width: 200, height: 200 },
        true,
      );
    });

    it('un fallo real durante applyPersistedSettings dispara el mismo protocolo de recuperacion y registra la falla', async () => {
      vi.mocked(windowManager.setAlwaysOnTop).mockRejectedValueOnce(
        new Error('fallo simulado durante applyPersistedSettings'),
      );

      await expect(
        manager.applyPersistedSettings(
          defaultPersistedSettings({ initialMode: 'COMPANION' }),
        ),
      ).resolves.toBeUndefined();

      expect(manager.getState().mode).toBe('FULL');
      expect(listFailures()).toContainEqual(
        expect.objectContaining({ failureClass: 'mode-change-error' }),
      );
    });

    it('esquina, tamano de ventana y monitor persistidos se aplican en PET en vez de los defaults de fabrica', async () => {
      vi.mocked(windowManager.getMonitors).mockResolvedValue([
        MONITOR_A,
        MONITOR_B,
      ]);
      await manager.applyPersistedSettings(
        defaultPersistedSettings({
          initialMode: 'FULL',
          corner: 'top-left',
          windowSize: { width: 150, height: 120 },
          monitor: 'monitor-b',
        }),
      );

      await manager.transitionTo('PET');

      const expected = calculateCornerPosition(
        MONITOR_B,
        { corner: 'top-left', marginX: 20, marginY: 20 },
        { width: 150, height: 120 },
      );
      expect(windowManager.showPetWindow).toHaveBeenCalledWith(
        { type: 'absolute', x: expected.x, y: expected.y },
        { width: 150, height: 120 },
        true,
      );
    });

    it('alwaysOnTop=false persistido se aplica en PET en vez del true fijo de MODE_PROFILES', async () => {
      await manager.applyPersistedSettings(
        defaultPersistedSettings({ initialMode: 'PET', alwaysOnTop: false }),
      );

      expect(manager.getState().window.alwaysOnTop).toBe(false);
      expect(windowManager.showPetWindow).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.anything(),
        false,
      );
    });

    it('alwaysOnTop persistido no afecta a FULL/COMPANION (siempre encima solo tiene sentido en modo mascota), solo a PET', async () => {
      await manager.applyPersistedSettings(
        defaultPersistedSettings({
          initialMode: 'COMPANION',
          alwaysOnTop: true,
        }),
      );

      expect(manager.getState().window.alwaysOnTop).toBe(false);

      await manager.transitionTo('PET');
      expect(manager.getState().window.alwaysOnTop).toBe(true);
    });
  });
});

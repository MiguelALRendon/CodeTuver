import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeAndPersistAppSettings } from './app-settings';
import type { AppSettings } from './app-settings';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

const BASE_SETTINGS: AppSettings = {
  corner: 'bottom-right',
  windowSize: { width: 320, height: 320 },
  opacity: 1,
  alwaysOnTop: true,
  monitor: 'primary',
  initialMode: 'FULL',
  activityVisibility: 'VISIBLE',
};

describe('mergeAndPersistAppSettings (correcciones-qa-gauntlet Hito 8)', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('un campo escrito por otra ventana de por medio (ej. PetView) no se pierde al mezclar', async () => {
    const freshFromDisk: AppSettings = {
      ...BASE_SETTINGS,
      petWindowPosition: { x: 500, y: 400 },
    };
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_app_settings') {
        return Promise.resolve({
          settings: freshFromDisk,
          usedDefaults: false,
        });
      }
      return Promise.resolve(undefined);
    });

    const result = await mergeAndPersistAppSettings({
      windowSize: { width: 250, height: 250 },
    });

    expect(result.petWindowPosition).toEqual({ x: 500, y: 400 });
    expect(result.windowSize).toEqual({ width: 250, height: 250 });
  });

  it('relee getAppSettings() antes de persistir, no usa ningun valor pasado por el llamador', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_app_settings') {
        return Promise.resolve({
          settings: BASE_SETTINGS,
          usedDefaults: false,
        });
      }
      return Promise.resolve(undefined);
    });

    await mergeAndPersistAppSettings({ primaryColorRgb: [255, 0, 0] });

    expect(invokeMock).toHaveBeenCalledWith('get_app_settings', { cwd: null });
  });

  it('persiste el objeto completo (settings frescos + parcial) via set_global_app_settings', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'get_app_settings') {
        return Promise.resolve({
          settings: BASE_SETTINGS,
          usedDefaults: false,
        });
      }
      return Promise.resolve(undefined);
    });

    await mergeAndPersistAppSettings({ primaryColorRgb: [1, 2, 3] });

    expect(invokeMock).toHaveBeenCalledWith('set_global_app_settings', {
      settings: { ...BASE_SETTINGS, primaryColorRgb: [1, 2, 3] },
    });
  });
});

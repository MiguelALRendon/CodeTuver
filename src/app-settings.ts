import { invoke } from '@tauri-apps/api/core';
import type { ScreenCorner } from './monitor-position';
import type { PresentationMode, WindowSize } from './desktop-window-manager';
import type { PanelVisibility } from './presentation-manager';
import type { SessionStartOptions } from './claude-transport';
import type { PetWindowPosition } from './pet-window-position';

export interface AppSettings {
  corner: ScreenCorner;
  windowSize: WindowSize;
  opacity: number;
  alwaysOnTop: boolean;
  monitor: string;
  initialMode: PresentationMode;
  activityVisibility: PanelVisibility;
  chatColumnWidthPx?: number;
  primaryColorRgb?: [number, number, number];
  sessionStartOptions?: SessionStartOptions;
  petWindowPosition?: PetWindowPosition;
}

export type AppSettingsPartial = Partial<AppSettings>;

export interface AppSettingsResolution {
  settings: AppSettings;
  usedDefaults: boolean;
}

export function getAppSettings(
  cwd: string | null = null,
): Promise<AppSettingsResolution> {
  return invoke<AppSettingsResolution>('get_app_settings', { cwd });
}

export function setGlobalAppSettings(settings: AppSettings): Promise<void> {
  return invoke('set_global_app_settings', { settings });
}

export function setProjectAppSettings(
  cwd: string,
  partialSettings: AppSettingsPartial,
): Promise<void> {
  return invoke('set_project_app_settings', { cwd, partialSettings });
}

// D8 (correcciones-qa-gauntlet Hito 8): relee getAppSettings() fresco antes de mezclar en vez de confiar en un cache local que puede quedar obsoleto si otra ventana (ej. PetView) escribio de por medio -- mismo patron ya validado por PetView.vue::persistDraggedPosition.
export async function mergeAndPersistAppSettings(
  partial: AppSettingsPartial,
): Promise<AppSettings> {
  const { settings } = await getAppSettings();
  const merged: AppSettings = { ...settings, ...partial };
  await setGlobalAppSettings(merged);
  return merged;
}

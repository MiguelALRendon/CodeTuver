import { loadVoiceEnabled } from './text-to-speech';

export interface AttentionSignalSettings {
  expressionChange: boolean;
  animation: boolean;
  visualIndicator: boolean;
  bubble: boolean;
  voice: boolean;
  systemNotification: boolean;
}

type StoredAttentionSignalSettings = Omit<AttentionSignalSettings, 'voice'>;

// Interino: FEAT-028 (EPIC-006) reemplazara localStorage por el almacen unificado.
const STORAGE_KEY = 'codetuver-avatar.attention-signals.settings';

// TC-080: la señal por omision es cambio de expresion + indicador visual unicamente, no las 6 a la vez.
const DEFAULT_STORED_SETTINGS: StoredAttentionSignalSettings = {
  expressionChange: true,
  animation: false,
  visualIndicator: true,
  bubble: false,
  systemNotification: false,
};

export function persistAttentionSignalSettings(
  settings: StoredAttentionSignalSettings,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadStoredSettings(storage: Storage): StoredAttentionSignalSettings {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_STORED_SETTINGS };
  try {
    return { ...DEFAULT_STORED_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STORED_SETTINGS };
  }
}

// `voice` reutiliza loadVoiceEnabled() como unica fuente de verdad, no un booleano paralelo.
export function loadAttentionSignalSettings(
  storage: Storage = window.localStorage,
): AttentionSignalSettings {
  return { ...loadStoredSettings(storage), voice: loadVoiceEnabled(storage) };
}

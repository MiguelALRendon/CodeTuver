import { reactive, readonly } from 'vue';
import type { MouthSyncSource } from './mouth-sync';

export interface TextToSpeech {
  speak(text: string): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
}

// Interino: FEAT-028 (EPIC-006) reemplazara localStorage por el almacen unificado.
const STORAGE_KEY_ENABLED = 'codetuver-avatar.voice.enabled';
const STORAGE_KEY_SETTINGS = 'codetuver-avatar.voice.settings';
const STORAGE_KEY_PET_MODE = 'codetuver-avatar.voice.allow-in-pet-mode';

export function persistVoiceEnabled(
  enabled: boolean,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(STORAGE_KEY_ENABLED, JSON.stringify(enabled));
}

// AC-020.1: sin preferencia guardada la voz llega desactivada, no un default implicito distinto.
export function loadVoiceEnabled(
  storage: Storage = window.localStorage,
): boolean {
  const raw = storage.getItem(STORAGE_KEY_ENABLED);
  return raw === 'true';
}

export interface VoiceSettings {
  volume: number;
  rate: number;
  pitch: number;
  voiceURI: string | null;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  volume: 1,
  rate: 1,
  pitch: 1,
  voiceURI: null,
};

export function persistVoiceSettings(
  settings: VoiceSettings,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
}

export function loadVoiceSettings(
  storage: Storage = window.localStorage,
): VoiceSettings {
  const raw = storage.getItem(STORAGE_KEY_SETTINGS);
  if (!raw) return { ...DEFAULT_VOICE_SETTINGS };
  try {
    return {
      ...DEFAULT_VOICE_SETTINGS,
      ...(JSON.parse(raw) as Partial<VoiceSettings>),
    };
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

export function persistAllowVoiceInPetMode(
  allow: boolean,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(STORAGE_KEY_PET_MODE, JSON.stringify(allow));
}

// AC-020.6: sin preferencia guardada, modo mascota no autoriza voz (silencio por omision).
export function loadAllowVoiceInPetMode(
  storage: Storage = window.localStorage,
): boolean {
  const raw = storage.getItem(STORAGE_KEY_PET_MODE);
  return raw === 'true';
}

export interface SpeechQueueState {
  queue: string[];
  lastAccepted: string | null;
}

export function createSpeechQueueState(): SpeechQueueState {
  return { queue: [], lastAccepted: null };
}

// AUT-10: descarta una frase igual a la ultima aceptada (encolada o en curso); no consecutivas si suenan las dos.
export function acceptPhrase(
  state: SpeechQueueState,
  phrase: string,
): SpeechQueueState | null {
  if (phrase === state.lastAccepted) return null;
  return { queue: [...state.queue, phrase], lastAccepted: phrase };
}

export function dequeuePhrase(state: SpeechQueueState): {
  phrase: string | null;
  next: SpeechQueueState;
} {
  const [phrase, ...rest] = state.queue;
  return { phrase: phrase ?? null, next: { ...state, queue: rest } };
}

export function clearSpeechQueue(): SpeechQueueState {
  return { queue: [], lastAccepted: null };
}

let voiceFaultArmed = false;

// paso 6.5: punto de inyeccion de fallo del motor de voz, aislado a esta capa, solo en dev.
export function armVoiceFault(): void {
  if (!import.meta.env.DEV) return;
  voiceFaultArmed = true;
}

function consumeVoiceFault(): boolean {
  if (!voiceFaultArmed) return false;
  voiceFaultArmed = false;
  return true;
}

// AC-1.3 (lanzamiento-publico Hito 4): introspeccion de la sintesis real sin oido humano (ADR-0005). Mismo gate `import.meta.env.DEV` que `armVoiceFault`, eliminado por tree-shaking en el bundle de produccion.
export interface QaSpeechLogEntry {
  text: string;
  voice: string | null;
  startedAt: number | null;
  endedAt: number | null;
}

function qaSpeechLog(): QaSpeechLogEntry[] | null {
  if (!import.meta.env.DEV) return null;
  const target = window as unknown as { __qaSpeechLog?: QaSpeechLogEntry[] };
  target.__qaSpeechLog = target.__qaSpeechLog ?? [];
  return target.__qaSpeechLog;
}

export interface VoiceOption {
  voiceURI: string;
  name: string;
  lang: string;
}

export interface VoiceSnapshot {
  enabled: boolean;
  volume: number;
  rate: number;
  pitch: number;
  voiceURI: string | null;
  voices: VoiceOption[];
  allowInPetMode: boolean;
  isSpeaking: boolean;
  queueLength: number;
  lastError: string | null;
}

interface PendingPhrase {
  resolve: () => void;
}

// Motor confirmado por EPIC-001: Web Speech API, nativa del navegador/WebView, sin dependencia nueva.
export class WebSpeechTextToSpeech implements TextToSpeech, MouthSyncSource {
  private queueState = createSpeechQueueState();
  private pendingResolvers: Array<() => void> = [];
  private current: PendingPhrase | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private readonly boundaryListeners = new Set<() => void>();
  private readonly speechEndListeners = new Set<() => void>();

  // Modo mascota real espera a EPIC-005 (no existe todavia); nadie llama setPetMode(true) hoy.
  private isPetMode = false;

  private readonly state = reactive<VoiceSnapshot>({
    enabled: loadVoiceEnabled(),
    ...loadVoiceSettings(),
    voices: [],
    allowInPetMode: loadAllowVoiceInPetMode(),
    isSpeaking: false,
    queueLength: 0,
    lastError: null,
  });

  readonly snapshot = readonly(this.state);

  constructor(
    private readonly synth: SpeechSynthesis = window.speechSynthesis,
  ) {
    this.refreshVoices();
    this.synth.addEventListener('voiceschanged', () => this.refreshVoices());
  }

  private refreshVoices(): void {
    this.voices = this.synth.getVoices();
    this.state.voices = this.voices.map((voice) => ({
      voiceURI: voice.voiceURI,
      name: voice.name,
      lang: voice.lang,
    }));
  }

  setEnabled(enabled: boolean): void {
    this.state.enabled = enabled;
    persistVoiceEnabled(enabled);
  }

  setVolume(volume: number): void {
    this.state.volume = volume;
    persistVoiceSettings(this.currentSettings());
  }

  setRate(rate: number): void {
    this.state.rate = rate;
    persistVoiceSettings(this.currentSettings());
  }

  setPitch(pitch: number): void {
    this.state.pitch = pitch;
    persistVoiceSettings(this.currentSettings());
  }

  setVoice(voiceURI: string | null): void {
    this.state.voiceURI = voiceURI;
    persistVoiceSettings(this.currentSettings());
  }

  setAllowVoiceInPetMode(allow: boolean): void {
    this.state.allowInPetMode = allow;
    persistAllowVoiceInPetMode(allow);
  }

  setPetMode(isPetMode: boolean): void {
    this.isPetMode = isPetMode;
  }

  // paso 7.1: punto de conexion real de MouthSyncSource; el resto de la capa de voz no sabe de sincronizacion de boca.
  onBoundary(callback: () => void): () => void {
    this.boundaryListeners.add(callback);
    return () => this.boundaryListeners.delete(callback);
  }

  onSpeechEnd(callback: () => void): () => void {
    this.speechEndListeners.add(callback);
    return () => this.speechEndListeners.delete(callback);
  }

  private notifyBoundary(): void {
    this.boundaryListeners.forEach((callback) => callback());
  }

  private notifySpeechEnd(): void {
    this.speechEndListeners.forEach((callback) => callback());
  }

  private currentSettings(): VoiceSettings {
    return {
      volume: this.state.volume,
      rate: this.state.rate,
      pitch: this.state.pitch,
      voiceURI: this.state.voiceURI,
    };
  }

  private resolveSelectedVoice(): SpeechSynthesisVoice | null {
    return (
      this.voices.find((voice) => voice.voiceURI === this.state.voiceURI) ??
      null
    );
  }

  // R7/AC-020.6: la politica de activacion vive aqui, no en quien llama speak().
  private canSpeakNow(): boolean {
    if (!this.state.enabled) return false;
    if (this.isPetMode && !this.state.allowInPetMode) return false;
    return true;
  }

  async speak(text: string): Promise<void> {
    if (!text) return;
    if (consumeVoiceFault()) {
      throw new Error('Fallo del motor de voz (inyectado)');
    }
    if (!this.canSpeakNow()) return;
    return new Promise((resolve) => {
      const accepted = acceptPhrase(this.queueState, text);
      if (!accepted) {
        resolve();
        return;
      }
      this.queueState = accepted;
      this.pendingResolvers.push(resolve);
      this.state.queueLength = this.queueState.queue.length;
      this.playNextIfIdle();
    });
  }

  private playNextIfIdle(): void {
    if (this.current) return;
    const { phrase, next } = dequeuePhrase(this.queueState);
    if (!phrase) return;
    this.queueState = next;
    const resolve = this.pendingResolvers.shift() ?? (() => {});
    this.state.queueLength = this.queueState.queue.length;
    this.current = { resolve };
    this.state.isSpeaking = true;
    this.synth.speak(this.buildUtterance(phrase));
  }

  private buildUtterance(text: string): SpeechSynthesisUtterance {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = this.state.volume;
    utterance.rate = this.state.rate;
    utterance.pitch = this.state.pitch;
    utterance.voice = this.resolveSelectedVoice();
    utterance.onboundary = () => this.notifyBoundary();
    utterance.onend = () => this.finishCurrent(null);
    utterance.onerror = (event) =>
      this.finishCurrent(event.error ?? 'error de sintesis de voz');
    this.wireQaSpeechLog(utterance, text);
    return utterance;
  }

  private wireQaSpeechLog(
    utterance: SpeechSynthesisUtterance,
    text: string,
  ): void {
    const log = qaSpeechLog();
    if (!log) return;
    const entry: QaSpeechLogEntry = {
      text,
      voice: utterance.voice?.name ?? null,
      startedAt: null,
      endedAt: null,
    };
    log.push(entry);
    const priorOnStart = utterance.onstart;
    utterance.onstart = (event) => {
      entry.startedAt = Date.now();
      priorOnStart?.call(utterance, event);
    };
    const priorOnEnd = utterance.onend;
    utterance.onend = (event) => {
      entry.endedAt = Date.now();
      priorOnEnd?.call(utterance, event);
    };
    const priorOnError = utterance.onerror;
    utterance.onerror = (event) => {
      entry.endedAt = Date.now();
      priorOnError?.call(utterance, event);
    };
  }

  // R4: un fallo a mitad de frase se aisla aqui y la cola sigue usable, nunca se relanza hacia el llamador.
  private finishCurrent(errorMessage: string | null): void {
    const finished = this.current;
    this.current = null;
    this.state.isSpeaking = false;
    this.state.lastError = errorMessage;
    this.notifySpeechEnd();
    if (errorMessage) {
      console.error(
        '[voz] fallo del motor de sintesis, cola sigue activa:',
        errorMessage,
      );
    }
    finished?.resolve();
    this.playNextIfIdle();
  }

  stop(): void {
    this.synth.cancel();
    const resolvers = this.current
      ? [this.current.resolve, ...this.pendingResolvers]
      : [...this.pendingResolvers];
    this.current = null;
    this.pendingResolvers = [];
    this.queueState = clearSpeechQueue();
    this.state.queueLength = 0;
    this.state.isSpeaking = false;
    this.notifySpeechEnd();
    resolvers.forEach((resolve) => resolve());
  }

  pause(): void {
    this.synth.pause();
  }

  resume(): void {
    this.synth.resume();
  }
}

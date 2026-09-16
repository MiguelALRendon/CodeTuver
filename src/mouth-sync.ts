import { reactive, readonly } from 'vue';

// boundary es un pulso discreto (llegada de palabra), no una medida continua; boolean basta hasta que exista amplitud real.
export interface MouthSyncSource {
  onBoundary(callback: () => void): () => void;
  onSpeechEnd(callback: () => void): () => void;
}

export interface MouthSyncSnapshot {
  mouthOpen: boolean;
}

const DEFAULT_CLOSE_DELAY_MS = 180;

// paso 7.1: sustituible por una fuente de amplitud/fonemas que implemente MouthSyncSource, sin tocar este controller.
export class MouthSyncController {
  private readonly state = reactive<MouthSyncSnapshot>({ mouthOpen: false });
  readonly snapshot = readonly(this.state);
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribeBoundary: () => void;
  private readonly unsubscribeSpeechEnd: () => void;

  constructor(
    source: MouthSyncSource,
    private readonly closeDelayMs: number = DEFAULT_CLOSE_DELAY_MS,
  ) {
    this.unsubscribeBoundary = source.onBoundary(() => this.openMouth());
    this.unsubscribeSpeechEnd = source.onSpeechEnd(() => this.closeMouth());
  }

  private openMouth(): void {
    this.state.mouthOpen = true;
    this.scheduleClose();
  }

  private scheduleClose(): void {
    this.clearTimer();
    this.closeTimer = setTimeout(() => this.closeMouth(), this.closeDelayMs);
  }

  private closeMouth(): void {
    this.clearTimer();
    this.state.mouthOpen = false;
  }

  private clearTimer(): void {
    if (this.closeTimer === null) return;
    clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }

  dispose(): void {
    this.clearTimer();
    this.unsubscribeBoundary();
    this.unsubscribeSpeechEnd();
  }
}

import { reactive, readonly } from 'vue';

export type AvatarState = string;
export type AvatarExpression = string;

export interface AvatarController {
  setState(state: AvatarState): void;
  setExpression(expression: AvatarExpression): void;
  speak(text: string): Promise<void>;
  stopSpeaking(): void;
}

export interface AvatarSnapshot {
  state: AvatarState;
  expression: AvatarExpression;
  isSpeaking: boolean;
  lastError: string | null;
}

const DEFAULT_STATE: AvatarState = 'idle';
const DEFAULT_EXPRESSION: AvatarExpression = 'neutral';
const MS_PER_CHAR_SPOKEN = 40;
const MAX_SPEECH_MS = 4000;

let drawFaultArmed = false;

export function armAvatarDrawFault(): void {
  if (!import.meta.env.DEV) return;
  drawFaultArmed = true;
}

function consumeDrawFault(): boolean {
  if (!drawFaultArmed) return false;
  drawFaultArmed = false;
  return true;
}

function simulateSpeech(text: string): Promise<void> {
  const duration = Math.min(text.length * MS_PER_CHAR_SPOKEN, MAX_SPEECH_MS);
  return new Promise((resolve) => setTimeout(resolve, duration));
}

// Personaje de prueba desechable (SVG/CSS) del Hito 1; no es el avatar VRM real de FEAT-003.
export class TestAvatarController implements AvatarController {
  private readonly state = reactive<AvatarSnapshot>({
    state: DEFAULT_STATE,
    expression: DEFAULT_EXPRESSION,
    isSpeaking: false,
    lastError: null,
  });

  readonly snapshot = readonly(this.state);

  setState(state: AvatarState): void {
    this.runIsolated(() => {
      this.throwIfFaultArmed();
      this.state.state = state;
    });
  }

  setExpression(expression: AvatarExpression): void {
    this.runIsolated(() => {
      this.throwIfFaultArmed();
      this.state.expression = expression;
    });
  }

  async speak(text: string): Promise<void> {
    if (!text) return;
    await this.runIsolatedAsync(async () => {
      this.throwIfFaultArmed();
      this.state.isSpeaking = true;
      await simulateSpeech(text);
      this.state.isSpeaking = false;
    });
  }

  stopSpeaking(): void {
    this.runIsolated(() => {
      this.state.isSpeaking = false;
    });
  }

  private throwIfFaultArmed(): void {
    if (!consumeDrawFault()) return;
    throw new Error('Fallo de dibujo del avatar (inyectado)');
  }

  private runIsolated(operation: () => void): void {
    try {
      operation();
      this.state.lastError = null;
    } catch (error) {
      this.handleDrawFailure(error);
    }
  }

  private async runIsolatedAsync(
    operation: () => Promise<void>,
  ): Promise<void> {
    try {
      await operation();
      this.state.lastError = null;
    } catch (error) {
      this.state.isSpeaking = false;
      this.handleDrawFailure(error);
    }
  }

  private handleDrawFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.state.lastError = message;
    console.error(
      '[avatar] fallo de dibujo aislado, la sesion sigue activa:',
      message,
    );
  }
}

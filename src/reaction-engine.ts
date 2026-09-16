import type { NormalizedEvent } from './claude-transport';
import type { AvatarController } from './avatar-controller';
import type {
  AvatarReactionDefinition,
  SpeechPolicy,
} from './reaction-catalog';
import type { TextToSpeech } from './text-to-speech';
import { registerFailure } from './failure-taxonomy';

// paso 6.7 (R7): "optional" queda fuera hasta que exista logica de personalidad que decida por si sola cuando hablar.
const SPEAKABLE_POLICIES = new Set<SpeechPolicy>(['required', 'recommended']);

// Supuesto verificable (paso 2.4): 2500ms agrupa rafagas tipicas de lecturas/herramientas sin sentirse lento.
const DEFAULT_GROUPING_WINDOW_MS = 2500;

type OutcomeCarryingEventType = 'tool_finished';

const OUTCOME_REACTION_ID_BY_TRIGGER: Record<
  OutcomeCarryingEventType,
  { success: string; failure: string }
> = {
  tool_finished: {
    success: 'resultado-operacion-exitosa',
    failure: 'resultado-error-recuperable',
  },
};

function isOutcomeCarryingEvent(
  event: NormalizedEvent,
): event is NormalizedEvent & {
  type: OutcomeCarryingEventType;
  success: boolean;
} {
  return event.type === 'tool_finished';
}

function pickByOutcome(
  candidates: AvatarReactionDefinition[],
  event: NormalizedEvent,
): AvatarReactionDefinition | null {
  if (!isOutcomeCarryingEvent(event)) return null;
  const wantedId = event.success
    ? OUTCOME_REACTION_ID_BY_TRIGGER[event.type].success
    : OUTCOME_REACTION_ID_BY_TRIGGER[event.type].failure;
  return candidates.find((reaction) => reaction.id === wantedId) ?? null;
}

function pickHighestPriority(
  candidates: AvatarReactionDefinition[],
): AvatarReactionDefinition {
  return candidates.reduce((best, current) =>
    current.priority > best.priority ? current : best,
  );
}

export function resolveReaction(
  catalog: AvatarReactionDefinition[],
  event: NormalizedEvent,
): AvatarReactionDefinition | null {
  const candidates = catalog.filter((reaction) =>
    reaction.triggers.includes(event.type),
  );
  if (candidates.length === 0) return null;
  return pickByOutcome(candidates, event) ?? pickHighestPriority(candidates);
}

export interface ReactionEngineOptions {
  groupingWindowMs?: number;
  now?: () => number;
  textToSpeech?: TextToSpeech;
}

interface ActiveReaction {
  id: string;
  priority: number;
  interruptible: boolean;
  expiresAt: number | null;
}

export class ReactionEngine {
  private readonly lastFiredAt = new Map<string, number>();
  private readonly groupingWindowMs: number;
  private readonly now: () => number;
  private readonly textToSpeech?: TextToSpeech;
  private active: ActiveReaction | null = null;

  constructor(
    private readonly catalog: AvatarReactionDefinition[],
    private readonly avatarController: AvatarController,
    options: ReactionEngineOptions = {},
  ) {
    this.groupingWindowMs =
      options.groupingWindowMs ?? DEFAULT_GROUPING_WINDOW_MS;
    this.now = options.now ?? Date.now;
    this.textToSpeech = options.textToSpeech;
  }

  handleEvent(event: NormalizedEvent): void {
    this.expireActiveReaction();
    const reaction = resolveReaction(this.catalog, event);
    if (!reaction) return;
    if (this.isSuppressed(reaction)) return;
    if (!this.canActivate(reaction)) return;
    this.activate(reaction, event);
  }

  private expireActiveReaction(): void {
    if (!this.active || this.active.expiresAt === null) return;
    if (this.now() < this.active.expiresAt) return;
    this.active = null;
  }

  private isSuppressed(reaction: AvatarReactionDefinition): boolean {
    const lastFired = this.lastFiredAt.get(reaction.id);
    if (lastFired === undefined) return false;
    const suppressWindow = Math.max(
      this.groupingWindowMs,
      reaction.cooldownMs ?? 0,
    );
    return this.now() - lastFired < suppressWindow;
  }

  private canActivate(reaction: AvatarReactionDefinition): boolean {
    if (!this.active) return true;
    if (reaction.priority <= this.active.priority) return false;
    return this.active.interruptible;
  }

  private activate(
    reaction: AvatarReactionDefinition,
    event: NormalizedEvent,
  ): void {
    const firedAt = this.now();
    this.lastFiredAt.set(reaction.id, firedAt);
    this.active = {
      id: reaction.id,
      priority: reaction.priority,
      interruptible: reaction.interruptible,
      expiresAt: reaction.durationMs ? firedAt + reaction.durationMs : null,
    };
    this.emit(reaction, event);
  }

  private emit(
    reaction: AvatarReactionDefinition,
    event: NormalizedEvent,
  ): void {
    if (reaction.state) this.avatarController.setState(reaction.state);
    if (reaction.expression)
      this.avatarController.setExpression(reaction.expression);
    this.speakIfAuthorized(reaction, event);
  }

  private handleSpeakError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    registerFailure('tts-error', message);
    console.error(
      '[voz] fallo al hablar una reaccion, sesion sigue activa:',
      err,
    );
  }

  // R7: unico punto que decide si suena una frase, y solo a partir del catalogo — nunca se suscribe a eventos.
  private speakIfAuthorized(
    reaction: AvatarReactionDefinition,
    event: NormalizedEvent,
  ): void {
    if (!this.textToSpeech) return;
    if (!reaction.phrase) return;
    if (!SPEAKABLE_POLICIES.has(reaction.speechPolicy)) return;
    const phraseText =
      typeof reaction.phrase === 'function'
        ? reaction.phrase(event)
        : reaction.phrase;
    if (!phraseText) return;
    this.textToSpeech
      .speak(phraseText)
      .catch((err) => this.handleSpeakError(err));
  }
}

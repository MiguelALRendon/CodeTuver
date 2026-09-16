import type { AvatarSnapshot } from './avatar-controller';

const STATE_MOOD: Record<string, string> = {
  idle: 'neutral',
  thinking: 'active',
  reading: 'active',
  coding: 'active',
  executing: 'active',
  waiting_permission: 'waiting',
  success: 'positive',
  error: 'negative',
  confused: 'waiting',
  sleeping: 'resting',
  speaking: 'active',
};

const MOUTH_PATH: Record<string, string> = {
  neutral: 'M 35 70 Q 50 70 65 70',
  happy: 'M 35 65 Q 50 82 65 65',
  sad: 'M 35 74 Q 50 58 65 74',
  angry: 'M 38 72 Q 50 66 62 72',
};

export function resolveMood(state: string): string {
  return STATE_MOOD[state] ?? 'neutral';
}

export function isKnownState(state: string): boolean {
  return state in STATE_MOOD;
}

export function resolveMouthPath(expression: string): string {
  return MOUTH_PATH[expression] ?? MOUTH_PATH.neutral;
}

// mouthSyncOpen viene de MouthSyncController (Hito 7); sin el, cae al binario isSpeaking previo.
export function isMouthOpen(
  snapshot: AvatarSnapshot,
  mouthSyncOpen?: boolean,
): boolean {
  if (snapshot.expression === 'surprised') return true;
  if (mouthSyncOpen !== undefined) return mouthSyncOpen;
  return snapshot.isSpeaking;
}

export function isAngryExpression(expression: string): boolean {
  return expression === 'angry';
}

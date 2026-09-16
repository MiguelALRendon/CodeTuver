export interface AnimationPoolState {
  readonly pool: readonly string[];
  readonly currentId: string | null;
  readonly elapsedMs: number;
  readonly nextChangeMs: number;
}

export const ANIMATION_CHANGE_MIN_MS = 6000;
export const ANIMATION_CHANGE_MAX_MS = 14000;

function randomChangeIntervalMs(random: () => number): number {
  return (
    ANIMATION_CHANGE_MIN_MS +
    random() * (ANIMATION_CHANGE_MAX_MS - ANIMATION_CHANGE_MIN_MS)
  );
}

// Con pool de 1 elemento no hay "otra" animacion que elegir: se devuelve la misma, sin reintentar.
export function pickRandomAnimation(
  pool: readonly string[],
  excludeId: string | null,
  random: () => number = Math.random,
): string | null {
  if (pool.length === 0) return null;
  const candidates =
    pool.length > 1 && excludeId !== null
      ? pool.filter((id) => id !== excludeId)
      : pool;
  const index = Math.min(
    Math.floor(random() * candidates.length),
    candidates.length - 1,
  );
  return candidates[index];
}

export function createAnimationPoolState(
  pool: readonly string[],
  random: () => number = Math.random,
): AnimationPoolState {
  return {
    pool,
    currentId: pickRandomAnimation(pool, null, random),
    elapsedMs: 0,
    nextChangeMs: randomChangeIntervalMs(random),
  };
}

export function advanceAnimationPool(
  state: AnimationPoolState,
  deltaMs: number,
  random: () => number = Math.random,
): AnimationPoolState {
  if (state.pool.length === 0) return state;
  const elapsedMs = state.elapsedMs + deltaMs;
  if (elapsedMs < state.nextChangeMs) return { ...state, elapsedMs };
  return {
    pool: state.pool,
    currentId: pickRandomAnimation(state.pool, state.currentId, random),
    elapsedMs: 0,
    nextChangeMs: randomChangeIntervalMs(random),
  };
}

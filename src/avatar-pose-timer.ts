export type PoseTimerPhase = 'idle' | 'active';

export interface PoseTimerState {
  readonly phase: PoseTimerPhase;
  readonly elapsedMs: number;
  readonly targetMs: number;
}

// La pose sostiene la postura de brazos: un ciclo con idle dominante deja al personaje en el bind T-pose del VRM la mayor parte del tiempo (las animaciones de fondo nunca tocan brazos, D4). Idle corto + hold largo invierte el balance para que "en reposo" sea la pose, no el bind.
export const POSE_TRIGGER_MIN_MS = 1500;
export const POSE_TRIGGER_MAX_MS = 4000;
export const POSE_HOLD_MIN_MS = 18000;
export const POSE_HOLD_MAX_MS = 35000;

function randomBetween(min: number, max: number, random: () => number): number {
  return min + random() * (max - min);
}

export function createPoseTimerState(
  random: () => number = Math.random,
): PoseTimerState {
  return {
    phase: 'idle',
    elapsedMs: 0,
    targetMs: randomBetween(POSE_TRIGGER_MIN_MS, POSE_TRIGGER_MAX_MS, random),
  };
}

// hasPose=false reinicia siempre a 'idle': un estado sin pose asignada nunca debe quedar "activo" a medias.
export function advancePoseTimer(
  state: PoseTimerState,
  deltaMs: number,
  hasPose: boolean,
  random: () => number = Math.random,
): PoseTimerState {
  if (!hasPose) return createPoseTimerState(random);
  const elapsedMs = state.elapsedMs + deltaMs;
  if (elapsedMs < state.targetMs) return { ...state, elapsedMs };
  if (state.phase === 'idle') {
    return {
      phase: 'active',
      elapsedMs: 0,
      targetMs: randomBetween(POSE_HOLD_MIN_MS, POSE_HOLD_MAX_MS, random),
    };
  }
  return {
    phase: 'idle',
    elapsedMs: 0,
    targetMs: randomBetween(POSE_TRIGGER_MIN_MS, POSE_TRIGGER_MAX_MS, random),
  };
}

export function isPoseActive(state: PoseTimerState): boolean {
  return state.phase === 'active';
}

// Nombre de pista three.js: "<nodo>.quaternion" / "<nodo>.position" — el hueso es todo menos la ultima propiedad.
export function boneNameFromTrackName(trackName: string): string {
  const separatorIndex = trackName.lastIndexOf('.');
  return separatorIndex === -1 ? trackName : trackName.slice(0, separatorIndex);
}

// D4/ADR-0012: aditivo solo si la pose comparte al menos un hueso con la animacion de fondo en curso.
export function needsAdditiveBlend(
  backgroundTrackNames: readonly string[],
  poseTrackNames: readonly string[],
): boolean {
  const backgroundBones = new Set(
    backgroundTrackNames.map(boneNameFromTrackName),
  );
  return poseTrackNames.some((name) =>
    backgroundBones.has(boneNameFromTrackName(name)),
  );
}

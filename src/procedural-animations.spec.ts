import { describe, expect, it } from 'vitest';
import { boneNameFromTrackName } from './avatar-pose-timer';
import {
  ACTIVE_STATE_ROTATION,
  MOOD_ANIMATION_POOLS,
  MOOD_POSE_POOLS,
  PROCEDURAL_CLIP_CATALOG,
  PROCEDURAL_CLIPS_BY_ID,
  animationPoolForState,
  poseForState,
} from './procedural-animations';

// D4: bloques disjuntos por construccion — animacion solo head/neck/spine, pose solo brazos/manos (+ chest).
const ARM_HAND_BONES = [
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
];
const HEAD_NECK_BONES = ['head', 'neck'];

function boneNamesOf(entryId: string): string[] {
  const entry = PROCEDURAL_CLIPS_BY_ID.get(entryId);
  if (!entry) throw new Error(`clip inexistente en el catalogo: ${entryId}`);
  return entry.clip.tracks.map((track) => boneNameFromTrackName(track.name));
}

describe('procedural-animations — casos adversos', () => {
  it('ningun clip de animacion toca huesos de brazos/manos', () => {
    const offenders = PROCEDURAL_CLIP_CATALOG.filter(
      (entry) =>
        entry.kind === 'animation' &&
        boneNamesOf(entry.id).some((bone) => ARM_HAND_BONES.includes(bone)),
    );
    expect(offenders).toEqual([]);
  });

  it('ningun clip de pose toca head/neck directo', () => {
    const offenders = PROCEDURAL_CLIP_CATALOG.filter(
      (entry) =>
        entry.kind === 'pose' &&
        boneNamesOf(entry.id).some((bone) => HEAD_NECK_BONES.includes(bone)),
    );
    expect(offenders).toEqual([]);
  });

  it('ningun clip tiene pistas duplicadas para el mismo hueso', () => {
    const offenders = PROCEDURAL_CLIP_CATALOG.filter((entry) => {
      const bones = boneNamesOf(entry.id);
      return new Set(bones).size !== bones.length;
    });
    expect(offenders).toEqual([]);
  });

  it('ningun par de los 5 estados de active resuelve el mismo conjunto exacto de 3 animaciones', () => {
    const states = Object.keys(ACTIVE_STATE_ROTATION);
    const pairs = states.flatMap((stateA, i) =>
      states.slice(i + 1).map((stateB) => [stateA, stateB] as const),
    );
    const sameSetPairs = pairs.filter(([stateA, stateB]) => {
      const setA = new Set(animationPoolForState(stateA));
      const setB = new Set(animationPoolForState(stateB));
      return setA.size === setB.size && [...setA].every((id) => setB.has(id));
    });
    expect(sameSetPairs).toEqual([]);
  });

  it('cada estado de active resuelve exactamente 3 animaciones y 1 pose', () => {
    const offenders = Object.keys(ACTIVE_STATE_ROTATION).filter(
      (state) => animationPoolForState(state).length !== 3,
    );
    expect(offenders).toEqual([]);
  });

  it('todo id resuelto por animationPoolForState/poseForState existe en el catalogo', () => {
    const states = [
      'idle',
      'thinking',
      'reading',
      'coding',
      'executing',
      'waiting_permission',
      'success',
      'error',
      'confused',
      'sleeping',
      'speaking',
    ];
    const missing = states.filter((state) => {
      const pose = poseForState(state);
      const animationsOk = animationPoolForState(state).every((id) =>
        PROCEDURAL_CLIPS_BY_ID.has(id),
      );
      const poseOk = pose === undefined || PROCEDURAL_CLIPS_BY_ID.has(pose);
      return !animationsOk || !poseOk;
    });
    expect(missing).toEqual([]);
  });

  it('un estado desconocido cae al mood neutral en vez de lanzar', () => {
    expect(animationPoolForState('estado-inexistente')).toEqual(
      MOOD_ANIMATION_POOLS.neutral,
    );
    expect(poseForState('estado-inexistente')).toBe(MOOD_POSE_POOLS.neutral[0]);
  });
});

describe('procedural-animations — happy path', () => {
  it('las 5 categorias simples tienen 3 animaciones + 1 pose cada una', () => {
    for (const mood of [
      'neutral',
      'waiting',
      'positive',
      'negative',
      'resting',
    ]) {
      expect(MOOD_ANIMATION_POOLS[mood]).toHaveLength(3);
      expect(MOOD_POSE_POOLS[mood]).toHaveLength(1);
    }
  });

  it('el mood active tiene 5 animaciones y 2 poses', () => {
    expect(MOOD_ANIMATION_POOLS.active).toHaveLength(5);
    expect(MOOD_POSE_POOLS.active).toHaveLength(2);
  });

  it('el catalogo total tiene 20 animaciones y 7 poses (27 clips)', () => {
    const animations = PROCEDURAL_CLIP_CATALOG.filter(
      (entry) => entry.kind === 'animation',
    );
    const poses = PROCEDURAL_CLIP_CATALOG.filter(
      (entry) => entry.kind === 'pose',
    );
    expect(animations).toHaveLength(20);
    expect(poses).toHaveLength(7);
    expect(PROCEDURAL_CLIP_CATALOG).toHaveLength(27);
  });

  it('la tabla de rotacion de active coincide exactamente con D2', () => {
    expect(animationPoolForState('thinking')).toEqual([
      'active-animation-1',
      'active-animation-2',
      'active-animation-3',
    ]);
    expect(animationPoolForState('reading')).toEqual([
      'active-animation-2',
      'active-animation-3',
      'active-animation-4',
    ]);
    expect(animationPoolForState('coding')).toEqual([
      'active-animation-3',
      'active-animation-4',
      'active-animation-5',
    ]);
    expect(animationPoolForState('executing')).toEqual([
      'active-animation-4',
      'active-animation-5',
      'active-animation-1',
    ]);
    expect(animationPoolForState('speaking')).toEqual([
      'active-animation-5',
      'active-animation-1',
      'active-animation-2',
    ]);
    expect(poseForState('thinking')).toBe('active-pose-1');
    expect(poseForState('reading')).toBe('active-pose-2');
    expect(poseForState('coding')).toBe('active-pose-1');
    expect(poseForState('executing')).toBe('active-pose-2');
    expect(poseForState('speaking')).toBe('active-pose-1');
  });

  it('un estado de mood simple resuelve el pool literal de su mood', () => {
    expect(animationPoolForState('idle')).toEqual(MOOD_ANIMATION_POOLS.neutral);
    expect(poseForState('idle')).toBe(MOOD_POSE_POOLS.neutral[0]);
    expect(animationPoolForState('sleeping')).toEqual(
      MOOD_ANIMATION_POOLS.resting,
    );
    expect(poseForState('error')).toBe(MOOD_POSE_POOLS.negative[0]);
  });
});

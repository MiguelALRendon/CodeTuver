// boneName es string (no PoseEditorBoneName) porque puede venir de una fuente externa antes de validarse — mismo patron que TouchedBoneRotation en vrma-pose-export.ts.
export interface BoneKeyframe {
  boneName: string;
  timeSeconds: number;
  quaternion: readonly [number, number, number, number];
}

// Mismo hueso+tiempo reemplaza el keyframe existente en vez de duplicarlo.
export function upsertKeyframe(
  keyframes: readonly BoneKeyframe[],
  next: BoneKeyframe,
): BoneKeyframe[] {
  const withoutNext = keyframes.filter(
    (kf) =>
      !(kf.boneName === next.boneName && kf.timeSeconds === next.timeSeconds),
  );
  return [...withoutNext, next].sort((a, b) => a.timeSeconds - b.timeSeconds);
}

export function removeKeyframe(
  keyframes: readonly BoneKeyframe[],
  boneName: string,
  timeSeconds: number,
): BoneKeyframe[] {
  return keyframes.filter(
    (kf) => !(kf.boneName === boneName && kf.timeSeconds === timeSeconds),
  );
}

export function keyframesForBone(
  keyframes: readonly BoneKeyframe[],
  boneName: string,
): BoneKeyframe[] {
  return keyframes
    .filter((kf) => kf.boneName === boneName)
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
}

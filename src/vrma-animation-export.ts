import type { BoneKeyframe } from './animation-keyframe-list';
import {
  buildBoneTracksGltfJson,
  isPoseEditorBoneName,
  normalizeQuaternion,
  packGlb,
  POSE_HOLD_DURATION_SECONDS,
  type BoneTrackSamples,
  type PoseEditorBoneName,
  type Quaternion,
} from './vrma-pose-export';

// Extiende el empaquetado GLB de vrma-pose-export.ts a N fotogramas por hueso, reusado sin duplicar.

function groupByBone(
  keyframes: readonly BoneKeyframe[],
): Map<PoseEditorBoneName, { timeSeconds: number; quaternion: Quaternion }[]> {
  const grouped = new Map<
    PoseEditorBoneName,
    { timeSeconds: number; quaternion: Quaternion }[]
  >();
  keyframes.forEach((kf) => {
    if (!isPoseEditorBoneName(kf.boneName)) return;
    const boneName = kf.boneName;
    const samples = grouped.get(boneName) ?? [];
    samples.push({
      timeSeconds: kf.timeSeconds,
      quaternion: normalizeQuaternion(kf.quaternion),
    });
    grouped.set(boneName, samples);
  });
  return grouped;
}

// Un solo keyframe no forma un tramo: se sostiene como una pose de un fotograma (mismo POSE_HOLD_DURATION_SECONDS del Hito 5).
function trackForBone(
  boneName: PoseEditorBoneName,
  samples: readonly { timeSeconds: number; quaternion: Quaternion }[],
): BoneTrackSamples {
  const sorted = [...samples].sort((a, b) => a.timeSeconds - b.timeSeconds);
  if (sorted.length === 1) {
    const only = sorted[0];
    return {
      boneName,
      times: [only.timeSeconds, only.timeSeconds + POSE_HOLD_DURATION_SECONDS],
      quaternions: [only.quaternion, only.quaternion],
    };
  }
  return {
    boneName,
    times: sorted.map((sample) => sample.timeSeconds),
    quaternions: sorted.map((sample) => sample.quaternion),
  };
}

// Agrupado por hueso: reusable tanto para el GLB de exportacion como para el AnimationClip de previsualizacion en vivo.
export function buildAnimationTracks(
  keyframes: readonly BoneKeyframe[],
): BoneTrackSamples[] {
  const grouped = groupByBone(keyframes);
  return [...grouped.entries()].map(([boneName, samples]) =>
    trackForBone(boneName, samples),
  );
}

// null si ningun hueso tiene keyframes validos: degradacion silenciosa (nada que exportar), no error.
export function exportAnimationAsVrma(
  keyframes: readonly BoneKeyframe[],
): Uint8Array | null {
  const tracks = buildAnimationTracks(keyframes);
  if (tracks.length === 0) return null;
  const { json, binary } = buildBoneTracksGltfJson(tracks, 'animation');
  return packGlb(json, binary);
}

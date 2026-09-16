import * as THREE from 'three';
import type { BoneKeyframe } from './animation-keyframe-list';
import { boneNameFromTrackName } from './avatar-pose-timer';
import { isPoseEditorBoneName } from './vrma-pose-export';

export interface ClipReadError {
  error: string;
}

function isQuaternionTrack(
  track: THREE.KeyframeTrack,
): track is THREE.QuaternionKeyframeTrack {
  return track instanceof THREE.QuaternionKeyframeTrack;
}

// Los clips reales llegan ya retargeteados (retargetProceduralClip): sus pistas se nombran con el nodo RAW real del VRM cargado (ej. "Head", "Hips.001"), no con el nombre de hueso normalizado ("head"). Este resolver traduce de vuelta.
export type NodeNameToBoneNameResolver = (rawNodeName: string) => string | null;

// Inverso de buildAnimationTracks (vrma-animation-export.ts): un THREE.AnimationClip real -> BoneKeyframe[] planos, para precargar el editor de linea de tiempo (D6, AC-085/AC-087).
export function clipToKeyframes(
  clip: THREE.AnimationClip,
  resolveBoneName: NodeNameToBoneNameResolver,
): BoneKeyframe[] | ClipReadError {
  if (clip.tracks.length === 0) {
    return { error: 'La animacion no tiene ninguna pista.' };
  }
  const keyframes: BoneKeyframe[] = [];
  for (const track of clip.tracks) {
    const trackName = track.name;
    if (!isQuaternionTrack(track)) {
      return {
        error: `El editor solo modela pistas de rotacion; "${trackName}" no lo es.`,
      };
    }
    const rawNodeName = boneNameFromTrackName(track.name);
    const boneName = resolveBoneName(rawNodeName);
    if (!boneName || !isPoseEditorBoneName(boneName)) {
      return {
        error: `El editor no modela el hueso "${rawNodeName}".`,
      };
    }
    for (let i = 0; i < track.times.length; i += 1) {
      keyframes.push({
        boneName,
        timeSeconds: track.times[i],
        quaternion: [
          track.values[i * 4],
          track.values[i * 4 + 1],
          track.values[i * 4 + 2],
          track.values[i * 4 + 3],
        ],
      });
    }
  }
  return keyframes;
}

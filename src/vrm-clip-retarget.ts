import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { boneNameFromTrackName } from './avatar-pose-timer';

export type BoneNodeResolver = (boneName: string) => THREE.Object3D | null;

function propertyFromTrackName(trackName: string): string {
  const separatorIndex = trackName.lastIndexOf('.');
  return separatorIndex === -1 ? '' : trackName.slice(separatorIndex + 1);
}

function retargetTrack(
  track: THREE.KeyframeTrack,
  resolveBoneNode: BoneNodeResolver,
): THREE.KeyframeTrack | null {
  const node = resolveBoneNode(boneNameFromTrackName(track.name));
  if (!node) return null;
  const TrackType = track.constructor as new (
    name: string,
    times: ArrayLike<number>,
    values: ArrayLike<number>,
    interpolation?: THREE.InterpolationModes,
  ) => THREE.KeyframeTrack;
  return new TrackType(
    `${node.name}.${propertyFromTrackName(track.name)}`,
    track.times,
    track.values,
    track.getInterpolation(),
  );
}

// null si ningun hueso resuelve: degradacion silenciosa (nada que reproducir), no error.
export function retargetProceduralClip(
  clip: THREE.AnimationClip,
  resolveBoneNode: BoneNodeResolver,
): THREE.AnimationClip | null {
  const tracks = clip.tracks
    .map((track) => retargetTrack(track, resolveBoneNode))
    .filter((track): track is THREE.KeyframeTrack => track !== null);
  if (tracks.length === 0) return null;
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export function resolveBoneNodeFromVrm(vrm: VRM): BoneNodeResolver {
  return (boneName) =>
    vrm.humanoid?.getRawBoneNode(boneName as VRMHumanBoneName) ?? null;
}

const HUMAN_BONE_NAMES: readonly VRMHumanBoneName[] = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
];

// createVRMAnimationClip() (@pixiv/three-vrm-animation) nombra sus pistas con el nodo NORMALIZADO del humanoid, que no es descendiente de vrm.scene: el AnimationMixer de VrmAvatar.vue (raiz vrm.scene, huesos raw) nunca los encuentra y la animacion queda muda sin error. Este resolver traduce ese nombre de vuelta al hueso raw real.
export function resolveRawBoneNodeFromNormalizedNodeName(
  vrm: VRM,
): BoneNodeResolver {
  const rawNodeByNormalizedName = new Map<string, THREE.Object3D>();
  HUMAN_BONE_NAMES.forEach((boneName) => {
    const normalizedNode = vrm.humanoid?.getNormalizedBoneNode(boneName);
    const rawNode = vrm.humanoid?.getRawBoneNode(boneName);
    if (normalizedNode && rawNode) {
      rawNodeByNormalizedName.set(normalizedNode.name, rawNode);
    }
  });
  return (normalizedNodeName) =>
    rawNodeByNormalizedName.get(normalizedNodeName) ?? null;
}

// Inverso de retargetTrack(): sus pistas quedan nombradas con node.name (el nombre real del nodo raw del VRM cargado, ej. "Head"), no con el nombre de hueso normalizado ("head"). El editor de linea de tiempo (H7) necesita volver de nodo real a hueso humanoid para precargar keyframes.
export function boneNameFromRawNodeName(
  vrm: VRM,
): (rawNodeName: string) => string | null {
  const boneNameByRawNodeName = new Map<string, string>();
  HUMAN_BONE_NAMES.forEach((boneName) => {
    const rawNode = vrm.humanoid?.getRawBoneNode(boneName);
    if (rawNode) boneNameByRawNodeName.set(rawNode.name, boneName);
  });
  return (rawNodeName) => boneNameByRawNodeName.get(rawNodeName) ?? null;
}

import { describe, expect, it } from 'vitest';
import {
  buildAnimationTracks,
  exportAnimationAsVrma,
} from './vrma-animation-export';
import { POSE_HOLD_DURATION_SECONDS } from './vrma-pose-export';
import type { BoneKeyframe } from './animation-keyframe-list';

const IDENTITY: readonly [number, number, number, number] = [0, 0, 0, 1];
const TILTED: readonly [number, number, number, number] = [
  0, 0, 0.1305262, 0.9914449,
];

function decodeGlb(bytes: Uint8Array): {
  header: DataView;
  json: Record<string, unknown>;
} {
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = header.getUint32(12, true);
  const jsonBytes = bytes.slice(20, 20 + jsonLength);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes)) as Record<
    string,
    unknown
  >;
  return { header, json };
}

function expectCloseQuaternion(
  actual: readonly number[],
  expected: readonly number[],
): void {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]));
}

function humanBonesOf(json: Record<string, unknown>): string[] {
  const extension = (json.extensions as Record<string, unknown>)
    .VRMC_vrm_animation as {
    humanoid: { humanBones: Record<string, unknown> };
  };
  return Object.keys(extension.humanoid.humanBones);
}

function samplerTimesOf(
  json: Record<string, unknown>,
  accessorIndex: number,
): number {
  const accessors = json.accessors as { count: number }[];
  return accessors[accessorIndex].count;
}

describe('exportAnimationAsVrma — adversarial', () => {
  it('sin keyframes devuelve null', () => {
    expect(exportAnimationAsVrma([])).toBeNull();
  });

  it('un solo keyframe se comporta como una pose de un fotograma (2 muestras sostenidas)', () => {
    const keyframes: BoneKeyframe[] = [
      { boneName: 'head', timeSeconds: 0, quaternion: TILTED },
    ];
    const tracks = buildAnimationTracks(keyframes);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].times).toEqual([0, POSE_HOLD_DURATION_SECONDS]);
    expectCloseQuaternion(tracks[0].quaternions[0], TILTED);
    expectCloseQuaternion(tracks[0].quaternions[1], TILTED);

    const bytes = exportAnimationAsVrma(keyframes) as Uint8Array;
    const { json } = decodeGlb(bytes);
    expect(samplerTimesOf(json, 0)).toBe(2);
  });

  it('huesos sin ningun keyframe asignado no aparecen en la exportacion', () => {
    const keyframes: BoneKeyframe[] = [
      { boneName: 'head', timeSeconds: 0, quaternion: IDENTITY },
      { boneName: 'leftToes', timeSeconds: 0, quaternion: IDENTITY },
    ];
    const bytes = exportAnimationAsVrma(keyframes) as Uint8Array;
    const { json } = decodeGlb(bytes);
    expect(humanBonesOf(json).sort()).toEqual(['head', 'hips']);
  });

  it('humanBones siempre declara hips — VRMAnimationLoaderPlugin lo necesita para resolver hipsParent al reproducir', () => {
    const keyframes: BoneKeyframe[] = [
      { boneName: 'head', timeSeconds: 0, quaternion: IDENTITY },
    ];
    const bytes = exportAnimationAsVrma(keyframes) as Uint8Array;
    const { json } = decodeGlb(bytes);
    const extension = (json.extensions as Record<string, unknown>)
      .VRMC_vrm_animation as {
      humanoid: { humanBones: Record<string, { node: number }> };
    };
    expect(extension.humanoid.humanBones.hips).toEqual({ node: 0 });
  });

  it('solo huesos no reconocidos por VRM devuelve null (todos filtrados)', () => {
    const keyframes: BoneKeyframe[] = [
      { boneName: 'tail', timeSeconds: 0, quaternion: IDENTITY },
    ];
    expect(exportAnimationAsVrma(keyframes)).toBeNull();
  });

  it('keyframes fuera de orden temporal se reordenan ascendente en la pista exportada', () => {
    const keyframes: BoneKeyframe[] = [
      { boneName: 'head', timeSeconds: 2, quaternion: IDENTITY },
      { boneName: 'head', timeSeconds: 0, quaternion: TILTED },
      { boneName: 'head', timeSeconds: 1, quaternion: IDENTITY },
    ];
    const tracks = buildAnimationTracks(keyframes);
    expect(tracks[0].times).toEqual([0, 1, 2]);
    expectCloseQuaternion(tracks[0].quaternions[0], TILTED);
  });
});

describe('exportAnimationAsVrma — happy path', () => {
  it('multiples keyframes en el mismo hueso producen una pista con una muestra por keyframe', () => {
    const keyframes: BoneKeyframe[] = [
      { boneName: 'head', timeSeconds: 0, quaternion: IDENTITY },
      { boneName: 'head', timeSeconds: 1, quaternion: TILTED },
      { boneName: 'head', timeSeconds: 2, quaternion: IDENTITY },
    ];
    const bytes = exportAnimationAsVrma(keyframes) as Uint8Array;
    const { json } = decodeGlb(bytes);
    expect(samplerTimesOf(json, 0)).toBe(3);
  });

  it('varios huesos con keyframes propios producen una pista por hueso', () => {
    const keyframes: BoneKeyframe[] = [
      { boneName: 'leftUpperArm', timeSeconds: 0, quaternion: IDENTITY },
      { boneName: 'leftUpperArm', timeSeconds: 1, quaternion: TILTED },
      { boneName: 'rightUpperArm', timeSeconds: 0, quaternion: IDENTITY },
    ];
    const bytes = exportAnimationAsVrma(keyframes) as Uint8Array;
    const { json } = decodeGlb(bytes);
    expect(humanBonesOf(json).sort()).toEqual([
      'hips',
      'leftUpperArm',
      'rightUpperArm',
    ]);
  });

  it('produce un GLB valido (magic glTF, version 2, longitud declarada == longitud real)', () => {
    const bytes = exportAnimationAsVrma([
      { boneName: 'head', timeSeconds: 0, quaternion: IDENTITY },
      { boneName: 'head', timeSeconds: 1, quaternion: TILTED },
    ]) as Uint8Array;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(bytes.byteLength);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  resolveBoneNodeFromVrm,
  retargetProceduralClip,
  type BoneNodeResolver,
} from './vrm-clip-retarget';

function quaternionTrack(bone: string): THREE.QuaternionKeyframeTrack {
  return new THREE.QuaternionKeyframeTrack(
    `${bone}.quaternion`,
    [0, 1],
    [0, 0, 0, 1, 0, 0, 0, 1],
  );
}

function resolverFor(known: Record<string, string>): BoneNodeResolver {
  return (boneName) => {
    const nodeName = known[boneName];
    if (!nodeName) return null;
    const node = new THREE.Object3D();
    node.name = nodeName;
    return node;
  };
}

describe('retargetProceduralClip — casos adversos', () => {
  it('un clip cuyo unico hueso no existe en el VRM activo devuelve null', () => {
    const clip = new THREE.AnimationClip('idle', -1, [quaternionTrack('head')]);
    const result = retargetProceduralClip(clip, resolverFor({}));
    expect(result).toBeNull();
  });

  it('mezcla de huesos declarados/no declarados: solo sobreviven las pistas resueltas', () => {
    const clip = new THREE.AnimationClip('mixed', -1, [
      quaternionTrack('head'),
      quaternionTrack('leftUpperArm'),
    ]);
    const result = retargetProceduralClip(
      clip,
      resolverFor({ head: 'J_Bip_C_Head' }),
    );
    expect(result?.tracks).toHaveLength(1);
    expect(result?.tracks[0].name).toBe('J_Bip_C_Head.quaternion');
  });

  it('un clip que queda sin pistas tras retargetear (ningun hueso resuelto) se trata como no disponible', () => {
    const clip = new THREE.AnimationClip('empty-after-retarget', -1, [
      quaternionTrack('leftHand'),
      quaternionTrack('rightHand'),
    ]);
    const result = retargetProceduralClip(clip, resolverFor({}));
    expect(result).toBeNull();
  });

  it('un nombre de pista sin punto separador retargetea a una propiedad vacia, no al nombre de pista original', () => {
    const track = new THREE.QuaternionKeyframeTrack(
      'headwithoutproperty',
      [0, 1],
      [0, 0, 0, 1, 0, 0, 0, 1],
    );
    const clip = new THREE.AnimationClip('malformed', -1, [track]);
    const result = retargetProceduralClip(
      clip,
      resolverFor({ headwithoutproperty: 'J_Bip_C_Head' }),
    );
    expect(result?.tracks[0].name).toBe('J_Bip_C_Head.');
  });
});

describe('retargetProceduralClip — happy path', () => {
  it('retargetea todas las pistas al nombre de nodo real del VRM, preservando tiempos y valores', () => {
    const track = quaternionTrack('head');
    const clip = new THREE.AnimationClip('neutral-animation-1', -1, [track]);
    const result = retargetProceduralClip(
      clip,
      resolverFor({ head: 'J_Bip_C_Head' }),
    );
    expect(result?.tracks[0].name).toBe('J_Bip_C_Head.quaternion');
    expect(result?.tracks[0].times).toEqual(track.times);
    expect(result?.tracks[0].values).toEqual(track.values);
    expect(result?.tracks[0]).toBeInstanceOf(THREE.QuaternionKeyframeTrack);
  });
});

describe('resolveBoneNodeFromVrm', () => {
  it('delega en VRMHumanoid.getRawBoneNode y devuelve null si el humanoid no existe', () => {
    const node = new THREE.Object3D();
    const vrmWithHumanoid = {
      humanoid: { getRawBoneNode: () => node },
    } as unknown as Parameters<typeof resolveBoneNodeFromVrm>[0];
    expect(resolveBoneNodeFromVrm(vrmWithHumanoid)('head')).toBe(node);

    const vrmWithoutHumanoid = {
      humanoid: null,
    } as unknown as Parameters<typeof resolveBoneNodeFromVrm>[0];
    expect(resolveBoneNodeFromVrm(vrmWithoutHumanoid)('head')).toBeNull();
  });
});

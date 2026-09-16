import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  clipToKeyframes,
  type NodeNameToBoneNameResolver,
} from './vrma-animation-import';

function quatTrack(
  bone: string,
  times: number[],
  values: number[],
): THREE.QuaternionKeyframeTrack {
  return new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
}

// Identidad: el nombre del track ya es el nombre de hueso humanoid -- suficiente para probar la extraccion de keyframes en si, sin acoplar estas pruebas a un VRM real.
const identityResolver: NodeNameToBoneNameResolver = (name) => name;

describe('clipToKeyframes', () => {
  it('clip sin pistas reporta el motivo en vez de devolver una lista vacia silenciosa', () => {
    const clip = new THREE.AnimationClip('vacio', 1, []);
    const result = clipToKeyframes(clip, identityResolver);
    expect('error' in result).toBe(true);
  });

  it('pista de una forma que el editor no modela (posicion, no rotacion) reporta el motivo', () => {
    const positionTrack = new THREE.VectorKeyframeTrack(
      'head.position',
      [0],
      [0, 0, 0],
    );
    const clip = new THREE.AnimationClip('con-posicion', 1, [positionTrack]);
    const result = clipToKeyframes(clip, identityResolver);
    expect('error' in result).toBe(true);
  });

  it('pista de un hueso que el editor no expone reporta el motivo, no lo inventa', () => {
    const clip = new THREE.AnimationClip('hueso-no-editable', 1, [
      quatTrack('leftShoulder', [0], [0, 0, 0, 1]),
    ]);
    const result = clipToKeyframes(clip, identityResolver);
    expect('error' in result).toBe(true);
  });

  it('el resolver de nombre de nodo real (retargeteado) sin mapeo tambien reporta, no lo inventa', () => {
    const clip = new THREE.AnimationClip('nodo-raw-sin-mapeo', 1, [
      quatTrack('Bip001_Head', [0], [0, 0, 0, 1]),
    ]);
    const result = clipToKeyframes(clip, () => null);
    expect('error' in result).toBe(true);
  });

  it('el resolver traduce el nombre de nodo real del VRM cargado al hueso humanoid (retargetProceduralClip)', () => {
    const clip = new THREE.AnimationClip('nodo-raw-con-mapeo', 1, [
      quatTrack('Head', [0], [0, 0, 0, 1]),
    ]);
    const result = clipToKeyframes(clip, (name) =>
      name === 'Head' ? 'head' : null,
    );
    if ('error' in result) throw new Error('no deberia fallar');
    expect(result[0].boneName).toBe('head');
  });

  it('un hueso con dos keyframes se lee completo y en orden', () => {
    const clip = new THREE.AnimationClip('un-hueso', 1, [
      quatTrack('head', [0, 0.5], [0, 0, 0, 1, 0, 0, 0.7071, 0.7071]),
    ]);
    const result = clipToKeyframes(clip, identityResolver);
    if ('error' in result) throw new Error('no deberia fallar');
    expect(result).toHaveLength(2);
    expect(result[0].boneName).toBe('head');
    expect(result[0].timeSeconds).toBe(0);
    expect(result[0].quaternion).toEqual([0, 0, 0, 1]);
    expect(result[1].timeSeconds).toBe(0.5);
    result[1].quaternion.forEach((component, i) => {
      expect(component).toBeCloseTo([0, 0, 0.7071, 0.7071][i], 3);
    });
  });

  it('varios huesos en tiempos distintos se leen todos, cada uno con sus propios tiempos (happy path)', () => {
    const clip = new THREE.AnimationClip('multi-hueso', 1, [
      quatTrack('head', [0], [0, 0, 0, 1]),
      quatTrack(
        'leftUpperArm',
        [0, 0.2, 0.4],
        [0, 0, 0, 1, 0, 0.1, 0, 0.99, 0, 0.2, 0, 0.98],
      ),
    ]);
    const result = clipToKeyframes(clip, identityResolver);
    if ('error' in result) throw new Error('no deberia fallar');
    expect(result.filter((kf) => kf.boneName === 'head')).toHaveLength(1);
    expect(result.filter((kf) => kf.boneName === 'leftUpperArm')).toHaveLength(
      3,
    );
  });
});

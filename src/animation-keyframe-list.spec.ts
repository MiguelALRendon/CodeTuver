import { describe, expect, it } from 'vitest';
import {
  keyframesForBone,
  removeKeyframe,
  upsertKeyframe,
  type BoneKeyframe,
} from './animation-keyframe-list';

const IDENTITY: readonly [number, number, number, number] = [0, 0, 0, 1];
const TILTED: readonly [number, number, number, number] = [
  0, 0, 0.1305262, 0.9914449,
];

function keyframe(
  boneName: BoneKeyframe['boneName'],
  timeSeconds: number,
  quaternion: BoneKeyframe['quaternion'] = IDENTITY,
): BoneKeyframe {
  return { boneName, timeSeconds, quaternion };
}

describe('animation-keyframe-list — adversarial', () => {
  it('upsertKeyframe con el mismo hueso y tiempo reemplaza en vez de duplicar', () => {
    const original = [keyframe('head', 1, IDENTITY)];
    const result = upsertKeyframe(original, keyframe('head', 1, TILTED));
    expect(result).toHaveLength(1);
    expect(result[0].quaternion).toEqual(TILTED);
  });

  it('removeKeyframe de un hueso/tiempo inexistente no cambia la lista', () => {
    const original = [keyframe('head', 1)];
    const result = removeKeyframe(original, 'neck', 5);
    expect(result).toEqual(original);
  });

  it('keyframesForBone filtra solo el hueso pedido, ignorando otros huesos', () => {
    const original = [keyframe('head', 1), keyframe('neck', 2)];
    expect(keyframesForBone(original, 'head')).toEqual([keyframe('head', 1)]);
  });

  it('upsertKeyframe deja la lista ordenada por tiempo aunque se inserte fuera de orden', () => {
    const original = [keyframe('head', 3), keyframe('head', 1)];
    const result = upsertKeyframe(original, keyframe('head', 2));
    expect(result.map((kf) => kf.timeSeconds)).toEqual([1, 2, 3]);
  });
});

describe('animation-keyframe-list — happy path', () => {
  it('upsertKeyframe agrega un keyframe nuevo cuando el hueso/tiempo no existia', () => {
    const result = upsertKeyframe([keyframe('head', 0)], keyframe('head', 1));
    expect(result).toHaveLength(2);
  });

  it('removeKeyframe quita exactamente el keyframe pedido', () => {
    const original = [keyframe('head', 0), keyframe('head', 1)];
    const result = removeKeyframe(original, 'head', 0);
    expect(result).toEqual([keyframe('head', 1)]);
  });

  it('keyframesForBone devuelve ordenado por tiempo', () => {
    const original = [keyframe('head', 2), keyframe('head', 0)];
    expect(
      keyframesForBone(original, 'head').map((kf) => kf.timeSeconds),
    ).toEqual([0, 2]);
  });
});

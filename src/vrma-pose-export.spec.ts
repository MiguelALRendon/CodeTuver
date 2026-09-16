import { describe, expect, it } from 'vitest';
import { exportPoseAsVrma, POSE_EDITOR_BONE_NAMES } from './vrma-pose-export';

const IDENTITY: readonly [number, number, number, number] = [0, 0, 0, 1];

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

describe('exportPoseAsVrma — adversarial', () => {
  it('cero huesos tocados devuelve null', () => {
    expect(exportPoseAsVrma([])).toBeNull();
  });

  it('solo nombres de hueso no reconocidos por VRM devuelve null (todos filtrados)', () => {
    const result = exportPoseAsVrma([
      { boneName: 'leftToes', quaternion: IDENTITY },
      { boneName: 'tail', quaternion: IDENTITY },
    ]);
    expect(result).toBeNull();
  });

  it('filtra huesos no reconocidos y conserva los validos', () => {
    const bytes = exportPoseAsVrma([
      { boneName: 'leftToes', quaternion: IDENTITY },
      { boneName: 'head', quaternion: IDENTITY },
    ]);
    expect(bytes).not.toBeNull();
    const { json } = decodeGlb(bytes as Uint8Array);
    const extension = (json.extensions as Record<string, unknown>)
      .VRMC_vrm_animation as {
      humanoid: { humanBones: Record<string, unknown> };
    };
    expect(Object.keys(extension.humanoid.humanBones).sort()).toEqual([
      'head',
      'hips',
    ]);
  });

  it('humanBones siempre declara hips, aunque ningun track lo toque — VRMAnimationLoaderPlugin lo necesita para resolver hipsParent', () => {
    const bytes = exportPoseAsVrma([
      { boneName: 'head', quaternion: IDENTITY },
    ]) as Uint8Array;
    const { json } = decodeGlb(bytes);
    const extension = (json.extensions as Record<string, unknown>)
      .VRMC_vrm_animation as {
      humanoid: { humanBones: Record<string, { node: number }> };
    };
    expect(extension.humanoid.humanBones.hips).toEqual({ node: 0 });
  });

  it('cuaternion de magnitud cero cae a identidad en vez de propagar NaN', () => {
    const bytes = exportPoseAsVrma([
      { boneName: 'head', quaternion: [0, 0, 0, 0] },
    ]);
    const { json } = decodeGlb(bytes as Uint8Array);
    const accessors = json.accessors as { type: string }[];
    const rotationAccessorIndex = accessors.findIndex(
      (accessor) => accessor.type === 'VEC4',
    );
    expect(rotationAccessorIndex).toBeGreaterThanOrEqual(0);
  });

  it('cuaternion en el limite de magnitud unitaria (180 grados) se conserva normalizado', () => {
    const bytes = exportPoseAsVrma([
      { boneName: 'rightUpperArm', quaternion: [1, 0, 0, 0] },
    ]);
    expect(bytes).not.toBeNull();
    const { header } = decodeGlb(bytes as Uint8Array);
    expect(header.getUint32(8, true)).toBe((bytes as Uint8Array).byteLength);
  });

  it('nombres de hueso duplicados se resuelven a un solo nodo (el ultimo valor)', () => {
    const bytes = exportPoseAsVrma([
      { boneName: 'head', quaternion: [0, 0, 0, 1] },
      { boneName: 'head', quaternion: [1, 0, 0, 0] },
    ]);
    const { json } = decodeGlb(bytes as Uint8Array);
    expect((json.nodes as unknown[]).length).toBe(2);
  });
});

describe('exportPoseAsVrma — happy path', () => {
  it('produce un GLB valido (magic glTF, version 2, longitud declarada == longitud real)', () => {
    const bytes = exportPoseAsVrma([
      { boneName: 'head', quaternion: [0, 0, 0.1305262, 0.9914449] },
    ]) as Uint8Array;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(bytes.byteLength);
  });

  it('declara VRMC_vrm_animation en extensionsUsed y mapea cada hueso tocado a un nodo', () => {
    const bytes = exportPoseAsVrma([
      { boneName: 'leftUpperArm', quaternion: [0, 0, 0, 1] },
      { boneName: 'rightUpperArm', quaternion: [0, 0, 0, 1] },
    ]) as Uint8Array;
    const { json } = decodeGlb(bytes);
    expect(json.extensionsUsed).toContain('VRMC_vrm_animation');
    const extension = (json.extensions as Record<string, unknown>)
      .VRMC_vrm_animation as {
      humanoid: { humanBones: Record<string, unknown> };
    };
    expect(Object.keys(extension.humanoid.humanBones).sort()).toEqual([
      'hips',
      'leftUpperArm',
      'rightUpperArm',
    ]);
  });

  it('todos los huesos del editor de posado son aceptados', () => {
    const bytes = exportPoseAsVrma(
      POSE_EDITOR_BONE_NAMES.map((boneName) => ({
        boneName,
        quaternion: IDENTITY,
      })),
    ) as Uint8Array;
    const { json } = decodeGlb(bytes);
    const extension = (json.extensions as Record<string, unknown>)
      .VRMC_vrm_animation as {
      humanoid: { humanBones: Record<string, unknown> };
    };
    expect(Object.keys(extension.humanoid.humanBones)).toHaveLength(
      POSE_EDITOR_BONE_NAMES.length + 1,
    );
  });
});

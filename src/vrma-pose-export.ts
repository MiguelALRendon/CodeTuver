// GLB+VRMC_vrm_animation escrito a mano (GLTFExporter depende de FileReader, ausente en `node`); empaquetado generalizado a N muestras/hueso.

// D6: mismo conjunto de huesos que D4 (torso, brazos, cabeza) — no el vocabulario humanoide completo.
export type PoseEditorBoneName =
  | 'head'
  | 'neck'
  | 'spine'
  | 'chest'
  | 'leftUpperArm'
  | 'leftLowerArm'
  | 'leftHand'
  | 'rightUpperArm'
  | 'rightLowerArm'
  | 'rightHand';

export const POSE_EDITOR_BONE_NAMES: readonly PoseEditorBoneName[] = [
  'head',
  'neck',
  'spine',
  'chest',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
];

export interface TouchedBoneRotation {
  boneName: string;
  quaternion: readonly [number, number, number, number];
}

export type Quaternion = readonly [number, number, number, number];

export const IDENTITY_QUATERNION: Quaternion = [0, 0, 0, 1];
const MIN_QUATERNION_LENGTH = 1e-6;
export const POSE_HOLD_DURATION_SECONDS = 1;

const GLTF_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_PREFIX_BYTES = 8;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const FLOAT_COMPONENT_TYPE = 5126;

export function isPoseEditorBoneName(name: string): name is PoseEditorBoneName {
  return (POSE_EDITOR_BONE_NAMES as readonly string[]).includes(name);
}

// Cuaternion degenerado (NaN, o magnitud ~0) cae a identidad en vez de propagar valores invalidos al archivo.
export function normalizeQuaternion(components: Quaternion): Quaternion {
  const [x, y, z, w] = components;
  if (![x, y, z, w].every(Number.isFinite)) return IDENTITY_QUATERNION;
  const length = Math.sqrt(x * x + y * y + z * z + w * w);
  if (length < MIN_QUATERNION_LENGTH) return IDENTITY_QUATERNION;
  return [x / length, y / length, z / length, w / length];
}

function padBytes(bytes: Uint8Array, fillByte: number): Uint8Array {
  const remainder = bytes.byteLength % 4;
  if (remainder === 0) return bytes;
  const padded = new Uint8Array(bytes.byteLength + (4 - remainder));
  padded.set(bytes);
  padded.fill(fillByte, bytes.byteLength);
  return padded;
}

interface GlAccessor {
  bufferView: number;
  componentType: number;
  count: number;
  type: 'SCALAR' | 'VEC4';
}

interface GlBufferView {
  buffer: 0;
  byteOffset: number;
  byteLength: number;
}

export interface BoneTrackSamples {
  boneName: PoseEditorBoneName;
  times: readonly number[];
  quaternions: readonly Quaternion[];
}

// Hips identidad como ancestro declarado: el loader de referencia exige un hueso en humanBones para resolver el mundo de cada hueso tocado, y con todo en identidad esa conversion es un no-op.
export function buildBoneTracksGltfJson(
  tracks: readonly BoneTrackSamples[],
  animationName: string,
): {
  json: Record<string, unknown>;
  binary: Uint8Array;
} {
  const nodes: Record<string, unknown>[] = [
    {
      name: 'hips',
      translation: [0, 1, 0],
      rotation: IDENTITY_QUATERNION,
      children: tracks.map((_, index) => index + 1),
    },
  ];
  // hips debe declararse en humanBones (no solo como nodo): VRMAnimationLoaderPlugin busca la entrada "hips" ahi para fijar worldMatrixMap.hipsParent, la referencia que usa para decompose() al resolver cualquier otro hueso.
  const humanBones: Record<string, { node: number }> = { hips: { node: 0 } };
  const bufferViews: GlBufferView[] = [];
  const accessors: GlAccessor[] = [];
  const channels: Record<string, unknown>[] = [];
  const samplers: Record<string, unknown>[] = [];
  const chunks: Float32Array[] = [];
  let byteOffset = 0;

  function pushAccessor(
    values: Float32Array,
    type: GlAccessor['type'],
  ): number {
    const itemSize = type === 'SCALAR' ? 1 : 4;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: values.byteLength });
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType: FLOAT_COMPONENT_TYPE,
      count: values.length / itemSize,
      type,
    });
    byteOffset += values.byteLength;
    chunks.push(values);
    return accessors.length - 1;
  }

  tracks.forEach((track, index) => {
    const nodeIndex = index + 1;
    nodes.push({ name: track.boneName, rotation: IDENTITY_QUATERNION });
    humanBones[track.boneName] = { node: nodeIndex };
    const timesAccessor = pushAccessor(new Float32Array(track.times), 'SCALAR');
    const values = new Float32Array(track.quaternions.length * 4);
    track.quaternions.forEach((quaternion, sampleIndex) => {
      values.set(quaternion, sampleIndex * 4);
    });
    const valuesAccessor = pushAccessor(values, 'VEC4');
    samplers.push({ input: timesAccessor, output: valuesAccessor });
    channels.push({
      sampler: samplers.length - 1,
      target: { node: nodeIndex, path: 'rotation' },
    });
  });

  const totalFloats = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const binary = new Float32Array(totalFloats);
  let cursor = 0;
  chunks.forEach((chunk) => {
    binary.set(chunk, cursor);
    cursor += chunk.length;
  });

  const json = {
    asset: { version: '2.0', generator: 'Codetuver Avatar' },
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: {
      VRMC_vrm_animation: {
        specVersion: '1.0',
        humanoid: { humanBones },
      },
    },
    nodes,
    scenes: [{ nodes: [0] }],
    animations: [{ name: animationName, channels, samplers }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  return { json, binary: new Uint8Array(binary.buffer) };
}

export function packGlb(
  json: Record<string, unknown>,
  binaryBytes: Uint8Array,
): Uint8Array {
  const jsonBytes = padBytes(
    new TextEncoder().encode(JSON.stringify(json)),
    0x20,
  );
  const paddedBinary = padBytes(binaryBytes, 0x00);
  const totalLength =
    GLB_HEADER_BYTES +
    GLB_CHUNK_PREFIX_BYTES +
    jsonBytes.byteLength +
    GLB_CHUNK_PREFIX_BYTES +
    paddedBinary.byteLength;

  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);
  let offset = 0;
  view.setUint32(offset, GLTF_MAGIC, true);
  offset += 4;
  view.setUint32(offset, GLB_VERSION, true);
  offset += 4;
  view.setUint32(offset, totalLength, true);
  offset += 4;

  view.setUint32(offset, jsonBytes.byteLength, true);
  offset += 4;
  view.setUint32(offset, JSON_CHUNK_TYPE, true);
  offset += 4;
  glb.set(jsonBytes, offset);
  offset += jsonBytes.byteLength;

  view.setUint32(offset, paddedBinary.byteLength, true);
  offset += 4;
  view.setUint32(offset, BIN_CHUNK_TYPE, true);
  offset += 4;
  glb.set(paddedBinary, offset);

  return glb;
}

// null si no hay huesos validos: degradacion silenciosa (nada que exportar), no error.
export function exportPoseAsVrma(
  touchedBones: readonly TouchedBoneRotation[],
): Uint8Array | null {
  const validEntries = touchedBones.filter((entry) =>
    isPoseEditorBoneName(entry.boneName),
  );
  if (validEntries.length === 0) return null;
  // Map: nombre duplicado se resuelve al ultimo valor, un hueso no puede tener dos nodos.
  const byBone = new Map<PoseEditorBoneName, Quaternion>(
    validEntries.map((entry) => [
      entry.boneName as PoseEditorBoneName,
      normalizeQuaternion(entry.quaternion),
    ]),
  );
  const tracks: BoneTrackSamples[] = [...byBone.entries()].map(
    ([boneName, quaternion]) => ({
      boneName,
      times: [0, POSE_HOLD_DURATION_SECONDS],
      quaternions: [quaternion, quaternion],
    }),
  );
  const { json, binary } = buildBoneTracksGltfJson(tracks, 'pose');
  return packGlb(json, binary);
}

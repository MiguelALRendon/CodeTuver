import * as THREE from 'three';
import { resolveMood } from './avatar-face-presentation';

export type ProceduralClipKind = 'animation' | 'pose';

export interface ProceduralClipEntry {
  readonly id: string;
  readonly kind: ProceduralClipKind;
  readonly mood: string;
  readonly clip: THREE.AnimationClip;
}

type Vec3 = readonly [number, number, number];

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function quaternionFromEulerDeg(rotationDeg: Vec3): THREE.Quaternion {
  const [x, y, z] = rotationDeg;
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(degToRad(x), degToRad(y), degToRad(z)),
  );
}

// D4: nombre de pista "<hueso>.quaternion" — el hueso real se resuelve via VRMHumanoid al reproducir (mismo contrato que boneNameFromTrackName, Hito 1).
function swingTrack(
  bone: string,
  base: Vec3,
  sway: Vec3 = [0, 0, 0],
  times: readonly number[] = [0, 1.5, 3],
): THREE.QuaternionKeyframeTrack {
  const swayed: Vec3 = [
    base[0] + sway[0],
    base[1] + sway[1],
    base[2] + sway[2],
  ];
  const values = [base, swayed, base].flatMap((rotation) => {
    const q = quaternionFromEulerDeg(rotation);
    return [q.x, q.y, q.z, q.w];
  });
  return new THREE.QuaternionKeyframeTrack(
    `${bone}.quaternion`,
    times as number[],
    values,
  );
}

function clip(id: string, tracks: THREE.KeyframeTrack[]): THREE.AnimationClip {
  return new THREE.AnimationClip(id, -1, tracks);
}

// mood neutral (idle): 3 animaciones + 1 pose — D4: animaciones solo head/neck/spine, pose solo brazos/manos + chest.

// balanceo respiratorio suave de cabeza en reposo
const neutralAnimation1 = clip('neutral-animation-1', [
  swingTrack('head', [0, 0, 0], [-4, 0, 0]),
]);

// ladeo lento de cabeza de lado a lado, quieto
const neutralAnimation2 = clip('neutral-animation-2', [
  swingTrack('head', [0, 0, 0], [0, 0, 6]),
]);

// pequeño giro de cabeza mirando alrededor, spine acompaña levemente
const neutralAnimation3 = clip('neutral-animation-3', [
  swingTrack('head', [0, 0, 0], [0, 10, 0]),
  swingTrack('spine', [0, 0, 0], [0, 3, 0]),
]);

// brazos bajados al costado desde el bind T-pose del VRM (D7: eje Z del hueso raw *upperArm* es el que baja el brazo en este rig — signo positivo en el izquierdo, negativo en el derecho, verificado leyendo la posicion mundial de la mano en el editor de posado, no es el vocabulario "roll" generico de VRM), manos entrelazadas al frente, leve inclinacion de chest
const neutralPose1 = clip('neutral-pose-1', [
  swingTrack('leftUpperArm', [8, 5, 78], [2, 0, 3]),
  swingTrack('rightUpperArm', [8, -5, -78], [2, 0, -3]),
  swingTrack('leftLowerArm', [0, 10, -25], [0, 0, -3]),
  swingTrack('rightLowerArm', [0, -10, 25], [0, 0, 3]),
  swingTrack('leftHand', [0, 0, -8], [0, 0, 4]),
  swingTrack('rightHand', [0, 0, 8], [0, 0, -4]),
  swingTrack('spine', [2, 0, 0], [0, 0, 1]),
  swingTrack('chest', [2, 0, 0], [1, 0, 0]),
]);

// mood waiting (waiting_permission, confused): 3 animaciones + 1 pose.

// cabeza ladeada con pequeño temblor de duda
const waitingAnimation1 = clip('waiting-animation-1', [
  swingTrack('head', [0, 0, 8], [0, 0, -4]),
]);

// cabeza gira lentamente buscando una respuesta
const waitingAnimation2 = clip('waiting-animation-2', [
  swingTrack('head', [0, -6, 0], [0, 12, 0]),
]);

// leve asentimiento repetitivo de cabeza, como esperando confirmacion
const waitingAnimation3 = clip('waiting-animation-3', [
  swingTrack('head', [-3, 0, 0], [6, 0, 0]),
  swingTrack('neck', [0, 0, 0], [2, 0, 0]),
]);

// brazos bajados a media altura y cruzados hacia el centro, chest inclinado hacia atras (duda)
const waitingPose1 = clip('waiting-pose-1', [
  swingTrack('leftUpperArm', [10, 15, 55], [0, 0, 4]),
  swingTrack('rightUpperArm', [10, -15, -55], [0, 0, -4]),
  swingTrack('leftLowerArm', [0, 20, -75], [0, 0, -3]),
  swingTrack('rightLowerArm', [0, -20, 75], [0, 0, 3]),
  swingTrack('leftHand', [0, 0, -10]),
  swingTrack('rightHand', [0, 0, 10]),
  swingTrack('spine', [-2, 0, 0]),
  swingTrack('chest', [-2, 0, 0]),
]);

// mood positive (success): 3 animaciones + 1 pose.

// cabeza sube y baja con entusiasmo, como celebrando
const positiveAnimation1 = clip('positive-animation-1', [
  swingTrack('head', [-6, 0, 0], [8, 0, 0]),
  swingTrack('neck', [0, 0, 0], [3, 0, 0]),
]);

// ladeo alegre de cabeza con rebote
const positiveAnimation2 = clip('positive-animation-2', [
  swingTrack('head', [0, 0, -6], [0, 0, 10]),
]);

// cabeza gira de lado a lado, animada
const positiveAnimation3 = clip('positive-animation-3', [
  swingTrack('head', [0, -10, 0], [0, 10, 0]),
  swingTrack('spine', [0, 0, 0], [0, 2, 0]),
]);

// brazos abiertos y levantados en señal de victoria, manos abiertas, chest erguido
const positivePose1 = clip('positive-pose-1', [
  swingTrack('leftUpperArm', [-15, 10, -55], [5, 0, -8]),
  swingTrack('rightUpperArm', [-15, -10, 55], [5, 0, 8]),
  swingTrack('leftLowerArm', [0, 0, -20], [0, 0, -5]),
  swingTrack('rightLowerArm', [0, 0, 20], [0, 0, 5]),
  swingTrack('leftHand', [0, 0, -15]),
  swingTrack('rightHand', [0, 0, 15]),
  swingTrack('spine', [-4, 0, 0]),
  swingTrack('chest', [-5, 0, 0]),
]);

// mood negative (error): 3 animaciones + 1 pose.

// cabeza cae ligeramente hacia adelante, como decepcion
const negativeAnimation1 = clip('negative-animation-1', [
  swingTrack('head', [6, 0, 0], [10, 0, 0]),
]);

// cabeza niega lentamente de lado a lado
const negativeAnimation2 = clip('negative-animation-2', [
  swingTrack('head', [0, 10, 0], [0, -10, 0]),
]);

// pequeño temblor de cabeza hacia abajo, spine encorvada levemente
const negativeAnimation3 = clip('negative-animation-3', [
  swingTrack('head', [8, 0, 0], [3, 0, 0]),
  swingTrack('spine', [3, 0, 0], [2, 0, 0]),
]);

// brazos caidos y pesados, codos hacia adentro como decepcion, chest hundido
const negativePose1 = clip('negative-pose-1', [
  swingTrack('leftUpperArm', [15, 5, 88], [3, 0, 2]),
  swingTrack('rightUpperArm', [15, -5, -88], [3, 0, -2]),
  swingTrack('leftLowerArm', [5, 0, -15], [0, 0, -3]),
  swingTrack('rightLowerArm', [5, 0, 15], [0, 0, 3]),
  swingTrack('leftHand', [5, 0, -5]),
  swingTrack('rightHand', [5, 0, 5]),
  swingTrack('spine', [6, 0, 0]),
  swingTrack('chest', [6, 0, 0]),
]);

// mood resting (sleeping): 3 animaciones + 1 pose.

// cabeza cae hacia un lado, respiracion lenta con spine
const restingAnimation1 = clip('resting-animation-1', [
  swingTrack('head', [4, 0, 14], [2, 0, -2]),
  swingTrack('spine', [0, 0, 0], [1, 0, 0]),
]);

// cabeceo muy lento de sueño
const restingAnimation2 = clip('resting-animation-2', [
  swingTrack('head', [10, 0, 0], [-6, 0, 0]),
]);

// leve balanceo circular de cabeza, muy lento
const restingAnimation3 = clip('resting-animation-3', [
  swingTrack('head', [0, 0, 4], [0, 6, -4]),
]);

// brazos caidos completamente relajados y pesados, manos sueltas, chest hundido levemente
const restingPose1 = clip('resting-pose-1', [
  swingTrack('leftUpperArm', [10, 0, 92], [2, 0, 2]),
  swingTrack('rightUpperArm', [10, 0, -92], [2, 0, -2]),
  swingTrack('leftLowerArm', [8, 0, -10], [0, 0, -2]),
  swingTrack('rightLowerArm', [8, 0, 10], [0, 0, 2]),
  swingTrack('leftHand', [10, 0, -5]),
  swingTrack('rightHand', [10, 0, 5]),
  swingTrack('spine', [8, 0, 0]),
  swingTrack('chest', [7, 0, 0]),
]);

// mood active (thinking, reading, coding, executing, speaking) — D2: 5 animaciones (A1-A5) + 2 poses (P1, P2), pool ampliado con rotacion por estado.

// A1 — cabeza ladeada fija, mirada hacia arriba, pensativa
const activeAnimation1 = clip('active-animation-1', [
  swingTrack('head', [-8, 0, 10], [-2, 0, 2]),
]);

// A2 — cabeza se mueve de lado a lado siguiendo lineas de texto
const activeAnimation2 = clip('active-animation-2', [
  swingTrack('head', [0, -14, 0], [0, 14, 0]),
]);

// A3 — pequeños asentimientos rapidos de cabeza, ritmo de tecleo
const activeAnimation3 = clip('active-animation-3', [
  swingTrack('head', [-2, 0, 0], [4, 0, 0], [0, 0.6, 1.2]),
  swingTrack('neck', [0, 0, 0], [1, 0, 0], [0, 0.6, 1.2]),
]);

// A4 — cabeza inclinada hacia adelante, atenta al progreso
const activeAnimation4 = clip('active-animation-4', [
  swingTrack('head', [10, 0, 0], [4, 0, 0]),
  swingTrack('spine', [2, 0, 0], [1, 0, 0]),
]);

// A5 — cabeza se mueve al ritmo de la voz, como hablando
const activeAnimation5 = clip('active-animation-5', [
  swingTrack('head', [-4, 0, 0], [6, 0, 4], [0, 0.5, 1]),
]);

// P1 — mano derecha cerca de la barbilla, codo levantado, brazo izquierdo bajado natural, pose de pensar
const activePose1 = clip('active-pose-1', [
  swingTrack('rightUpperArm', [0, -85, 30]),
  swingTrack('rightLowerArm', [0, 0, -70]),
  swingTrack('rightHand', [0, 0, 15]),
  swingTrack('leftUpperArm', [8, 0, 78], [2, 0, 2]),
  swingTrack('leftLowerArm', [0, 0, -15]),
  swingTrack('leftHand', [0, 0, -8]),
  swingTrack('spine', [3, 0, 0]),
  swingTrack('chest', [2, 0, 0]),
]);

// P2 — brazos a media altura gesticulando levemente hacia adelante, palmas abiertas, chest inclinado
const activePose2 = clip('active-pose-2', [
  swingTrack('leftUpperArm', [10, 15, 45], [5, 0, -6]),
  swingTrack('rightUpperArm', [10, -15, -45], [5, 0, 6]),
  swingTrack('leftLowerArm', [0, 0, -35], [0, 0, -5]),
  swingTrack('rightLowerArm', [0, 0, 35], [0, 0, 5]),
  swingTrack('leftHand', [0, 0, -10]),
  swingTrack('rightHand', [0, 0, 10]),
  swingTrack('spine', [1, 0, 0]),
  swingTrack('chest', [3, 0, 0]),
]);

function entry(
  kind: ProceduralClipKind,
  mood: string,
  animationClip: THREE.AnimationClip,
): ProceduralClipEntry {
  return { id: animationClip.name, kind, mood, clip: animationClip };
}

export const PROCEDURAL_CLIP_CATALOG: readonly ProceduralClipEntry[] = [
  entry('animation', 'neutral', neutralAnimation1),
  entry('animation', 'neutral', neutralAnimation2),
  entry('animation', 'neutral', neutralAnimation3),
  entry('pose', 'neutral', neutralPose1),
  entry('animation', 'waiting', waitingAnimation1),
  entry('animation', 'waiting', waitingAnimation2),
  entry('animation', 'waiting', waitingAnimation3),
  entry('pose', 'waiting', waitingPose1),
  entry('animation', 'positive', positiveAnimation1),
  entry('animation', 'positive', positiveAnimation2),
  entry('animation', 'positive', positiveAnimation3),
  entry('pose', 'positive', positivePose1),
  entry('animation', 'negative', negativeAnimation1),
  entry('animation', 'negative', negativeAnimation2),
  entry('animation', 'negative', negativeAnimation3),
  entry('pose', 'negative', negativePose1),
  entry('animation', 'resting', restingAnimation1),
  entry('animation', 'resting', restingAnimation2),
  entry('animation', 'resting', restingAnimation3),
  entry('pose', 'resting', restingPose1),
  entry('animation', 'active', activeAnimation1),
  entry('animation', 'active', activeAnimation2),
  entry('animation', 'active', activeAnimation3),
  entry('animation', 'active', activeAnimation4),
  entry('animation', 'active', activeAnimation5),
  entry('pose', 'active', activePose1),
  entry('pose', 'active', activePose2),
];

export const PROCEDURAL_CLIPS_BY_ID: ReadonlyMap<string, ProceduralClipEntry> =
  new Map(PROCEDURAL_CLIP_CATALOG.map((item) => [item.id, item]));

export const MOOD_ANIMATION_POOLS: Readonly<Record<string, readonly string[]>> =
  {
    neutral: [
      'neutral-animation-1',
      'neutral-animation-2',
      'neutral-animation-3',
    ],
    waiting: [
      'waiting-animation-1',
      'waiting-animation-2',
      'waiting-animation-3',
    ],
    positive: [
      'positive-animation-1',
      'positive-animation-2',
      'positive-animation-3',
    ],
    negative: [
      'negative-animation-1',
      'negative-animation-2',
      'negative-animation-3',
    ],
    resting: [
      'resting-animation-1',
      'resting-animation-2',
      'resting-animation-3',
    ],
    active: [
      'active-animation-1',
      'active-animation-2',
      'active-animation-3',
      'active-animation-4',
      'active-animation-5',
    ],
  };

export const MOOD_POSE_POOLS: Readonly<Record<string, readonly string[]>> = {
  neutral: ['neutral-pose-1'],
  waiting: ['waiting-pose-1'],
  positive: ['positive-pose-1'],
  negative: ['negative-pose-1'],
  resting: ['resting-pose-1'],
  active: ['active-pose-1', 'active-pose-2'],
};

interface ActiveStateRotation {
  readonly animations: readonly string[];
  readonly pose: string;
}

// D2: ventana de 3-sobre-5 animaciones + pose alternada, para que los 5 estados del mood active no se vean identicos.
export const ACTIVE_STATE_ROTATION: Readonly<
  Record<string, ActiveStateRotation>
> = {
  thinking: {
    animations: [
      'active-animation-1',
      'active-animation-2',
      'active-animation-3',
    ],
    pose: 'active-pose-1',
  },
  reading: {
    animations: [
      'active-animation-2',
      'active-animation-3',
      'active-animation-4',
    ],
    pose: 'active-pose-2',
  },
  coding: {
    animations: [
      'active-animation-3',
      'active-animation-4',
      'active-animation-5',
    ],
    pose: 'active-pose-1',
  },
  executing: {
    animations: [
      'active-animation-4',
      'active-animation-5',
      'active-animation-1',
    ],
    pose: 'active-pose-2',
  },
  speaking: {
    animations: [
      'active-animation-5',
      'active-animation-1',
      'active-animation-2',
    ],
    pose: 'active-pose-1',
  },
};

export function animationPoolForState(state: string): readonly string[] {
  const rotation = ACTIVE_STATE_ROTATION[state];
  if (rotation) return rotation.animations;
  return MOOD_ANIMATION_POOLS[resolveMood(state)] ?? [];
}

export function poseForState(state: string): string | undefined {
  const rotation = ACTIVE_STATE_ROTATION[state];
  if (rotation) return rotation.pose;
  return MOOD_POSE_POOLS[resolveMood(state)]?.[0];
}

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as THREE from 'three';
import { VRMUtils, type VRM } from '@pixiv/three-vrm';
import { setupVrmScene, loadVrmModel, CAMERA_FOV_DEG } from '../vrm-scene';
import { computeFramingDistance } from '../vrm-camera-framing';
import { resolveClip, type ClipCache } from '../vrm-clip-resolver';
import type { AvatarSnapshot } from '../avatar-controller';
import { errorMessage } from '../error-message';
import { resolveMood } from '../avatar-face-presentation';
import {
  resolveBlinkIntervalMs,
  resolveSupportedVrmExpression,
} from '../vrm-expression-mapping';
import {
  advanceAnimationPool,
  createAnimationPoolState,
  type AnimationPoolState,
} from '../avatar-animation-pool';
import {
  advancePoseTimer,
  createPoseTimerState,
  isPoseActive,
  needsAdditiveBlend,
  type PoseTimerState,
} from '../avatar-pose-timer';
import {
  DEFAULT_TRANSITION_DURATION_MS,
  decideTransition,
} from '../avatar-transition';

const props = defineProps<{
  modelUrl: string;
  snapshot: AvatarSnapshot;
  mouthOpen?: boolean;
  // Cada entrada es id de catalogo procedural o URL .vrma; resolveClip() distingue cual.
  animationPoolUrls?: string[];
  poseUrl?: string;
  transitionDurationMs?: number;
  // AC-083/AC-084: vista previa de una animacion puntual del pool, distinta del ciclo automatico. previewNonce cambia en cada click (incluso repitiendo el mismo id) para poder reiniciarla desde el frame 0.
  previewClipId?: string;
  previewNonce?: number;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const loadError = ref<string | null>(null);
const isLoading = ref(true);

const BLINK_DURATION_MS = 180;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let vrm: VRM | null = null;
let clock: THREE.Clock | null = null;
let animationFrameId: number | null = null;
let blinkElapsedMs = 0;
let blinkPhaseMs: number | null = null;
let modelBox: THREE.Box3 | null = null;
let lastRawChestHeight: number | null = null;
let chestUpFrame: {
  center: THREE.Vector3;
  width: number;
  height: number;
} | null = null;
// Del pecho hacia arriba, no cuerpo completo (correccion 2026-09-06 sobre H5): ancho relativo al alto del encuadre -- no al ancho de la malla completa, que en T-pose/brazos abiertos exagera el ancho real de un plano de busto.
const CHEST_UP_WIDTH_TO_HEIGHT_RATIO = 1.0;
// Salvaguarda contra un rawHeight casi nulo (chest casi pegado al tope de la malla), no un valor tipico esperado (hallazgo real H23: 0.45 quedaba por ENCIMA de la proporcion real pecho-a-cabeza de un modelo humanoide normal -- 0.37 medido en vivo -- asi que la salvaguarda sustituia siempre el calculo correcto y encuadraba desde la cadera).
const CHEST_UP_MIN_HEIGHT_RATIO = 0.2;
let resizeObserver: ResizeObserver | null = null;
// Frontal, sin inclinacion vertical (hallazgo real H23): el angulo anterior copiaba `camera.position` de `vrm-scene.ts` (0, 1.35, 1.6), pensado para una camara a altura de pecho mirando HACIA ABAJO a un personaje de cuerpo completo parado en el suelo (~40 grados) -- al apuntar ahora a un objetivo que YA esta a la altura del pecho, ese mismo angulo miraba hacia abajo desde encima de la cabeza, no de frente.
const CAMERA_VIEW_DIRECTION = new THREE.Vector3(0, 0, 1);

let mixer: THREE.AnimationMixer | null = null;
// Key `procedural:${id}` evita colision con URLs .vrma cacheadas en el mismo mapa.
let clipCache: ClipCache = new Map();
let animationPoolState: AnimationPoolState = createAnimationPoolState([]);
let poseTimerState: PoseTimerState = createPoseTimerState();
let animationAction: THREE.AnimationAction | null = null;
let poseAction: THREE.AnimationAction | null = null;
// Desregistrar del mixer al parar, o se acumula un clon por cada disparo de pose.
let poseAdditiveClip: THREE.AnimationClip | null = null;
let playingAnimationUrl: string | null = null;
let playingPoseUrl: string | null = null;
let loadingAnimationUrl: string | null = null;
let loadingPoseUrl: string | null = null;
// Invalida cargas en vuelo que ya no aplican al cambiar de estado.
let bodyStateGeneration = 0;

function setupScene(canvas: HTMLCanvasElement): void {
  const setup = setupVrmScene(canvas);
  renderer = setup.renderer;
  scene = setup.scene;
  camera = setup.camera;
  clock = setup.clock;
}

// El hueso 'chest' es casi inmune a la pose de los brazos: mucho mas estable que la malla completa, que en T-pose/brazos abiertos exagera el ancho real de un plano de busto. El tope usa la malla real (modelBox.max.y), no un margen sobre 'head': asi el pelo, moños, cuernos o antenas que sobresalen del hueso nunca quedan cortados.
function computeChestUpFrame(
  box: THREE.Box3,
): { center: THREE.Vector3; width: number; height: number } | null {
  if (!vrm?.humanoid) return null;
  const chestNode = vrm.humanoid.getRawBoneNode('chest' as any);
  if (!chestNode) return null;
  const chestPos = chestNode.getWorldPosition(new THREE.Vector3());
  const topY = box.max.y;
  const rawHeight = topY - chestPos.y;
  lastRawChestHeight = rawHeight;
  if (rawHeight <= 0) return null;
  const minHeight =
    box.getSize(new THREE.Vector3()).y * CHEST_UP_MIN_HEIGHT_RATIO;
  const height = Math.max(rawHeight, minHeight);
  const bottomY = topY - height;
  return {
    center: new THREE.Vector3(chestPos.x, (topY + bottomY) / 2, chestPos.z),
    width: height * CHEST_UP_WIDTH_TO_HEIGHT_RATIO,
    height,
  };
}

async function loadModel(url: string): Promise<void> {
  if (!scene) return;
  vrm = await loadVrmModel(scene, url);
  // VRMHumanoid.update() pisa los huesos raw que anima el mixer con la pose normalizada (sin tocar) en cada frame; desactivarlo es seguro, nada en el proyecto lee huesos normalizados.
  if (vrm.humanoid) vrm.humanoid.autoUpdateHumanBones = false;
  mixer = new THREE.AnimationMixer(vrm.scene);
  // Calculada una vez por modelo (D4): recalcularla en cada resize seria trabajo repetido sobre una malla que no cambia. Se conserva como respaldo (profundidad, y personajes sin humanoid completo).
  modelBox = new THREE.Box3().setFromObject(vrm.scene);
  chestUpFrame = computeChestUpFrame(modelBox);
}

// Del pecho hacia arriba (correccion 2026-09-06 sobre D4): mantiene el angulo de camara original, ajusta distancia/objetivo al busto real y al aspecto real del contenedor ("contain" -- el eje que restringe toca los bordes, el otro deja aire). Cae a cuerpo completo solo si el personaje no tiene humanoid (Live2D u otro, fuera de alcance actual).
function applyFraming(): void {
  const canvas = canvasRef.value;
  if (!canvas || !camera || !modelBox) return;
  const { clientWidth, clientHeight } = canvas;
  if (clientWidth === 0 || clientHeight === 0) return;
  const depth = modelBox.getSize(new THREE.Vector3()).z;
  const frame = chestUpFrame ?? {
    center: modelBox.getCenter(new THREE.Vector3()),
    width: modelBox.getSize(new THREE.Vector3()).x,
    height: modelBox.getSize(new THREE.Vector3()).y,
  };
  const aspect = clientWidth / clientHeight;
  const distance = computeFramingDistance(
    { width: frame.width, height: frame.height, depth },
    aspect,
    CAMERA_FOV_DEG,
  );
  camera.position
    .copy(frame.center)
    .addScaledVector(CAMERA_VIEW_DIRECTION, distance);
  camera.lookAt(frame.center);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

function stopPoseAction(): void {
  poseAction?.stop();
  poseAction = null;
  playingPoseUrl = null;
  loadingPoseUrl = null;
  if (poseAdditiveClip) mixer?.uncacheClip(poseAdditiveClip);
  poseAdditiveClip = null;
}

function stopBodyActions(): void {
  animationAction?.stop();
  animationAction = null;
  playingAnimationUrl = null;
  loadingAnimationUrl = null;
  stopPoseAction();
}

// D5 (H6): elegir lo nuevo ya no mata lo viejo -- la saliente sigue viva para que crossFadeOrStop la funda, no reciba null.
function resetBodyAnimationState(): void {
  bodyStateGeneration += 1;
  animationPoolState = createAnimationPoolState(props.animationPoolUrls ?? []);
  poseTimerState = createPoseTimerState();
  if (props.poseUrl) {
    void ensurePoseAction(props.poseUrl);
  } else if (poseAction) {
    stopPoseAction();
  }
}

watch(() => props.snapshot.state, resetBodyAnimationState);

// Compartido con AnimationTimelineEditor.vue (H7): resuelve un id de catalogo procedural o una URL .vrma contra el VRM cargado.
async function resolveClipForActiveVrm(
  idOrUrl: string,
): Promise<THREE.AnimationClip | null> {
  if (!vrm) return null;
  return resolveClip(vrm, idOrUrl, clipCache);
}

// crossFadeTo funde pesos entre 2 acciones ya en .play(): no arranca la entrante por si solo.
function crossFadeOrStop(
  previousAction: THREE.AnimationAction | null,
  nextAction: THREE.AnimationAction,
): void {
  const durationSeconds =
    (props.transitionDurationMs ?? DEFAULT_TRANSITION_DURATION_MS) / 1000;
  const decision = decideTransition(previousAction !== null, durationSeconds);
  if (decision === 'crossfade' && previousAction) {
    previousAction.crossFadeTo(nextAction, durationSeconds, false);
    return;
  }
  if (decision === 'stop-immediately') previousAction?.stop();
}

async function ensureAnimationAction(url: string): Promise<void> {
  if (playingAnimationUrl === url || loadingAnimationUrl === url) return;
  loadingAnimationUrl = url;
  const generation = bodyStateGeneration;
  const clip = await resolveClipForActiveVrm(url);
  loadingAnimationUrl = null;
  if (generation !== bodyStateGeneration || !mixer || !clip) return;
  const previousAction = animationAction;
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.reset();
  action.play();
  crossFadeOrStop(previousAction, action);
  animationAction = action;
  playingAnimationUrl = url;
}

// AC-083/AC-084: a diferencia de ensureAnimationAction, siempre reinicia -- incluso si `url` ya es la que suena, para que "Ejecutar" dos veces sobre la misma anime la reinicie desde el frame 0.
async function playPreviewClip(url: string): Promise<void> {
  loadingAnimationUrl = url;
  const generation = bodyStateGeneration;
  const clip = await resolveClipForActiveVrm(url);
  loadingAnimationUrl = null;
  if (generation !== bodyStateGeneration || !mixer || !clip) return;
  const isSameClip = playingAnimationUrl === url;
  const previousAction = isSameClip ? null : animationAction;
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.reset();
  action.play();
  crossFadeOrStop(previousAction, action);
  animationAction = action;
  playingAnimationUrl = url;
  // Sin esto, updateBodyAnimation() ve currentUrl (el del pool) != playingAnimationUrl (la vista previa) en el siguiente frame y la pisa de inmediato con ensureAnimationAction(currentUrl).
  animationPoolState = { ...animationPoolState, currentId: url };
}

watch(
  () => props.previewNonce,
  () => {
    if (props.previewClipId) void playPreviewClip(props.previewClipId);
  },
);

// makeClipAdditive() sin referenceClip resta el frame 0 del propio clip: en una pose (dos muestras identicas, ver POSE_HOLD_DURATION_SECONDS) eso da delta identidad siempre. Referencia en identidad para que el delta sea la rotacion completa de la pose.
function identityReferenceClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.map(
    (track) => new THREE.QuaternionKeyframeTrack(track.name, [0], [0, 0, 0, 1]),
  );
  return new THREE.AnimationClip('identity-reference', clip.duration, tracks);
}

// 1.5: aditivo solo si la pose comparte hueso con la animacion de fondo en curso (D4/ADR-0012).
async function ensurePoseAction(url: string): Promise<void> {
  if (playingPoseUrl === url || loadingPoseUrl === url) return;
  loadingPoseUrl = url;
  const generation = bodyStateGeneration;
  const clip = await resolveClipForActiveVrm(url);
  loadingPoseUrl = null;
  if (generation !== bodyStateGeneration || !mixer || !clip) return;
  const backgroundTrackNames =
    animationAction?.getClip().tracks.map((track) => track.name) ?? [];
  const poseTrackNames = clip.tracks.map((track) => track.name);
  const isAdditive = needsAdditiveBlend(backgroundTrackNames, poseTrackNames);
  // clone(): makeClipAdditive() muta in-place, y el clip cacheado debe quedar intacto.
  const finalClip = isAdditive
    ? THREE.AnimationUtils.makeClipAdditive(
        clip.clone(),
        0,
        identityReferenceClip(clip),
      )
    : clip;
  const previousAction = poseAction;
  const action = mixer.clipAction(finalClip);
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.reset();
  action.play();
  crossFadeOrStop(previousAction, action);
  poseAction = action;
  playingPoseUrl = url;
  poseAdditiveClip = isAdditive ? finalClip : null;
}

function updateBodyAnimation(deltaMs: number): void {
  if (!mixer) return;
  animationPoolState = advanceAnimationPool(
    { ...animationPoolState, pool: props.animationPoolUrls ?? [] },
    deltaMs,
  );
  const currentUrl = animationPoolState.currentId;
  if (currentUrl && currentUrl !== playingAnimationUrl) {
    void ensureAnimationAction(currentUrl);
  }
  if (!currentUrl && animationAction) {
    animationAction.stop();
    animationAction = null;
    playingAnimationUrl = null;
  }

  const poseUrl = props.poseUrl;
  poseTimerState = advancePoseTimer(poseTimerState, deltaMs, Boolean(poseUrl));
  if (isPoseActive(poseTimerState) && poseUrl && !poseAction) {
    void ensurePoseAction(poseUrl);
  }
}

function applyExpression(): void {
  if (!vrm?.expressionManager) return;
  const manager = vrm.expressionManager;
  const available = manager.expressions.map((item) => item.expressionName);
  const resolved = resolveSupportedVrmExpression(
    props.snapshot.expression,
    available,
  );
  available
    .filter((name) => name !== 'blink' && name !== 'aa')
    .forEach((name) => manager.setValue(name, 0));
  if (resolved) manager.setValue(resolved, 1);
  manager.setValue('aa', props.mouthOpen ? 1 : 0);
}

function blinkWeightForPhase(phaseMs: number): number {
  const half = BLINK_DURATION_MS / 2;
  if (phaseMs < half) return phaseMs / half;
  return Math.max(0, 1 - (phaseMs - half) / half);
}

function updateBlink(deltaMs: number): void {
  const manager = vrm?.expressionManager;
  if (!manager) return;
  if (blinkPhaseMs !== null) {
    blinkPhaseMs += deltaMs;
    manager.setValue('blink', blinkWeightForPhase(blinkPhaseMs));
    if (blinkPhaseMs >= BLINK_DURATION_MS) blinkPhaseMs = null;
    return;
  }
  blinkElapsedMs += deltaMs;
  const interval = resolveBlinkIntervalMs(resolveMood(props.snapshot.state));
  if (blinkElapsedMs < interval) return;
  blinkElapsedMs = 0;
  blinkPhaseMs = 0;
}

function tick(): void {
  animationFrameId = requestAnimationFrame(tick);
  const delta = clock?.getDelta() ?? 0;
  applyExpression();
  updateBlink(delta * 1000);
  updateBodyAnimation(delta * 1000);
  mixer?.update(delta);
  vrm?.update(delta);
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function resizeToContainer(): void {
  const canvas = canvasRef.value;
  if (!canvas || !renderer) return;
  const { clientWidth, clientHeight } = canvas;
  if (clientWidth === 0 || clientHeight === 0) return;
  renderer.setSize(clientWidth, clientHeight, false);
  applyFraming();
}

async function swapModel(url: string): Promise<void> {
  if (!scene) return;
  isLoading.value = true;
  loadError.value = null;
  try {
    if (vrm) {
      scene.remove(vrm.scene);
      VRMUtils.deepDispose(vrm.scene);
      vrm = null;
      mixer = null;
      clipCache = new Map();
      // D7: sin esto, ensureAnimationAction/ensurePoseAction ven el mismo url que antes y no reconstruyen la accion sobre el mixer nuevo.
      animationAction = null;
      playingAnimationUrl = null;
      poseAction = null;
      playingPoseUrl = null;
    }
    await loadModel(url);
    applyExpression();
    resetBodyAnimationState();
    resizeToContainer();
  } catch (error) {
    loadError.value = errorMessage(error);
    console.error('[avatar-vrm] fallo aislado al cargar el modelo:', error);
  } finally {
    isLoading.value = false;
  }
}

watch(() => props.modelUrl, swapModel);

async function initialize(): Promise<void> {
  const canvas = canvasRef.value;
  if (!canvas) return;
  try {
    setupScene(canvas);
    await loadModel(props.modelUrl);
    applyExpression();
    resetBodyAnimationState();
    resizeToContainer();
    resizeObserver = new ResizeObserver(() => resizeToContainer());
    resizeObserver.observe(canvas);
    tick();
    (window as any).__debugAvatarState = () => ({
      animationPoolUrls: props.animationPoolUrls,
      playingAnimationUrl,
      hasAction: !!animationAction,
      actionRunning: animationAction?.isRunning(),
      actionTime: animationAction?.time,
      actionWeight: animationAction?.getEffectiveWeight(),
      headQuat: vrm?.humanoid
        ?.getRawBoneNode('head' as any)
        ?.quaternion.toArray(),
      poseUrl: props.poseUrl,
      hasPoseAction: !!poseAction,
      poseActionRunning: poseAction?.isRunning(),
      poseActionTime: poseAction?.time,
      leftUpperArmQuat: vrm?.humanoid
        ?.getRawBoneNode('leftUpperArm' as any)
        ?.quaternion.toArray(),
      rightUpperArmQuat: vrm?.humanoid
        ?.getRawBoneNode('rightUpperArm' as any)
        ?.quaternion.toArray(),
      modelBoxSize: modelBox?.getSize(new THREE.Vector3()).toArray(),
      modelBoxMin: modelBox?.min.toArray(),
      modelBoxMax: modelBox?.max.toArray(),
      cameraPosition: camera?.position.toArray(),
      cameraFov: camera?.fov,
      cameraAspect: camera?.aspect,
      chestUpFrame: chestUpFrame
        ? {
            width: chestUpFrame.width,
            height: chestUpFrame.height,
            center: chestUpFrame.center.toArray(),
          }
        : null,
      lastRawChestHeight,
    });
  } catch (error) {
    loadError.value = errorMessage(error);
    console.error('[avatar-vrm] fallo aislado al cargar el modelo:', error);
  } finally {
    isLoading.value = false;
  }
}

function disposeScene(): void {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
  stopBodyActions();
  if (vrm) VRMUtils.deepDispose(vrm.scene);
  renderer?.dispose();
  renderer = null;
  scene = null;
  camera = null;
  clock = null;
  vrm = null;
  mixer = null;
  modelBox = null;
  chestUpFrame = null;
  clipCache = new Map();
  animationFrameId = null;
}

onMounted(initialize);
onBeforeUnmount(disposeScene);

// H3 (/clear) reutiliza este mismo re-arme para resetear el avatar sin duplicar la logica de D7.
defineExpose({ resetPoseForCurrentState: resetBodyAnimationState });
</script>

<template>
  <div class="vrm-avatar">
    <canvas ref="canvasRef" class="vrm-avatar__canvas" />
    <p
      v-if="isLoading && !loadError"
      class="vrm-avatar__status"
      aria-live="polite"
    >
      Cargando avatar…
    </p>
    <p v-if="loadError" class="vrm-avatar__error" aria-live="polite">
      Avatar VRM degradado: {{ loadError }}
    </p>
  </div>
</template>

<style scoped>
.vrm-avatar {
  position: relative;
  display: flex;
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  align-items: center;
  justify-content: center;
}

.vrm-avatar__canvas {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: var(--radius-lg);
}

.vrm-avatar__error,
.vrm-avatar__status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: var(--color-surface-base);
  backdrop-filter: blur(var(--blur-panel));
  border-radius: var(--radius-lg);
}

.vrm-avatar__error {
  font-size: var(--text-sm);
  color: var(--color-error);
}

.vrm-avatar__status {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { VRM } from '@pixiv/three-vrm';
import { getProject, type ISheet, type ISheetObject } from '@theatre/core';
import {
  setupVrmScene,
  loadVrmModel,
  observeVrmSceneResize,
} from '../vrm-scene';
import {
  resolveBoneNodeFromVrm,
  boneNameFromRawNodeName,
} from '../vrm-clip-retarget';
import { resolveClip, type ClipCache } from '../vrm-clip-resolver';
import { clipToKeyframes } from '../vrma-animation-import';
import {
  POSE_EDITOR_BONE_NAMES,
  type PoseEditorBoneName,
} from '../vrma-pose-export';
import {
  buildAnimationTracks,
  exportAnimationAsVrma,
} from '../vrma-animation-export';
import {
  keyframesForBone,
  removeKeyframe,
  upsertKeyframe,
  type BoneKeyframe,
} from '../animation-keyframe-list';
import IconGlyph from './IconGlyph.vue';
import {
  saveCreatedAnimationFile,
  type ImportedAnimationSummary,
} from '../animation-import';
import { errorMessage } from '../error-message';
import {
  MAX_ROTATION_DEGREES,
  MIN_ROTATION_DEGREES,
  clampRotationDegrees,
} from '../character-editor';

const props = defineProps<{
  modelUrl: string;
  // AC-085/AC-087: id/URL de la animacion a precargar en modo "editar"; ausente = editor en blanco (modo "nueva").
  editClipId?: string;
}>();
const emit = defineEmits<{
  saved: [summary: ImportedAnimationSummary];
  close: [];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const loadError = ref<string | null>(null);
const isLoading = ref(true);
// AC-087: si la animacion a editar no se puede leer, esto se llena y el template no muestra el editor -- un editor vacio que aparente ser la animacion haria perder el trabajo al guardar encima.
const editClipReadError = ref<string | null>(null);
const selectedBone = ref<PoseEditorBoneName>(POSE_EDITOR_BONE_NAMES[0]);
const keyframes = ref<BoneKeyframe[]>([]);
const currentTimeSeconds = ref(0);
const isLoopPreviewing = ref(false);
const previewError = ref<string | null>(null);
const isSaving = ref(false);
const saveError = ref<string | null>(null);
const keyframeActionError = ref<string | null>(null);
const selectedBoneRotationDeg = ref({ x: 0, y: 0, z: 0 });

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let clock: THREE.Clock | null = null;
let vrm: VRM | null = null;
let transformControls: TransformControls | null = null;
let orbitControls: OrbitControls | null = null;
let animationFrameId: number | null = null;
let stopResizeObserver: (() => void) | null = null;
let mixer: THREE.AnimationMixer | null = null;
const clipCache: ClipCache = new Map();
let previewClip: THREE.AnimationClip | null = null;
let previewAction: THREE.AnimationAction | null = null;
let theatreSheet: ISheet | null = null;
// Sheet object por hueso; la interpolacion real la hace AnimationMixer, no expuesta por @theatre/core sin @theatre/studio.
const theatreObjects = new Map<
  PoseEditorBoneName,
  ISheetObject<{ rotation: { x: number; y: number; z: number } }>
>();

function boneNode(name: PoseEditorBoneName): THREE.Object3D | null {
  if (!vrm) return null;
  return resolveBoneNodeFromVrm(vrm)(name);
}

function keyframeCountForBone(name: PoseEditorBoneName): number {
  return keyframesForBone(keyframes.value, name).length;
}

function keyframesForRow(name: PoseEditorBoneName): BoneKeyframe[] {
  return keyframesForBone(keyframes.value, name);
}

const selectedBoneKeyframes = computed(() =>
  keyframesForBone(keyframes.value, selectedBone.value),
);

const isSidePanelOpen = ref(false);

const hasKeyframeAtCurrentTime = computed(() =>
  selectedBoneKeyframes.value.some(
    (kf) => kf.timeSeconds === currentTimeSeconds.value,
  ),
);

// Unico lugar que fija el orden de ejes: lectura (syncTheatreFromLiveBone) y escritura (setBoneRotationAxis) lo comparten para no divergir.
const BONE_ROTATION_ORDER: THREE.EulerOrder = 'XYZ';

function syncTheatreFromLiveBone(): void {
  const node = boneNode(selectedBone.value);
  const theatreObject = theatreObjects.get(selectedBone.value);
  if (!node || !theatreObject) return;
  const euler = new THREE.Euler().setFromQuaternion(
    node.quaternion,
    BONE_ROTATION_ORDER,
  );
  const rotationDeg = {
    x: THREE.MathUtils.radToDeg(euler.x),
    y: THREE.MathUtils.radToDeg(euler.y),
    z: THREE.MathUtils.radToDeg(euler.z),
  };
  theatreObject.initialValue = { rotation: rotationDeg };
  selectedBoneRotationDeg.value = theatreObject.value.rotation;
}

function setBoneRotationAxis(axis: 'x' | 'y' | 'z', degrees: number): void {
  selectedBoneRotationDeg.value = {
    ...selectedBoneRotationDeg.value,
    [axis]: clampRotationDegrees(degrees),
  };
  const node = boneNode(selectedBone.value);
  if (!node) return;
  const { x, y, z } = selectedBoneRotationDeg.value;
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(x),
    THREE.MathUtils.degToRad(y),
    THREE.MathUtils.degToRad(z),
    BONE_ROTATION_ORDER,
  );
  node.quaternion.setFromEuler(euler);
  const theatreObject = theatreObjects.get(selectedBone.value);
  if (theatreObject) {
    theatreObject.initialValue = { rotation: selectedBoneRotationDeg.value };
  }
}

function attachGizmoToSelectedBone(): void {
  const node = boneNode(selectedBone.value);
  if (!node || !transformControls) return;
  transformControls.attach(node);
}

function selectBone(name: PoseEditorBoneName): void {
  selectedBone.value = name;
  attachGizmoToSelectedBone();
  syncTheatreFromLiveBone();
}

function threeTrackForBone(
  track: ReturnType<typeof buildAnimationTracks>[number],
): THREE.QuaternionKeyframeTrack | null {
  const node = boneNode(track.boneName);
  if (!node) return null;
  const values = new Float32Array(track.quaternions.length * 4);
  track.quaternions.forEach((quaternion, index) =>
    values.set(quaternion, index * 4),
  );
  return new THREE.QuaternionKeyframeTrack(
    `${node.name}.quaternion`,
    [...track.times],
    Array.from(values),
  );
}

// Reconstruye el clip de previsualizacion desde los keyframes actuales; el AnimationMixer resuelve la interpolacion real (Hito 1).
function rebuildPreviewAction(): void {
  if (!vrm || !mixer) return;
  previewAction?.stop();
  if (previewClip) mixer.uncacheClip(previewClip);
  previewAction = null;
  previewClip = null;
  const tracks = buildAnimationTracks(keyframes.value)
    .map(threeTrackForBone)
    .filter((track): track is THREE.QuaternionKeyframeTrack => track !== null);
  if (tracks.length === 0) return;
  const duration = Math.max(
    ...tracks.map((track) => track.times[track.times.length - 1]),
  );
  previewClip = new THREE.AnimationClip('preview', duration, tracks);
  previewAction = mixer.clipAction(previewClip);
  previewAction.play();
  previewAction.paused = true;
  scrubToCurrentTime();
}

function scrubToCurrentTime(): void {
  if (!previewAction || !mixer) return;
  previewAction.time = currentTimeSeconds.value;
  mixer.update(0);
  syncTheatreFromLiveBone();
}

function setCurrentTime(value: number): void {
  currentTimeSeconds.value = Math.max(0, Math.round(value * 10) / 10);
  scrubToCurrentTime();
}

const trackRef = ref<HTMLDivElement | null>(null);
const draggingBoneName = ref<string | null>(null);
const draggingOriginalTime = ref<number | null>(null);
const draggingLiveTime = ref<number | null>(null);

const timelineDurationSeconds = computed(() =>
  Math.max(
    5,
    currentTimeSeconds.value + 1,
    ...keyframes.value.map((kf) => kf.timeSeconds + 1),
  ),
);

const playheadPercent = computed(
  () => (currentTimeSeconds.value / timelineDurationSeconds.value) * 100,
);

function timeFromClientX(clientX: number): number {
  const track = trackRef.value;
  if (!track) return currentTimeSeconds.value;
  const rect = track.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return Math.round(ratio * timelineDurationSeconds.value * 10) / 10;
}

function onRulerClick(event: MouseEvent): void {
  setCurrentTime(timeFromClientX(event.clientX));
}

const NEW_KEYFRAME_SNAP_SECONDS = 0.15;

// Clic en un tramo vacio de la fila de un hueso: lo selecciona, ubica el tiempo, y captura su rotacion actual como keyframe ahi mismo — sin boton aparte.
function onRowTrackClick(
  event: MouseEvent,
  boneName: PoseEditorBoneName,
): void {
  const time = timeFromClientX(event.clientX);
  selectBone(boneName);
  const existing = keyframesForRow(boneName).find(
    (kf) => Math.abs(kf.timeSeconds - time) < NEW_KEYFRAME_SNAP_SECONDS,
  );
  if (existing) {
    setCurrentTime(existing.timeSeconds);
    return;
  }
  const node = boneNode(boneName);
  if (!node) return;
  setCurrentTime(time);
  keyframes.value = upsertKeyframe(keyframes.value, {
    boneName,
    timeSeconds: currentTimeSeconds.value,
    quaternion: [
      node.quaternion.x,
      node.quaternion.y,
      node.quaternion.z,
      node.quaternion.w,
    ],
  });
  rebuildPreviewAction();
}

function markerPercent(kf: BoneKeyframe): number {
  const isDragged =
    draggingBoneName.value === kf.boneName &&
    draggingOriginalTime.value === kf.timeSeconds;
  const time =
    isDragged && draggingLiveTime.value !== null
      ? draggingLiveTime.value
      : kf.timeSeconds;
  return (time / timelineDurationSeconds.value) * 100;
}

function resetDragState(): void {
  draggingBoneName.value = null;
  draggingOriginalTime.value = null;
  draggingLiveTime.value = null;
}

function onMarkerPointerDown(event: PointerEvent, kf: BoneKeyframe): void {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  selectBone(kf.boneName as PoseEditorBoneName);
  draggingBoneName.value = kf.boneName;
  draggingOriginalTime.value = kf.timeSeconds;
  draggingLiveTime.value = kf.timeSeconds;
}

function onMarkerPointerMove(event: PointerEvent): void {
  if (draggingOriginalTime.value === null) return;
  draggingLiveTime.value = timeFromClientX(event.clientX);
}

// Suelta el gizmo del keyframe: reescribe su tiempo (quitar+agregar, animation-keyframe-list.ts ya ordena) en vez de mutar in-place.
function onMarkerPointerUp(): void {
  const boneName = draggingBoneName.value;
  const originalTime = draggingOriginalTime.value;
  const newTime = draggingLiveTime.value;
  resetDragState();
  if (boneName === null || originalTime === null || newTime === null) return;
  if (newTime === originalTime) {
    setCurrentTime(originalTime);
    return;
  }
  const kf = keyframesForBone(keyframes.value, boneName).find(
    (entry) => entry.timeSeconds === originalTime,
  );
  if (!kf) return;
  keyframes.value = removeKeyframe(keyframes.value, boneName, originalTime);
  keyframes.value = upsertKeyframe(keyframes.value, {
    ...kf,
    timeSeconds: newTime,
  });
  setCurrentTime(newTime);
  rebuildPreviewAction();
}

function addKeyframeAtCurrentTime(): void {
  const node = boneNode(selectedBone.value);
  if (!node) {
    keyframeActionError.value =
      'No se pudo ubicar el hueso seleccionado en el modelo.';
    return;
  }
  keyframeActionError.value = null;
  keyframes.value = upsertKeyframe(keyframes.value, {
    boneName: selectedBone.value,
    timeSeconds: currentTimeSeconds.value,
    quaternion: [
      node.quaternion.x,
      node.quaternion.y,
      node.quaternion.z,
      node.quaternion.w,
    ],
  });
  rebuildPreviewAction();
}

function removeKeyframeAt(
  boneName: PoseEditorBoneName,
  timeSeconds: number,
): void {
  keyframes.value = removeKeyframe(keyframes.value, boneName, timeSeconds);
  rebuildPreviewAction();
}

function startLoopPreview(): void {
  if (!previewAction) rebuildPreviewAction();
  if (!previewAction) {
    previewError.value = 'Agrega al menos un keyframe antes de previsualizar.';
    return;
  }
  previewError.value = null;
  previewAction.setLoop(THREE.LoopRepeat, Infinity);
  previewAction.paused = false;
  isLoopPreviewing.value = true;
}

function stopLoopPreview(): void {
  if (previewAction) {
    previewAction.paused = true;
    previewAction.setLoop(THREE.LoopOnce, 1);
  }
  isLoopPreviewing.value = false;
  scrubToCurrentTime();
}

function tick(): void {
  animationFrameId = requestAnimationFrame(tick);
  orbitControls?.update();
  const deltaSeconds = clock?.getDelta() ?? 0;
  if (isLoopPreviewing.value) {
    mixer?.update(deltaSeconds);
    syncTheatreFromLiveBone();
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function ensureTheatreObjects(): void {
  const project = getProject('Codetuver Avatar Timeline Editor');
  theatreSheet = project.sheet('Bone Rotations');
  POSE_EDITOR_BONE_NAMES.forEach((boneName) => {
    theatreObjects.set(
      boneName,
      theatreSheet!.object(boneName, { rotation: { x: 0, y: 0, z: 0 } }),
    );
  });
}

async function initialize(): Promise<void> {
  const canvas = canvasRef.value;
  if (!canvas) return;
  try {
    const setup = setupVrmScene(canvas);
    renderer = setup.renderer;
    scene = setup.scene;
    camera = setup.camera;
    clock = setup.clock;
    stopResizeObserver = observeVrmSceneResize(setup, canvas);
    vrm = await loadVrmModel(scene, props.modelUrl);
    mixer = new THREE.AnimationMixer(vrm.scene);
    if (props.editClipId) {
      const clip = await resolveClip(vrm, props.editClipId, clipCache);
      if (!clip) {
        editClipReadError.value = `No se pudo leer la animacion "${props.editClipId}".`;
      } else {
        const result = clipToKeyframes(clip, boneNameFromRawNodeName(vrm));
        if ('error' in result) {
          editClipReadError.value = result.error;
        } else {
          keyframes.value = result;
        }
      }
    }
    ensureTheatreObjects();
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.target.set(0, 1.0, 0);
    orbitControls.enablePan = false;
    transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setMode('rotate');
    transformControls.addEventListener('objectChange', syncTheatreFromLiveBone);
    transformControls.addEventListener('dragging-changed', (event) => {
      if (orbitControls) orbitControls.enabled = !event.value;
    });
    scene.add(transformControls.getHelper());
    attachGizmoToSelectedBone();
    syncTheatreFromLiveBone();
    tick();
    (window as any).__debugSetBoneRotation = (
      boneName: PoseEditorBoneName,
      degX: number,
      degY: number,
      degZ: number,
    ) => {
      const node = boneNode(boneName);
      if (!node) return;
      node.quaternion.setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(degX),
          THREE.MathUtils.degToRad(degY),
          THREE.MathUtils.degToRad(degZ),
        ),
      );
      if (boneName === selectedBone.value) syncTheatreFromLiveBone();
    };
    (window as any).__debugAnimationEditorState = () => ({
      selectedBone: selectedBone.value,
      rotationDeg: selectedBoneRotationDeg.value,
      boneQuaternion: boneNode(selectedBone.value)?.quaternion.toArray(),
      keyframeCount: selectedBoneKeyframes.value.length,
      editClipId: props.editClipId,
      totalKeyframeCount: keyframes.value.length,
      editClipReadError: editClipReadError.value,
    });
    (window as any).__debugExportAnimationBlobUrl = () => {
      const bytes = exportAnimationAsVrma(keyframes.value);
      if (!bytes) return null;
      const url = URL.createObjectURL(
        new Blob([bytes], { type: 'model/gltf-binary' }),
      );
      (window as any).__lastExportedBlobUrl = url;
      return url;
    };
  } catch (error) {
    loadError.value = errorMessage(error);
    console.error(
      '[animation-timeline-editor] fallo aislado al cargar el modelo:',
      error,
    );
  } finally {
    isLoading.value = false;
  }
}

function disposeScene(): void {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
  stopResizeObserver?.();
  previewAction?.stop();
  if (previewClip) mixer?.uncacheClip(previewClip);
  transformControls?.dispose();
  orbitControls?.dispose();
  renderer?.dispose();
  POSE_EDITOR_BONE_NAMES.forEach((boneName) =>
    theatreSheet?.detachObject(boneName),
  );
  theatreObjects.clear();
  theatreSheet = null;
  renderer = null;
  scene = null;
  camera = null;
  clock = null;
  vrm = null;
  mixer = null;
  transformControls = null;
  orbitControls = null;
  stopResizeObserver = null;
}

onMounted(initialize);
onBeforeUnmount(disposeScene);

async function saveAsAnimation(): Promise<void> {
  const bytes = exportAnimationAsVrma(keyframes.value);
  if (!bytes) {
    saveError.value = 'Agrega al menos un keyframe antes de guardar.';
    return;
  }
  isSaving.value = true;
  saveError.value = null;
  try {
    const fileName = `animation-${Date.now()}.vrma`;
    const summary = await saveCreatedAnimationFile(
      bytes,
      'animation',
      fileName,
    );
    emit('saved', summary);
  } catch (error) {
    saveError.value = errorMessage(error);
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div v-if="editClipReadError" class="animation-timeline-editor">
    <p class="session-panel__error" aria-live="polite">
      <IconGlyph name="error" />{{ editClipReadError }}
    </p>
    <button type="button" class="session-panel__button" @click="emit('close')">
      Cerrar
    </button>
  </div>
  <div v-else class="animation-timeline-editor">
    <div class="animation-timeline-editor__canvas-wrap">
      <canvas
        ref="canvasRef"
        class="animation-timeline-editor__canvas"
        aria-label="Vista 3D del personaje para grabar una secuencia de animacion"
        aria-describedby="animation-timeline-editor-hint"
      />
      <p
        v-if="isLoading && !loadError"
        class="animation-timeline-editor__status"
        aria-live="polite"
      >
        Cargando modelo…
      </p>
      <p
        v-if="loadError"
        class="animation-timeline-editor__error"
        aria-live="polite"
      >
        No se pudo cargar el modelo: {{ loadError }}
      </p>
      <p
        v-if="isLoopPreviewing"
        class="animation-timeline-editor__playing-badge"
        aria-live="polite"
      >
        Reproduciendo…
      </p>
    </div>

    <div class="animation-timeline-editor__toolbar">
      <span class="animation-timeline-editor__active-bone">{{
        selectedBone
      }}</span>
      <button
        type="button"
        class="animation-timeline-editor__icon-button"
        :disabled="isLoopPreviewing || isLoading"
        :aria-label="
          hasKeyframeAtCurrentTime
            ? 'Sobrescribir keyframe en el tiempo actual'
            : 'Agregar keyframe en el tiempo actual'
        "
        :title="
          hasKeyframeAtCurrentTime
            ? 'Sobrescribir keyframe en el tiempo actual'
            : 'Agregar keyframe en el tiempo actual'
        "
        @click="addKeyframeAtCurrentTime"
      >
        {{ hasKeyframeAtCurrentTime ? '⟳' : '+' }}
      </button>
      <button
        v-if="!isLoopPreviewing"
        type="button"
        class="animation-timeline-editor__icon-button"
        aria-label="Previsualizar en bucle"
        title="Previsualizar en bucle"
        @click="startLoopPreview"
      >
        ▶
      </button>
      <button
        v-else
        type="button"
        class="animation-timeline-editor__icon-button"
        aria-label="Detener previsualizacion"
        title="Detener previsualizacion"
        aria-pressed="true"
        @click="stopLoopPreview"
      >
        ⏸
      </button>
      <button
        type="button"
        class="animation-timeline-editor__icon-button"
        :class="{
          'animation-timeline-editor__icon-button--active': isSidePanelOpen,
        }"
        :aria-expanded="isSidePanelOpen"
        aria-controls="animation-timeline-editor-side-panel"
        aria-label="Opciones"
        title="Opciones"
        @click="isSidePanelOpen = !isSidePanelOpen"
      >
        ⚙
      </button>
      <span class="animation-timeline-editor__toolbar-spacer" />
      <button
        type="button"
        class="session-panel__button"
        :disabled="isSaving"
        @click="saveAsAnimation"
      >
        {{ isSaving ? 'Guardando...' : 'Guardar' }}
      </button>
      <button
        type="button"
        class="session-panel__button"
        @click="emit('close')"
      >
        Cerrar
      </button>
    </div>

    <p v-if="previewError" class="session-panel__error" aria-live="polite">
      <IconGlyph name="error" />{{ previewError }}
    </p>
    <p
      v-if="keyframeActionError"
      class="session-panel__error"
      aria-live="polite"
    >
      <IconGlyph name="error" />{{ keyframeActionError }}
    </p>
    <p v-if="saveError" class="session-panel__error" aria-live="polite">
      <IconGlyph name="error" />{{ saveError }}
    </p>

    <p
      id="animation-timeline-editor-hint"
      class="animation-timeline-editor__hint"
    >
      Clic en la fila de un hueso para seleccionarlo. Arrastra el modelo 3D o
      escribe los grados en Opciones para posarlo. Usa "+" para capturar un
      keyframe en el tiempo actual. Arrastra un keyframe para moverlo en el
      tiempo, doble clic para quitarlo.
    </p>

    <div class="animation-timeline-editor__body">
      <div class="animation-timeline-editor__dopesheet">
        <div class="animation-timeline-editor__ruler">
          <div class="animation-timeline-editor__ruler-spacer" />
          <div
            ref="trackRef"
            class="animation-timeline-editor__ruler-track"
            role="slider"
            tabindex="0"
            aria-label="Linea de tiempo, clic o flechas para ubicar el tiempo actual"
            :aria-valuemin="0"
            :aria-valuemax="timelineDurationSeconds"
            :aria-valuenow="currentTimeSeconds"
            @click="onRulerClick"
            @keydown.left.prevent="setCurrentTime(currentTimeSeconds - 0.1)"
            @keydown.right.prevent="setCurrentTime(currentTimeSeconds + 0.1)"
          >
            <span
              class="animation-timeline-editor__ruler-label animation-timeline-editor__ruler-label--start"
              >0s</span
            >
            <span
              class="animation-timeline-editor__ruler-label animation-timeline-editor__ruler-label--end"
              >{{ timelineDurationSeconds.toFixed(1) }}s</span
            >
          </div>
        </div>
        <div class="animation-timeline-editor__rows-wrap">
          <div class="animation-timeline-editor__playhead-overlay">
            <div
              class="animation-timeline-editor__playhead"
              :style="{ left: playheadPercent + '%' }"
            />
          </div>
          <div class="animation-timeline-editor__rows">
            <template v-for="bone in POSE_EDITOR_BONE_NAMES" :key="bone">
              <button
                type="button"
                class="animation-timeline-editor__row-label"
                :class="{
                  'animation-timeline-editor__row-label--active':
                    bone === selectedBone,
                }"
                @click="selectBone(bone)"
              >
                <span class="animation-timeline-editor__row-bone-name">{{
                  bone
                }}</span>
                <span class="animation-timeline-editor__row-count"
                  >({{ keyframeCountForBone(bone) }})</span
                >
              </button>
              <div
                class="animation-timeline-editor__row-track"
                @click="onRowTrackClick($event, bone)"
              >
                <button
                  v-for="kf in keyframesForRow(bone)"
                  :key="kf.timeSeconds"
                  type="button"
                  class="animation-timeline-editor__marker"
                  :class="{
                    'animation-timeline-editor__marker--current':
                      kf.timeSeconds === currentTimeSeconds &&
                      bone === selectedBone &&
                      draggingOriginalTime === null,
                  }"
                  :style="{ left: markerPercent(kf) + '%' }"
                  :title="`${kf.timeSeconds}s`"
                  :aria-label="`Keyframe de ${bone} en ${kf.timeSeconds}s — arrastra para mover, doble clic para quitar`"
                  @click.stop="setCurrentTime(kf.timeSeconds)"
                  @dblclick.stop="removeKeyframeAt(bone, kf.timeSeconds)"
                  @pointerdown.stop="onMarkerPointerDown($event, kf)"
                  @pointermove="onMarkerPointerMove"
                  @pointerup="onMarkerPointerUp"
                  @pointercancel="resetDragState"
                />
              </div>
            </template>
          </div>
        </div>
      </div>

      <aside
        v-if="isSidePanelOpen"
        id="animation-timeline-editor-side-panel"
        class="animation-timeline-editor__side-panel"
      >
        <h4 class="animation-timeline-editor__side-panel-title">Opciones</h4>
        <label class="animation-timeline-editor__field">
          Rotacion X (grados)
          <input
            type="number"
            class="animation-timeline-editor__number-input"
            step="0.1"
            :min="MIN_ROTATION_DEGREES"
            :max="MAX_ROTATION_DEGREES"
            :value="selectedBoneRotationDeg.x.toFixed(1)"
            aria-label="Rotacion X del hueso seleccionado, en grados"
            @change="
              setBoneRotationAxis(
                'x',
                Number(($event.target as HTMLInputElement).value),
              )
            "
          />
        </label>
        <label class="animation-timeline-editor__field">
          Rotacion Y (grados)
          <input
            type="number"
            class="animation-timeline-editor__number-input"
            step="0.1"
            :min="MIN_ROTATION_DEGREES"
            :max="MAX_ROTATION_DEGREES"
            :value="selectedBoneRotationDeg.y.toFixed(1)"
            aria-label="Rotacion Y del hueso seleccionado, en grados"
            @change="
              setBoneRotationAxis(
                'y',
                Number(($event.target as HTMLInputElement).value),
              )
            "
          />
        </label>
        <label class="animation-timeline-editor__field">
          Rotacion Z (grados)
          <input
            type="number"
            class="animation-timeline-editor__number-input"
            step="0.1"
            :min="MIN_ROTATION_DEGREES"
            :max="MAX_ROTATION_DEGREES"
            :value="selectedBoneRotationDeg.z.toFixed(1)"
            aria-label="Rotacion Z del hueso seleccionado, en grados"
            @change="
              setBoneRotationAxis(
                'z',
                Number(($event.target as HTMLInputElement).value),
              )
            "
          />
        </label>
        <label class="animation-timeline-editor__field">
          Tiempo actual (s)
          <input
            type="number"
            class="animation-timeline-editor__number-input"
            min="0"
            step="0.1"
            :value="currentTimeSeconds"
            :disabled="isLoopPreviewing"
            @change="
              setCurrentTime(Number(($event.target as HTMLInputElement).value))
            "
          />
        </label>
        <details class="animation-timeline-editor__keyframe-list-details">
          <summary>
            Keyframes de {{ selectedBone }} ({{ selectedBoneKeyframes.length }})
          </summary>
          <ul class="animation-timeline-editor__keyframe-list">
            <li
              v-for="kf in selectedBoneKeyframes"
              :key="kf.timeSeconds"
              class="animation-timeline-editor__keyframe"
              :class="{
                'animation-timeline-editor__keyframe--current':
                  kf.timeSeconds === currentTimeSeconds,
              }"
            >
              <span>{{ kf.timeSeconds.toFixed(1) }}s</span>
              <button
                type="button"
                class="animation-timeline-editor__keyframe-remove"
                :aria-label="`Quitar keyframe de ${selectedBone} en ${kf.timeSeconds}s`"
                @click="removeKeyframeAt(selectedBone, kf.timeSeconds)"
              >
                Quitar
              </button>
            </li>
            <li
              v-if="selectedBoneKeyframes.length === 0"
              class="animation-timeline-editor__keyframe-empty"
            >
              Sin keyframes para este hueso todavia.
            </li>
          </ul>
        </details>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* Ninguna superficie interna lleva su propio backdrop-filter: este componente solo se monta dentro de EditorModal, cuyo panel ya blurea todo lo que hay detras. */
.animation-timeline-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  height: 100%;
  min-height: 0;
}

.animation-timeline-editor__canvas-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 0;
  min-height: 0;
}

.animation-timeline-editor__canvas {
  width: auto;
  height: 100%;
  max-width: 100%;
  aspect-ratio: var(--aspect-vrm-canvas);
  border-radius: var(--radius-lg);
}

.animation-timeline-editor__error,
.animation-timeline-editor__status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: var(--text-sm);
  background: var(--color-surface-base);
  border-radius: var(--radius-lg);
}

.animation-timeline-editor__error {
  color: var(--color-error);
}

.animation-timeline-editor__status {
  color: var(--color-text-secondary);
}

.animation-timeline-editor__playing-badge {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  margin: 0;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-accent-primary);
  color: var(--color-text-on-accent);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-medium);
}

.animation-timeline-editor__hint {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.animation-timeline-editor__toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.animation-timeline-editor__active-bone {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.animation-timeline-editor__icon-button {
  min-width: var(--space-8);
  min-height: var(--space-8);
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  border: var(--border-width-thin) solid var(--color-border-strong);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  line-height: 1;
  cursor: pointer;
}

.animation-timeline-editor__icon-button--active {
  border-color: var(--color-accent-primary);
  color: var(--color-accent-primary);
}

.animation-timeline-editor__toolbar-spacer {
  flex: 1;
}

.animation-timeline-editor__body {
  display: flex;
  gap: var(--space-2);
  flex: 2 1 0;
  min-height: 0;
}

.animation-timeline-editor__dopesheet {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
}

.animation-timeline-editor__ruler {
  display: grid;
  grid-template-columns: var(--size-dopesheet-label-column) 1fr;
  flex-shrink: 0;
}

.animation-timeline-editor__ruler-track {
  position: relative;
  height: var(--space-6);
  border-radius: var(--radius-sm);
  border: var(--border-width-thin) solid var(--color-border-strong);
  background: var(--color-surface-base);
  cursor: pointer;
}

.animation-timeline-editor__ruler-label {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  padding: 0 var(--space-1);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  pointer-events: none;
}

.animation-timeline-editor__ruler-label--start {
  left: 0;
}

.animation-timeline-editor__ruler-label--end {
  right: 0;
}

.animation-timeline-editor__rows-wrap {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

.animation-timeline-editor__playhead-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--size-dopesheet-label-column);
  right: 0;
  pointer-events: none;
}

.animation-timeline-editor__playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: var(--border-width-thick);
  background: var(--color-accent-primary);
}

.animation-timeline-editor__rows {
  display: grid;
  grid-template-columns: var(--size-dopesheet-label-column) 1fr;
  grid-auto-rows: var(--space-8);
}

.animation-timeline-editor__row-label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  border: none;
  border-bottom: var(--border-width-thin) solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  text-align: left;
  cursor: pointer;
}

.animation-timeline-editor__row-bone-name {
  overflow: hidden;
  min-width: 0;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.animation-timeline-editor__row-label--active {
  color: var(--color-accent-primary);
  background: var(--color-surface-raised);
}

.animation-timeline-editor__row-count {
  flex-shrink: 0;
  color: inherit;
  opacity: 0.7;
}

.animation-timeline-editor__row-track {
  position: relative;
  border-bottom: var(--border-width-thin) solid var(--color-border-subtle);
  background: var(--color-surface-base);
  cursor: pointer;
}

.animation-timeline-editor__marker {
  position: absolute;
  top: 50%;
  width: var(--space-6);
  height: var(--space-6);
  padding: 0;
  border-radius: 50%;
  border: var(--border-width-thick) solid var(--color-accent-secondary);
  background: var(--color-surface-raised);
  transform: translate(-50%, -50%);
  cursor: grab;
}

.animation-timeline-editor__marker:active {
  cursor: grabbing;
}

.animation-timeline-editor__marker--current {
  background: var(--color-accent-secondary);
}

.animation-timeline-editor__side-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 0 0 var(--size-dopesheet-side-panel);
  min-width: 0;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  background: var(--color-surface-raised);
  overflow-y: auto;
}

.animation-timeline-editor__side-panel-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.animation-timeline-editor__keyframe-list-details {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.animation-timeline-editor__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.animation-timeline-editor__number-input {
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  border: var(--border-width-thin) solid var(--color-border-strong);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
}

.animation-timeline-editor__keyframe-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.animation-timeline-editor__keyframe {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  background: var(--color-surface-raised);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-primary);
}

.animation-timeline-editor__keyframe--current {
  border-color: var(--color-accent-primary);
  border-width: var(--border-width-thick);
}

.animation-timeline-editor__keyframe-remove {
  min-width: calc(var(--space-4) + var(--space-2));
  min-height: calc(var(--space-4) + var(--space-2));
  padding: var(--space-1);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-standard);
}

.animation-timeline-editor__keyframe-remove:hover {
  color: var(--color-error);
}

.animation-timeline-editor__keyframe-empty {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}
</style>

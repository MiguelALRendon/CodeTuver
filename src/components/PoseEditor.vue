<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { VRM } from '@pixiv/three-vrm';
import {
  setupVrmScene,
  loadVrmModel,
  observeVrmSceneResize,
} from '../vrm-scene';
import { resolveBoneNodeFromVrm } from '../vrm-clip-retarget';
import {
  exportPoseAsVrma,
  POSE_EDITOR_BONE_NAMES,
  type PoseEditorBoneName,
} from '../vrma-pose-export';
import {
  saveCreatedAnimationFile,
  type ImportedAnimationSummary,
} from '../animation-import';
import { errorMessage } from '../error-message';
import IconGlyph from './IconGlyph.vue';
import CustomSelect, { type CustomSelectOption } from './CustomSelect.vue';

const props = defineProps<{ modelUrl: string }>();
const emit = defineEmits<{
  saved: [summary: ImportedAnimationSummary];
  close: [];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const loadError = ref<string | null>(null);
const isLoading = ref(true);
const selectedBone = ref<PoseEditorBoneName>(POSE_EDITOR_BONE_NAMES[0]);
const touchedBoneNames = ref<Set<PoseEditorBoneName>>(new Set());
const isSaving = ref(false);
const saveError = ref<string | null>(null);

const boneOptions = computed<CustomSelectOption[]>(() =>
  POSE_EDITOR_BONE_NAMES.map((bone) => ({
    value: bone,
    label: `${bone}${touchedBoneNames.value.has(bone) ? ' (tocado)' : ''}`,
  })),
);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let vrm: VRM | null = null;
let transformControls: TransformControls | null = null;
let orbitControls: OrbitControls | null = null;
let animationFrameId: number | null = null;
let stopResizeObserver: (() => void) | null = null;
// Cuaternion actual por hueso tocado; se recalcula desde el bone real al guardar, no se acumula aqui.
const touchedBones = new Map<PoseEditorBoneName, THREE.Quaternion>();

function boneNode(name: PoseEditorBoneName): THREE.Object3D | null {
  if (!vrm) return null;
  return resolveBoneNodeFromVrm(vrm)(name);
}

function attachGizmoToSelectedBone(): void {
  const node = boneNode(selectedBone.value);
  if (!node || !transformControls) return;
  transformControls.attach(node);
}

function selectBone(name: PoseEditorBoneName): void {
  selectedBone.value = name;
  attachGizmoToSelectedBone();
}

function recordSelectedBoneRotation(): void {
  const node = boneNode(selectedBone.value);
  if (!node) return;
  touchedBones.set(selectedBone.value, node.quaternion.clone());
  touchedBoneNames.value = new Set(touchedBones.keys());
}

function tick(): void {
  animationFrameId = requestAnimationFrame(tick);
  orbitControls?.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

async function initialize(): Promise<void> {
  const canvas = canvasRef.value;
  if (!canvas) return;
  try {
    const setup = setupVrmScene(canvas);
    renderer = setup.renderer;
    scene = setup.scene;
    camera = setup.camera;
    stopResizeObserver = observeVrmSceneResize(setup, canvas);
    vrm = await loadVrmModel(scene, props.modelUrl);
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.target.set(0, 1.0, 0);
    orbitControls.enablePan = false;
    transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setMode('rotate');
    transformControls.addEventListener(
      'objectChange',
      recordSelectedBoneRotation,
    );
    transformControls.addEventListener('dragging-changed', (event) => {
      if (orbitControls) orbitControls.enabled = !event.value;
    });
    scene.add(transformControls.getHelper());
    attachGizmoToSelectedBone();
    tick();
    (window as any).__debugSetPoseBoneRotation = (
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
      touchedBones.set(boneName, node.quaternion.clone());
      touchedBoneNames.value = new Set(touchedBones.keys());
    };
    (window as any).__debugBoneWorldPosition = (
      boneName: PoseEditorBoneName,
    ) => {
      const node = boneNode(boneName);
      if (!node) return null;
      const position = new THREE.Vector3();
      node.getWorldPosition(position);
      return position.toArray();
    };
    (window as any).__debugExportPoseBlobUrl = () => {
      const rotations = [...touchedBones.entries()].map(
        ([boneName, quaternion]) => ({
          boneName,
          quaternion: [
            quaternion.x,
            quaternion.y,
            quaternion.z,
            quaternion.w,
          ] as const,
        }),
      );
      const bytes = exportPoseAsVrma(rotations);
      if (!bytes) return null;
      const url = URL.createObjectURL(
        new Blob([bytes], { type: 'model/gltf-binary' }),
      );
      (window as any).__lastExportedPoseBlobUrl = url;
      return url;
    };
  } catch (error) {
    loadError.value = errorMessage(error);
    console.error('[pose-editor] fallo aislado al cargar el modelo:', error);
  } finally {
    isLoading.value = false;
  }
}

function disposeScene(): void {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
  stopResizeObserver?.();
  transformControls?.dispose();
  orbitControls?.dispose();
  renderer?.dispose();
  renderer = null;
  scene = null;
  camera = null;
  vrm = null;
  transformControls = null;
  orbitControls = null;
  stopResizeObserver = null;
}

onMounted(initialize);
onBeforeUnmount(disposeScene);

async function saveAsPose(): Promise<void> {
  const rotations = [...touchedBones.entries()].map(
    ([boneName, quaternion]) => ({
      boneName,
      quaternion: [
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w,
      ] as const,
    }),
  );
  const bytes = exportPoseAsVrma(rotations);
  if (!bytes) {
    saveError.value = 'Mueve al menos un hueso con el gizmo antes de guardar.';
    return;
  }
  isSaving.value = true;
  saveError.value = null;
  try {
    const fileName = `pose-${Date.now()}.vrma`;
    const summary = await saveCreatedAnimationFile(bytes, 'pose', fileName);
    emit('saved', summary);
  } catch (error) {
    saveError.value = errorMessage(error);
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="pose-editor">
    <div class="pose-editor__canvas-wrap">
      <canvas
        ref="canvasRef"
        class="pose-editor__canvas"
        aria-label="Vista 3D del personaje para posar huesos"
        aria-describedby="pose-editor-hint"
      />
      <p
        v-if="isLoading && !loadError"
        class="pose-editor__status"
        aria-live="polite"
      >
        Cargando modelo…
      </p>
      <p v-if="loadError" class="pose-editor__error" aria-live="polite">
        No se pudo cargar el modelo: {{ loadError }}
      </p>
    </div>

    <p id="pose-editor-hint" class="pose-editor__hint">
      Selecciona un hueso y arrastra el gizmo sobre el modelo para rotarlo.
      Arrastra fuera del gizmo para orbitar la camara.
    </p>

    <div class="pose-editor__controls">
      <label class="pose-editor__field">
        Hueso seleccionado
        <CustomSelect
          class="pose-editor__select"
          :options="boneOptions"
          :model-value="selectedBone"
          @update:model-value="selectBone($event as PoseEditorBoneName)"
        />
      </label>

      <div class="session-panel__row">
        <button
          type="button"
          class="session-panel__button"
          :disabled="isSaving"
          @click="saveAsPose"
        >
          {{ isSaving ? 'Guardando...' : 'Guardar como pose' }}
        </button>
        <button
          type="button"
          class="session-panel__button"
          @click="emit('close')"
        >
          Cerrar
        </button>
      </div>

      <p v-if="saveError" class="session-panel__error" aria-live="polite">
        <IconGlyph name="error" />{{ saveError }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.pose-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  height: 100%;
}

.pose-editor__canvas-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
}

.pose-editor__canvas {
  width: auto;
  height: 100%;
  max-width: 100%;
  aspect-ratio: var(--aspect-vrm-canvas);
  border-radius: var(--radius-lg);
}

.pose-editor__error,
.pose-editor__status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: var(--text-sm);
  background: var(--color-surface-base);
  backdrop-filter: blur(var(--blur-panel));
  border-radius: var(--radius-lg);
}

.pose-editor__error {
  color: var(--color-error);
}

.pose-editor__status {
  color: var(--color-text-secondary);
}

.pose-editor__hint {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.pose-editor__controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.pose-editor__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

/* El select vive pegado al borde inferior del modal (overflow-y:auto en editor-modal__body): abre hacia arriba para no cortarse. */
.pose-editor__select :deep(.commands-inline-list--floating) {
  top: auto;
  bottom: 100%;
  margin: 0 0 var(--space-2);
}
</style>

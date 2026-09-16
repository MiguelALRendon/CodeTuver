<script setup lang="ts">
import { ref, computed } from 'vue';
import { TestAvatarController } from './avatar-controller';
import { CHARACTER_CATALOG } from './character-catalog';
import AvatarStage from './components/AvatarStage.vue';
import CharacterEditor from './components/CharacterEditor.vue';
import {
  capabilitiesForTestAvatar,
  resolveActiveStateAssignment,
  EDITABLE_STATES,
} from './character-editor';
import { loadCharacterEditorSettings } from './character-editor-storage';

const character = CHARACTER_CATALOG.find((c) => c.id === 'alicia-solid')!;
const characterId = character.id;
const capabilities = capabilitiesForTestAvatar();
const avatarController = new TestAvatarController();

const previewClipId = ref<string | undefined>(undefined);
const previewNonce = ref(0);
function onPreviewClip(id: string): void {
  previewClipId.value = id;
  previewNonce.value += 1;
}

const settingsVersion = ref(0);
const activeStateAssignment = computed(() => {
  void settingsVersion.value;
  const persisted = loadCharacterEditorSettings(characterId);
  return resolveActiveStateAssignment(
    persisted,
    capabilities,
    avatarController.snapshot.state,
  );
});

// Override manual para probar una animacion recien exportada sin pasar por el guardado real en disco (Tauri, fuera de alcance del harness).
const testAnimationOverride = ref<string[] | null>(null);
const testPoseOverride = ref<string | null>(null);
const effectiveAnimations = computed(
  () => testAnimationOverride.value ?? activeStateAssignment.value.animations,
);
const effectivePose = computed(
  () => testPoseOverride.value ?? activeStateAssignment.value.pose,
);

function triggerState(state: string): void {
  avatarController.setState(state);
}

function applyTestAnimation(url: string): void {
  testAnimationOverride.value = [url];
  testPoseOverride.value = null;
}

function applyLastExported(): void {
  const url = (window as unknown as { __lastExportedBlobUrl?: string })
    .__lastExportedBlobUrl;
  if (url) applyTestAnimation(url);
}

function applyTestPose(url: string): void {
  testPoseOverride.value = url;
  testAnimationOverride.value = null;
}

function applyLastExportedPose(): void {
  const url = (window as unknown as { __lastExportedPoseBlobUrl?: string })
    .__lastExportedPoseBlobUrl;
  if (url) applyTestPose(url);
}
</script>

<template>
  <div class="dev-harness">
    <h1>
      Dev harness — verificacion visual animaciones-editables-correcciones
    </h1>
    <p>
      Estado: {{ avatarController.snapshot.state }} · animaciones:
      {{ effectiveAnimations }} · pose:
      {{ effectivePose }}
      <template v-if="testAnimationOverride">
        (override de prueba activo)</template
      >
    </p>
    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px">
      <button
        v-for="s in EDITABLE_STATES"
        :key="s"
        type="button"
        @click="triggerState(s)"
      >
        {{ s }}
      </button>
      <button type="button" @click="testAnimationOverride = null">
        Quitar override de prueba
      </button>
      <button type="button" @click="testPoseOverride = null">
        Quitar override de pose de prueba
      </button>
    </div>
    <div style="width: 500px; height: 500px">
      <AvatarStage
        :active-character="character"
        :active-imported-character="null"
        :avatar-controller="avatarController"
        :mouth-open="false"
        :animation-pool-urls="effectiveAnimations"
        :pose-url="effectivePose"
        :preview-clip-id="previewClipId"
        :preview-nonce="previewNonce"
      />
    </div>
    <button type="button" @click="applyLastExported">
      Aplicar ultima animacion exportada como override
    </button>
    <button type="button" @click="applyLastExportedPose">
      Aplicar ultima pose exportada como override
    </button>
    <CharacterEditor
      :character-id="characterId"
      :capabilities="capabilities"
      :avatar-controller="avatarController"
      :model-url="character.modelUrl"
      @preview-clip="onPreviewClip"
    />
  </div>
</template>

<style scoped>
.dev-harness {
  padding: var(--space-4);
  font-family: var(--font-sans);
  color: var(--color-text-primary);
  background: var(--color-surface-base);
  backdrop-filter: blur(var(--blur-panel));
}
</style>

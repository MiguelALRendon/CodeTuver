<script setup lang="ts">
import { computed, ref } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { TestAvatarController } from '../avatar-controller';
import type { CharacterCatalogEntry } from '../character-catalog';
import type { ImportedCharacterSummary } from '../character-import';
import { resolveImportedVrmModelUrl } from '../avatar-imported-model';
import VrmAvatar from './VrmAvatar.vue';

const props = defineProps<{
  activeCharacter: CharacterCatalogEntry | null;
  activeImportedCharacter: ImportedCharacterSummary | null;
  avatarController: TestAvatarController;
  mouthOpen: boolean;
  animationPoolUrls?: string[];
  poseUrl?: string;
  transitionDurationMs?: number;
  previewClipId?: string;
  previewNonce?: number;
}>();

// D2/H6: solo el formato vrm tiene renderizador real hoy; live2d permanece con el placeholder (fuera de alcance, EPIC-004 futuro).
const importedVrmModelUrl = computed(() =>
  resolveImportedVrmModelUrl(props.activeImportedCharacter, convertFileSrc),
);

const vrmAvatarRef = ref<InstanceType<typeof VrmAvatar> | null>(null);

defineExpose({
  resetPoseForCurrentState: () =>
    vrmAvatarRef.value?.resetPoseForCurrentState(),
});
</script>

<template>
  <VrmAvatar
    v-if="activeCharacter?.kind === 'vrm'"
    ref="vrmAvatarRef"
    :model-url="activeCharacter.modelUrl"
    :snapshot="avatarController.snapshot"
    :mouth-open="mouthOpen"
    :animation-pool-urls="animationPoolUrls"
    :pose-url="poseUrl"
    :transition-duration-ms="transitionDurationMs"
    :preview-clip-id="previewClipId"
    :preview-nonce="previewNonce"
  />
  <VrmAvatar
    v-else-if="importedVrmModelUrl"
    ref="vrmAvatarRef"
    :model-url="importedVrmModelUrl"
    :snapshot="avatarController.snapshot"
    :mouth-open="mouthOpen"
    :animation-pool-urls="animationPoolUrls"
    :pose-url="poseUrl"
    :transition-duration-ms="transitionDurationMs"
    :preview-clip-id="previewClipId"
    :preview-nonce="previewNonce"
  />
  <p v-else-if="activeImportedCharacter" class="avatar-stage__fallback">
    Personaje importado (Live2D): sin renderizador todavia, EPIC-004 futuro.
    Estado: {{ avatarController.snapshot.state }} ·
    {{ avatarController.snapshot.expression }}
  </p>
  <p v-else class="avatar-stage__fallback">Sin personaje seleccionado.</p>
</template>

<style scoped>
.avatar-stage__fallback {
  font-size: var(--text-sm);
  color: var(--color-error);
}
</style>

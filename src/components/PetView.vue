<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import AvatarStage from './AvatarStage.vue';
import { TestAvatarController } from '../avatar-controller';
import { TauriDesktopWindowManager } from '../desktop-window-manager';
import { getAppSettings, setGlobalAppSettings } from '../app-settings';
import {
  CHARACTER_CATALOG,
  type CharacterCatalogEntry,
} from '../character-catalog';
import {
  loadPersistedCharacterId,
  resolveActiveCharacter,
} from '../character-selection';
import {
  listImportedCharacters,
  type ImportedCharacterSummary,
} from '../character-import';
import { ATTENTION_SIGNAL_MESSAGE } from '../attention-signals';
import {
  PET_RESTORE_REQUESTED_EVENT,
  PET_SYNC_EVENT,
  PET_SYNC_REQUEST_EVENT,
  type PetSyncPayload,
} from '../pet-sync';

const windowManager = new TauriDesktopWindowManager();
const avatarController = new TestAvatarController();

const activeCharacterId = ref<string | null>(
  resolveActiveCharacter(CHARACTER_CATALOG, loadPersistedCharacterId())?.id ??
    null,
);
const activeCharacter = computed<CharacterCatalogEntry | null>(
  () =>
    CHARACTER_CATALOG.find((entry) => entry.id === activeCharacterId.value) ??
    null,
);

const importedCharacters = ref<ImportedCharacterSummary[]>([]);
const activeImportedCharacter = computed<ImportedCharacterSummary | null>(
  () =>
    importedCharacters.value.find(
      (entry) => entry.id === activeCharacterId.value,
    ) ?? null,
);

const mouthOpen = ref(false);
const sessionActive = ref(false);
const attentionVisible = ref(false);
const attentionVisualIndicator = ref(false);
const attentionBubble = ref(false);
const animationPoolUrls = ref<string[] | undefined>(undefined);
const poseUrl = ref<string | undefined>(undefined);
const transitionDurationMs = ref<number | undefined>(undefined);

function applySync(payload: PetSyncPayload): void {
  avatarController.setState(payload.avatarState);
  avatarController.setExpression(payload.avatarExpression);
  mouthOpen.value = payload.mouthOpen;
  activeCharacterId.value = payload.activeCharacterId;
  sessionActive.value = payload.sessionActive;
  attentionVisible.value = payload.attentionVisible;
  attentionVisualIndicator.value = payload.attentionVisualIndicator;
  attentionBubble.value = payload.attentionBubble;
  animationPoolUrls.value = payload.animationPoolUrls;
  poseUrl.value = payload.poseUrl;
  transitionDurationMs.value = payload.transitionDurationMs;
}

const DRAG_THRESHOLD_PX = 4;
let dragStart: { x: number; y: number } | null = null;
let didDrag = false;

function requestFullMode(): void {
  if (didDrag) return;
  void emit(PET_RESTORE_REQUESTED_EVENT);
}

// Hito 8/D8: en Windows startDragging() no resuelve hasta soltar el boton -- leer la posicion justo despues es el punto arrastrado final, sin necesitar onMoved.
async function persistDraggedPosition(): Promise<void> {
  try {
    const position = await windowManager.getPosition();
    const { settings } = await getAppSettings();
    await setGlobalAppSettings({ ...settings, petWindowPosition: position });
  } catch (err) {
    console.error('[pet] no se pudo persistir la posicion arrastrada:', err);
  }
}

async function onPetMouseMove(event: MouseEvent): Promise<void> {
  if (!dragStart || didDrag) return;
  const dx = event.clientX - dragStart.x;
  const dy = event.clientY - dragStart.y;
  if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
  didDrag = true;
  await windowManager.startDragging();
  await persistDraggedPosition();
}

function onPetMouseUp(): void {
  dragStart = null;
  window.removeEventListener('mousemove', onPetMouseMove);
  window.removeEventListener('mouseup', onPetMouseUp);
}

function onPetMouseDown(event: MouseEvent): void {
  dragStart = { x: event.clientX, y: event.clientY };
  didDrag = false;
  window.addEventListener('mousemove', onPetMouseMove);
  window.addEventListener('mouseup', onPetMouseUp);
}

let unlistenSync: UnlistenFn | null = null;

onMounted(async () => {
  try {
    importedCharacters.value = await listImportedCharacters();
  } catch (err) {
    console.error('[pet] no se pudo listar personajes importados:', err);
  }
  unlistenSync = await listen<PetSyncPayload>(PET_SYNC_EVENT, (event) =>
    applySync(event.payload),
  );
  void emit(PET_SYNC_REQUEST_EVENT);
});

onUnmounted(() => {
  unlistenSync?.();
});
</script>

<template>
  <section
    v-if="sessionActive"
    class="pet-stage"
    role="button"
    tabindex="0"
    :aria-label="
      attentionVisible
        ? 'Restaurar modo completo — autorizacion pendiente'
        : 'Restaurar modo completo'
    "
    @click="requestFullMode"
    @keydown.enter="requestFullMode"
    @keydown.space.prevent="requestFullMode"
    @mousedown="onPetMouseDown"
  >
    <AvatarStage
      :active-character="activeCharacter"
      :active-imported-character="activeImportedCharacter"
      :avatar-controller="avatarController"
      :mouth-open="mouthOpen"
      :animation-pool-urls="animationPoolUrls"
      :pose-url="poseUrl"
      :transition-duration-ms="transitionDurationMs"
    />
    <span
      v-if="attentionVisible && attentionVisualIndicator"
      class="pet-stage__indicator"
      aria-hidden="true"
    ></span>
    <p v-if="attentionVisible && attentionBubble" class="pet-stage__bubble">
      {{ ATTENTION_SIGNAL_MESSAGE }}
    </p>
  </section>
</template>

<style scoped>
.pet-stage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: transparent;
}

.pet-stage:focus-visible {
  outline: var(--border-width-thick) solid var(--color-accent-primary);
  outline-offset: calc(-1 * var(--border-width-thick));
}

.pet-stage__indicator {
  position: absolute;
  top: var(--space-1);
  right: var(--space-1);
  width: var(--space-3);
  height: var(--space-3);
  border-radius: var(--radius-lg);
  background: var(--color-warning);
  box-shadow: var(--shadow-glow-accent);
  animation: pet-stage-indicator-pulse var(--duration-slow) var(--ease-standard)
    infinite alternate;
}

.pet-stage__bubble {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin: 0 0 var(--space-1);
  padding: var(--space-1) var(--space-2);
  max-width: 12rem;
  border-radius: var(--radius-md);
  background: var(--color-surface-overlay);
  backdrop-filter: blur(var(--blur-panel));
  border: var(--border-width-thin) solid var(--color-border-strong);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  text-align: center;
  white-space: normal;
}

@keyframes pet-stage-indicator-pulse {
  from {
    opacity: 0.6;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pet-stage__indicator {
    animation: none;
  }
}
</style>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: transparent;
}
</style>

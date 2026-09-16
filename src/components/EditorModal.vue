<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, useId } from 'vue';

const props = withDefaults(
  defineProps<{ title: string; role?: 'dialog' | 'alertdialog' }>(),
  { role: 'dialog' },
);
const emit = defineEmits<{ close: [] }>();

const titleId = useId();
const panelRef = ref<HTMLElement | null>(null);
let returnFocusTo: HTMLElement | null = null;

function focusableElementsWithin(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      'button, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  ];
}

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

function trapTab(event: KeyboardEvent): void {
  if (event.key !== 'Tab' || !panelRef.value) return;
  const focusables = focusableElementsWithin(panelRef.value);
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  returnFocusTo = document.activeElement as HTMLElement | null;
  window.addEventListener('keydown', closeOnEscape);
  void nextTick(() => {
    if (!panelRef.value) return;
    focusableElementsWithin(panelRef.value)[0]?.focus();
  });
});

onUnmounted(() => {
  window.removeEventListener('keydown', closeOnEscape);
  returnFocusTo?.focus();
});
</script>

<template>
  <Teleport to="body">
    <div
      class="editor-modal"
      :role="props.role"
      aria-modal="true"
      :aria-labelledby="titleId"
      @keydown="trapTab"
    >
      <div ref="panelRef" class="editor-modal__panel">
        <h3 :id="titleId" class="editor-modal__title">{{ props.title }}</h3>
        <div class="editor-modal__body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.editor-modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-overlay-scrim);
  z-index: var(--z-overlay);
}

.editor-modal__panel {
  width: var(--size-overlay-panel-large);
  height: var(--size-overlay-panel-large-height);
  max-width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  background: var(--color-surface-overlay);
  backdrop-filter: blur(var(--blur-panel));
  box-shadow: var(--shadow-md);
  overflow: hidden;
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}

.editor-modal__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.editor-modal__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>

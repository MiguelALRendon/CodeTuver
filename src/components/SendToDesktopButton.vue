<script setup lang="ts">
import IconGlyph from './IconGlyph.vue';

defineProps<{ disabled: boolean }>();
defineEmits<{ (e: 'click'): void }>();
</script>

<template>
  <button
    type="button"
    class="send-to-desktop-button"
    aria-label="Enviar al escritorio"
    title="Enviar al escritorio"
    :disabled="disabled"
    @click="$emit('click')"
  >
    <IconGlyph name="sendToDesktop" class="send-to-desktop-button__icon" />
  </button>
</template>

<style scoped>
.send-to-desktop-button {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--size-floating-button);
  height: var(--size-floating-button);
  border-radius: var(--radius-md);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-panel));
  color: var(--color-text-primary);
  cursor: pointer;
  z-index: var(--z-panel);
  transition: background var(--duration-fast) var(--ease-standard);
}

.send-to-desktop-button:hover:not(:disabled) {
  background: var(--color-accent-primary);
  color: var(--color-text-on-accent);
}

.send-to-desktop-button:disabled {
  color: var(--color-text-muted);
  cursor: not-allowed;
}
</style>

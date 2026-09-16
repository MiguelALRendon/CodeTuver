<script setup lang="ts">
defineProps<{ loading?: boolean }>();
</script>

<template>
  <div class="scrollable-list-panel">
    <div v-if="$slots.header" class="scrollable-list-panel__header">
      <slot name="header" />
    </div>

    <p v-if="loading" class="scrollable-list-panel__loading" role="status">
      <span class="scrollable-list-panel__spinner" aria-hidden="true"></span>
      Cargando...
    </p>
    <div v-else class="scrollable-list-panel__list">
      <slot name="list" />
    </div>

    <div v-if="$slots.footer" class="scrollable-list-panel__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.scrollable-list-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1 1 auto;
  min-height: 0;
}

.scrollable-list-panel__header,
.scrollable-list-panel__footer {
  flex: 0 0 auto;
}

.scrollable-list-panel__list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.scrollable-list-panel__loading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.scrollable-list-panel__spinner {
  width: 1em;
  height: 1em;
  border: var(--border-width-thick) solid var(--color-border-subtle);
  border-top-color: var(--color-accent-primary);
  border-radius: 50%;
  animation: scrollable-list-panel-spin calc(var(--duration-slow) * 2) linear
    infinite;
}

@keyframes scrollable-list-panel-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<script setup lang="ts">
import { computed } from 'vue';
import { ICONS, isStrokeIcon, type IconName } from '../icons';

const props = defineProps<{
  name: IconName;
  label?: string;
}>();

const stroke = computed(() => isStrokeIcon(props.name));
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    class="icon-glyph"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
  >
    <path
      :d="ICONS[name]"
      :fill="stroke ? 'none' : 'currentColor'"
      fill-rule="evenodd"
      :stroke="stroke ? 'currentColor' : undefined"
      :stroke-width="stroke ? 2 : undefined"
      :stroke-linecap="stroke ? 'round' : undefined"
      :stroke-linejoin="stroke ? 'round' : undefined"
    />
  </svg>
</template>

<style scoped>
.icon-glyph {
  width: var(--size-icon-md);
  height: var(--size-icon-md);
  flex-shrink: 0;
}
</style>

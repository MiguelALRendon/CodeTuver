<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { nextCommandIndex } from '../slash-commands';

export interface CustomSelectOption {
  value: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    options: CustomSelectOption[];
    modelValue: string;
    placeholder?: string;
    inline?: boolean;
    // Solo se lee en modo inline (el padre controla la navegacion, ej. flechas sobre el textarea de comandos); en modo trigger el componente maneja su propio indice.
    activeIndex?: number;
    emptyMessage?: string | null;
    listboxId?: string;
    listboxLabel?: string;
    disabled?: boolean;
    title?: string;
    ariaLabel?: string;
  }>(),
  {
    placeholder: '',
    inline: false,
    activeIndex: -1,
    emptyMessage: null,
    listboxId: undefined,
    listboxLabel: undefined,
    disabled: false,
    title: undefined,
    ariaLabel: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const rootEl = ref<HTMLElement | null>(null);
const panelOpen = ref(false);
const internalActiveIndex = ref(0);
const optionEls = ref<(HTMLLIElement | null)[]>([]);
const resolvedListboxId = props.listboxId ?? `custom-select-${useId()}`;

const highlightedIndex = computed(() =>
  props.inline ? props.activeIndex : internalActiveIndex.value,
);

function setOptionEl(index: number, el: Element | null): void {
  optionEls.value[index] = el as HTMLLIElement | null;
}

watch(highlightedIndex, (index) => {
  nextTick(() => {
    optionEls.value[index]?.scrollIntoView({ block: 'nearest' });
  });
});

const triggerLabel = computed(
  () =>
    props.options.find((option) => option.value === props.modelValue)?.label ??
    props.placeholder,
);

function optionId(value: string): string {
  return `${resolvedListboxId}-option-${value}`;
}

function selectOption(index: number): void {
  const option = props.options[index];
  if (!option) return;
  emit('update:modelValue', option.value);
  panelOpen.value = false;
}

function openPanel(): void {
  internalActiveIndex.value = Math.max(
    props.options.findIndex((option) => option.value === props.modelValue),
    0,
  );
  panelOpen.value = true;
}

function closePanel(): void {
  panelOpen.value = false;
}

function toggle(): void {
  if (panelOpen.value) closePanel();
  else openPanel();
}

// Solo aplica al modo trigger: en modo inline el teclado lo maneja el composer del chat (foco se queda en el textarea), este handler nunca recibe esos eventos.
function onTriggerKeydown(event: KeyboardEvent): void {
  if (props.inline) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!panelOpen.value) {
      openPanel();
      return;
    }
    internalActiveIndex.value = nextCommandIndex(
      internalActiveIndex.value,
      props.options.length,
      event.key === 'ArrowDown' ? 'down' : 'up',
    );
  } else if (
    (event.key === 'Home' || event.key === 'End') &&
    panelOpen.value &&
    props.options.length > 0
  ) {
    event.preventDefault();
    internalActiveIndex.value =
      event.key === 'Home' ? 0 : props.options.length - 1;
  } else if (event.key === 'Enter' && panelOpen.value) {
    event.preventDefault();
    selectOption(internalActiveIndex.value);
  } else if (event.key === 'Escape' && panelOpen.value) {
    event.preventDefault();
    event.stopPropagation();
    closePanel();
  }
}

function onFocusOut(event: FocusEvent): void {
  if (props.inline) return;
  const next = event.relatedTarget as Node | null;
  if (next && rootEl.value?.contains(next)) return;
  closePanel();
}
</script>

<template>
  <div
    ref="rootEl"
    class="custom-select"
    @keydown="onTriggerKeydown"
    @focusout="onFocusOut"
  >
    <button
      v-if="!inline"
      type="button"
      class="session-panel__button custom-select__trigger"
      aria-haspopup="listbox"
      :aria-expanded="panelOpen"
      :aria-controls="resolvedListboxId"
      :aria-activedescendant="
        panelOpen && options[highlightedIndex]
          ? optionId(options[highlightedIndex].value)
          : undefined
      "
      :aria-label="ariaLabel"
      :disabled="disabled"
      :title="title"
      @click="toggle"
    >
      <slot name="trigger">{{ triggerLabel }}</slot>
    </button>

    <ul
      v-if="inline || panelOpen"
      :id="resolvedListboxId"
      role="listbox"
      :aria-label="listboxLabel"
      class="commands-inline-list"
      :class="{ 'commands-inline-list--floating': !inline }"
    >
      <li
        v-for="(option, index) in options"
        :ref="(el) => setOptionEl(index, el as Element | null)"
        :id="optionId(option.value)"
        :key="option.value"
        role="option"
        :aria-selected="index === highlightedIndex"
        class="commands-panel__item"
        :class="{
          'commands-panel__item--selected': index === highlightedIndex,
        }"
        @mousedown.prevent="selectOption(index)"
      >
        {{ option.label }}
      </li>
      <li
        v-if="options.length === 0 && emptyMessage"
        class="commands-panel__item commands-panel__item--empty"
      >
        {{ emptyMessage }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.custom-select {
  position: relative;
}

.custom-select__trigger {
  min-width: var(--size-select-trigger-min);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

/* Ancla D9: position:absolute + bottom:100% sobre el padre inmediato (ya relative) en vez de CSS anchor positioning -- el ancla siempre es ese mismo padre, no hace falta la API nueva. */
.commands-inline-list {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  z-index: var(--z-panel);
  list-style: none;
  margin: 0 0 var(--space-2);
  padding: var(--space-2);
  max-height: 30vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  border-radius: var(--radius-md);
  border: var(--border-width-thin) solid var(--color-border-strong);
  background: var(--color-surface-overlay);
  backdrop-filter: blur(var(--blur-panel));
}

.commands-inline-list--floating {
  bottom: auto;
  top: 100%;
  margin: var(--space-2) 0 0;
}

.commands-panel__item {
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}

.commands-panel__item:hover,
.commands-panel__item:focus-visible {
  background: var(--color-surface-overlay);
  backdrop-filter: blur(var(--blur-panel));
}

.commands-panel__item--selected {
  background: var(--color-accent-primary);
  color: var(--color-text-on-accent);
}

.commands-panel__item--empty {
  color: var(--color-text-muted);
  cursor: default;
}
</style>

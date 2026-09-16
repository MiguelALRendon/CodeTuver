<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import iro from '@jaames/iro';
import type { IroColor } from '@irojs/iro-core';
import {
  DEFAULT_PRIMARY_COLOR_RGB,
  applyPrimaryColorRgb,
  primaryColorRgbToHex,
  hexToPrimaryColorRgb,
  type PrimaryColorRgb,
} from '../theme-color';

const props = defineProps<{
  currentColorRgb: PrimaryColorRgb;
}>();

const emit = defineEmits<{
  commit: [rgb: PrimaryColorRgb];
  close: [];
}>();

const wheelHost = ref<HTMLElement | null>(null);
const wheelHue = ref(0);
let picker: ReturnType<typeof iro.ColorPicker> | null = null;

const HUE_KEYBOARD_STEP = 5;

function onColorChange(color: IroColor): void {
  wheelHue.value = color.hue;
  const rgb = hexToPrimaryColorRgb(color.hexString);
  if (rgb) applyPrimaryColorRgb(rgb);
}

function onInputEnd(color: IroColor): void {
  const rgb = hexToPrimaryColorRgb(color.hexString);
  if (rgb) emit('commit', rgb);
}

onMounted(() => {
  if (!wheelHost.value) return;
  // Sin slider de alfa a proposito (D2): la pieza no montada es lo que hace la alfa no editable.
  picker = iro.ColorPicker(wheelHost.value, {
    width: 200,
    color: primaryColorRgbToHex(props.currentColorRgb),
    layout: [
      { component: iro.ui.Wheel },
      { component: iro.ui.Slider, options: { sliderType: 'value' } },
    ],
  });
  wheelHue.value = picker.color.hue;
  picker.on('color:change', onColorChange);
  picker.on('input:end', onInputEnd);
});

// D4: paridad minima de teclado sobre la libreria ya instalada (@jaames/iro) -- ArrowLeft/ArrowRight mueven el matiz en pasos fijos; cada paso se trata como una edicion completa (emite commit de inmediato, no hay "soltar el mouse" que lo dispare por su cuenta).
function onWheelKeydown(event: KeyboardEvent): void {
  if (!picker) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const delta =
    event.key === 'ArrowRight' ? HUE_KEYBOARD_STEP : -HUE_KEYBOARD_STEP;
  picker.color.hue = (picker.color.hue + delta + 360) % 360;
  onInputEnd(picker.color);
}

onBeforeUnmount(() => {
  applyPrimaryColorRgb(props.currentColorRgb);
});

function resetToDefault(): void {
  picker?.color.set(primaryColorRgbToHex(DEFAULT_PRIMARY_COLOR_RGB));
  applyPrimaryColorRgb(DEFAULT_PRIMARY_COLOR_RGB);
  emit('commit', DEFAULT_PRIMARY_COLOR_RGB);
}
</script>

<template>
  <div class="theme-popup">
    <div class="theme-popup__header">
      <h2 class="theme-popup__title">Theme</h2>
      <button
        type="button"
        class="session-panel__button"
        @click="emit('close')"
      >
        Cerrar
      </button>
    </div>
    <p class="theme-popup__hint">
      Elegí el color primario de la app. Las burbujas de chat siempre usan alfa
      0.75 sobre este color, sin control aparte.
    </p>
    <div
      ref="wheelHost"
      class="theme-popup__wheel"
      tabindex="0"
      role="slider"
      aria-label="Matiz del color primario"
      aria-valuemin="0"
      aria-valuemax="360"
      :aria-valuenow="wheelHue"
      @keydown="onWheelKeydown"
    ></div>
    <button type="button" class="session-panel__button" @click="resetToDefault">
      Volver al naranja por omisión
    </button>
  </div>
</template>

<style scoped>
.theme-popup {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
}

.theme-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.theme-popup__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  color: var(--color-text-primary);
}

.theme-popup__hint {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.theme-popup__wheel {
  display: flex;
  justify-content: center;
}

.theme-popup__wheel:focus-visible {
  outline: var(--border-width-thick) solid var(--color-accent-primary);
  outline-offset: var(--border-width-thick);
}
</style>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { WebSpeechTextToSpeech } from '../text-to-speech';
import CustomSelect, { type CustomSelectOption } from './CustomSelect.vue';

const props = defineProps<{
  textToSpeech: WebSpeechTextToSpeech;
}>();

const statusMessage = ref<string | null>(null);

const voiceOptions = computed<CustomSelectOption[]>(() => [
  { value: '', label: '(voz por omision del sistema)' },
  ...props.textToSpeech.snapshot.voices.map((voice) => ({
    value: voice.voiceURI,
    label: `${voice.name} (${voice.lang})`,
  })),
]);

function toggleEnabled(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  props.textToSpeech.setEnabled(checked);
  statusMessage.value = checked ? 'Voz activada.' : 'Voz desactivada.';
}

function onVolume(event: Event): void {
  props.textToSpeech.setVolume(
    Number((event.target as HTMLInputElement).value),
  );
}

function onRate(event: Event): void {
  props.textToSpeech.setRate(Number((event.target as HTMLInputElement).value));
}

function onPitch(event: Event): void {
  props.textToSpeech.setPitch(Number((event.target as HTMLInputElement).value));
}

function onVoice(value: string): void {
  props.textToSpeech.setVoice(value || null);
}

function onAllowInPetMode(event: Event): void {
  props.textToSpeech.setAllowVoiceInPetMode(
    (event.target as HTMLInputElement).checked,
  );
}

function stopSpeaking(): void {
  props.textToSpeech.stop();
  statusMessage.value = 'Voz detenida.';
}
</script>

<template>
  <section class="voice-controls">
    <h2 class="voice-controls__title">Voz</h2>

    <label class="voice-controls__field voice-controls__field--checkbox">
      <input
        type="checkbox"
        :checked="textToSpeech.snapshot.enabled"
        @change="toggleEnabled"
      />
      Activar voz
    </label>

    <label class="voice-controls__field">
      Volumen
      <span class="voice-controls__value"
        >{{ Math.round(textToSpeech.snapshot.volume * 100) }}%</span
      >
      <input
        type="range"
        min="0"
        max="1"
        step="0.1"
        :disabled="!textToSpeech.snapshot.enabled"
        :value="textToSpeech.snapshot.volume"
        @input="onVolume"
      />
    </label>

    <label class="voice-controls__field">
      Velocidad
      <span class="voice-controls__value"
        >{{ textToSpeech.snapshot.rate.toFixed(1) }}x</span
      >
      <input
        type="range"
        min="0.5"
        max="2"
        step="0.1"
        :disabled="!textToSpeech.snapshot.enabled"
        :value="textToSpeech.snapshot.rate"
        @input="onRate"
      />
    </label>

    <label class="voice-controls__field">
      Tono
      <span class="voice-controls__value">{{
        textToSpeech.snapshot.pitch.toFixed(1)
      }}</span>
      <input
        type="range"
        min="0"
        max="2"
        step="0.1"
        :disabled="!textToSpeech.snapshot.enabled"
        :value="textToSpeech.snapshot.pitch"
        @input="onPitch"
      />
    </label>

    <label class="voice-controls__field">
      Voz
      <CustomSelect
        :options="voiceOptions"
        :disabled="!textToSpeech.snapshot.enabled"
        :model-value="textToSpeech.snapshot.voiceURI ?? ''"
        @update:model-value="onVoice"
      />
    </label>

    <label class="voice-controls__field voice-controls__field--pet-mode">
      <input
        type="checkbox"
        :checked="textToSpeech.snapshot.allowInPetMode"
        @change="onAllowInPetMode"
      />
      <span class="voice-controls__pet-mode-text">
        Permitir voz en modo mascota — el personaje hablara aunque este en modo
        mascota, pudiendo interrumpir en cualquier momento
      </span>
    </label>

    <button
      type="button"
      class="session-panel__button"
      :disabled="
        !textToSpeech.snapshot.isSpeaking &&
        textToSpeech.snapshot.queueLength === 0
      "
      @click="stopSpeaking"
    >
      Detener voz
    </button>

    <p v-if="statusMessage" class="voice-controls__status" aria-live="polite">
      {{ statusMessage }}
    </p>
    <p
      v-if="textToSpeech.snapshot.lastError"
      class="voice-controls__error"
      aria-live="polite"
    >
      {{ textToSpeech.snapshot.lastError }}
    </p>
  </section>
</template>

<style scoped>
.voice-controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-top: var(--border-width-thin) solid var(--color-border-subtle);
  padding-top: var(--space-4);
}

.voice-controls__title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin: 0;
}

.voice-controls__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.voice-controls__field--checkbox {
  flex-direction: row;
  align-items: center;
  gap: var(--space-2);
}

.voice-controls__value {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-primary);
}

.voice-controls__field--pet-mode {
  flex-direction: row;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-left: var(--border-width-thick) solid var(--color-warning);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-panel));
}

.voice-controls__pet-mode-text {
  font-weight: var(--font-weight-bold);
  color: var(--color-warning);
}

.voice-controls__status {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-success);
}

.voice-controls__error {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-error);
}
</style>

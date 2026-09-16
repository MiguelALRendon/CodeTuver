<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { armAvatarDrawFault } from '../avatar-controller';
import { armVoiceFault } from '../text-to-speech';
import { armParseFault } from '../content-interpreter';
import {
  armMissingWindowCapability,
  type WindowCapability,
  type PresentationMode,
} from '../desktop-window-manager';
import {
  armPresentationTransitionFault,
  PET_WINDOW_CORNER,
  PET_WINDOW_MARGIN,
  PET_WINDOW_SIZE,
} from '../presentation-manager';
import {
  armSimulatedMonitors,
  getCurrentMonitor,
  calculateCornerPosition,
  type MonitorInfo,
  type ScreenCornerPosition,
} from '../monitor-position';
import {
  clearFailureLog,
  listFailures,
  type FailureLogEntry,
} from '../failure-taxonomy';
import type { NormalizedEvent } from '../claude-transport';
import CustomSelect, { type CustomSelectOption } from './CustomSelect.vue';

const props = defineProps<{
  onIncomingEvent: (event: NormalizedEvent) => void;
}>();

const isOpen = ref(false);
const firstControl = ref<HTMLButtonElement | null>(null);
const panelRoot = ref<HTMLElement | null>(null);
const lastFocused = ref<HTMLElement | null>(null);

function handleShortcut(event: KeyboardEvent): void {
  const isToggle =
    event.ctrlKey && event.shiftKey && event.altKey && event.key === 'D';
  const isEscapeClose = event.key === 'Escape' && isOpen.value;
  if (!isToggle && !isEscapeClose) return;
  if (isEscapeClose) {
    isOpen.value = false;
    return;
  }
  isOpen.value = !isOpen.value;
}

function focusableElements(): HTMLElement[] {
  if (!panelRoot.value) return [];
  return Array.from(
    panelRoot.value.querySelectorAll<HTMLElement>(
      'button, select, input, [tabindex]:not([tabindex="-1"])',
    ),
  );
}

// Ciclo minimo: Tab en el ultimo elemento vuelve al primero, Shift+Tab en el primero va al ultimo.
function trapFocus(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const elements = focusableElements();
  if (elements.length === 0) return;
  const first = elements[0];
  const last = elements[elements.length - 1];
  const active = document.activeElement;
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  }
}

onMounted(() => {
  if (!import.meta.env.DEV) return;
  window.addEventListener('keydown', handleShortcut);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleShortcut);
});

watch(isOpen, (open) => {
  if (open) {
    lastFocused.value = document.activeElement as HTMLElement | null;
    // firstControl vive dentro de un v-if="isOpen": el DOM aun no existe en el flush por defecto del watcher (mismo patron ya resuelto en EditorModal.vue).
    void nextTick(() => firstControl.value?.focus());
  } else {
    lastFocused.value?.focus();
  }
});

const WINDOW_CAPABILITIES: WindowCapability[] = [
  'setPresentationMode',
  'setAlwaysOnTop',
  'setTransparent',
  'setBorderless',
  'setPosition',
  'setSize',
  'setIgnoreMouseEvents',
  'setFocusable',
  'show',
  'hide',
  'minimize',
  'restore',
  'focus',
  'getMonitors',
  'getCurrentMonitor',
];

const PRESENTATION_MODES: PresentationMode[] = ['FULL', 'COMPANION', 'PET'];
const WINDOW_MANAGEMENT_PROXY_CAPABILITY: WindowCapability = 'setPosition';

const transitionModeOptions: CustomSelectOption[] = PRESENTATION_MODES.map(
  (mode) => ({ value: mode, label: mode }),
);
const missingCapabilityOptions: CustomSelectOption[] = WINDOW_CAPABILITIES.map(
  (cap) => ({ value: cap, label: cap }),
);

const parseFaultIndex = ref(0);
const transitionFaultMode = ref<PresentationMode>('PET');
const missingCapability = ref<WindowCapability>(WINDOW_CAPABILITIES[0]);

function injectAvatarFault(): void {
  armAvatarDrawFault();
}

function injectVoiceFault(): void {
  armVoiceFault();
}

function injectParseFault(): void {
  armParseFault(parseFaultIndex.value);
}

// #4 no tiene mecanismo generico propio en desktop-window-manager.ts: reutiliza armMissingWindowCapability como proxy.
function injectWindowManagementFault(): void {
  armMissingWindowCapability(WINDOW_MANAGEMENT_PROXY_CAPABILITY);
}

function injectTransitionFault(): void {
  armPresentationTransitionFault(transitionFaultMode.value);
}

function injectMissingCapability(): void {
  armMissingWindowCapability(missingCapability.value);
}

const SAMPLE_EVENT: NormalizedEvent = {
  type: 'assistant_message',
  text: 'Muestra de salida inyectada desde el panel de depuracion (TC-085).',
};

function injectSampleEvent(): void {
  props.onIncomingEvent(SAMPLE_EVENT);
}

const failures = computed<readonly FailureLogEntry[]>(() => listFailures());

function makeSimulatedMonitor(overrides: Partial<MonitorInfo>): MonitorInfo {
  return {
    id: 'sim-primary',
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    scaleFactor: 1,
    isPrimary: true,
    ...overrides,
  };
}

const SIMULATED_PRIMARY = makeSimulatedMonitor({});
const SIMULATED_SECONDARY = makeSimulatedMonitor({
  id: 'sim-secondary',
  bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
  workArea: { x: 1920, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1.25,
  isPrimary: false,
});

const monitorPreset = ref<'none' | 'single' | 'dual'>('none');

function armSingleMonitor(): void {
  armSimulatedMonitors([SIMULATED_PRIMARY]);
  monitorPreset.value = 'single';
}

function armDualMonitors(): void {
  armSimulatedMonitors([SIMULATED_PRIMARY, SIMULATED_SECONDARY]);
  monitorPreset.value = 'dual';
}

function disconnectSecondaryMonitor(): void {
  if (monitorPreset.value !== 'dual') return;
  armSingleMonitor();
}

function clearMonitorSimulation(): void {
  armSimulatedMonitors(null);
  monitorPreset.value = 'none';
}

const petPosition = ref<{ x: number; y: number; monitorId: string } | null>(
  null,
);

// Posicion calculada con la misma geometria que presentation-manager.ts::applyModeGeometry, no una lectura en vivo del SO.
async function recalculatePetPosition(): Promise<void> {
  const monitor = await getCurrentMonitor();
  if (!monitor) {
    petPosition.value = null;
    return;
  }
  const corner: ScreenCornerPosition = {
    corner: PET_WINDOW_CORNER,
    marginX: PET_WINDOW_MARGIN,
    marginY: PET_WINDOW_MARGIN,
  };
  const { x, y } = calculateCornerPosition(monitor, corner, PET_WINDOW_SIZE);
  petPosition.value = { x, y, monitorId: monitor.id };
}
</script>

<template>
  <div
    v-if="isOpen"
    ref="panelRoot"
    class="debug-panel"
    role="dialog"
    aria-modal="true"
    aria-label="Panel de depuracion e inyeccion de fallas"
    @keydown="trapFocus"
  >
    <div class="debug-panel__header">
      <h2 class="debug-panel__title">Panel de depuracion (solo dev)</h2>
      <button
        ref="firstControl"
        type="button"
        class="session-panel__button"
        @click="isOpen = false"
      >
        Cerrar (Ctrl+Shift+Alt+D)
      </button>
    </div>

    <section class="debug-panel__section">
      <h3 class="debug-panel__section-title">Inyecciones</h3>

      <div class="debug-panel__subsection">
        <h4 class="debug-panel__subsection-title">Avatar, voz e interprete</h4>

        <button
          type="button"
          class="session-panel__button"
          @click="injectAvatarFault"
        >
          Fallo de dibujo del avatar
        </button>

        <button
          type="button"
          class="session-panel__button"
          @click="injectVoiceFault"
        >
          Fallo del motor de voz
        </button>

        <div class="debug-panel__row">
          <label class="debug-panel__field">
            Indice de fragmento
            <input
              v-model.number="parseFaultIndex"
              type="number"
              min="0"
              class="debug-panel__number"
            />
          </label>
          <button
            type="button"
            class="session-panel__button"
            @click="injectParseFault"
          >
            Fallo del interprete sobre ese fragmento
          </button>
        </div>
      </div>

      <div class="debug-panel__subsection">
        <h4 class="debug-panel__subsection-title">
          Ventana, presentacion y sesion
        </h4>

        <button
          type="button"
          class="session-panel__button"
          @click="injectWindowManagementFault"
        >
          Fallo de gestion de ventana
        </button>

        <div class="debug-panel__row">
          <label class="debug-panel__field">
            Modo destino
            <CustomSelect
              :options="transitionModeOptions"
              :model-value="transitionFaultMode"
              @update:model-value="
                transitionFaultMode = $event as PresentationMode
              "
            />
          </label>
          <button
            type="button"
            class="session-panel__button"
            @click="injectTransitionFault"
          >
            Fallo de transicion de modo
          </button>
        </div>

        <div class="debug-panel__row">
          <label class="debug-panel__field">
            Capacidad ausente
            <CustomSelect
              :options="missingCapabilityOptions"
              :model-value="missingCapability"
              @update:model-value="
                missingCapability = $event as WindowCapability
              "
            />
          </label>
          <button
            type="button"
            class="session-panel__button"
            @click="injectMissingCapability"
          >
            Simular capacidad de ventana ausente
          </button>
        </div>

        <button
          type="button"
          class="session-panel__button"
          @click="injectSampleEvent"
        >
          Inyectar muestra de salida en el flujo de la sesion
        </button>
      </div>
    </section>

    <section class="debug-panel__section">
      <h3 class="debug-panel__section-title">
        Configuracion de monitores simulada
      </h3>
      <div class="debug-panel__row">
        <button
          type="button"
          class="session-panel__button"
          @click="armSingleMonitor"
        >
          Simular 1 monitor
        </button>
        <button
          type="button"
          class="session-panel__button"
          @click="armDualMonitors"
        >
          Simular 2 monitores
        </button>
        <button
          type="button"
          class="session-panel__button"
          :disabled="monitorPreset !== 'dual'"
          @click="disconnectSecondaryMonitor"
        >
          Desconectar secundario
        </button>
        <button
          type="button"
          class="session-panel__button"
          @click="clearMonitorSimulation"
        >
          Desarmar simulacion
        </button>
      </div>
      <p class="debug-panel__meta">Preset activo: {{ monitorPreset }}</p>
    </section>

    <section class="debug-panel__section">
      <h3 class="debug-panel__section-title">Diagnostico</h3>

      <button
        type="button"
        class="session-panel__button"
        @click="recalculatePetPosition"
      >
        Recalcular posicion calculada en modo mascota
      </button>
      <p class="debug-panel__meta">
        Posicion calculada, no una lectura en vivo del SO.
        <template v-if="petPosition">
          x={{ petPosition.x }}, y={{ petPosition.y }}, monitor={{
            petPosition.monitorId
          }}
        </template>
      </p>

      <p class="debug-panel__meta">Fallas registradas: {{ failures.length }}</p>
      <button
        type="button"
        class="session-panel__button"
        :disabled="failures.length === 0"
        @click="clearFailureLog"
      >
        Limpiar registro de fallas
      </button>
      <ul class="debug-panel__list">
        <li
          v-for="(entry, index) in failures"
          :key="index"
          class="debug-panel__list-item"
        >
          [{{ entry.origin }}/{{ entry.failureClass }}] {{ entry.message }}
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.debug-panel {
  position: fixed;
  inset: var(--space-4);
  z-index: var(--z-overlay);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  overflow: auto;
  padding: var(--space-4);
  border: var(--border-width-thick) solid var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: var(--color-surface-overlay);
  backdrop-filter: blur(var(--blur-panel));
  box-shadow: var(--shadow-md);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}

.debug-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.debug-panel__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.debug-panel__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: var(--border-width-thin) solid var(--color-border-subtle);
}

.debug-panel__section-title {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-secondary);
}

.debug-panel__subsection {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: var(--border-width-thin) solid var(--color-border-subtle);
}

/* :first-child nunca coincidia (siempre hay un h3 de titulo antes): el reset quedaba muerto y la primera subseccion arrastraba una linea contra su propio titulo. */
.debug-panel__section-title + .debug-panel__subsection {
  padding-top: 0;
  border-top: none;
}

.debug-panel__subsection-title {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-muted);
}

.debug-panel__row {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.debug-panel__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.debug-panel__number {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  background: var(--color-surface-raised);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
}

.debug-panel__meta {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.debug-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 20vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.debug-panel__list-item {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-primary);
}
</style>

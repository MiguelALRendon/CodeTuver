<script setup lang="ts">
import { computed } from 'vue';
import {
  PERMISSION_MODES,
  validateStartOptionsDraft,
  type SessionStartOptionsDraft,
} from '../session-start-options';
import CustomSelect, { type CustomSelectOption } from './CustomSelect.vue';

const draft = defineModel<SessionStartOptionsDraft>({ required: true });

const errors = computed(() => validateStartOptionsDraft(draft.value));

const permissionModeOptions: CustomSelectOption[] = [
  { value: '', label: '(por omision)' },
  ...PERMISSION_MODES.map((mode) => ({ value: mode, label: mode })),
];

function errorFor(field: keyof SessionStartOptionsDraft): string | undefined {
  return errors.value.find((error) => error.field === field)?.message;
}
</script>

<template>
  <details class="admin-panel-disclosure">
    <summary class="admin-panel-disclosure__summary">
      Opciones de arranque de la sesion
    </summary>

    <div class="session-start-options">
      <label class="session-start-options__field">
        Modelo
        <span class="session-start-options__hint">flag real: --model</span>
        <input
          v-model="draft.model"
          type="text"
          placeholder="sonnet, opus, haiku, fable..."
        />
      </label>

      <label class="session-start-options__field">
        Modo de permisos
        <span class="session-start-options__hint"
          >flag real: --permission-mode</span
        >
        <CustomSelect
          :options="permissionModeOptions"
          :model-value="draft.permissionMode"
          @update:model-value="
            draft.permissionMode =
              $event as SessionStartOptionsDraft['permissionMode']
          "
        />
      </label>

      <label class="session-start-options__field">
        Directorios adicionales
        <span class="session-start-options__hint"
          >flag real: --add-dir · uno por linea</span
        >
        <textarea v-model="draft.addDir" rows="2"></textarea>
      </label>

      <label class="session-start-options__field">
        Herramientas permitidas
        <span class="session-start-options__hint"
          >flag real: --allowedTools · una por linea</span
        >
        <textarea v-model="draft.allowedTools" rows="2"></textarea>
      </label>

      <label class="session-start-options__field">
        Herramientas denegadas
        <span class="session-start-options__hint"
          >flag real: --disallowedTools · una por linea</span
        >
        <textarea v-model="draft.disallowedTools" rows="2"></textarea>
      </label>

      <label class="session-start-options__field">
        Limite de gasto (USD)
        <span class="session-start-options__hint"
          >flag real: --max-budget-usd</span
        >
        <input v-model="draft.maxBudgetUsd" type="text" placeholder="5.00" />
        <span
          v-if="errorFor('maxBudgetUsd')"
          class="session-start-options__error"
          role="alert"
        >
          {{ errorFor('maxBudgetUsd') }}
        </span>
      </label>

      <p class="session-start-options__note">
        Todas estas opciones se aplican solo al arrancar la sesion (no en
        caliente) y se recuerdan para la proxima vez.
      </p>
    </div>
  </details>
</template>

<style scoped>
.admin-panel-disclosure {
  border-top: var(--border-width-thin) solid var(--color-border-subtle);
  padding-top: var(--space-4);
}

.admin-panel-disclosure__summary {
  cursor: pointer;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.session-start-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.session-start-options__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.session-start-options__field input,
.session-start-options__field textarea {
  padding: var(--space-2);
  border-radius: var(--radius-md);
  border: var(--border-width-thin) solid var(--color-border-strong);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
}

.session-start-options__field textarea {
  font-family: var(--font-mono);
  resize: vertical;
}

.session-start-options__hint {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.session-start-options__error {
  font-size: var(--text-xs);
  color: var(--color-error);
}

.session-start-options__note {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
</style>

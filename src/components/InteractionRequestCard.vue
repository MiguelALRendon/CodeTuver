<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { InteractionRequest } from '../claude-transport';
import type { ContentBlock } from '../content-interpreter';
import {
  invalidFormFields,
  type InteractionDecision,
} from '../interaction-requests';
import ContentBlockRenderer from './ContentBlockRenderer.vue';

const props = defineProps<{
  request: InteractionRequest;
  decision: InteractionDecision | null;
}>();

const emit = defineEmits<{ respond: [decision: InteractionDecision] }>();

const TYPE_LABELS: Record<InteractionRequest['type'], string> = {
  permission: 'Autorizacion',
  choice: 'Eleccion',
  open_question: 'Pregunta abierta',
  confirmation: 'Confirmacion',
  form: 'Formulario',
};

const typeLabel = computed(() => TYPE_LABELS[props.request.type]);

const permissionInputBlocks = computed<ContentBlock[]>(() => {
  if (props.request.type !== 'permission') return [];
  return [
    {
      type: 'code',
      language: 'json',
      code: JSON.stringify(props.request.input, null, 2),
    },
  ];
});

function respondPermission(allow: boolean): void {
  emit('respond', { type: 'permission', allow });
}

function respondConfirmation(allow: boolean): void {
  emit('respond', { type: 'confirmation', allow });
}

// Seleccion de una sola opcion: el contrato real (`interaction_request.rs`) no trae `allowMultiple`.
const selectedOption = ref('');

function respondChoice(): void {
  if (!selectedOption.value) return;
  emit('respond', { type: 'choice', selected: [selectedOption.value] });
}

const openAnswer = ref('');

function respondOpenQuestion(): void {
  const answer = openAnswer.value.trim();
  if (!answer) return;
  emit('respond', { type: 'open_question', answer });
}

const formValues = reactive<Record<string, string>>({});
const invalidFields = ref<string[]>([]);

function respondForm(): void {
  if (props.request.type !== 'form') return;
  const invalid = invalidFormFields(props.request.fields, formValues);
  invalidFields.value = invalid;
  if (invalid.length > 0) return;
  emit('respond', { type: 'form', values: { ...formValues } });
}
</script>

<template>
  <li
    class="interaction-request"
    :class="{ 'interaction-request--resolved': !!decision }"
  >
    <header class="interaction-request__header">
      <span class="interaction-request__type">{{ typeLabel }}</span>
      <span class="interaction-request__status">{{
        decision ? 'Respondida' : 'Pendiente'
      }}</span>
    </header>

    <template v-if="request.type === 'permission'">
      <p class="interaction-request__summary">
        Herramienta: <strong>{{ request.tool_name }}</strong>
      </p>
      <ContentBlockRenderer :blocks="permissionInputBlocks" />
      <p v-if="decision" class="interaction-request__decision">
        {{
          decision.type === 'permission' && decision.allow
            ? 'Autorizada'
            : 'Rechazada'
        }}
      </p>
      <div v-else class="interaction-request__actions">
        <button
          type="button"
          class="interaction-request__approve"
          @click="respondPermission(true)"
        >
          Aceptar
        </button>
        <button
          type="button"
          class="interaction-request__deny"
          @click="respondPermission(false)"
        >
          Rechazar
        </button>
      </div>
    </template>

    <template v-else-if="request.type === 'confirmation'">
      <p class="interaction-request__summary">{{ request.title }}</p>
      <p v-if="decision" class="interaction-request__decision">
        {{
          decision.type === 'confirmation' && decision.allow
            ? 'Confirmada'
            : 'Rechazada'
        }}
      </p>
      <div v-else class="interaction-request__actions">
        <button
          type="button"
          class="interaction-request__approve"
          @click="respondConfirmation(true)"
        >
          Aceptar
        </button>
        <button
          type="button"
          class="interaction-request__deny"
          @click="respondConfirmation(false)"
        >
          Rechazar
        </button>
      </div>
    </template>

    <template v-else-if="request.type === 'choice'">
      <p v-if="decision" class="interaction-request__summary">
        {{ request.title }}
      </p>
      <p v-if="decision" class="interaction-request__decision">
        Elegido:
        {{ decision.type === 'choice' ? decision.selected.join(', ') : '' }}
      </p>
      <fieldset v-else class="interaction-request__choice-options">
        <legend class="interaction-request__summary">
          {{ request.title }}
        </legend>
        <label
          v-for="option in request.options"
          :key="option"
          class="interaction-request__choice-option"
        >
          <input
            v-model="selectedOption"
            type="radio"
            :name="request.request_id"
            :value="option"
          />
          {{ option }}
        </label>
        <button
          type="button"
          class="interaction-request__approve"
          :disabled="!selectedOption"
          @click="respondChoice"
        >
          Confirmar eleccion
        </button>
      </fieldset>
    </template>

    <template v-else-if="request.type === 'open_question'">
      <p class="interaction-request__summary">{{ request.prompt }}</p>
      <p v-if="decision" class="interaction-request__decision">
        Respuesta:
        {{ decision.type === 'open_question' ? decision.answer : '' }}
      </p>
      <div v-else class="interaction-request__open-question">
        <input
          v-model="openAnswer"
          type="text"
          class="interaction-request__text-input"
          placeholder="Escribe tu respuesta..."
        />
        <button
          type="button"
          class="interaction-request__approve"
          :disabled="!openAnswer.trim()"
          @click="respondOpenQuestion"
        >
          Enviar
        </button>
      </div>
    </template>

    <template v-else-if="request.type === 'form'">
      <p class="interaction-request__summary">{{ request.title }}</p>
      <p v-if="decision" class="interaction-request__decision">
        Formulario enviado
      </p>
      <div v-else class="interaction-request__form">
        <div
          v-for="field in request.fields"
          :key="field"
          class="interaction-request__form-field"
        >
          <label :for="`${request.request_id}-${field}`">{{ field }}</label>
          <input
            :id="`${request.request_id}-${field}`"
            v-model="formValues[field]"
            type="text"
            class="interaction-request__text-input"
            :class="{
              'interaction-request__text-input--invalid':
                invalidFields.includes(field),
            }"
          />
          <span
            v-if="invalidFields.includes(field)"
            class="interaction-request__field-error"
          >
            Campo requerido
          </span>
        </div>
        <button
          type="button"
          class="interaction-request__approve"
          :disabled="
            request.fields.every((field) => !formValues[field]?.trim())
          "
          @click="respondForm"
        >
          Enviar formulario
        </button>
      </div>
    </template>
  </li>
</template>

<style scoped>
.interaction-request {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  border-left: var(--border-width-thick) solid var(--color-warning);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-panel));
}

.interaction-request--resolved {
  border-left-color: var(--color-success);
  opacity: 0.85;
}

.interaction-request__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.interaction-request__type {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.interaction-request__status {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.interaction-request__summary,
.interaction-request__decision {
  margin: 0;
  padding: 0;
  border: none;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}

.interaction-request__decision {
  color: var(--color-text-secondary);
}

.interaction-request__actions {
  display: flex;
  gap: var(--space-2);
}

.interaction-request__approve,
.interaction-request__deny {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}

.interaction-request__approve {
  background: var(--color-success);
  color: var(--color-text-on-accent);
}

.interaction-request__deny {
  background: var(--color-error);
  color: var(--color-text-on-accent);
}

.interaction-request__approve:hover:not(:disabled),
.interaction-request__deny:hover:not(:disabled) {
  filter: brightness(1.12);
}

.interaction-request__approve:disabled,
.interaction-request__deny:disabled {
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.interaction-request__choice-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border: none;
  margin: 0;
  padding: 0;
}

.interaction-request__choice-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}

.interaction-request__open-question,
.interaction-request__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.interaction-request__form-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.interaction-request__form-field label {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.interaction-request__text-input {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: var(--border-width-thin) solid var(--color-border-strong);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
}

.interaction-request__text-input--invalid {
  border-color: var(--color-error);
}

.interaction-request__field-error {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-error);
}
</style>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import type { AvatarController } from '../avatar-controller';
import {
  EDITABLE_STATES,
  EXPRESSION_OPTIONS,
  MAX_CHARACTER_SIZE,
  MAX_TRANSITION_DURATION_MS,
  MIN_CHARACTER_SIZE,
  applyAnchorChange,
  applyAssignmentChange,
  applySizeChange,
  assignmentForState,
  clampTransitionDuration,
  createCharacterEditorState,
  discardEditorChanges,
  markEditorSaved,
  previewAssignment,
  registerImportedAnimation,
  type CharacterEditorState,
  type EditorCapabilities,
} from '../character-editor';
import {
  loadCharacterEditorSettings,
  persistCharacterEditorSettings,
} from '../character-editor-storage';
import { capabilityCellProps } from '../character-editor-capability-cell';
import { PROCEDURAL_CLIP_CATALOG } from '../procedural-animations';
import {
  importAnimationFile,
  listImportedAnimations,
  type ImportedAnimationKind,
  type ImportedAnimationSummary,
} from '../animation-import';
import { errorMessage } from '../error-message';
import { DEFAULT_TRANSITION_DURATION_MS } from '../avatar-transition';
import type { ScreenCorner } from '../monitor-position';
import PoseEditor from './PoseEditor.vue';
import AnimationTimelineEditor from './AnimationTimelineEditor.vue';
import EditorModal from './EditorModal.vue';
import IconGlyph from './IconGlyph.vue';
import CustomSelect, { type CustomSelectOption } from './CustomSelect.vue';

const props = defineProps<{
  characterId: string;
  capabilities: EditorCapabilities;
  avatarController: AvatarController;
  modelUrl: string | null;
  // El separador de fabrica solo tiene sentido cuando este componente esta apilado debajo de otro (Modo Compañera); en un layout de columnas junto al avatar (pestaña "Editor de personaje") no separa nada.
  noSeparatorAbove?: boolean;
}>();
const emit = defineEmits<{
  'settings-saved': [];
  'preview-clip': [id: string];
}>();

const CORNER_OPTIONS: ScreenCorner[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];

const cornerSelectOptions: CustomSelectOption[] = CORNER_OPTIONS.map(
  (corner) => ({ value: corner, label: corner }),
);

function loadEditorState(): CharacterEditorState {
  const persisted = loadCharacterEditorSettings(props.characterId);
  return createCharacterEditorState(
    props.characterId,
    props.capabilities,
    persisted,
  );
}

// El padre remonta este componente con :key cuando cambia el personaje activo.
const editorState = ref<CharacterEditorState>(loadEditorState());

function assignmentFor(state: string) {
  return assignmentForState(editorState.value.editing.assignments, state);
}

function capabilityCellPropsFor(state: string) {
  return {
    expression: capabilityCellProps(
      'Expresion',
      state,
      props.capabilities.expression,
    ),
    animation: capabilityCellProps(
      'Animacion',
      state,
      props.capabilities.animation,
    ),
    pose: capabilityCellProps('Pose', state, props.capabilities.pose),
    mouth: capabilityCellProps(
      'Boca',
      state,
      props.capabilities.mouth,
      props.capabilities.mouth.supported
        ? 'sincronizada automaticamente con el audio'
        : undefined,
    ),
  };
}

const tableRows = computed(() =>
  EDITABLE_STATES.map((state) => ({
    state,
    cell: capabilityCellPropsFor(state),
  })),
);

function setExpression(state: string, expression: string): void {
  editorState.value = applyAssignmentChange(
    editorState.value,
    props.capabilities,
    { ...assignmentFor(state), expression: expression || undefined },
  );
}

const expressionSelectOptions: CustomSelectOption[] = [
  { value: '', label: '(sin asignar)' },
  ...EXPRESSION_OPTIONS.map((option) => ({ value: option, label: option })),
];

const FACTORY_POSE_OPTIONS = PROCEDURAL_CLIP_CATALOG.filter(
  (entry) => entry.kind === 'pose',
);

// Hito 4: catalogo importado, reactivo en este componente; la validez del id la sigue decidiendo character-editor.ts (registerImportedAnimation).
const importedAnimations = ref<ImportedAnimationSummary[]>([]);

onMounted(async () => {
  try {
    const summaries = await listImportedAnimations();
    summaries.forEach(registerImportedAnimation);
    importedAnimations.value = summaries;
  } catch (err) {
    console.error('[animacion] no se pudo listar animaciones importadas:', err);
  }
});

const importedPoseOptions = computed(() =>
  importedAnimations.value.filter((entry) => entry.kind === 'pose'),
);

const poseSelectOptions = computed<CustomSelectOption[]>(() => [
  { value: '', label: '(sin asignar)' },
  ...FACTORY_POSE_OPTIONS.map((entry) => ({
    value: entry.id,
    label: `Fabrica: ${entry.id}`,
  })),
  ...importedPoseOptions.value.map((entry) => ({
    value: entry.savedPath,
    label: `Guardado: ${entry.name}`,
  })),
]);

function factoryAnimationOptions(state: string) {
  const assigned = new Set(assignmentFor(state).animations ?? []);
  return PROCEDURAL_CLIP_CATALOG.filter(
    (entry) => entry.kind === 'animation' && !assigned.has(entry.id),
  );
}

function importedAnimationOptionsFor(state: string) {
  const assigned = new Set(assignmentFor(state).animations ?? []);
  return importedAnimations.value.filter(
    (entry) => entry.kind === 'animation' && !assigned.has(entry.savedPath),
  );
}

function addAnimationOptionsFor(state: string): CustomSelectOption[] {
  return [
    ...factoryAnimationOptions(state).map((entry) => ({
      value: entry.id,
      label: `Fabrica: ${entry.id}`,
    })),
    ...importedAnimationOptionsFor(state).map((entry) => ({
      value: entry.savedPath,
      label: `Guardado: ${entry.name}`,
    })),
  ];
}

// "guardado" cubre tanto lo importado (Hito 4) como lo creado en el editor de posado (Hito 5): ambos comparten el mismo catalogo y no son distinguibles tras un reinicio de la app.
function animationLabel(id: string): string {
  const saved = importedAnimations.value.find(
    (entry) => entry.savedPath === id,
  );
  return saved ? `${saved.name} (guardado)` : id;
}

function addAnimation(state: string, id: string): void {
  if (!id) return;
  const current = assignmentFor(state).animations ?? [];
  if (current.includes(id)) return;
  editorState.value = applyAssignmentChange(
    editorState.value,
    props.capabilities,
    { ...assignmentFor(state), animations: [...current, id] },
  );
}

function removeAnimation(state: string, id: string): void {
  const current = assignmentFor(state).animations ?? [];
  editorState.value = applyAssignmentChange(
    editorState.value,
    props.capabilities,
    {
      ...assignmentFor(state),
      animations: current.filter((existing) => existing !== id),
    },
  );
}

function setPose(state: string, pose: string): void {
  editorState.value = applyAssignmentChange(
    editorState.value,
    props.capabilities,
    {
      ...assignmentFor(state),
      pose: pose || undefined,
      poseCleared: pose ? undefined : true,
    },
  );
}

const pendingAnimationImportPath = ref<string | null>(null);
const pendingAnimationImportKind = ref<ImportedAnimationKind>('animation');
const isImportingAnimation = ref(false);
const animationImportError = ref<string | null>(null);
const pickAnimationButtonRef = ref<HTMLButtonElement | null>(null);

const importKindOptions = computed(() => {
  const options: { value: ImportedAnimationKind; label: string }[] = [];
  if (props.capabilities.animation.supported) {
    options.push({ value: 'animation', label: 'Animacion (bucle de fondo)' });
  }
  if (props.capabilities.pose.supported) {
    options.push({ value: 'pose', label: 'Pose (puntual)' });
  }
  return options;
});

function returnFocusToPickButton(): void {
  nextTick(() => pickAnimationButtonRef.value?.focus());
}

async function pickAnimationFile(): Promise<void> {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Animacion o pose VRMA', extensions: ['vrma'] }],
    });
    if (typeof selected === 'string') {
      pendingAnimationImportPath.value = selected;
      pendingAnimationImportKind.value =
        importKindOptions.value[0]?.value ?? 'animation';
      animationImportError.value = null;
    }
  } catch (err) {
    animationImportError.value = errorMessage(err);
  }
}

function cancelAnimationImport(): void {
  pendingAnimationImportPath.value = null;
  returnFocusToPickButton();
}

// Fallo aislado: un .vrma corrupto o con extension incorrecta no tumba el editor.
async function confirmAnimationImport(): Promise<void> {
  if (!pendingAnimationImportPath.value) return;
  isImportingAnimation.value = true;
  animationImportError.value = null;
  try {
    const summary = await importAnimationFile(
      pendingAnimationImportPath.value,
      pendingAnimationImportKind.value,
    );
    registerImportedAnimation(summary);
    importedAnimations.value = [...importedAnimations.value, summary];
    pendingAnimationImportPath.value = null;
    statusMessage.value = `Importado: "${summary.name}" (${summary.kind}). Ya disponible para asignar en cualquier estado.`;
    returnFocusToPickButton();
  } catch (err) {
    animationImportError.value = errorMessage(err);
  } finally {
    isImportingAnimation.value = false;
  }
}

type EditorMode = 'nueva' | 'editar-animacion' | 'editar-pose';

interface EditorContext {
  state: string;
  mode: EditorMode;
  targetAnimationId?: string;
}

const activeEditorContext = ref<EditorContext | null>(null);

const isPoseEditorOpen = ref(false);

function openPoseEditor(state: string, mode: 'nueva' | 'editar-pose'): void {
  activeEditorContext.value = { state, mode };
  isPoseEditorOpen.value = true;
}

function closePoseEditor(): void {
  isPoseEditorOpen.value = false;
  activeEditorContext.value = null;
}

// D5b: ni "nueva" ni "editar-pose" precargan (sin parser inverso de .vrma); ambas terminan asignando el resultado al estado.
function onPoseSaved(summary: ImportedAnimationSummary): void {
  registerImportedAnimation(summary);
  importedAnimations.value = [...importedAnimations.value, summary];
  const context = activeEditorContext.value;
  if (context) {
    setPose(context.state, summary.savedPath);
  }
  closePoseEditor();
  statusMessage.value = `Pose creada: "${summary.name}". Ya disponible para asignar en cualquier estado.`;
}

const isTimelineEditorOpen = ref(false);

function openTimelineEditor(
  state: string,
  mode: 'nueva' | 'editar-animacion',
  targetAnimationId?: string,
): void {
  activeEditorContext.value = { state, mode, targetAnimationId };
  isTimelineEditorOpen.value = true;
}

function closeTimelineEditor(): void {
  isTimelineEditorOpen.value = false;
  activeEditorContext.value = null;
}

function replaceAnimation(
  state: string,
  targetId: string,
  newId: string,
): void {
  const current = assignmentFor(state).animations ?? [];
  editorState.value = applyAssignmentChange(
    editorState.value,
    props.capabilities,
    {
      ...assignmentFor(state),
      animations: current.map((id) => (id === targetId ? newId : id)),
    },
  );
}

// "editar-animacion" reemplaza en el mismo indice (D5b); desde H7 el editor ya precarga los keyframes reales via edit-clip-id.
function onAnimationSaved(summary: ImportedAnimationSummary): void {
  registerImportedAnimation(summary);
  importedAnimations.value = [...importedAnimations.value, summary];
  const context = activeEditorContext.value;
  if (context?.mode === 'nueva') {
    addAnimation(context.state, summary.savedPath);
  } else if (
    context?.mode === 'editar-animacion' &&
    context.targetAnimationId
  ) {
    replaceAnimation(
      context.state,
      context.targetAnimationId,
      summary.savedPath,
    );
  }
  closeTimelineEditor();
  statusMessage.value = `Animacion creada: "${summary.name}". Ya disponible para asignar en cualquier estado.`;
}

function setCorner(corner: ScreenCorner): void {
  editorState.value = applyAnchorChange(editorState.value, {
    ...editorState.value.editing.anchor,
    corner,
  });
}

function setMarginX(marginX: number): void {
  editorState.value = applyAnchorChange(editorState.value, {
    ...editorState.value.editing.anchor,
    marginX,
  });
}

function setMarginY(marginY: number): void {
  editorState.value = applyAnchorChange(editorState.value, {
    ...editorState.value.editing.anchor,
    marginY,
  });
}

function setSize(size: number): void {
  editorState.value = applySizeChange(editorState.value, size);
}

// Global deliberado: D5/D5b no piden control de transicion por fila, solo gestion de animacion/pose.
const transitionDurationMs = computed(
  () =>
    editorState.value.editing.assignments[0]?.transitionDurationMs ??
    DEFAULT_TRANSITION_DURATION_MS,
);

function setTransitionDuration(ms: number): void {
  const clampedMs = clampTransitionDuration(ms);
  EDITABLE_STATES.forEach((state) => {
    editorState.value = applyAssignmentChange(
      editorState.value,
      props.capabilities,
      { ...assignmentFor(state), transitionDurationMs: clampedMs },
    );
  });
}

const statusMessage = ref<string | null>(null);

// setState ya dispara, via el snapshot compartido, el watch de VrmAvatar que arranca el pool/pose del Hito 1.
function testAssignment(state: string): void {
  previewAssignment(props.avatarController, assignmentFor(state));
  statusMessage.value = `Reaccion de "${state}" disparada en el personaje activo: expresion, pool de animaciones y pose.`;
}

function saveChanges(): void {
  editorState.value = markEditorSaved(editorState.value);
  persistCharacterEditorSettings(props.characterId, editorState.value.saved);
  emit('settings-saved');
  statusMessage.value = 'Cambios guardados.';
}

// D12 (correcciones-qa-gauntlet Hito 14): dialogo propio (EditorModal, ya usado por los editores de pose/animacion de este mismo archivo) en vez de window.confirm() nativo -- mismo patron accesible (role="alertdialog", foco atrapado) del resto de confirmaciones destructivas de la app, y automatizable por CDP/DOM.
const discardConfirmOpen = ref(false);

function discardChanges(): void {
  discardConfirmOpen.value = true;
}

function cancelDiscardChanges(): void {
  discardConfirmOpen.value = false;
}

function confirmDiscardChanges(): void {
  discardConfirmOpen.value = false;
  editorState.value = discardEditorChanges(editorState.value);
  statusMessage.value = 'Cambios descartados, vuelto a los valores originales.';
}
</script>

<template>
  <details
    class="character-editor"
    :class="{ 'character-editor--no-separator': noSeparatorAbove }"
  >
    <summary class="character-editor__summary">Editor de personaje</summary>

    <div class="character-editor__rows">
      <details
        v-for="row in tableRows"
        :key="row.state"
        class="character-editor__state-row"
      >
        <summary
          class="character-editor__state-summary"
          :aria-label="`Estado ${row.state}`"
        >
          <span class="character-editor__state-name">{{ row.state }}</span>
          <CustomSelect
            :options="expressionSelectOptions"
            :disabled="row.cell.expression.disabled"
            :aria-label="row.cell.expression.ariaLabel"
            :title="row.cell.expression.title"
            :model-value="assignmentFor(row.state).expression ?? ''"
            @click.stop
            @update:model-value="setExpression(row.state, $event)"
          />
          <button
            type="button"
            class="character-editor__test-button"
            :aria-label="`Probar reaccion de ${row.state}`"
            @click.stop="testAssignment(row.state)"
          >
            <IconGlyph name="play" />
          </button>
        </summary>

        <div class="character-editor__section">
          <h4 class="character-editor__section-title">Animaciones</h4>
          <div class="character-editor__animation-cell">
            <span
              v-for="id in assignmentFor(row.state).animations ?? []"
              :key="id"
              class="character-editor__chip"
            >
              <span class="character-editor__chip-label">{{
                animationLabel(id)
              }}</span>
              <button
                type="button"
                class="character-editor__chip-action"
                :aria-label="`Ejecutar animacion ${id} de ${row.state}`"
                @click="emit('preview-clip', id)"
              >
                <IconGlyph name="play" />
              </button>
              <button
                type="button"
                class="character-editor__chip-action"
                :aria-label="`Editar animacion ${id} de ${row.state}`"
                @click="openTimelineEditor(row.state, 'editar-animacion', id)"
              >
                <IconGlyph name="edit" />
              </button>
              <button
                type="button"
                class="character-editor__chip-remove"
                :aria-label="`Quitar animacion ${id} de ${row.state}`"
                @click="removeAnimation(row.state, id)"
              >
                <IconGlyph name="close" />
              </button>
            </span>
          </div>
          <div class="character-editor__section-actions">
            <CustomSelect
              :options="addAnimationOptionsFor(row.state)"
              :disabled="row.cell.animation.disabled"
              :aria-label="row.cell.animation.ariaLabel"
              :title="row.cell.animation.title"
              placeholder="(agregar animacion)"
              model-value=""
              @update:model-value="addAnimation(row.state, $event)"
            />
            <button
              type="button"
              class="character-editor__test-button"
              :disabled="row.cell.animation.disabled"
              :aria-label="`Crear animacion nueva para ${row.state}`"
              @click="openTimelineEditor(row.state, 'nueva')"
            >
              <IconGlyph name="plus" />
            </button>
          </div>
        </div>

        <div class="character-editor__section">
          <h4 class="character-editor__section-title">Pose</h4>
          <p
            v-if="assignmentFor(row.state).pose"
            class="character-editor__pose-current"
          >
            {{ assignmentFor(row.state).pose }}
            <button
              type="button"
              class="character-editor__chip-action"
              :aria-label="`Editar pose de ${row.state}`"
              @click="openPoseEditor(row.state, 'editar-pose')"
            >
              <IconGlyph name="edit" />
            </button>
          </p>
          <div class="character-editor__section-actions">
            <CustomSelect
              :options="poseSelectOptions"
              :disabled="row.cell.pose.disabled"
              :aria-label="row.cell.pose.ariaLabel"
              :title="row.cell.pose.title"
              :model-value="assignmentFor(row.state).pose ?? ''"
              @update:model-value="setPose(row.state, $event)"
            />
            <button
              type="button"
              class="character-editor__test-button"
              :disabled="row.cell.pose.disabled"
              :aria-label="`Crear pose nueva para ${row.state}`"
              @click="openPoseEditor(row.state, 'nueva')"
            >
              <IconGlyph name="plus" />
            </button>
          </div>
        </div>

        <div class="character-editor__section">
          <h4 class="character-editor__section-title">Boca</h4>
          <input
            type="text"
            class="character-editor__text-input"
            :class="
              capabilities.mouth.supported
                ? 'character-editor__text-input--mouth-active'
                : 'character-editor__text-input--unsupported'
            "
            disabled
            :placeholder="
              capabilities.mouth.supported
                ? 'sincronizada automaticamente con el audio'
                : 'no soportado'
            "
            :aria-label="row.cell.mouth.ariaLabel"
            :title="row.cell.mouth.title"
          />
        </div>
      </details>
    </div>

    <p
      v-if="!capabilities.expression.supported"
      class="character-editor__disabled-reason"
    >
      Expresion deshabilitada: {{ capabilities.expression.reason }}
    </p>
    <p
      v-if="!capabilities.animation.supported"
      class="character-editor__disabled-reason"
    >
      Animacion deshabilitada: {{ capabilities.animation.reason }}
    </p>
    <p
      v-if="!capabilities.pose.supported"
      class="character-editor__disabled-reason"
    >
      Pose deshabilitada: {{ capabilities.pose.reason }}
    </p>
    <p
      v-if="!capabilities.mouth.supported"
      class="character-editor__disabled-reason"
    >
      Boca deshabilitada: {{ capabilities.mouth.reason }}
    </p>

    <div class="character-editor__import">
      <h3 class="character-editor__import-title">Importar animacion o pose</h3>
      <button
        ref="pickAnimationButtonRef"
        type="button"
        class="session-panel__button"
        :disabled="
          !capabilities.animation.supported && !capabilities.pose.supported
        "
        @click="pickAnimationFile"
      >
        Elegir archivo (.vrma)
      </button>

      <div
        v-if="pendingAnimationImportPath"
        class="character-editor__import-confirm"
      >
        <p class="session-panel__folder">{{ pendingAnimationImportPath }}</p>
        <label class="character-editor__field">
          Tipo de contenido
          <CustomSelect
            :options="importKindOptions"
            :model-value="pendingAnimationImportKind"
            @update:model-value="
              pendingAnimationImportKind = $event as ImportedAnimationKind
            "
          />
        </label>
        <div class="session-panel__row">
          <button
            type="button"
            class="session-panel__button"
            :disabled="isImportingAnimation"
            @click="confirmAnimationImport"
          >
            {{
              isImportingAnimation ? 'Importando...' : 'Confirmar importacion'
            }}
          </button>
          <button
            type="button"
            class="session-panel__button"
            :disabled="isImportingAnimation"
            @click="cancelAnimationImport"
          >
            Cancelar
          </button>
        </div>
      </div>

      <p
        v-if="animationImportError"
        class="session-panel__error"
        aria-live="polite"
      >
        <IconGlyph name="error" />{{ animationImportError }}
      </p>
    </div>

    <template v-if="modelUrl && capabilities.pose.supported">
      <EditorModal
        v-if="isPoseEditorOpen"
        title="Editor de posado"
        @close="closePoseEditor"
      >
        <PoseEditor
          :model-url="modelUrl"
          @saved="onPoseSaved"
          @close="closePoseEditor"
        />
      </EditorModal>
    </template>

    <template v-if="modelUrl && capabilities.animation.supported">
      <EditorModal
        v-if="isTimelineEditorOpen"
        title="Editor de animacion"
        @close="closeTimelineEditor"
      >
        <AnimationTimelineEditor
          :model-url="modelUrl"
          :edit-clip-id="
            activeEditorContext?.mode === 'editar-animacion'
              ? activeEditorContext.targetAnimationId
              : undefined
          "
          @saved="onAnimationSaved"
          @close="closeTimelineEditor"
        />
      </EditorModal>
    </template>

    <EditorModal
      v-if="discardConfirmOpen"
      title="Descartar cambios"
      role="alertdialog"
      @close="cancelDiscardChanges"
    >
      <p>Se perderan los cambios sin guardar. ¿Descartar?</p>
      <div class="session-panel__row">
        <button
          type="button"
          class="session-panel__button session-panel__button--danger"
          @click="confirmDiscardChanges"
        >
          Descartar
        </button>
        <button
          type="button"
          class="session-panel__button"
          @click="cancelDiscardChanges"
        >
          Cancelar
        </button>
      </div>
    </EditorModal>

    <div class="character-editor__layout">
      <label class="character-editor__field">
        Esquina
        <CustomSelect
          :options="cornerSelectOptions"
          :model-value="editorState.editing.anchor.corner"
          @update:model-value="setCorner($event as ScreenCorner)"
        />
      </label>
      <label class="character-editor__field">
        Margen X (px)
        <input
          type="number"
          class="character-editor__number-input"
          min="0"
          :value="editorState.editing.anchor.marginX"
          @change="
            setMarginX(Number(($event.target as HTMLInputElement).value))
          "
        />
      </label>
      <label class="character-editor__field">
        Margen Y (px)
        <input
          type="number"
          class="character-editor__number-input"
          min="0"
          :value="editorState.editing.anchor.marginY"
          @change="
            setMarginY(Number(($event.target as HTMLInputElement).value))
          "
        />
      </label>
      <label class="character-editor__field">
        Tamano
        <input
          type="number"
          class="character-editor__number-input"
          step="0.1"
          :min="MIN_CHARACTER_SIZE"
          :max="MAX_CHARACTER_SIZE"
          :value="editorState.editing.size"
          @change="setSize(Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="character-editor__field">
        Transicion (ms)
        <input
          type="number"
          class="character-editor__number-input"
          min="0"
          :max="MAX_TRANSITION_DURATION_MS"
          step="50"
          :value="transitionDurationMs"
          @change="
            setTransitionDuration(
              Number(($event.target as HTMLInputElement).value),
            )
          "
        />
      </label>
    </div>

    <div class="character-editor__actions">
      <button type="button" class="session-panel__button" @click="saveChanges">
        Guardar
      </button>
      <button
        type="button"
        class="session-panel__button"
        @click="discardChanges"
      >
        Descartar cambios
      </button>
    </div>
    <p v-if="statusMessage" class="character-editor__status" aria-live="polite">
      {{ statusMessage }}
    </p>
  </details>
</template>

<style scoped>
.character-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  border-top: var(--border-width-thin) solid var(--color-border-subtle);
  padding-top: var(--space-4);
}

.character-editor--no-separator {
  border-top: none;
  padding-top: 0;
}

.character-editor__summary {
  cursor: pointer;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.character-editor__rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.character-editor__state-row {
  border: var(--border-width-thin) solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
}

.character-editor__state-summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-panel));
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}

.character-editor__state-name {
  font-weight: var(--font-weight-bold);
  color: var(--color-text-secondary);
}

.character-editor__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: var(--border-width-thin) solid var(--color-border-subtle);
}

.character-editor__section-title {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-secondary);
}

.character-editor__section-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.character-editor__pose-current {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-primary);
}

.character-editor__text-input,
.character-editor__number-input {
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  border: var(--border-width-thin) solid var(--color-border-strong);
  background: var(--color-surface-base);
  backdrop-filter: blur(var(--blur-panel));
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
}

.character-editor__text-input:disabled {
  color: var(--color-text-muted);
  background: var(--color-surface-raised);
  cursor: not-allowed;
}

/* Boca soportada: disabled solo por ser de solo lectura (auto-sincronizada), no por falta de soporte. */
.character-editor__text-input--mouth-active:disabled {
  color: var(--color-success);
  background: var(--color-surface-base);
  cursor: default;
}

.character-editor__text-input--unsupported {
  border-style: dashed;
}

.character-editor__animation-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
}

.character-editor__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-panel));
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-primary);
}

.character-editor__chip-label {
  max-width: var(--size-chip-label-max);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: var(--font-mono);
}

.character-editor__chip-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-1);
  min-height: calc(var(--space-4) + var(--space-1));
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-standard);
}

.character-editor__chip-action:hover {
  color: var(--color-accent-primary);
}

.character-editor__chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: calc(var(--space-4) + var(--space-1));
  min-height: calc(var(--space-4) + var(--space-1));
  padding: var(--space-1);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  line-height: 1;
  cursor: pointer;
  transition: color var(--duration-fast) var(--ease-standard);
}

.character-editor__chip-remove:hover {
  color: var(--color-error);
}

.character-editor__test-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-panel));
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}

.character-editor__test-button:hover {
  background: var(--color-accent-primary);
  color: var(--color-text-on-accent);
}

.character-editor__disabled-reason {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.character-editor__status {
  margin: var(--space-2) 0 0;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-success);
}

.character-editor__import {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-top: var(--border-width-thin) solid var(--color-border-subtle);
  padding-top: var(--space-4);
}

.character-editor__import-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.character-editor__import-confirm {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}

.character-editor__layout {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.character-editor__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.character-editor__actions {
  display: flex;
  gap: var(--space-2);
}
</style>

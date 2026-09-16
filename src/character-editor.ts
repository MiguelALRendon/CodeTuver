import type {
  AvatarController,
  AvatarExpression,
  AvatarState,
} from './avatar-controller';
import { resolveMood } from './avatar-face-presentation';
import {
  animationPoolForState,
  poseForState,
  PROCEDURAL_CLIPS_BY_ID,
} from './procedural-animations';
import type {
  ScreenCornerPosition,
  WindowDimensions,
} from './monitor-position';
import type {
  CharacterCapabilities,
  ImportedCharacterFormat,
} from './character-import';
import type { ImportedAnimationSummary } from './animation-import';

// Mismo vocabulario que docs/reference/avatar-reacciones-voz.md ("Estados iniciales").
export const EDITABLE_STATES: AvatarState[] = [
  'idle',
  'thinking',
  'reading',
  'coding',
  'executing',
  'waiting_permission',
  'success',
  'error',
  'confused',
  'sleeping',
  'speaking',
];

// Mismo vocabulario que docs/reference/avatar-reacciones-voz.md ("Expresiones iniciales").
export const EXPRESSION_OPTIONS: AvatarExpression[] = [
  'neutral',
  'happy',
  'sad',
  'surprised',
  'confused',
  'angry',
  'tired',
  'excited',
];

// Mapea el mood ya calculado por resolveMood() a la expresion mas cercana ya usada en reaction-catalog.ts para estados equivalentes.
const MOOD_TO_EXPRESSION: Record<string, AvatarExpression> = {
  neutral: 'neutral',
  active: 'neutral',
  waiting: 'confused',
  positive: 'happy',
  negative: 'sad',
  resting: 'tired',
};

export interface StateAssignment {
  state: AvatarState;
  expression?: AvatarExpression;
  animations?: string[];
  pose?: string;
  // true cuando el usuario eligio "(sin asignar)" a proposito — distingue de "nunca personalizado" (undefined), que si cae al default de fabrica.
  poseCleared?: boolean;
  transitionDurationMs?: number;
}

export interface AxisCapability {
  supported: boolean;
  reason: string | null;
}

export interface EditorCapabilities {
  expression: AxisCapability;
  animation: AxisCapability;
  pose: AxisCapability;
  mouth: AxisCapability;
}

const NO_POSE_IMPORTED =
  'sin renderizador real que aplique poses todavia (mismo alcance declarado en el Hito 4)';
const NO_ANIMATION_IMPORTED =
  'sin renderizador real que aplique animaciones todavia (mismo alcance declarado en el Hito 4)';
const NO_EXPRESSION_IMPORTED = 'el formato no declaro control de expresion';
const NO_MOUTH_IMPORTED = 'el formato no declaro control de boca';

export function capabilitiesForTestAvatar(): EditorCapabilities {
  return {
    expression: { supported: true, reason: null },
    animation: { supported: true, reason: null },
    pose: { supported: true, reason: null },
    mouth: { supported: true, reason: null },
  };
}

export function capabilitiesForImportedCharacter(
  imported: CharacterCapabilities,
  format: ImportedCharacterFormat,
): EditorCapabilities {
  // El motor de animacion/pose ya es generico (vrm-clip-retarget.ts); solo Live2D carece de renderizador real.
  const rendersAnimationAndPose = format === 'vrm';
  return {
    expression: {
      supported: imported.expression,
      reason: imported.expression ? null : NO_EXPRESSION_IMPORTED,
    },
    animation: {
      supported: rendersAnimationAndPose,
      reason: rendersAnimationAndPose ? null : NO_ANIMATION_IMPORTED,
    },
    pose: {
      supported: rendersAnimationAndPose,
      reason: rendersAnimationAndPose ? null : NO_POSE_IMPORTED,
    },
    mouth: {
      supported: imported.mouth,
      reason: imported.mouth ? null : NO_MOUTH_IMPORTED,
    },
  };
}

// savedPath como id: resoluble por VrmAvatar.resolveClip via URL.
const importedAnimations = new Map<string, ImportedAnimationSummary>();

export function registerImportedAnimation(
  summary: ImportedAnimationSummary,
): void {
  importedAnimations.set(summary.savedPath, summary);
}

export function importedAnimationCatalog(): ImportedAnimationSummary[] {
  return [...importedAnimations.values()];
}

function isKnownClipId(id: string): boolean {
  return PROCEDURAL_CLIPS_BY_ID.has(id) || importedAnimations.has(id);
}

function sanitizeAssignment(
  assignment: StateAssignment,
  capabilities: EditorCapabilities,
): StateAssignment {
  const pose = assignment.pose;
  return {
    state: assignment.state,
    expression: capabilities.expression.supported
      ? assignment.expression
      : undefined,
    animations: capabilities.animation.supported
      ? assignment.animations?.filter(isKnownClipId)
      : undefined,
    pose:
      capabilities.pose.supported && pose && isKnownClipId(pose)
        ? pose
        : undefined,
    poseCleared: assignment.poseCleared,
    transitionDurationMs: assignment.transitionDurationMs,
  };
}

export function defaultAssignmentsFor(
  capabilities: EditorCapabilities,
): StateAssignment[] {
  return EDITABLE_STATES.map((state) =>
    sanitizeAssignment(
      {
        state,
        expression: MOOD_TO_EXPRESSION[resolveMood(state)],
        animations: [...animationPoolForState(state)],
        pose: poseForState(state),
      },
      capabilities,
    ),
  );
}

// Shape previo a animaciones/poses (D8) dejaba entradas sin `animations`/`pose`; se completan campo a campo desde fabrica, preservando lo ya personalizado (Hallazgo 5).
function fillMissingAnimationFields(
  assignments: StateAssignment[],
  capabilities: EditorCapabilities,
): StateAssignment[] {
  const defaults = defaultAssignmentsFor(capabilities);
  return assignments.map((entry) => {
    const fallback = defaults.find((d) => d.state === entry.state);
    if (!fallback) return entry;
    return {
      ...entry,
      // Un array vacio cuenta como "sin asignar" (nunca se guardo nada real), no como personalizacion deliberada de silencio.
      animations: entry.animations?.length
        ? entry.animations
        : fallback.animations,
      // A diferencia de animations, pose SI distingue "nunca personalizado" (cae a fabrica) de "sin asignar a proposito" (poseCleared, se respeta).
      pose: entry.pose ?? (entry.poseCleared ? undefined : fallback.pose),
    };
  });
}

// Traduce el vocabulario real del motor de reacciones (~55 valores de `state`) al vocabulario curado del Editor (Hallazgo 6); solo cubre estados con trigger real hoy (ver qa-sesion-real-hallazgos.md).
export const REACTION_STATE_ALIASES: Record<string, AvatarState> = {
  pensativa: 'thinking',
  confundida: 'confused',
  'no-entendio': 'confused',
  'error-grave': 'error',
  'error-recuperable': 'error',
  concentrada: 'thinking',
  sorprendida: 'waiting_permission',
  alarmada: 'error',
  curiosa: 'reading',
  despertando: 'idle',
  explorando: 'thinking',
  'buscando-referencias': 'thinking',
  'analizando-dependencias': 'thinking',
  planificando: 'thinking',
  'eliminando-codigo': 'coding',
  'ejecutando-pruebas': 'executing',
  compilando: 'executing',
  'instalando-dependencias': 'executing',
  'revisando-errores': 'thinking',
  'comparando-cambios': 'thinking',
  'generando-diff': 'thinking',
  'cambio-aplicado': 'coding',
  'necesita-aclaracion': 'confused',
  'advirtiendo-riesgo': 'waiting_permission',
};

export function assignmentForState(
  assignments: StateAssignment[],
  state: AvatarState,
): StateAssignment {
  const exact = assignments.find((entry) => entry.state === state);
  if (exact) return exact;
  const aliasTarget = REACTION_STATE_ALIASES[state];
  if (!aliasTarget) return { state };
  return assignments.find((entry) => entry.state === aliasTarget) ?? { state };
}

// Sin config persistida (personaje nunca abierto en el Editor), el avatar en vivo debe sonar igual que el Editor lo muestra: los defaults de fabrica, no silencio.
export function resolveActiveStateAssignment(
  persisted: CharacterEditorSettings | null,
  capabilities: EditorCapabilities,
  state: AvatarState,
): StateAssignment {
  const settings = persisted ?? defaultCharacterEditorSettings(capabilities);
  const migratedAssignments = fillMissingAnimationFields(
    settings.assignments,
    capabilities,
  );
  const resolved = assignmentForState(migratedAssignments, state);
  const isCuratedState = (EDITABLE_STATES as string[]).includes(state);
  const hasResolvedContent = Boolean(
    resolved.animations?.length || resolved.pose,
  );
  if (isCuratedState || hasResolvedContent) {
    return resolved;
  }
  // state real (no curado) sin coincidencia exacta ni alias: fallback generico via animationPoolForState/poseForState (funciones totales), nunca silencio total.
  return sanitizeAssignment(
    {
      state,
      animations: [...animationPoolForState(state)],
      pose: poseForState(state),
    },
    capabilities,
  );
}

export interface CharacterFootprint {
  baseWidth: number;
  baseHeight: number;
}

export const MIN_CHARACTER_SIZE = 0.5;
export const MAX_CHARACTER_SIZE = 2;
export const DEFAULT_CHARACTER_SIZE = 1;

export const DEFAULT_ANCHOR: ScreenCornerPosition = {
  corner: 'bottom-right',
  marginX: 24,
  marginY: 24,
};

// 8rem = --size-poc-avatar (constants.css); base de referencia hasta que exista un footprint real por personaje.
export const DEFAULT_CHARACTER_FOOTPRINT: CharacterFootprint = {
  baseWidth: 128,
  baseHeight: 128,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function clampCharacterSize(size: number): number {
  return clamp(size, MIN_CHARACTER_SIZE, MAX_CHARACTER_SIZE);
}

export const MIN_TRANSITION_DURATION_MS = 0;
export const MAX_TRANSITION_DURATION_MS = 10000;

export function clampTransitionDuration(durationMs: number): number {
  return clamp(
    durationMs,
    MIN_TRANSITION_DURATION_MS,
    MAX_TRANSITION_DURATION_MS,
  );
}

export const MIN_ROTATION_DEGREES = -360;
export const MAX_ROTATION_DEGREES = 360;

export function clampRotationDegrees(degrees: number): number {
  return clamp(degrees, MIN_ROTATION_DEGREES, MAX_ROTATION_DEGREES);
}

export function isAnchorWithinArea(
  anchor: ScreenCornerPosition,
  size: number,
  footprint: CharacterFootprint,
  area: WindowDimensions,
): boolean {
  if (anchor.marginX < 0 || anchor.marginY < 0) return false;
  const width = footprint.baseWidth * size;
  const height = footprint.baseHeight * size;
  return (
    anchor.marginX + width <= area.width &&
    anchor.marginY + height <= area.height
  );
}

export function clampAnchorToArea(
  anchor: ScreenCornerPosition,
  size: number,
  footprint: CharacterFootprint,
  area: WindowDimensions,
): ScreenCornerPosition {
  const width = footprint.baseWidth * size;
  const height = footprint.baseHeight * size;
  const maxMarginX = Math.max(0, area.width - width);
  const maxMarginY = Math.max(0, area.height - height);
  return {
    corner: anchor.corner,
    marginX: clamp(anchor.marginX, 0, maxMarginX),
    marginY: clamp(anchor.marginY, 0, maxMarginY),
  };
}

function defaultViewportArea(): WindowDimensions {
  return { width: window.innerWidth, height: window.innerHeight };
}

export interface CharacterEditorSettings {
  assignments: StateAssignment[];
  anchor: ScreenCornerPosition;
  size: number;
}

export interface CharacterEditorState {
  characterId: string;
  original: CharacterEditorSettings;
  saved: CharacterEditorSettings;
  editing: CharacterEditorSettings;
}

export function defaultCharacterEditorSettings(
  capabilities: EditorCapabilities,
): CharacterEditorSettings {
  return {
    assignments: defaultAssignmentsFor(capabilities),
    anchor: DEFAULT_ANCHOR,
    size: DEFAULT_CHARACTER_SIZE,
  };
}

function cloneSettings(
  settings: CharacterEditorSettings,
): CharacterEditorSettings {
  return {
    assignments: settings.assignments.map((entry) => ({ ...entry })),
    anchor: { ...settings.anchor },
    size: settings.size,
  };
}

// El estado "original" son los defaults calculados, no el ultimo guardado: descartar vuelve aqui (paso 5.6).
export function createCharacterEditorState(
  characterId: string,
  capabilities: EditorCapabilities,
  persisted: CharacterEditorSettings | null,
): CharacterEditorState {
  const original = defaultCharacterEditorSettings(capabilities);
  const saved = persisted
    ? {
        ...persisted,
        assignments: fillMissingAnimationFields(
          persisted.assignments,
          capabilities,
        ),
      }
    : original;
  return { characterId, original, saved, editing: cloneSettings(saved) };
}

export function discardEditorChanges(
  editorState: CharacterEditorState,
): CharacterEditorState {
  return { ...editorState, editing: cloneSettings(editorState.original) };
}

export function markEditorSaved(
  editorState: CharacterEditorState,
): CharacterEditorState {
  return { ...editorState, saved: cloneSettings(editorState.editing) };
}

export function applyAssignmentChange(
  editorState: CharacterEditorState,
  capabilities: EditorCapabilities,
  next: StateAssignment,
): CharacterEditorState {
  const sanitized = sanitizeAssignment(next, capabilities);
  const assignments = editorState.editing.assignments.map((entry) =>
    entry.state === sanitized.state ? sanitized : entry,
  );
  return { ...editorState, editing: { ...editorState.editing, assignments } };
}

export function applyAnchorChange(
  editorState: CharacterEditorState,
  anchor: ScreenCornerPosition,
  area: WindowDimensions = defaultViewportArea(),
): CharacterEditorState {
  const clamped = clampAnchorToArea(
    anchor,
    editorState.editing.size,
    DEFAULT_CHARACTER_FOOTPRINT,
    area,
  );
  return {
    ...editorState,
    editing: { ...editorState.editing, anchor: clamped },
  };
}

export function applySizeChange(
  editorState: CharacterEditorState,
  size: number,
  area: WindowDimensions = defaultViewportArea(),
): CharacterEditorState {
  const clampedSize = clampCharacterSize(size);
  const anchor = clampAnchorToArea(
    editorState.editing.anchor,
    clampedSize,
    DEFAULT_CHARACTER_FOOTPRINT,
    area,
  );
  return {
    ...editorState,
    editing: { ...editorState.editing, size: clampedSize, anchor },
  };
}

// Reutiliza el AvatarController real (Hito 2): mismo camino que ReactionEngine.emit, sin via de disparo nueva.
export function previewAssignment(
  avatarController: AvatarController,
  assignment: StateAssignment,
): void {
  avatarController.setState(assignment.state);
  if (assignment.expression) {
    avatarController.setExpression(assignment.expression);
  }
}

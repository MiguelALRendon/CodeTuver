export const VRM_STANDARD_EXPRESSIONS = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'relaxed',
  'surprised',
] as const;

export type VrmStandardExpression = (typeof VRM_STANDARD_EXPRESSIONS)[number];

const FALLBACK_EXPRESSION: VrmStandardExpression = 'neutral';

// Mapeo fijado por avatar-and-tts.md SS"Matriz avatar-reaccion": sin 1:1 con las 6 expresiones VRM, cae a la mas cercana.
const EXPRESSION_TO_VRM: Record<string, VrmStandardExpression> = {
  neutral: 'neutral',
  happy: 'happy',
  excited: 'happy',
  sad: 'sad',
  tired: 'relaxed',
  angry: 'angry',
  surprised: 'surprised',
  confused: 'neutral',
};

export function mapExpressionToVrm(expression: string): VrmStandardExpression {
  return EXPRESSION_TO_VRM[expression] ?? FALLBACK_EXPRESSION;
}

export function resolveSupportedVrmExpression(
  expression: string,
  availableExpressions: readonly string[],
): VrmStandardExpression | null {
  const mapped = mapExpressionToVrm(expression);
  if (availableExpressions.includes(mapped)) return mapped;
  if (availableExpressions.includes(FALLBACK_EXPRESSION)) {
    return FALLBACK_EXPRESSION;
  }
  return null;
}

// Fallback de "pose/mirada" de la matriz: sin blendshape propio, varia la cadencia de parpadeo segun el mood de resolveMood.
const BLINK_INTERVAL_MS_BY_MOOD: Record<string, number> = {
  neutral: 4000,
  active: 2500,
  waiting: 3500,
  positive: 3000,
  negative: 2000,
  resting: 6000,
};
const DEFAULT_BLINK_INTERVAL_MS = 4000;

export function resolveBlinkIntervalMs(mood: string): number {
  return BLINK_INTERVAL_MS_BY_MOOD[mood] ?? DEFAULT_BLINK_INTERVAL_MS;
}

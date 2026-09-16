export interface UpdateCheckOutcome {
  available: boolean;
  version: string | null;
}

export function buildUpdateNoticeText(
  outcome: UpdateCheckOutcome,
): string | null {
  if (!outcome.available || !outcome.version) return null;
  return `Hay una version nueva disponible (v${outcome.version}). Usa "Descargar e instalar" para actualizar.`;
}

export function normalizeReleaseNotes(
  body: string | null | undefined,
): string | null {
  const trimmed = body?.trim();
  return trimmed ? trimmed : null;
}

import { parseCommandInvocationTags } from './content-interpreter';
import type { ModelUsage, SessionSummary } from './session-history';

const UNKNOWN_DURATION = 'duracion desconocida';
const UNKNOWN_COST = 'costo desconocido';
const UNKNOWN_TOKENS = 'tokens desconocidos';
const UNKNOWN_DATE = 'fecha desconocida';
const UNTITLED_SESSION = 'Sesion sin titulo';
const TITLE_MAX_LENGTH = 80;

export function formatSessionDuration(durationMs: number | null): string {
  if (durationMs == null) return UNKNOWN_DURATION;
  const totalSeconds = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

export function formatSessionCost(costUsd: number | null): string {
  if (costUsd == null) return UNKNOWN_COST;
  return `$${costUsd.toFixed(2)}`;
}

export function totalSessionTokens(
  modelUsage: Record<string, ModelUsage> | null,
): number | null {
  if (!modelUsage) return null;
  return Object.values(modelUsage).reduce(
    (sum, usage) => sum + (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    0,
  );
}

export function formatTokenCount(total: number | null): string {
  if (total == null) return UNKNOWN_TOKENS;
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M tokens`;
  if (total >= 1_000) return `${(total / 1_000).toFixed(1)}K tokens`;
  return `${total} tokens`;
}

export function formatSessionTokens(
  modelUsage: Record<string, ModelUsage> | null,
): string {
  return formatTokenCount(totalSessionTokens(modelUsage));
}

// Fecha manual (no toLocaleDateString): evita depender de datos ICU/locale del entorno, que varian entre maquinas y hacen la prueba no determinista.
export function formatSessionDate(startTimeMs: number | null): string {
  if (startTimeMs == null) return UNKNOWN_DATE;
  const date = new Date(startTimeMs);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

export function truncateSessionTitle(title: string | null): string {
  if (!title) return UNTITLED_SESSION;
  const invocation = parseCommandInvocationTags(title);
  if (invocation) return `/${invocation.name.replace(/^\//, '')}`;
  const singleLine = title.replace(/\s+/g, ' ').trim();
  if (!singleLine) return UNTITLED_SESSION;
  if (singleLine.length <= TITLE_MAX_LENGTH) return singleLine;
  return `${singleLine.slice(0, TITLE_MAX_LENGTH - 1)}…`;
}

export function sortSessionsByDateDescending<T extends SessionSummary>(
  sessions: readonly T[],
): T[] {
  return [...sessions].sort(
    (a, b) => (b.startTimeMs ?? 0) - (a.startTimeMs ?? 0),
  );
}

export interface SessionSummaryWithFolder extends SessionSummary {
  folder: string;
}

export interface FolderSessions {
  folder: string;
  sessions: readonly SessionSummary[];
}

export function pickRecentSessionsAcrossFolders(
  sessionsByFolder: readonly FolderSessions[],
  limit: number,
): SessionSummaryWithFolder[] {
  const flattened = sessionsByFolder.flatMap(({ folder, sessions }) =>
    sessions.map((session) => ({ ...session, folder })),
  );
  return sortSessionsByDateDescending(flattened).slice(0, limit);
}

// La convencion real de Claude Code (confirmada contra decenas de nombres de carpeta reales en esta maquina, incluida mayuscula/minuscula de unidad preservada tal cual).
export function cwdToProjectFolder(cwd: string): string {
  return cwd.replace(/[\\/: ]/g, '-');
}

const DRIVE_FOLDER_PREFIX = /^([A-Za-z])--/;

// Inversa best-effort de cwdToProjectFolder (D5): la codificacion pierde si el segmento original tenia un guion literal, no hay forma de distinguirlo del separador.
export function describeProjectFolder(folder: string): string {
  const match = DRIVE_FOLDER_PREFIX.exec(folder);
  if (!match) return folder;
  const rest = folder.slice(match[0].length);
  return `${match[1]}:\\${rest.replace(/-/g, '\\')}`;
}

export const PROJECT_FOLDER_DISPLAY_MAX_SEGMENTS = 4;

export function truncateProjectFolderSegments(readablePath: string): string {
  const segments = readablePath.split('\\');
  if (segments.length <= PROJECT_FOLDER_DISPLAY_MAX_SEGMENTS)
    return readablePath;
  const headCount = Math.ceil(PROJECT_FOLDER_DISPLAY_MAX_SEGMENTS / 2);
  const tailCount = PROJECT_FOLDER_DISPLAY_MAX_SEGMENTS - headCount;
  const head = segments.slice(0, headCount);
  const tail = segments.slice(segments.length - tailCount);
  return [...head, '...', ...tail].join('\\');
}

export function formatProjectFolderDisplay(folder: string): string {
  return truncateProjectFolderSegments(describeProjectFolder(folder));
}

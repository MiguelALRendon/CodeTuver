import type { PermissionMode, SessionStartOptions } from './claude-transport';

// H19: los unicos 6 modos reales confirmados contra `claude --help` (2.1.263).
export const PERMISSION_MODES: readonly PermissionMode[] = [
  'acceptEdits',
  'auto',
  'bypassPermissions',
  'manual',
  'dontAsk',
  'plan',
];

// Forma de borrador (todo texto plano) para enlazar con controles de formulario, distinta de SessionStartOptions (la forma tipada que cruza a Rust).
export interface SessionStartOptionsDraft {
  model: string;
  permissionMode: PermissionMode | '';
  addDir: string;
  allowedTools: string;
  disallowedTools: string;
  maxBudgetUsd: string;
}

export function emptyStartOptionsDraft(): SessionStartOptionsDraft {
  return {
    model: '',
    permissionMode: '',
    addDir: '',
    allowedTools: '',
    disallowedTools: '',
    maxBudgetUsd: '',
  };
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface StartOptionsValidationError {
  field: keyof SessionStartOptionsDraft;
  message: string;
}

// Frontera de confianza del lado del cliente: mismo criterio que valida_startup_options en Rust, para rechazar antes de invocar en vez de solo despues.
export function validateStartOptionsDraft(
  draft: SessionStartOptionsDraft,
): StartOptionsValidationError[] {
  const errors: StartOptionsValidationError[] = [];
  if (draft.maxBudgetUsd.trim() !== '') {
    const parsed = Number(draft.maxBudgetUsd);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.push({
        field: 'maxBudgetUsd',
        message: 'El limite de gasto debe ser un numero positivo.',
      });
    }
  }
  return errors;
}

export function buildSessionStartOptions(
  draft: SessionStartOptionsDraft,
): SessionStartOptions {
  const options: SessionStartOptions = {};
  if (draft.model.trim()) options.model = draft.model.trim();
  if (draft.permissionMode) options.permissionMode = draft.permissionMode;
  const addDir = splitLines(draft.addDir);
  if (addDir.length > 0) options.addDir = addDir;
  const allowedTools = splitLines(draft.allowedTools);
  if (allowedTools.length > 0) options.allowedTools = allowedTools;
  const disallowedTools = splitLines(draft.disallowedTools);
  if (disallowedTools.length > 0) options.disallowedTools = disallowedTools;
  if (draft.maxBudgetUsd.trim() !== '') {
    const parsed = Number(draft.maxBudgetUsd);
    if (Number.isFinite(parsed) && parsed > 0) options.maxBudgetUsd = parsed;
  }
  return options;
}

export function draftFromSessionStartOptions(
  options: SessionStartOptions | undefined,
): SessionStartOptionsDraft {
  if (!options) return emptyStartOptionsDraft();
  return {
    model: options.model ?? '',
    permissionMode: options.permissionMode ?? '',
    addDir: (options.addDir ?? []).join('\n'),
    allowedTools: (options.allowedTools ?? []).join('\n'),
    disallowedTools: (options.disallowedTools ?? []).join('\n'),
    maxBudgetUsd:
      options.maxBudgetUsd != null ? String(options.maxBudgetUsd) : '',
  };
}

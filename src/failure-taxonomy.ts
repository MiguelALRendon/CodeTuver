export type FailureOrigin =
  | 'agente'
  | 'proceso'
  | 'comunicacion'
  | 'interpretacion'
  | 'voz'
  | 'avatar'
  | 'interfaz'
  | 'ventana';

export type FailureClass =
  | 'claude-code-error'
  | 'process-error'
  | 'communication-error'
  | 'parsing-error'
  | 'tts-error'
  | 'avatar-error'
  | 'interface-error'
  | 'window-management-error'
  | 'unsupported-capability'
  | 'mode-change-error'
  | 'window-restore-error'
  | 'monitor-query-error';

// docs/reference/taxonomia-errores.md §"Clases de error a distinguir"; design.md §3 confirma la correspondencia exacta con los 8 origenes de AC-027.1.
export const FAILURE_CLASS_ORIGIN: Record<FailureClass, FailureOrigin> = {
  'claude-code-error': 'agente',
  'process-error': 'proceso',
  'communication-error': 'comunicacion',
  'parsing-error': 'interpretacion',
  'tts-error': 'voz',
  'avatar-error': 'avatar',
  'interface-error': 'interfaz',
  'window-management-error': 'ventana',
  'unsupported-capability': 'ventana',
  'mode-change-error': 'ventana',
  'window-restore-error': 'ventana',
  'monitor-query-error': 'ventana',
};

import { reactive } from 'vue';

export interface FailureLogEntry {
  origin: FailureOrigin;
  failureClass: FailureClass;
  message: string;
  timestamp: number;
}

// reactive(): un array plano no dispara los efectos de Vue (verificado); el panel de depuracion necesita listFailures() en vivo mientras esta abierto.
const failureLog = reactive<FailureLogEntry[]>([]);

// AC-027.4/spec.md "Fuera de alcance": memoria del proceso, nunca disco/red/telemetria.
export function registerFailure(
  failureClass: FailureClass,
  message: string,
): FailureLogEntry {
  const entry: FailureLogEntry = {
    origin: FAILURE_CLASS_ORIGIN[failureClass],
    failureClass,
    message,
    timestamp: Date.now(),
  };
  failureLog.push(entry);
  return entry;
}

export function listFailures(): readonly FailureLogEntry[] {
  return failureLog;
}

export function clearFailureLog(): void {
  failureLog.splice(0, failureLog.length);
}

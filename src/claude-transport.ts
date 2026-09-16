import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type TransportErrorKind =
  | 'process-spawn-failed'
  | 'claude-code-not-found'
  | 'session-already-active'
  | 'session-not-active'
  | 'write-failed'
  | 'invalid-startup-options';

export interface TransportError {
  kind: TransportErrorKind;
  message: string;
}

// H19: los unicos 6 modos reales confirmados contra `claude --help` (2.1.263).
export type PermissionMode =
  'acceptEdits' | 'auto' | 'bypassPermissions' | 'manual' | 'dontAsk' | 'plan';

export interface SessionStartOptions {
  model?: string;
  permissionMode?: PermissionMode;
  addDir?: string[];
  allowedTools?: string[];
  disallowedTools?: string[];
  maxBudgetUsd?: number;
}

// H22: separado de SessionStartOptions a proposito -- eso se persiste y se reaplica en cada arranque; "reanudar la sesion X" nunca deberia recordarse para el proximo arranque normal.
export interface ResumeOptions {
  sessionId: string;
  fork: boolean;
}

export type ClaudeActivity =
  | { kind: 'raw'; line: string }
  | { kind: 'invalid-line'; line: string; error: string };

export interface SessionClosed {
  expected: boolean;
  exitCode: number | null;
}

export type NormalizedEvent =
  | { type: 'session_started'; session_id: string; sendable_commands: string[] }
  | {
      type: 'session_finished';
      session_id: string;
      is_error: boolean;
      stop_reason: string | null;
      total_cost_usd: number;
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    }
  | { type: 'assistant_message'; text: string }
  | { type: 'assistant_turn_complete'; text: string }
  | { type: 'thinking' }
  | { type: 'file_read'; path: string }
  | { type: 'file_modified'; path: string }
  | { type: 'command_started'; command: string; id: string }
  | { type: 'tool_started'; name: string; id: string }
  | { type: 'tool_finished'; success: boolean; tool_use_id: string }
  | { type: 'interaction_required'; text: string }
  | { type: 'permission_denied'; tool_name: string }
  | { type: 'unclassified'; raw: string };

export interface SessionPreference {
  lastWorkingDirectory: string;
  lastSessionId: string;
}

export type InteractionRequest =
  | {
      type: 'permission';
      request_id: string;
      tool_name: string;
      input: unknown;
    }
  // sin constructor: ningun evento crudo confirmado dispara una eleccion entre opciones
  | { type: 'choice'; request_id: string; title: string; options: string[] }
  // sin constructor: en modo -p una pregunta abierta se resolvio como texto plano dentro de `result`, sin evento propio
  | { type: 'open_question'; request_id: string; prompt: string }
  // sin constructor: ningun evento crudo confirmado distingue una confirmacion de una autorizacion generica
  | { type: 'confirmation'; request_id: string; title: string }
  // sin constructor: ningun evento crudo confirmado modela un formulario de varios campos
  | { type: 'form'; request_id: string; title: string; fields: string[] };

const EVENT_ACTIVITY = 'claude-activity';
const EVENT_STDERR = 'claude-stderr';
const EVENT_SESSION_CLOSED = 'session-closed';
const EVENT_NORMALIZED = 'claude-normalized-event';
const EVENT_PERMISSION_PENDING = 'permission-request-pending';

export function startSession(
  cwd: string,
  options: SessionStartOptions = {},
  resume?: ResumeOptions,
): Promise<void> {
  return invoke<void>('start_claude_session', {
    cwd,
    options,
    resume: resume ?? null,
  });
}

export function sendInstruction(text: string): Promise<void> {
  return invoke<void>('send_claude_instruction', { text });
}

export function interruptSession(): Promise<void> {
  return invoke<void>('interrupt_claude_session');
}

export function closeSession(): Promise<void> {
  return invoke<void>('close_claude_session');
}

export function onActivity(
  handler: (activity: ClaudeActivity) => void,
): Promise<UnlistenFn> {
  return listen<ClaudeActivity>(EVENT_ACTIVITY, (event) =>
    handler(event.payload),
  );
}

export function onStderr(handler: (line: string) => void): Promise<UnlistenFn> {
  return listen<string>(EVENT_STDERR, (event) => handler(event.payload));
}

export function onSessionClosed(
  handler: (closed: SessionClosed) => void,
): Promise<UnlistenFn> {
  return listen<SessionClosed>(EVENT_SESSION_CLOSED, (event) =>
    handler(event.payload),
  );
}

export function onNormalizedEvent(
  handler: (event: NormalizedEvent) => void,
): Promise<UnlistenFn> {
  return listen<NormalizedEvent>(EVENT_NORMALIZED, (event) =>
    handler(event.payload),
  );
}

export function getLastSessionPreference(): Promise<SessionPreference | null> {
  return invoke<SessionPreference | null>('get_last_session_preference');
}

export function onPermissionPending(
  handler: (request: InteractionRequest) => void,
): Promise<UnlistenFn> {
  return listen<InteractionRequest>(EVENT_PERMISSION_PENDING, (event) =>
    handler(event.payload),
  );
}

export function respondToPermissionRequest(
  requestId: string,
  allow: boolean,
  updatedInput?: unknown,
  message?: string,
): Promise<void> {
  return invoke<void>('respond_to_permission_request', {
    requestId,
    allow,
    updatedInput,
    message,
  });
}

export interface AdminError {
  kind: 'process-spawn-failed' | 'command-failed' | 'parse-failed';
  message: string;
}

export interface PluginSummary {
  id: string;
  version: string;
  scope: string;
  enabled: boolean;
}

export interface AdminOperationResult {
  requiresRestart: boolean;
}

export interface AvailablePlugin {
  pluginId: string;
  name: string;
  description: string;
  marketplaceName: string;
  installCount: number;
}

export type McpStatus =
  | { kind: 'connected' }
  | { kind: 'needs-authentication' }
  | { kind: 'pending-approval' }
  | { kind: 'failed'; reason: string }
  | { kind: 'unknown'; raw: string };

export type McpLoginOutcome =
  | { kind: 'confirmed' }
  | { kind: 'failed-early'; message: string }
  | { kind: 'still-in-progress' };

export interface McpServerSummary {
  name: string;
  status: McpStatus;
}

export interface ScopedSettings {
  global: Record<string, unknown> | null;
  project: Record<string, unknown> | null;
}

export function listPlugins(cwd: string | null): Promise<PluginSummary[]> {
  return invoke<PluginSummary[]>('list_plugins', { cwd });
}

export function setPluginEnabled(
  id: string,
  enabled: boolean,
): Promise<AdminOperationResult> {
  return invoke<AdminOperationResult>('set_plugin_enabled', { id, enabled });
}

export function listAvailablePlugins(
  cwd: string | null,
): Promise<AvailablePlugin[]> {
  return invoke<AvailablePlugin[]>('list_available_plugins', { cwd });
}

export function installPlugin(pluginId: string): Promise<AdminOperationResult> {
  return invoke<AdminOperationResult>('install_plugin', { pluginId });
}

export function uninstallPlugin(id: string): Promise<AdminOperationResult> {
  return invoke<AdminOperationResult>('uninstall_plugin', { id });
}

// `claude plugin details` no soporta --json (confirmado): texto crudo, sin esquema inventado.
export function getPluginDetails(id: string): Promise<string> {
  return invoke<string>('get_plugin_details', { id });
}

export function addPluginMarketplace(
  source: string,
): Promise<AdminOperationResult> {
  return invoke<AdminOperationResult>('add_plugin_marketplace', { source });
}

export function listMcpServers(): Promise<McpServerSummary[]> {
  return invoke<McpServerSummary[]>('list_mcp_servers');
}

export function addMcpServer(
  name: string,
  command: string,
): Promise<AdminOperationResult> {
  return invoke<AdminOperationResult>('add_mcp_server', { name, command });
}

export function removeMcpServer(name: string): Promise<AdminOperationResult> {
  return invoke<AdminOperationResult>('remove_mcp_server', { name });
}

// Abre el flujo real de OAuth en el navegador del usuario; no espera a que el login termine (interactivo por naturaleza, sin TTY no puede completarse solo). El resultado distingue fallo inmediato de "sigue en curso".
export function authenticateMcp(name: string): Promise<McpLoginOutcome> {
  return invoke<McpLoginOutcome>('authenticate_mcp', { name });
}

export function clearMcpAuthentication(
  name: string,
): Promise<AdminOperationResult> {
  return invoke<AdminOperationResult>('clear_mcp_authentication', { name });
}

export function readAdminSettings(
  projectDir: string | null,
): Promise<ScopedSettings> {
  return invoke<ScopedSettings>('read_admin_settings', { projectDir });
}

import { invoke } from '@tauri-apps/api/core';
import type { NormalizedEvent } from './claude-transport';

export interface ModelUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadInputTokens: number | null;
  cacheCreationInputTokens: number | null;
  costUsd: number | null;
}

export interface SessionSummary {
  id: string;
  title: string | null;
  cwd: string | null;
  gitBranch: string | null;
  cliVersion: string | null;
  totalCostUsd: number | null;
  totalDurationMs: number | null;
  startTimeMs: number | null;
  modelUsage: Record<string, ModelUsage> | null;
}

export function listProjectFolders(): Promise<string[]> {
  return invoke('list_project_folders');
}

export function listProjectSessions(folder: string): Promise<SessionSummary[]> {
  return invoke('list_project_sessions', { folder });
}

export interface TranscriptEntry {
  role: 'person' | 'agent';
  text: string;
}

export function readSessionTranscript(
  folder: string,
  sessionId: string,
): Promise<TranscriptEntry[]> {
  return invoke('read_session_transcript', { folder, sessionId });
}

export function readSessionActivityEvents(
  folder: string,
  sessionId: string,
): Promise<NormalizedEvent[]> {
  return invoke('read_session_activity_events', { folder, sessionId });
}

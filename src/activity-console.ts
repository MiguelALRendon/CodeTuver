import type { ClaudeActivity, NormalizedEvent } from './claude-transport';
import { parseContentBlocks, type ContentBlock } from './content-interpreter';

export type ConsoleViewMode = 'styled' | 'markdown' | 'raw';

export interface PendingEntry {
  id: string;
  index: number;
}

export interface ActivityConsoleState {
  blocks: ContentBlock[];
  pendingToolIndices: PendingEntry[];
  pendingCommandIndices: PendingEntry[];
}

export function createActivityConsoleState(): ActivityConsoleState {
  return { blocks: [], pendingToolIndices: [], pendingCommandIndices: [] };
}

type PendingQueueKey = 'pendingToolIndices' | 'pendingCommandIndices';

function appendBlocks(
  state: ActivityConsoleState,
  blocks: ContentBlock[],
): ActivityConsoleState {
  return { ...state, blocks: [...state.blocks, ...blocks] };
}

function pushRunningBlock(
  state: ActivityConsoleState,
  block: ContentBlock,
  queueKey: PendingQueueKey,
  id: string,
): ActivityConsoleState {
  const blocks = [...state.blocks, block];
  return {
    ...state,
    blocks,
    [queueKey]: [...state[queueKey], { id, index: blocks.length - 1 }],
  };
}

function withResolvedStatus(
  block: ContentBlock,
  success: boolean,
): ContentBlock {
  if (block.type !== 'command') return block;
  return { ...block, status: success ? 'success' : 'failed' };
}

function resolveBlockAt(
  state: ActivityConsoleState,
  index: number,
  success: boolean,
): ContentBlock[] {
  return state.blocks.map((block, i) =>
    i === index ? withResolvedStatus(block, success) : block,
  );
}

function resolvePendingBlock(
  state: ActivityConsoleState,
  queueKey: PendingQueueKey,
  success: boolean,
): ActivityConsoleState {
  const [entry, ...rest] = state[queueKey];
  if (entry === undefined) return state;
  return {
    ...state,
    blocks: resolveBlockAt(state, entry.index, success),
    [queueKey]: rest,
  };
}

function resolvePendingBlockById(
  state: ActivityConsoleState,
  toolUseId: string,
  success: boolean,
): ActivityConsoleState {
  const queueKeys: PendingQueueKey[] = [
    'pendingToolIndices',
    'pendingCommandIndices',
  ];
  for (const queueKey of queueKeys) {
    const entry = state[queueKey].find((e) => e.id === toolUseId);
    if (entry === undefined) continue;
    return {
      ...state,
      blocks: resolveBlockAt(state, entry.index, success),
      [queueKey]: state[queueKey].filter((e) => e.id !== toolUseId),
    };
  }
  return state;
}

export function sweepStalePending(
  state: ActivityConsoleState,
): ActivityConsoleState {
  const stale = [...state.pendingToolIndices, ...state.pendingCommandIndices];
  const blocks = stale.reduce(
    (blocks, entry) =>
      blocks.map((block, i) =>
        i === entry.index ? withResolvedStatus(block, false) : block,
      ),
    state.blocks,
  );
  return {
    ...state,
    blocks,
    pendingToolIndices: [],
    pendingCommandIndices: [],
  };
}

function toolBlock(name: string): ContentBlock {
  return {
    type: 'command',
    command: name,
    status: 'running',
    isShellCommand: false,
  };
}

function commandBlock(command: string): ContentBlock {
  return {
    type: 'command',
    command,
    status: 'running',
    isShellCommand: true,
  };
}

function fileBlock(path: string, action: 'read' | 'modify'): ContentBlock {
  return { type: 'file_reference', path, action };
}

export function handleNormalizedEvent(
  state: ActivityConsoleState,
  event: NormalizedEvent,
): ActivityConsoleState {
  switch (event.type) {
    case 'assistant_message':
      return appendBlocks(state, parseContentBlocks(event.text));
    case 'tool_started':
      return pushRunningBlock(
        state,
        toolBlock(event.name),
        'pendingToolIndices',
        event.id,
      );
    case 'tool_finished':
      return resolvePendingBlockById(state, event.tool_use_id, event.success);
    case 'command_started':
      return pushRunningBlock(
        state,
        commandBlock(event.command),
        'pendingCommandIndices',
        event.id,
      );
    case 'permission_denied':
      return resolvePendingBlock(state, 'pendingCommandIndices', false);
    case 'file_read':
      return appendBlocks(state, [fileBlock(event.path, 'read')]);
    case 'file_modified':
      return appendBlocks(state, [fileBlock(event.path, 'modify')]);
    case 'session_finished':
      return sweepStalePending(state);
    default:
      return state;
  }
}

export function resumeActivityConsoleState(
  events: readonly NormalizedEvent[],
): ActivityConsoleState {
  return events.reduce(handleNormalizedEvent, createActivityConsoleState());
}

export function appendRawActivity(
  lines: string[],
  activity: ClaudeActivity,
): string[] {
  if (activity.kind !== 'raw') return lines;
  return [...lines, activity.line];
}

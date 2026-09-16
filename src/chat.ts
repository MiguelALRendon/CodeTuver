import type { NormalizedEvent } from './claude-transport';
import {
  createStreamBuffer,
  flushStreamBuffer,
  pushStreamChunk,
  type ContentBlock,
  type StreamBufferState,
} from './content-interpreter';
import {
  createActivityConsoleState,
  handleNormalizedEvent as reduceActivityEvent,
  sweepStalePending,
  type ActivityConsoleState,
} from './activity-console';

export type ChatEntry =
  { role: 'person'; text: string } | { role: 'agent'; blocks: ContentBlock[] };

interface OpenAgentTurn {
  buffer: StreamBufferState;
  console: ActivityConsoleState;
}

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalCostUsd: number;
}

export function createSessionUsage(): SessionUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    totalCostUsd: 0,
  };
}

function accumulateSessionUsage(
  usage: SessionUsage,
  event: Extract<NormalizedEvent, { type: 'session_finished' }>,
): SessionUsage {
  return {
    inputTokens: usage.inputTokens + event.input_tokens,
    outputTokens: usage.outputTokens + event.output_tokens,
    cacheCreationInputTokens:
      usage.cacheCreationInputTokens + event.cache_creation_input_tokens,
    cacheReadInputTokens:
      usage.cacheReadInputTokens + event.cache_read_input_tokens,
    totalCostUsd: usage.totalCostUsd + event.total_cost_usd,
  };
}

export interface ChatState {
  closedEntries: ChatEntry[];
  openTurn: OpenAgentTurn | null;
  usage: SessionUsage;
}

export function createChatState(): ChatState {
  return { closedEntries: [], openTurn: null, usage: createSessionUsage() };
}

// Derivado en cada lectura: guardar el turno abierto tambien en closedEntries lo duplicaria y podria desincronizarse.
export function chatEntries(state: ChatState): ChatEntry[] {
  if (!state.openTurn) return state.closedEntries;
  const openEntry: ChatEntry = {
    role: 'agent',
    blocks: state.openTurn.console.blocks,
  };
  return [...state.closedEntries, openEntry];
}

function closeOpenTurn(state: ChatState): ChatState {
  if (!state.openTurn) return state;
  const sweptConsole = sweepStalePending(state.openTurn.console);
  const trailingBlocks = flushStreamBuffer(state.openTurn.buffer);
  const closedEntry: ChatEntry = {
    role: 'agent',
    blocks: [...sweptConsole.blocks, ...trailingBlocks],
  };
  return {
    closedEntries: [...state.closedEntries, closedEntry],
    openTurn: null,
    usage: state.usage,
  };
}

export function shouldShowWorkingIndicator(
  state: ChatState,
  isSending: boolean,
): boolean {
  if (!isSending) return false;
  return (state.openTurn?.console.blocks.length ?? 0) === 0;
}

export function recordPersonMessage(state: ChatState, text: string): ChatState {
  const withoutOpenTurn = closeOpenTurn(state);
  const personEntry: ChatEntry = { role: 'person', text };
  return {
    ...withoutOpenTurn,
    closedEntries: [...withoutOpenTurn.closedEntries, personEntry],
  };
}

function ensureOpenTurn(state: ChatState): OpenAgentTurn {
  return (
    state.openTurn ?? {
      buffer: createStreamBuffer(),
      console: createActivityConsoleState(),
    }
  );
}

function applyAssistantMessage(
  turn: OpenAgentTurn,
  text: string,
): OpenAgentTurn {
  const pushResult = pushStreamChunk(turn.buffer, text);
  const console: ActivityConsoleState = {
    ...turn.console,
    blocks: [...turn.console.blocks, ...pushResult.completedBlocks],
  };
  return { buffer: pushResult.state, console };
}

const TURN_CONTENT_EVENT_TYPES = new Set<NormalizedEvent['type']>([
  'assistant_message',
  'tool_started',
  'tool_finished',
  'command_started',
  'file_read',
  'file_modified',
  'permission_denied',
]);

export function applyChatEvent(
  state: ChatState,
  event: NormalizedEvent,
): ChatState {
  if (event.type === 'session_finished') {
    const closed = closeOpenTurn(state);
    return { ...closed, usage: accumulateSessionUsage(closed.usage, event) };
  }
  if (!TURN_CONTENT_EVENT_TYPES.has(event.type)) return state;
  const openTurn = ensureOpenTurn(state);
  const nextTurn =
    event.type === 'assistant_message'
      ? applyAssistantMessage(openTurn, event.text)
      : { ...openTurn, console: reduceActivityEvent(openTurn.console, event) };
  return { ...state, openTurn: nextTurn };
}

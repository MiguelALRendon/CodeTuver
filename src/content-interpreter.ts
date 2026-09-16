import { registerFailure } from './failure-taxonomy';

export interface DiffLine {
  content: string;
}

export type ContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; language?: string; code: string }
  | {
      type: 'diff';
      file?: string;
      additions: DiffLine[];
      deletions: DiffLine[];
    }
  | {
      type: 'file_reference';
      path: string;
      action?: 'read' | 'write' | 'modify' | 'delete';
    }
  | {
      type: 'command';
      command: string;
      status?: 'pending' | 'running' | 'success' | 'failed';
      isShellCommand?: boolean;
    }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'ascii_art'; content: string; detectedTheme?: string }
  | { type: 'warning'; text: string }
  | { type: 'error'; text: string }
  | { type: 'plain_text'; text: string }
  | { type: 'command_invocation'; name: string; message: string; args: string };

const ANSI_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function stripAnsiSequences(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

export function isMarkdownTextBlock(
  block: ContentBlock,
): block is Extract<ContentBlock, { type: 'paragraph' }> {
  return block.type === 'paragraph';
}

function isFenceMarker(line: string): boolean {
  return line.trimStart().startsWith('```');
}

function splitIntoSegments(text: string): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (isFenceMarker(line)) inFence = !inFence;
    const isBlankLine = line.trim().length === 0;
    if (isBlankLine && !inFence) {
      if (current.length > 0) segments.push(current.join('\n'));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) segments.push(current.join('\n'));
  return segments;
}

function findSafeBoundaryIndex(text: string): number {
  const lines = text.split('\n');
  let offset = 0;
  let lastSafeOffset = 0;
  let inFence = false;
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    const lineEndOffset = offset + line.length + 1;
    if (isFenceMarker(line)) inFence = !inFence;
    if (line.trim().length === 0 && !inFence) lastSafeOffset = lineEndOffset;
    offset = lineEndOffset;
  }
  return lastSafeOffset;
}

const FENCE_PATTERN = /^```([^\n]*)\n([\s\S]*?)\n```$/;

function toDiffLine(line: string): DiffLine {
  return { content: line.slice(1).trimStart() };
}

function buildDiffBlock(code: string): ContentBlock {
  const lines = code.split('\n');
  return {
    type: 'diff',
    additions: lines.filter((line) => line.startsWith('+')).map(toDiffLine),
    deletions: lines.filter((line) => line.startsWith('-')).map(toDiffLine),
  };
}

function detectFence(segment: string): ContentBlock | null {
  const match = FENCE_PATTERN.exec(segment.trim());
  if (!match) return null;
  const language = match[1].trim();
  const code = match[2];
  if (language === 'diff') return buildDiffBlock(code);
  if (language.length === 0) return { type: 'ascii_art', content: code };
  return { type: 'code', language, code };
}

const TABLE_SEPARATOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function detectTable(segment: string): ContentBlock | null {
  const lines = segment.trim().split('\n');
  if (lines.length < 2) return null;
  const isTableStart = lines[0].trim().startsWith('|');
  if (!isTableStart || !TABLE_SEPARATOR.test(lines[1].trim())) return null;
  return {
    type: 'table',
    headers: splitTableRow(lines[0]),
    rows: lines.slice(2).map(splitTableRow),
  };
}

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;

function detectHeading(segment: string): ContentBlock | null {
  const trimmed = segment.trim();
  if (trimmed.includes('\n')) return null;
  const match = HEADING_PATTERN.exec(trimmed);
  if (!match) return null;
  return { type: 'heading', level: match[1].length, text: match[2].trim() };
}

const COMMAND_PATTERN = /^\$\s+(.+)$/;

function detectCommand(segment: string): ContentBlock | null {
  const trimmed = segment.trim();
  if (trimmed.includes('\n')) return null;
  const match = COMMAND_PATTERN.exec(trimmed);
  if (!match) return null;
  return { type: 'command', command: match[1].trim(), isShellCommand: true };
}

// D4: se extrae cada etiqueta por separado (no un regex secuencial) porque el orden real name/message/args varia entre sesiones.
const COMMAND_NAME_TAG = /<command-name>([^<]*)<\/command-name>/;
const COMMAND_MESSAGE_TAG = /<command-message>([^<]*)<\/command-message>/;
const COMMAND_ARGS_TAG = /<command-args>([^<]*)<\/command-args>/;

export interface CommandInvocationTags {
  name: string;
  message: string;
  args: string;
}

export function parseCommandInvocationTags(
  text: string,
): CommandInvocationTags | null {
  const nameMatch = COMMAND_NAME_TAG.exec(text);
  const messageMatch = COMMAND_MESSAGE_TAG.exec(text);
  const argsMatch = COMMAND_ARGS_TAG.exec(text);
  if (!nameMatch || !messageMatch || !argsMatch) return null;
  return {
    name: nameMatch[1].trim(),
    message: messageMatch[1].trim(),
    args: argsMatch[1].trim(),
  };
}

function detectCommandInvocation(segment: string): ContentBlock | null {
  const tags = parseCommandInvocationTags(segment);
  if (!tags) return null;
  return { type: 'command_invocation', ...tags };
}

const FILE_REFERENCE_PATTERN = /^`([^`\n]+)`$/;
const LOOKS_LIKE_PATH = /[./]/;

function detectFileReference(segment: string): ContentBlock | null {
  const trimmed = segment.trim();
  if (trimmed.includes('\n')) return null;
  const match = FILE_REFERENCE_PATTERN.exec(trimmed);
  if (!match || !LOOKS_LIKE_PATH.test(match[1])) return null;
  return { type: 'file_reference', path: match[1] };
}

const WARNING_PATTERN = /^(?:warning|advertencia)[:\s]/i;
const ERROR_PATTERN = /^error[:\s]/i;

function detectWarningOrError(segment: string): ContentBlock | null {
  const trimmed = segment.trim();
  if (WARNING_PATTERN.test(trimmed)) return { type: 'warning', text: trimmed };
  if (ERROR_PATTERN.test(trimmed)) return { type: 'error', text: trimmed };
  return null;
}

const HAS_LETTERS = /[a-zA-ZÀ-ɏ]/;

function detectDefault(segment: string): ContentBlock {
  const trimmed = segment.trim();
  if (HAS_LETTERS.test(trimmed)) return { type: 'paragraph', text: trimmed };
  return { type: 'plain_text', text: trimmed };
}

type Detector = (segment: string) => ContentBlock | null;

const DETECTORS: Detector[] = [
  detectFence,
  detectTable,
  detectHeading,
  detectCommandInvocation,
  detectCommand,
  detectFileReference,
  detectWarningOrError,
];

function parseSegment(segment: string): ContentBlock {
  const cleaned = stripAnsiSequences(segment);
  for (const detect of DETECTORS) {
    const block = detect(cleaned);
    if (block) return block;
  }
  return detectDefault(cleaned);
}

export const FAULT_INJECTION_MARKER = '__forzar_fallo_parser__';

let armedFaultIndex: number | null = null;

// TC-027 exige forzar el fallo de un fragmento concreto sin herramientas externas; no-op fuera de DEV
export function armParseFault(index: number | null): void {
  if (!import.meta.env.DEV) return;
  armedFaultIndex = index;
}

function injectParseFaultIfArmed(segment: string, index: number): void {
  if (!import.meta.env.DEV) return;
  const shouldFail =
    index === armedFaultIndex || segment.includes(FAULT_INJECTION_MARKER);
  if (shouldFail) throw new Error('fallo de parseo inyectado para pruebas');
}

function parseSegmentSafely(segment: string, index: number): ContentBlock {
  try {
    injectParseFaultIfArmed(segment, index);
    return parseSegment(segment);
  } catch (error) {
    registerFailure(
      'parsing-error',
      error instanceof Error ? error.message : String(error),
    );
    return { type: 'plain_text', text: segment };
  }
}

export function parseContentBlocks(rawText: string): ContentBlock[] {
  return splitIntoSegments(rawText).map((segment, index) =>
    parseSegmentSafely(segment, index),
  );
}

export interface StreamBufferState {
  readonly buffer: string;
}

export function createStreamBuffer(): StreamBufferState {
  return { buffer: '' };
}

export interface StreamPushResult {
  state: StreamBufferState;
  completedBlocks: ContentBlock[];
  pendingText: string;
}

export function pushStreamChunk(
  state: StreamBufferState,
  chunk: string,
): StreamPushResult {
  const combined = state.buffer + chunk;
  const boundary = findSafeBoundaryIndex(combined);
  const completeText = combined.slice(0, boundary);
  const pendingText = combined.slice(boundary);
  return {
    state: { buffer: pendingText },
    completedBlocks: parseContentBlocks(completeText),
    pendingText,
  };
}

export function flushStreamBuffer(state: StreamBufferState): ContentBlock[] {
  return parseContentBlocks(state.buffer);
}

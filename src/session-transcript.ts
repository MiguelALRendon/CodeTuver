import type { ChatEntry } from './chat';
import type { TranscriptEntry } from './session-history';

export function transcriptToChatEntries(
  entries: readonly TranscriptEntry[],
): ChatEntry[] {
  return entries.map((entry) =>
    entry.role === 'person'
      ? { role: 'person', text: entry.text }
      : { role: 'agent', blocks: [{ type: 'paragraph', text: entry.text }] },
  );
}

import type { ContentBlock } from './content-interpreter';
import { renderChatDraftMarkdown } from './chat-draft-markdown';

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

// Reusa el interprete real de H6 (markdown-it) en vez de reimplementar reglas de Markdown para la voz; solo se descartan las etiquetas que el propio renderer genero, sin sanitizar HTML arbitrario de terceros.
function stripMarkdownForSpeech(text: string): string {
  const withoutTags = renderChatDraftMarkdown(text)
    .replace(/<\/(p|li|h[1-6]|blockquote|tr)>|<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(
      /&amp;|&lt;|&gt;|&quot;|&#39;/g,
      (entity) => HTML_ENTITIES[entity],
    );
  return withoutTags
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function diffToText(block: Extract<ContentBlock, { type: 'diff' }>): string {
  const additions = block.additions.map((line) => `+${line.content}`);
  const deletions = block.deletions.map((line) => `-${line.content}`);
  return [...additions, ...deletions].join('\n');
}

function tableToText(block: Extract<ContentBlock, { type: 'table' }>): string {
  const rows = block.rows.map((row) => row.join(' | '));
  return [block.headers.join(' | '), ...rows].join('\n');
}

function blockToText(block: ContentBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'plain_text':
    case 'warning':
    case 'error':
      return block.text;
    case 'heading':
      return `${'#'.repeat(block.level)} ${block.text}`;
    case 'code':
      return `\`\`\`${block.language ?? ''}\n${block.code}\n\`\`\``;
    case 'diff':
      return diffToText(block);
    case 'file_reference':
      return `\`${block.path}\``;
    case 'command':
      return `$ ${block.command}`;
    case 'command_invocation':
      return `/${block.name.replace(/^\//, '')}`;
    case 'table':
      return tableToText(block);
    case 'ascii_art':
      return block.content;
  }
}

export function blocksToMarkdownText(blocks: ContentBlock[]): string {
  return blocks.map(blockToText).join('\n\n');
}

// D7: lo que se habla es solo prosa -- codigo/comandos/diffs/ascii se omiten enteros (sin dejar hueco, para que el texto alrededor quede continuo) y una tabla se menciona brevemente en vez de leerse celda por celda.
function blockToSpeechText(block: ContentBlock): string | null {
  switch (block.type) {
    case 'paragraph':
      return stripMarkdownForSpeech(block.text);
    case 'plain_text':
    case 'heading':
    case 'warning':
    case 'error':
      return block.text;
    case 'table':
      return 'Hay una tabla.';
    case 'code':
    case 'command':
    case 'command_invocation':
    case 'diff':
    case 'ascii_art':
    case 'file_reference':
      return null;
  }
}

export function blocksToSpeechText(blocks: ContentBlock[]): string {
  return blocks
    .map(blockToSpeechText)
    .filter((text): text is string => text !== null)
    .join('\n\n');
}

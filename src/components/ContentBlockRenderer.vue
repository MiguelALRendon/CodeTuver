<script setup lang="ts">
import { isMarkdownTextBlock, type ContentBlock } from '../content-interpreter';
import { renderChatDraftMarkdown } from '../chat-draft-markdown';
import { openExternalLinkOnClick } from '../external-link-click';

defineProps<{ blocks: ContentBlock[]; showRaw?: boolean }>();

const COMMAND_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  running: 'En curso',
  success: 'Exito',
  failed: 'Fallo',
};

const FILE_ACTION_LABELS: Record<string, string> = {
  read: 'Lectura',
  write: 'Escritura',
  modify: 'Modificacion',
  delete: 'Eliminacion',
};

function commandStatusLabel(status?: string): string {
  return status ? (COMMAND_STATUS_LABELS[status] ?? status) : '';
}

function fileActionLabel(action?: string): string {
  return action ? (FILE_ACTION_LABELS[action] ?? action) : '';
}
</script>

<template>
  <ul class="content-blocks">
    <li
      v-for="(block, index) in blocks"
      :key="index"
      class="content-blocks__item"
    >
      <pre
        v-if="isMarkdownTextBlock(block) && showRaw"
        class="content-blocks__raw-text"
        >{{ block.text }}</pre>
      <div
        v-else-if="isMarkdownTextBlock(block)"
        class="content-blocks__paragraph"
        v-html="renderChatDraftMarkdown(block.text)"
        @click="openExternalLinkOnClick"
      ></div>

      <component
        :is="`h${block.level}`"
        v-else-if="block.type === 'heading'"
        class="content-blocks__heading"
      >
        {{ block.text }}
      </component>

      <div v-else-if="block.type === 'code'" class="content-blocks__code">
        <span v-if="block.language" class="content-blocks__code-lang">{{
          block.language
        }}</span>
        <pre
          class="content-blocks__code-body"
        ><code>{{ block.code }}</code></pre>
      </div>

      <div v-else-if="block.type === 'diff'" class="content-blocks__diff">
        <span v-if="block.file" class="content-blocks__diff-file">{{
          block.file
        }}</span>
        <div
          v-for="(line, i) in block.additions"
          :key="`add-${i}`"
          class="content-blocks__diff-line content-blocks__diff-line--add"
        >
          +{{ line.content }}
        </div>
        <div
          v-for="(line, i) in block.deletions"
          :key="`del-${i}`"
          class="content-blocks__diff-line content-blocks__diff-line--del"
        >
          -{{ line.content }}
        </div>
      </div>

      <div
        v-else-if="block.type === 'file_reference'"
        class="content-blocks__file"
      >
        <span class="content-blocks__file-path">{{ block.path }}</span>
        <span v-if="block.action" class="content-blocks__file-action">{{
          fileActionLabel(block.action)
        }}</span>
      </div>

      <div
        v-else-if="block.type === 'command'"
        class="content-blocks__command"
        :class="`content-blocks__command--${block.status ?? 'pending'}`"
      >
        <span class="content-blocks__command-text"
          >{{ block.isShellCommand ? '$ ' : '' }}{{ block.command }}</span
        >
        <span v-if="block.status" class="content-blocks__command-status">{{
          commandStatusLabel(block.status)
        }}</span>
      </div>

      <div
        v-else-if="block.type === 'command_invocation'"
        class="content-blocks__command"
      >
        <span class="content-blocks__command-text"
          >/{{ block.name.replace(/^\//, '') }}</span
        >
      </div>

      <div
        v-else-if="block.type === 'table'"
        class="content-blocks__table-scroll"
      >
        <table class="content-blocks__table">
          <thead>
            <tr>
              <th v-for="(header, i) in block.headers" :key="i">
                {{ header }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in block.rows" :key="r">
              <td v-for="(cell, c) in row" :key="c">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <pre
        v-else-if="block.type === 'ascii_art'"
        class="content-blocks__ascii"
        >{{ block.content }}</pre>

      <p v-else-if="block.type === 'warning'" class="content-blocks__warning">
        {{ block.text }}
      </p>

      <p v-else-if="block.type === 'error'" class="content-blocks__error">
        {{ block.text }}
      </p>

      <p v-else class="content-blocks__plain">{{ block.text }}</p>
    </li>
  </ul>
</template>

<style scoped>
.content-blocks {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.content-blocks__item {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}

.content-blocks__paragraph,
.content-blocks__plain,
.content-blocks__raw-text {
  margin: 0;
  line-height: var(--line-height-normal);
}

.content-blocks__raw-text {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  white-space: pre-wrap;
  word-break: break-word;
}

.content-blocks__paragraph :deep(*) {
  margin: 0 0 var(--space-2);
}

.content-blocks__paragraph :deep(:last-child) {
  margin-bottom: 0;
}

.content-blocks__paragraph :deep(a) {
  color: var(--color-accent-primary);
}

.content-blocks__paragraph :deep(ul),
.content-blocks__paragraph :deep(ol) {
  padding-left: var(--space-4);
}

.content-blocks__paragraph :deep(code) {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: var(--color-surface-raised);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-1);
}

.content-blocks__heading {
  margin: 0;
  font-family: var(--font-display);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

/* Sin backdrop-filter propio: siempre vive dentro de una burbuja de chat o de InteractionRequestCard, ya blureadas. */
.content-blocks__code {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  padding: var(--space-2);
}

.content-blocks__code-lang {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.content-blocks__code-body {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.content-blocks__diff {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  padding: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.content-blocks__diff-file {
  color: var(--color-text-secondary);
}

.content-blocks__diff-line {
  white-space: pre-wrap;
  word-break: break-word;
}

.content-blocks__diff-line--add {
  color: var(--color-success);
}

.content-blocks__diff-line--del {
  color: var(--color-error);
}

.content-blocks__file {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.content-blocks__file-path {
  color: var(--color-text-primary);
}

.content-blocks__file-action {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.content-blocks__command {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border-radius: var(--radius-sm);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  padding: var(--space-1) var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.content-blocks__command-status {
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.content-blocks__command--running .content-blocks__command-status {
  color: var(--color-accent-secondary);
}

.content-blocks__command--success .content-blocks__command-status {
  color: var(--color-success);
}

.content-blocks__command--failed .content-blocks__command-status {
  color: var(--color-error);
}

.content-blocks__table-scroll {
  overflow-x: auto;
}

.content-blocks__table {
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.content-blocks__table th,
.content-blocks__table td {
  border: var(--border-width-thin) solid var(--color-border-subtle);
  padding: var(--space-1) var(--space-2);
  text-align: left;
}

.content-blocks__table th {
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
}

.content-blocks__ascii {
  margin: 0;
  border-radius: var(--radius-sm);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  padding: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  white-space: pre;
  overflow-x: auto;
}

.content-blocks__warning {
  margin: 0;
  color: var(--color-warning);
}

.content-blocks__error {
  margin: 0;
  color: var(--color-error);
}
</style>

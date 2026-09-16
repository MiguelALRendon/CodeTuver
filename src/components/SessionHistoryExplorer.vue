<script setup lang="ts">
import { onMounted, ref } from 'vue';
import IconGlyph from './IconGlyph.vue';
import ScrollableListPanel from './ScrollableListPanel.vue';
import {
  listProjectFolders,
  listProjectSessions,
  type SessionSummary,
} from '../session-history';
import {
  formatProjectFolderDisplay,
  formatSessionCost,
  formatSessionDate,
  formatSessionDuration,
  formatSessionTokens,
  pickRecentSessionsAcrossFolders,
  sortSessionsByDateDescending,
  truncateSessionTitle,
  type SessionSummaryWithFolder,
} from '../session-history-format';

const RECENT_SESSIONS_LIMIT = 5;

const emit = defineEmits<{
  'resume-session': [
    cwd: string,
    sessionId: string,
    fork: boolean,
    folder: string,
  ];
}>();

const view = ref<'folders' | 'sessions'>('folders');
const folders = ref<string[]>([]);
const loadingFolders = ref(false);
const activeFolder = ref<string | null>(null);
const sessions = ref<SessionSummary[]>([]);
const loadingSessions = ref(false);
const recentSessions = ref<SessionSummaryWithFolder[]>([]);
const loadingRecentSessions = ref(false);

async function loadFolders(): Promise<string[]> {
  loadingFolders.value = true;
  try {
    const result = await listProjectFolders();
    folders.value = result;
    return result;
  } finally {
    loadingFolders.value = false;
  }
}

async function loadRecentSessions(knownFolders: string[]): Promise<void> {
  loadingRecentSessions.value = true;
  try {
    const sessionsByFolder = await Promise.all(
      knownFolders.map(async (folder) => ({
        folder,
        sessions: await listProjectSessions(folder),
      })),
    );
    recentSessions.value = pickRecentSessionsAcrossFolders(
      sessionsByFolder,
      RECENT_SESSIONS_LIMIT,
    );
  } finally {
    loadingRecentSessions.value = false;
  }
}

async function openFolder(folder: string): Promise<void> {
  activeFolder.value = folder;
  view.value = 'sessions';
  loadingSessions.value = true;
  try {
    const raw = await listProjectSessions(folder);
    sessions.value = sortSessionsByDateDescending(raw);
  } finally {
    loadingSessions.value = false;
  }
}

function backToFolders(): void {
  view.value = 'folders';
  activeFolder.value = null;
  sessions.value = [];
}

onMounted(() => {
  void loadFolders().then(loadRecentSessions);
});
</script>

<template>
  <div class="session-history">
    <div v-if="view === 'folders'" class="session-history__grid-wrap">
      <section class="session-history__recent">
        <h2 class="session-history__recent-title">Sesiones recientes</h2>
        <p
          v-if="loadingRecentSessions"
          class="session-history__status"
          role="status"
        >
          Cargando sesiones recientes...
        </p>
        <p
          v-else-if="recentSessions.length === 0"
          class="session-history__status"
          role="status"
        >
          Sin sesiones recientes.
        </p>
        <ul v-else class="session-history__sessions" role="list">
          <li
            v-for="session in recentSessions"
            :key="`${session.folder}-${session.id}`"
            class="session-history__session"
            role="listitem"
          >
            <p class="session-history__session-title">
              <IconGlyph name="claude" class="session-history__claude-icon" />
              {{ truncateSessionTitle(session.title) }}
            </p>
            <p class="session-history__session-meta" :title="session.folder">
              {{ formatProjectFolderDisplay(session.folder) }} ·
              {{ formatSessionCost(session.totalCostUsd) }} ·
              {{ formatSessionDuration(session.totalDurationMs) }} ·
              {{ formatSessionDate(session.startTimeMs) }}
            </p>
            <div v-if="session.cwd" class="session-history__session-actions">
              <button
                type="button"
                class="session-panel__button"
                @click="
                  emit(
                    'resume-session',
                    session.cwd,
                    session.id,
                    false,
                    session.folder,
                  )
                "
              >
                Reanudar
              </button>
              <button
                type="button"
                class="session-panel__button"
                @click="
                  emit(
                    'resume-session',
                    session.cwd,
                    session.id,
                    true,
                    session.folder,
                  )
                "
              >
                Bifurcar
              </button>
            </div>
            <p v-else class="session-history__session-status">
              Sin carpeta real registrada -- no se puede reanudar.
            </p>
          </li>
        </ul>
      </section>

      <p v-if="loadingFolders" class="session-history__status" role="status">
        Cargando carpetas...
      </p>
      <p
        v-else-if="folders.length === 0"
        class="session-history__status"
        role="status"
      >
        Sin historial de sesiones previas.
      </p>
      <div v-else class="session-history__grid" role="list">
        <button
          v-for="folder in folders"
          :key="folder"
          type="button"
          role="listitem"
          class="session-history__folder"
          :title="folder"
          @click="openFolder(folder)"
        >
          <IconGlyph name="folder" class="session-history__folder-icon" />
          <span class="session-history__folder-name">{{
            formatProjectFolderDisplay(folder)
          }}</span>
        </button>
      </div>
    </div>

    <ScrollableListPanel v-else :loading="loadingSessions">
      <template #header>
        <button
          type="button"
          class="session-panel__button session-history__back"
          aria-label="Volver a las carpetas"
          @click="backToFolders"
        >
          <IconGlyph name="chevronLeft" />
          Carpetas
        </button>
      </template>

      <template #list>
        <p
          v-if="!loadingSessions && sessions.length === 0"
          class="session-history__status"
          role="status"
        >
          Esta carpeta no tiene sesiones registradas.
        </p>
        <ul v-else class="session-history__sessions">
          <li
            v-for="session in sessions"
            :key="session.id"
            class="session-history__session"
          >
            <p class="session-history__session-title">
              <IconGlyph name="claude" class="session-history__claude-icon" />
              {{ truncateSessionTitle(session.title) }}
            </p>
            <p class="session-history__session-meta">
              {{ formatSessionTokens(session.modelUsage) }} ·
              {{ formatSessionCost(session.totalCostUsd) }} ·
              {{ formatSessionDuration(session.totalDurationMs) }} ·
              {{ formatSessionDate(session.startTimeMs) }}
            </p>
            <div v-if="session.cwd" class="session-history__session-actions">
              <button
                type="button"
                class="session-panel__button"
                @click="
                  emit(
                    'resume-session',
                    session.cwd,
                    session.id,
                    false,
                    activeFolder ?? '',
                  )
                "
              >
                Reanudar
              </button>
              <button
                type="button"
                class="session-panel__button"
                @click="
                  emit(
                    'resume-session',
                    session.cwd,
                    session.id,
                    true,
                    activeFolder ?? '',
                  )
                "
              >
                Bifurcar
              </button>
            </div>
            <p v-else class="session-history__session-status">
              Sin carpeta real registrada -- no se puede reanudar.
            </p>
          </li>
        </ul>
      </template>
    </ScrollableListPanel>
  </div>
</template>

<style scoped>
.session-history {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.session-history__grid-wrap {
  min-height: 0;
}

.session-history__recent {
  margin-bottom: var(--space-4);
}

.session-history__recent-title {
  margin: 0 0 var(--space-2);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.session-history__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: var(--space-2);
}

.session-history__folder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-panel));
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard);
}

.session-history__folder:hover {
  background: var(--color-accent-primary);
  color: var(--color-text-on-accent);
}

.session-history__folder-icon {
  width: var(--size-icon-md);
  height: var(--size-icon-md);
}

.session-history__folder-name {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
  text-align: center;
}

.session-history__back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.session-history__status {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.session-history__sessions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.session-history__session {
  padding: var(--space-2);
  border-radius: var(--radius-md);
  border: var(--border-width-thin) solid var(--color-border-subtle);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-panel));
}

.session-history__session-title {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
}

.session-history__claude-icon {
  flex: 0 0 auto;
  width: var(--size-icon-md);
  height: var(--size-icon-md);
  color: var(--color-accent-primary);
}

.session-history__session-meta {
  margin: var(--space-1) 0 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.session-history__session-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.session-history__session-status {
  margin: var(--space-2) 0 0;
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
</style>

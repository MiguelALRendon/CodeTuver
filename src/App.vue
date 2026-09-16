<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import { pickCharacterFile } from './character-file-picker';
import { convertFileSrc } from '@tauri-apps/api/core';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  PET_RESTORE_REQUESTED_EVENT,
  PET_SYNC_EVENT,
  PET_SYNC_REQUEST_EVENT,
  type PetSyncPayload,
} from './pet-sync';
import {
  startSession,
  closeSession,
  interruptSession,
  sendInstruction,
  onNormalizedEvent,
  onActivity,
  onStderr,
  onSessionClosed,
  onPermissionPending,
  respondToPermissionRequest,
  getLastSessionPreference,
  type SessionPreference,
  type NormalizedEvent,
  type TransportError,
  type InteractionRequest,
} from './claude-transport';
import { buildUnexpectedCloseMessage } from './session-closed-notice';
import { startSessionWithRetry } from './session-start-retry';
import {
  listProjectFolders,
  listProjectSessions,
  readSessionActivityEvents,
  readSessionTranscript,
} from './session-history';
import {
  cwdToProjectFolder,
  formatSessionCost,
  formatTokenCount,
} from './session-history-format';
import { transcriptToChatEntries } from './session-transcript';
import {
  createInteractionRequestsState,
  receivePendingRequest,
  resolveRequest,
  listInteractionRequests,
  countPendingInteractionRequests,
  type InteractionDecision,
} from './interaction-requests';
import {
  resolveAttentionSignal,
  ATTENTION_SIGNAL_MESSAGE,
} from './attention-signals';
import { loadAttentionSignalSettings } from './attention-signal-settings';
import { sendAttentionNotification } from './system-notification';
import InteractionRequestCard from './components/InteractionRequestCard.vue';
import EditorModal from './components/EditorModal.vue';
import {
  hasAcceptedCharacterLicense,
  persistCharacterLicenseAccepted,
} from './character-license-consent';
import { buildUpdateNoticeText, normalizeReleaseNotes } from './update-check';
import {
  createActivityConsoleState,
  handleNormalizedEvent,
  resumeActivityConsoleState,
  appendRawActivity,
  type ConsoleViewMode,
} from './activity-console';
import { blocksToMarkdownText, blocksToSpeechText } from './content-block-text';
import { renderChatDraftMarkdown } from './chat-draft-markdown';
import { openExternalLinkOnClick } from './external-link-click';
import {
  filterCommands,
  nextCommandIndex,
  commandToCommitText,
  resolveCommandsEmptyStateMessage,
} from './slash-commands';
import {
  CLEAR_COMMAND,
  isClearCommandWithExtraContent,
  isClearSessionReset,
} from './clear-command';
import {
  createChatState,
  createSessionUsage,
  chatEntries,
  recordPersonMessage,
  applyChatEvent,
  shouldShowWorkingIndicator,
} from './chat';
import { isNearChatBottom } from './chat-scroll';
import {
  CHAT_HISTORY_CHUNK_SIZE,
  revealMoreEntries,
} from './chat-history-window';
import ContentBlockRenderer from './components/ContentBlockRenderer.vue';
import IconGlyph from './components/IconGlyph.vue';
import CustomSelect, {
  type CustomSelectOption,
} from './components/CustomSelect.vue';
import {
  createTabFocusRegistry,
  filterVisibleTabs,
  handleTabListKeydown,
  isTabArrowKey,
  nextTabId,
  tabButtonId,
  tabPanelId,
} from './tab-navigation';
import AvatarStage from './components/AvatarStage.vue';
import SendToDesktopButton from './components/SendToDesktopButton.vue';
import {
  describePetWindowPosition,
  sanitizePetWindowPosition,
  type PetWindowPosition,
} from './pet-window-position';
import {
  PET_WINDOW_SIZE_MIN_PX,
  PET_WINDOW_SIZE_MAX_PX,
  sanitizePetWindowSizePx,
} from './pet-window-size';
import ScrollableListPanel from './components/ScrollableListPanel.vue';
import SessionHistoryExplorer from './components/SessionHistoryExplorer.vue';
import SessionStartOptionsPanel from './components/SessionStartOptionsPanel.vue';
import {
  buildSessionStartOptions,
  draftFromSessionStartOptions,
  emptyStartOptionsDraft,
  validateStartOptionsDraft,
} from './session-start-options';
import {
  buildEffortCommand,
  parseEffortChangeConfirmation,
  EFFORT_LEVELS,
  type EffortLevel,
  type EffortChangeConfirmation,
} from './session-hot-options';
import { TestAvatarController } from './avatar-controller';
import { REACTION_CATALOG } from './reaction-catalog';
import { ReactionEngine } from './reaction-engine';
import { PresentationManager } from './presentation-manager';
import { TauriDesktopWindowManager } from './desktop-window-manager';
import {
  getAppSettings,
  mergeAndPersistAppSettings,
  type AppSettings,
} from './app-settings';
import { WebSpeechTextToSpeech } from './text-to-speech';
import { MouthSyncController } from './mouth-sync';
import VoiceControls from './components/VoiceControls.vue';
import {
  CHARACTER_CATALOG,
  type CharacterCatalogEntry,
} from './character-catalog';
import {
  loadPersistedCharacterId,
  persistCharacterId,
  resolveActiveCharacter,
} from './character-selection';
import {
  listImportedCharacters,
  importCharacterFile,
  type CharacterCapabilities,
  type ImportedCharacterSummary,
} from './character-import';
import { resolveImportedVrmModelUrl } from './avatar-imported-model';
import {
  capabilitiesForImportedCharacter,
  capabilitiesForTestAvatar,
  resolveActiveStateAssignment,
} from './character-editor';
import { loadCharacterEditorSettings } from './character-editor-storage';
import CharacterEditor from './components/CharacterEditor.vue';
import AdminSettingsPanel from './components/AdminSettingsPanel.vue';
import { registerFailure } from './failure-taxonomy';
import { errorMessage } from './error-message';
import DebugPanel from './components/DebugPanel.vue';
import { installNativeMenu, type NativeMenuHandle } from './native-menu';
import ThemePopup from './components/ThemePopup.vue';
import {
  DEFAULT_PRIMARY_COLOR_RGB,
  applyPrimaryColorRgb,
  sanitizePrimaryColorRgb,
  type PrimaryColorRgb,
} from './theme-color';

const chosenCwd = ref<string | null>(null);
// Distinto de sessionId: el proceso real de Claude solo emite system/init (que fija sessionId) tras la primera instruccion, y esa instruccion se escribe desde paneles gateados por session activa — sessionId por si solo nunca se cumpliria.
const sessionActive = ref(false);
const sessionId = ref<string | null>(null);
const lastPreference = ref<SessionPreference | null>(null);
const startError = ref<string | null>(null);
const isStarting = ref(false);
const appSettingsNotice = ref<string | null>(null);
const updateNotice = ref<string | null>(null);
const updateReleaseNotes = ref<string | null>(null);
let pendingUpdate: Awaited<
  ReturnType<typeof import('@tauri-apps/plugin-updater').check>
> | null = null;

async function checkForUpdateSilently(): Promise<void> {
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const result = await check();
    if (!result?.available) return;
    pendingUpdate = result;
    updateNotice.value = buildUpdateNoticeText({
      available: result.available,
      version: result.version ?? null,
    });
    updateReleaseNotes.value = normalizeReleaseNotes(result.body);
  } catch (err) {
    console.error(
      '[actualizacion] chequeo silencioso fallo, sesion sigue activa:',
      err,
    );
  }
}

async function downloadAndInstallUpdate(): Promise<void> {
  if (!pendingUpdate) return;
  try {
    await pendingUpdate.downloadAndInstall();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (err) {
    updateNotice.value = `No se pudo instalar la actualizacion: ${errorMessage(err)}`;
  }
}
// Guardada completa (no parcial): setGlobalAppSettings pide el AppSettings entero.
const loadedAppSettings = ref<AppSettings | null>(null);
const chatColumnWidthPx = ref<number | undefined>(undefined);
// AC-083/AC-084: previewNonce sube en cada click, incluso repitiendo el mismo id, para que VrmAvatar reinicie la animacion desde el frame 0.
const previewClipId = ref<string | undefined>(undefined);
const previewNonce = ref(0);
function onPreviewClip(id: string): void {
  previewClipId.value = id;
  previewNonce.value += 1;
}
const currentPrimaryColorRgb = ref<PrimaryColorRgb>(DEFAULT_PRIMARY_COLOR_RGB);

// AC-031.2: el evento init real no trae ambito (proyecto vs global) por comando, solo nombres planos.
const sendableCommands = ref<string[]>([]);

const activityConsole = ref(createActivityConsoleState());
const rawActivityLines = ref<string[]>([]);
const consoleViewMode = ref<ConsoleViewMode>('styled');
const markdownText = computed(() =>
  blocksToMarkdownText(activityConsole.value.blocks),
);

const chatState = ref(createChatState());
const chatDraft = ref('');
// Evita el envio concurrente (Hallazgo 9): sin esto, un segundo mensaje antes de que termine el turno anterior producia un session_started espurio a mitad de sesion.
const isSending = ref(false);
const chatEntryList = computed(() => chatEntries(chatState.value));
const sessionUsage = computed(() => chatState.value.usage);

// H11/H13: el umbral evita competir con quien esta revisando historial hacia arriba; H13 la reusa tal cual al abrir/reanudar una sesion.
const chatEntriesEl = ref<HTMLElement | null>(null);
function scrollChatToBottom(): void {
  const el = chatEntriesEl.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}
watch(chatEntryList, () => {
  const el = chatEntriesEl.value;
  const wasNearBottom = el
    ? isNearChatBottom(el.scrollTop, el.scrollHeight, el.clientHeight)
    : true;
  if (!wasNearBottom) return;
  void nextTick(scrollChatToBottom);
});

// H13: la lectura del transcript real ya trae todo -- el costo esta en el RENDER, no en el disco. Independiente del watch de H11 (observa chatEntryList, no visibleEntryCount): revelar hacia arriba nunca dispara el auto-scroll-al-fondo.
const visibleEntryCount = ref(CHAT_HISTORY_CHUNK_SIZE);
// Cada item conserva su indice real en chatEntryList (no la posicion recortada): rawViewEntryIds y el indicador de "trabajando" se indexan contra la lista completa.
const visibleChatEntryList = computed(() => {
  const total = chatEntryList.value.length;
  const start = Math.max(total - visibleEntryCount.value, 0);
  return chatEntryList.value
    .slice(start)
    .map((entry, i) => ({ entry, index: start + i }));
});
const chatHistorySentinel = ref<HTMLElement | null>(null);
let chatHistoryObserver: IntersectionObserver | null = null;

function revealMoreChatHistory(): void {
  const root = chatEntriesEl.value;
  const next = revealMoreEntries(
    visibleEntryCount.value,
    chatEntryList.value.length,
  );
  if (next === visibleEntryCount.value) return;
  const previousScrollHeight = root?.scrollHeight ?? 0;
  visibleEntryCount.value = next;
  void nextTick(() => {
    if (!root) return;
    root.scrollTop += root.scrollHeight - previousScrollHeight;
  });
}

// watch (no onMounted): la app arranca sin sesion activa, asi que el <ul>/centinela real recien existen cuando sessionActive pasa a true -- onMounted del componente raiz corre una sola vez, demasiado temprano.
watch([chatEntriesEl, chatHistorySentinel], ([root, target]) => {
  chatHistoryObserver?.disconnect();
  chatHistoryObserver = null;
  if (!root || !target) return;
  chatHistoryObserver = new IntersectionObserver(
    (observedEntries) => {
      if (observedEntries[0]?.isIntersecting) revealMoreChatHistory();
    },
    { root, threshold: 0 },
  );
  chatHistoryObserver.observe(target);
});
onUnmounted(() => chatHistoryObserver?.disconnect());
const isWorkingIndicatorVisible = computed(() =>
  shouldShowWorkingIndicator(chatState.value, isSending.value),
);
// Preferencia de vista efimera (D6): no vive en chatState, se pierde al recargar a proposito.
const rawViewEntryIds = ref<Set<number>>(new Set());

function toggleRawView(entryId: number): void {
  const next = new Set(rawViewEntryIds.value);
  if (next.has(entryId)) next.delete(entryId);
  else next.add(entryId);
  rawViewEntryIds.value = next;
}

const CHAT_COMPOSER_MAX_ROWS = 5;
const chatComposerExpanded = ref(false);
const chatComposerTextarea = ref<HTMLTextAreaElement | null>(null);
const chatDraftPreviewHtml = computed(() =>
  renderChatDraftMarkdown(chatDraft.value),
);

type ComposerTab = 'editar' | 'vista-previa';
const COMPOSER_TABS: { id: ComposerTab; label: string }[] = [
  { id: 'editar', label: 'Editar' },
  { id: 'vista-previa', label: 'Vista previa' },
];
const COMPOSER_TAB_IDS: readonly ComposerTab[] = COMPOSER_TABS.map(
  (tab) => tab.id,
);
const activeComposerTab = ref<ComposerTab>('editar');
const composerTabFocus = createTabFocusRegistry();
function onComposerTabKeydown(event: KeyboardEvent): void {
  handleTabListKeydown(
    event,
    COMPOSER_TAB_IDS,
    activeComposerTab,
    composerTabFocus,
  );
}

// Mide en el DOM real en vez de asumir un line-height fijo, para no quemar un valor que puede cambiar con el tema.
function resizeChatComposer(): void {
  const el = chatComposerTextarea.value;
  if (!el) return;
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
  const maxHeightPx = lineHeight * CHAT_COMPOSER_MAX_ROWS;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, maxHeightPx)}px`;
}

const COMMANDS_LISTBOX_ID = 'commands-listbox';
const commandsListVisible = ref(false);
const activeCommandIndex = ref(0);
const commandFilterText = computed(() =>
  commandsListVisible.value ? chatDraft.value.slice(1) : '',
);
const filteredCommands = computed(() =>
  filterCommands(sendableCommands.value, commandFilterText.value),
);
const commandOptions = computed<CustomSelectOption[]>(() =>
  filteredCommands.value.map((name) => ({ value: name, label: `/${name}` })),
);
const commandsEmptyStateMessage = computed(() =>
  resolveCommandsEmptyStateMessage(
    sessionId.value,
    sendableCommands.value,
    commandFilterText.value,
  ),
);

function onCommandOptionChosen(name: string): void {
  commitSelectedCommand(filteredCommands.value.indexOf(name));
}

function onChatComposerInput(): void {
  if (!chatComposerExpanded.value) resizeChatComposer();
  if (!chatDraft.value.startsWith('/')) {
    commandsListVisible.value = false;
    return;
  }
  commandsListVisible.value = true;
  activeCommandIndex.value = 0;
}

function onChatComposerBlur(event: FocusEvent): void {
  if (!commandsListVisible.value) return;
  const next = event.relatedTarget as Node | null;
  const listboxEl = document.getElementById(COMMANDS_LISTBOX_ID);
  if (next && listboxEl?.contains(next)) return;
  commandsListVisible.value = false;
}

function onComposerKeydown(event: KeyboardEvent): void {
  if (!commandsListVisible.value) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    activeCommandIndex.value = nextCommandIndex(
      activeCommandIndex.value,
      filteredCommands.value.length,
      event.key === 'ArrowDown' ? 'down' : 'up',
    );
  } else if (event.key === 'Escape') {
    event.preventDefault();
    commandsListVisible.value = false;
  }
}

// D17: elegir un comando escribe su texto en el borrador sin enviarlo -- la persona decide cuando presionar Enviar, igual que con cualquier otro texto. /clear es la unica excepcion (D2 revisada): destruye el contexto sin deshacer, asi que pide confirmacion en vez de escribirse.
function commitSelectedCommand(index: number): void {
  const text = commandToCommitText(filteredCommands.value, index);
  commandsListVisible.value = false;
  if (!text) return;
  if (text === CLEAR_COMMAND) {
    openClearConfirmation();
    return;
  }
  chatDraft.value = text;
  void nextTick(() => {
    resizeChatComposer();
    const el = chatComposerTextarea.value;
    el?.focus();
    el?.setSelectionRange(chatDraft.value.length, chatDraft.value.length);
  });
}

type OverlayId = 'clear' | 'usageDetail' | 'themePopup' | 'characterImport';
const openOverlayStack = ref<OverlayId[]>([]);

function pushOverlay(id: OverlayId): void {
  openOverlayStack.value = [
    ...openOverlayStack.value.filter((entry) => entry !== id),
    id,
  ];
}

function popOverlay(id: OverlayId): void {
  openOverlayStack.value = openOverlayStack.value.filter(
    (entry) => entry !== id,
  );
}

const CLEAR_CONFIRMATION_TIMEOUT_MS = 8000;
const clearConfirmationVisible = computed(() =>
  openOverlayStack.value.includes('clear'),
);
const clearConfirmationPanel = ref<HTMLElement | null>(null);
const clearConfirmationTimedOut = ref(false);
let clearConfirmationReturnFocus: HTMLElement | null = null;
let clearConfirmationTimeoutId: ReturnType<typeof setTimeout> | null = null;

function openClearConfirmation(): void {
  clearConfirmationReturnFocus = document.activeElement as HTMLElement | null;
  pushOverlay('clear');
  void nextTick(() =>
    clearConfirmationPanel.value?.querySelector<HTMLElement>('button')?.focus(),
  );
}

function closeClearConfirmation(): void {
  popOverlay('clear');
  clearConfirmationReturnFocus?.focus();
  clearConfirmationReturnFocus = null;
}

function trapClearConfirmationTab(event: KeyboardEvent): void {
  trapOverlayTab(clearConfirmationPanel.value, event);
}

function cancelClear(): void {
  closeClearConfirmation();
}

// H8: simetrico a awaitingEffortResponse/awaitingUsageDetail -- ninguna respuesta a un comando en caliente se narra por voz.
const awaitingClearReset = ref(false);

function confirmClear(): void {
  closeClearConfirmation();
  clearConfirmationTimedOut.value = false;
  awaitingClearReset.value = true;
  chatDraft.value = CLEAR_COMMAND;
  void sendChatMessage();
  clearConfirmationTimeoutId = setTimeout(() => {
    clearConfirmationTimeoutId = null;
    clearConfirmationTimedOut.value = true;
  }, CLEAR_CONFIRMATION_TIMEOUT_MS);
}

watch(isSending, (sending) => {
  if (!sending) awaitingClearReset.value = false;
});

function onComposerEnterKey(): void {
  if (isClearCommandWithExtraContent(chatDraft.value)) {
    commandsListVisible.value = false;
    openClearConfirmation();
    return;
  }
  if (commandsListVisible.value) {
    commitSelectedCommand(activeCommandIndex.value);
    return;
  }
  void sendChatMessage();
}

// La entrada del menu nativo abre el mismo listado inline que teclear "/" -- un solo listado, dos disparadores (D9).
function openCommandsListFromMenu(): void {
  const el = chatComposerTextarea.value;
  if (!el) return;
  chatDraft.value = '/';
  commandsListVisible.value = true;
  activeCommandIndex.value = 0;
  void nextTick(() => {
    resizeChatComposer();
    el.focus();
  });
}

// El alto en modo completo lo da flex:1 (CSS), no el calculo de renglones del modo compacto -- se limpia el alto en linea para que ninguno de los dos se pise al alternar.
function toggleChatComposerExpanded(): void {
  chatComposerExpanded.value = !chatComposerExpanded.value;
  activeComposerTab.value = 'editar';
  if (chatComposerExpanded.value) {
    const el = chatComposerTextarea.value;
    if (el) el.style.height = '';
  } else {
    void nextTick(resizeChatComposer);
  }
}

const presentationManager = new PresentationManager(
  new TauriDesktopWindowManager(),
);
const presentationState = computed(() => presentationManager.getState());
const presentationError = ref<string | null>(null);
// AC-025.6: informa a la persona cuando una transicion aplica su alternativa de recuperacion (el registro en DebugPanel es solo para desarrollo, no visible en produccion).
presentationManager.onTransitionFault((fault) => {
  presentationError.value = fault.message;
});

async function switchToFullMode(): Promise<void> {
  presentationError.value = null;
  try {
    await presentationManager.transitionTo('FULL');
  } catch (err) {
    presentationError.value = errorMessage(err);
  }
}

async function switchToCompanionMode(): Promise<void> {
  presentationError.value = null;
  try {
    await presentationManager.transitionTo('COMPANION');
  } catch (err) {
    presentationError.value = errorMessage(err);
  }
}

const petWindowPosition = ref<PetWindowPosition | null>(null);
const petWindowPositionLabel = computed(() =>
  describePetWindowPosition(petWindowPosition.value),
);

// D8: un arrastre persiste desde la ventana pet (proceso separado); se relee de disco antes de cada reactivacion para no quedarse con el cache en memoria de la sesion anterior.
async function syncPetWindowPositionBeforeActivating(): Promise<void> {
  try {
    const { settings } = await getAppSettings(chosenCwd.value);
    petWindowPosition.value = sanitizePetWindowPosition(
      settings.petWindowPosition,
    );
    presentationManager.setPetWindowPosition(petWindowPosition.value);
  } catch (err) {
    console.error(
      '[configuracion] no se pudo releer la posicion de la mascota:',
      err,
    );
  }
}

async function switchToPetMode(): Promise<void> {
  presentationError.value = null;
  try {
    await syncPetWindowPositionBeforeActivating();
    await presentationManager.transitionTo('PET');
  } catch (err) {
    presentationError.value = errorMessage(err);
  }
}

async function onRestorePetWindowPosition(): Promise<void> {
  petWindowPosition.value = null;
  presentationManager.setPetWindowPosition(null);
  try {
    loadedAppSettings.value = await mergeAndPersistAppSettings({
      petWindowPosition: undefined,
    });
  } catch (err) {
    console.error(
      '[configuracion] no se pudo restaurar la posicion de la mascota:',
      err,
    );
  }
  await presentationManager.refreshPetGeometry();
}

const petWindowSizePx = ref(PET_WINDOW_SIZE_MIN_PX);

async function onPetWindowSizeChange(event: Event): Promise<void> {
  const px = sanitizePetWindowSizePx(
    Number((event.target as HTMLInputElement).value),
  );
  petWindowSizePx.value = px;
  presentationManager.setPetWindowSize({ width: px, height: px });
  try {
    loadedAppSettings.value = await mergeAndPersistAppSettings({
      windowSize: { width: px, height: px },
    });
  } catch (err) {
    console.error(
      '[configuracion] no se pudo persistir el tamaño de la mascota:',
      err,
    );
  }
}

type ModeTabId = 'FULL' | 'COMPANION';
const MODE_TABS: { id: ModeTabId; label: string }[] = [
  { id: 'FULL', label: 'Modo completo' },
  { id: 'COMPANION', label: 'Modo compañera' },
];
const MODE_TAB_IDS: readonly ModeTabId[] = MODE_TABS.map((tab) => tab.id);
const modeTabFocus = createTabFocusRegistry();

function activateModeTab(id: ModeTabId): Promise<void> {
  return id === 'FULL' ? switchToFullMode() : switchToCompanionMode();
}

// El propio PresentationManager llama a windowManager.focus() en toda transicion FULL<->COMPANION (leavePetGeometry), lo que en WebView2 resetea el foco del DOM a <body> tras terminar. Sin re-aplicar foco despues de esperar la transicion, el contrato de tablist (el tab activo debe mantener el foco) se rompe tanto por teclado como por click.
async function onModeTabClick(id: ModeTabId): Promise<void> {
  await activateModeTab(id);
  modeTabFocus.focus(id);
}

// handleTabListKeydown asume un ref mutable de valor plano; el modo requiere disparar una transicion async con manejo de error, asi que se reusan solo las piezas puras (isTabArrowKey/nextTabId) y se activa via activateModeTab.
async function onModeTabKeydown(event: KeyboardEvent): Promise<void> {
  if (!isTabArrowKey(event.key)) return;
  event.preventDefault();
  const next = nextTabId(
    MODE_TAB_IDS,
    presentationState.value.mode as ModeTabId,
    event.key,
  );
  await activateModeTab(next);
  modeTabFocus.focus(next);
}

function toggleActivityVisibility() {
  presentationManager.setActivityVisibility(
    presentationState.value.activityVisibility === 'VISIBLE'
      ? 'HIDDEN'
      : 'VISIBLE',
  );
}

const MIN_CHAT_COLUMN_WIDTH_PX = 240;
const MAX_CHAT_COLUMN_WIDTH_PERCENT = 0.6;
const CHAT_COLUMN_KEYBOARD_STEP_PX = 24;
const isResizingChatColumn = ref(false);
let chatColumnResizeStartX = 0;
let chatColumnResizeStartWidthPx = 0;

function maxChatColumnWidthPx(): number {
  return Math.round(window.innerWidth * MAX_CHAT_COLUMN_WIDTH_PERCENT);
}

function stopChatColumnResize(): void {
  isResizingChatColumn.value = false;
  window.removeEventListener('pointermove', onChatColumnResizePointerMove);
  window.removeEventListener('pointerup', onChatColumnResizePointerUp);
}

function clampChatColumnWidthPx(px: number): number {
  return Math.min(
    Math.max(px, MIN_CHAT_COLUMN_WIDTH_PX),
    maxChatColumnWidthPx(),
  );
}

function currentChatColumnWidthPx(): number {
  return (
    chatColumnWidthPx.value ??
    document.querySelector('.full-layout__chat')?.getBoundingClientRect()
      .width ??
    MIN_CHAT_COLUMN_WIDTH_PX
  );
}

function onChatColumnResizePointerDown(event: PointerEvent) {
  isResizingChatColumn.value = true;
  chatColumnResizeStartX = event.clientX;
  chatColumnResizeStartWidthPx = currentChatColumnWidthPx();
  window.addEventListener('pointermove', onChatColumnResizePointerMove);
  window.addEventListener('pointerup', onChatColumnResizePointerUp);
}

function onChatColumnResizePointerMove(event: PointerEvent) {
  const deltaPx = event.clientX - chatColumnResizeStartX;
  chatColumnWidthPx.value = clampChatColumnWidthPx(
    chatColumnResizeStartWidthPx + deltaPx,
  );
}

function onChatColumnResizePointerUp() {
  stopChatColumnResize();
  void persistChatColumnWidth();
}

// Sin esto, achicar la ventana tras un ancho persistido grande (ej. 60% de una pantalla de 1920px) deja la columna de chat invadiendo casi todo el layout en ventanas mas chicas, porque el ancho guardado nunca se recalcula contra el nuevo `window.innerWidth`.
function onWindowResizeForChatColumn(): void {
  if (chatColumnWidthPx.value === undefined) return;
  chatColumnWidthPx.value = clampChatColumnWidthPx(chatColumnWidthPx.value);
}

function onChatColumnResizeKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const direction = event.key === 'ArrowLeft' ? -1 : 1;
  chatColumnWidthPx.value = clampChatColumnWidthPx(
    currentChatColumnWidthPx() + direction * CHAT_COLUMN_KEYBOARD_STEP_PX,
  );
  void persistChatColumnWidth();
}

async function persistChatColumnWidth(): Promise<void> {
  if (chatColumnWidthPx.value === undefined) return;
  try {
    loadedAppSettings.value = await mergeAndPersistAppSettings({
      chatColumnWidthPx: chatColumnWidthPx.value,
    });
  } catch (err) {
    console.error(
      '[configuracion] no se pudo persistir el ancho de la columna de chat:',
      err,
    );
  }
}

// D9: nunca roba el foco si la persona ya lo movio a proposito a otro control mientras el mensaje estaba en vuelo.
function restoreComposerFocusIfIdle(): void {
  const active = document.activeElement;
  if (active !== document.body && active !== chatComposerTextarea.value) {
    return;
  }
  // El textarea sigue con :disabled hasta que Vue vacie este render -- un input disabled nunca acepta foco, incluso si isSending.value ya es false aqui.
  void nextTick(() => chatComposerTextarea.value?.focus());
}

async function sendChatMessage() {
  if (isSending.value) return;
  const text = chatDraft.value.trim();
  if (!text) return;
  isSending.value = true;
  chatState.value = recordPersonMessage(chatState.value, text);
  chatDraft.value = '';
  void nextTick(resizeChatComposer);
  try {
    await sendInstruction(text);
  } catch {
    // el turno nunca llegara a completarse del lado del backend: sin esto, isSending quedaria atascado en true para siempre.
    isSending.value = false;
    restoreComposerFocusIfIdle();
  }
}

// H19/H21: unica opcion del carril caliente con cambio de estado real demostrado. Reusa sendChatMessage tal cual -- mismo mecanismo ya probado, sin escribir un segundo camino de envio.
const effortLevel = ref<EffortLevel>('medium');
const effortOptions = computed<CustomSelectOption[]>(() =>
  EFFORT_LEVELS.map((level) => ({ value: level, label: level })),
);
const effortChangeStatus = ref<'idle' | 'pending' | EffortChangeConfirmation>(
  'idle',
);
// La respuesta llega en streaming (blocks se llenan de a poco): sin este flag separado, la primera actualizacion parcial (todavia sin el texto de confirmacion) fijaria 'unknown' para siempre.
const awaitingEffortResponse = ref(false);

// H7: un solo paso -- elegir la opcion ya actualiza y envia, sin boton "Cambiar" intermedio.
async function selectEffortLevel(value: string): Promise<void> {
  effortLevel.value = value as EffortLevel;
  if (isSending.value) return;
  effortChangeStatus.value = 'pending';
  awaitingEffortResponse.value = true;
  chatDraft.value = buildEffortCommand(effortLevel.value);
  await sendChatMessage();
}

// Refleja el estado que Claude realmente respondio, no el pedido (AC-112): se reevalua en cada actualizacion del streaming hasta que el turno termina; si al terminar nunca confirmo, queda 'unknown', nunca se asume exito.
watch(chatEntryList, (entries) => {
  if (!awaitingEffortResponse.value) return;
  const last = entries[entries.length - 1];
  if (!last || last.role !== 'agent') return;
  effortChangeStatus.value = parseEffortChangeConfirmation(
    blocksToMarkdownText(last.blocks),
  );
});
watch(isSending, (sending) => {
  if (!sending) awaitingEffortResponse.value = false;
});

// D14: /usage responde con prosa libre, no datos estructurados -- se reusa el mismo mecanismo de comando en caliente y el mismo interprete de Markdown que ya usa el tab "Markdown" de la consola de Actividad, sin parsear porcentajes.
const usageDetailVisible = computed(() =>
  openOverlayStack.value.includes('usageDetail'),
);
const usageDetailPanel = ref<HTMLElement | null>(null);
const usageDetailText = ref<string | null>(null);
const awaitingUsageDetail = ref(false);
let usageDetailReturnFocus: HTMLElement | null = null;
const usageDetailHtml = computed(() =>
  usageDetailText.value ? renderChatDraftMarkdown(usageDetailText.value) : '',
);

async function openUsageDetail(): Promise<void> {
  if (isSending.value) return;
  usageDetailReturnFocus = document.activeElement as HTMLElement | null;
  pushOverlay('usageDetail');
  usageDetailText.value = null;
  awaitingUsageDetail.value = true;
  chatDraft.value = '/usage';
  await sendChatMessage();
}

function closeUsageDetail(): void {
  popOverlay('usageDetail');
  usageDetailReturnFocus?.focus();
  usageDetailReturnFocus = null;
}
function trapUsageDetailTab(event: KeyboardEvent): void {
  trapOverlayTab(usageDetailPanel.value, event);
}

watch(chatEntryList, (entries) => {
  if (!awaitingUsageDetail.value) return;
  const last = entries[entries.length - 1];
  if (!last || last.role !== 'agent') return;
  usageDetailText.value = blocksToMarkdownText(last.blocks);
});
watch(isSending, (sending) => {
  if (!sending) awaitingUsageDetail.value = false;
});

const avatarStageRef = ref<InstanceType<typeof AvatarStage> | null>(null);
const avatarController = new TestAvatarController();
const textToSpeech = new WebSpeechTextToSpeech();
const reactionEngine = new ReactionEngine(REACTION_CATALOG, avatarController, {
  textToSpeech,
});
// paso 7.1: WebSpeechTextToSpeech es la implementacion real de MouthSyncSource; sustituible sin tocar el resto.
const mouthSyncController = new MouthSyncController(textToSpeech);

// Un solo AvatarController para todo el catalogo: cambiar de personaje solo cambia que componente dibuja el snapshot, sin resuscribir el motor de reacciones.
const activeCharacterId = ref<string | null>(
  resolveActiveCharacter(CHARACTER_CATALOG, loadPersistedCharacterId())?.id ??
    null,
);
const activeCharacter = computed<CharacterCatalogEntry | null>(
  () =>
    CHARACTER_CATALOG.find((entry) => entry.id === activeCharacterId.value) ??
    null,
);

// Un solo manejador: catalogo e importados solo difieren en de donde viene el id, la asignacion es identica.
function applyCharacterActivation(id: string): void {
  activeCharacterId.value = id;
  try {
    persistCharacterId(id);
  } catch (err) {
    console.error('[personaje] no se pudo persistir la eleccion:', err);
  }
  void nativeMenuHandle?.setActiveCharacter(id);
}

// D7 (lanzamiento-publico Hito 9): Rabbit/Polydancer exigen aceptacion explicita de su riesgo de licencia antes de poder seleccionarse, una sola vez por instalacion.
const pendingCharacterLicenseId = ref<string | null>(null);
const pendingCharacterLicenseEntry = computed<CharacterCatalogEntry | null>(
  () =>
    CHARACTER_CATALOG.find(
      (entry) => entry.id === pendingCharacterLicenseId.value,
    ) ?? null,
);

function activateCharacter(id: string): void {
  const entry = CHARACTER_CATALOG.find((candidate) => candidate.id === id);
  if (entry?.requiresLicenseAcceptance && !hasAcceptedCharacterLicense(id)) {
    pendingCharacterLicenseId.value = id;
    return;
  }
  applyCharacterActivation(id);
}

function acceptCharacterLicense(): void {
  if (!pendingCharacterLicenseId.value) return;
  persistCharacterLicenseAccepted(pendingCharacterLicenseId.value);
  applyCharacterActivation(pendingCharacterLicenseId.value);
  pendingCharacterLicenseId.value = null;
}

function cancelCharacterLicense(): void {
  pendingCharacterLicenseId.value = null;
}

const importedCharacters = ref<ImportedCharacterSummary[]>([]);
const activeImportedCharacter = computed<ImportedCharacterSummary | null>(
  () =>
    importedCharacters.value.find(
      (entry) => entry.id === activeCharacterId.value,
    ) ?? null,
);

function onCharacterImported(summary: ImportedCharacterSummary): void {
  importedCharacters.value = [...importedCharacters.value, summary];
  void nativeMenuHandle?.addImportedCharacter({
    id: summary.id,
    name: summary.name,
  });
}

// Hito 5/7: reconcilia el modelo {expression, mouth, eyebrows} de los importados con los 4 ejes editables (expresion/animacion/pose/boca).
const activeCharacterCapabilities = computed(() =>
  activeImportedCharacter.value
    ? capabilitiesForImportedCharacter(
        activeImportedCharacter.value.capabilities,
        activeImportedCharacter.value.format,
      )
    : capabilitiesForTestAvatar(),
);

// D2: un solo punto de resolucion de la URL del modelo para el Editor de personaje, en vez de duplicar el ternario en cada uso de <CharacterEditor>.
const characterEditorModelUrl = computed(() =>
  activeCharacter.value?.kind === 'vrm'
    ? activeCharacter.value.modelUrl
    : resolveImportedVrmModelUrl(activeImportedCharacter.value, convertFileSrc),
);

// Bump manual: loadCharacterEditorSettings no es reactivo (localStorage), este contador fuerza recomputar activeStateAssignment tras un guardado del Editor sin cambio de estado.
const characterEditorSettingsVersion = ref(0);
function reloadActiveCharacterSettings(): void {
  characterEditorSettingsVersion.value += 1;
}

// Wiring del avatar en vivo: lo que el Editor de personaje asigno por estado, resuelto contra el estado actual del avatarController compartido.
const activeStateAssignment = computed(() => {
  if (!activeCharacterId.value) return null;
  void characterEditorSettingsVersion.value;
  const persisted = loadCharacterEditorSettings(activeCharacterId.value);
  return resolveActiveStateAssignment(
    persisted,
    activeCharacterCapabilities.value,
    avatarController.snapshot.state,
  );
});

// paso 7.4: sin soporte de boca el personaje se queda fijo (false explicito), no hereda el binario isSpeaking.
const mouthOpenForActiveCharacter = computed(() =>
  activeCharacterCapabilities.value.mouth.supported
    ? mouthSyncController.snapshot.mouthOpen
    : false,
);

// R4: un fallo del motor de reacciones nunca debe tumbar el listener de sesion; el TTS ya se aisla y registra dentro de reaction-engine.ts.
function reactToEvent(event: NormalizedEvent): void {
  try {
    reactionEngine.handleEvent(event);
  } catch (err) {
    const message = errorMessage(err);
    registerFailure('avatar-error', message);
    console.error('[avatar] motor de reacciones fallo, avatar degradado:', err);
  }
}

const interactionRequestsState = ref(createInteractionRequestsState());
const interactionRequestEntries = computed(() =>
  listInteractionRequests(interactionRequestsState.value),
);
const interactionRequestError = ref<string | null>(null);

const attentionSignalSettings = ref(loadAttentionSignalSettings());
const attentionSignal = computed(() =>
  resolveAttentionSignal(
    presentationState.value.pendingInteractionCount,
    presentationState.value.mode,
  ),
);

// La ventana pet (App.vue nunca se desmonta al ocultarse) es la unica fuente de este estado; PetView.vue solo lo pinta.
const petSyncPayload = computed<PetSyncPayload>(() => ({
  avatarState: avatarController.snapshot.state,
  avatarExpression: avatarController.snapshot.expression,
  mouthOpen: mouthOpenForActiveCharacter.value,
  activeCharacterId: activeCharacterId.value,
  sessionActive: sessionActive.value,
  attentionVisible: attentionSignal.value.visible,
  attentionVisualIndicator: attentionSignalSettings.value.visualIndicator,
  attentionBubble: attentionSignalSettings.value.bubble,
  animationPoolUrls: activeStateAssignment.value?.animations,
  poseUrl: activeStateAssignment.value?.pose,
  transitionDurationMs: activeStateAssignment.value?.transitionDurationMs,
}));
watch(petSyncPayload, (payload) => void emit(PET_SYNC_EVENT, payload), {
  deep: true,
  immediate: true,
});

// AC-026.5/R3: la presentacion solo lee el numero; la fila y la notificacion nunca resuelven la peticion.
watch(
  () => countPendingInteractionRequests(interactionRequestsState.value),
  (count, previousCount) => {
    presentationManager.setPendingInteractionCount(count);
    notifyOnRisingEdgeInPetMode(count, previousCount ?? 0);
  },
);

function notifyOnRisingEdgeInPetMode(
  count: number,
  previousCount: number,
): void {
  if (previousCount > 0 || count === 0) return;
  if (presentationState.value.mode !== 'PET') return;
  if (!attentionSignalSettings.value.systemNotification) return;
  void sendAttentionNotification({
    title: 'Codetuver Avatar',
    body: ATTENTION_SIGNAL_MESSAGE,
  });
}

// Solo `permission` tiene transmision real hoy; las demas variantes se resuelven solo aqui, sin invoke.
async function respondToInteractionRequest(
  requestId: string,
  decision: InteractionDecision,
): Promise<void> {
  if (decision.type === 'permission') {
    try {
      await respondToPermissionRequest(requestId, decision.allow);
    } catch (err) {
      interactionRequestError.value = errorMessage(err);
      return;
    }
  }
  interactionRequestsState.value = resolveRequest(
    interactionRequestsState.value,
    requestId,
    decision,
  );
}

// AC-024.5/024.6: Avatar es una pestaña mas que nunca coexiste con las demas, no apiladas.
type SecondaryTab =
  | 'avatar'
  | 'actividad'
  | 'salida-cruda'
  | 'configuracion'
  | 'editor-personaje';
type ToggleableSecondaryTab = Exclude<SecondaryTab, 'avatar'>;
const SECONDARY_TABS: { id: SecondaryTab; label: string }[] = [
  { id: 'avatar', label: 'Avatar' },
  { id: 'actividad', label: 'Actividad' },
  { id: 'salida-cruda', label: 'Salida cruda' },
  { id: 'configuracion', label: 'Configuracion' },
  { id: 'editor-personaje', label: 'Editor de personaje' },
];
// El submenu nativo "Window" solo marca/desmarca estas 4; Avatar siempre esta presente.
const TOGGLEABLE_SECONDARY_TABS = SECONDARY_TABS.filter(
  (tab) => tab.id !== 'avatar',
) as { id: ToggleableSecondaryTab; label: string }[];
const activeSecondaryTab = ref<SecondaryTab>('avatar');
const enabledTabs = ref<Record<ToggleableSecondaryTab, boolean>>({
  actividad: true,
  'salida-cruda': true,
  configuracion: true,
  'editor-personaje': true,
});
const visibleSecondaryTabs = computed(() =>
  filterVisibleTabs(SECONDARY_TABS, 'avatar', enabledTabs.value),
);
const visibleSecondaryTabIds = computed(() =>
  visibleSecondaryTabs.value.map((tab) => tab.id),
);
const secondaryTabFocus = createTabFocusRegistry();
function onSecondaryTabKeydown(event: KeyboardEvent): void {
  handleTabListKeydown(
    event,
    visibleSecondaryTabIds.value,
    activeSecondaryTab,
    secondaryTabFocus,
  );
}

// Desmarcar la pestaña activa desde el menu nativo la saca de la barra; el Avatar es el destino seguro porque siempre esta presente.
function setTabEnabled(tabId: string, enabled: boolean): void {
  if (!(tabId in enabledTabs.value)) return;
  enabledTabs.value = {
    ...enabledTabs.value,
    [tabId as ToggleableSecondaryTab]: enabled,
  };
  if (!enabled && activeSecondaryTab.value === tabId) {
    activeSecondaryTab.value = 'avatar';
    secondaryTabFocus.focus('avatar');
  }
}

const themePopupVisible = computed(() =>
  openOverlayStack.value.includes('themePopup'),
);
const themePopupPanel = ref<HTMLElement | null>(null);
let themePopupReturnFocus: HTMLElement | null = null;

function openThemePopup(): void {
  themePopupReturnFocus = document.activeElement as HTMLElement | null;
  pushOverlay('themePopup');
}
function closeThemePopup(): void {
  popOverlay('themePopup');
  themePopupReturnFocus?.focus();
  themePopupReturnFocus = null;
}
function trapThemePopupTab(event: KeyboardEvent): void {
  trapOverlayTab(themePopupPanel.value, event);
}

async function commitPrimaryColor(rgb: PrimaryColorRgb): Promise<void> {
  currentPrimaryColorRgb.value = rgb;
  try {
    loadedAppSettings.value = await mergeAndPersistAppSettings({
      primaryColorRgb: rgb,
    });
  } catch (err) {
    console.error(
      '[configuracion] no se pudo persistir el color primario:',
      err,
    );
  }
}
// Compartido por los overlays modales de la app (importar personaje, tema): mismo trap de foco, distinto panel.
function trapOverlayTab(
  panelEl: HTMLElement | null,
  event: KeyboardEvent,
): void {
  if (event.key !== 'Tab' || !panelEl) return;
  const focusables = panelEl.querySelectorAll<HTMLElement>(
    'button, input, [role="option"]',
  );
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

const characterImportOverlayVisible = computed(() =>
  openOverlayStack.value.includes('characterImport'),
);
const characterImportOverlayPanel = ref<HTMLElement | null>(null);
const pendingCharacterImportPath = ref<string | null>(null);
const isImportingCharacterFile = ref(false);
const characterImportError = ref<string | null>(null);
const lastImportedCharacterSummary = ref<ImportedCharacterSummary | null>(null);
let characterImportOverlayReturnFocus: HTMLElement | null = null;

function showCharacterImportOverlay(path: string): void {
  characterImportOverlayReturnFocus =
    document.activeElement as HTMLElement | null;
  pendingCharacterImportPath.value = path;
  characterImportError.value = null;
  lastImportedCharacterSummary.value = null;
  pushOverlay('characterImport');
  void nextTick(() =>
    characterImportOverlayPanel.value
      ?.querySelector<HTMLElement>('button, input')
      ?.focus(),
  );
}

// Disparado desde "Agregar nuevo..." del menu nativo (Hito 11): abre el picker nativo de archivo primero, el overlay solo aparece si de verdad se eligio un archivo.
async function openCharacterImportOverlay(): Promise<void> {
  const selected = await pickCharacterFile();
  if (!selected) return;
  showCharacterImportOverlay(selected);
}
// No cierra mientras hay una importacion en vuelo: si no, el overlay desaparece por v-if y el exito/error de confirmCharacterImport queda calculado pero invisible (Nielsen #1, hallazgo real de design-critic).
function closeCharacterImportOverlay(): void {
  if (isImportingCharacterFile.value) return;
  popOverlay('characterImport');
  pendingCharacterImportPath.value = null;
  characterImportOverlayReturnFocus?.focus();
  characterImportOverlayReturnFocus = null;
}
const OVERLAY_CLOSERS: Record<OverlayId, () => void> = {
  clear: closeClearConfirmation,
  usageDetail: closeUsageDetail,
  themePopup: closeThemePopup,
  characterImport: closeCharacterImportOverlay,
};

function closeTopOverlayOnEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  const topOverlay = openOverlayStack.value[openOverlayStack.value.length - 1];
  if (!topOverlay) return;
  OVERLAY_CLOSERS[topOverlay]();
}
function trapCharacterImportOverlayTab(event: KeyboardEvent): void {
  trapOverlayTab(characterImportOverlayPanel.value, event);
}

// AC-017.2: el rechazo muestra el motivo real del backend sin cerrar la aplicacion.
async function confirmCharacterImport(): Promise<void> {
  if (!pendingCharacterImportPath.value) return;
  isImportingCharacterFile.value = true;
  characterImportError.value = null;
  try {
    const summary = await importCharacterFile(pendingCharacterImportPath.value);
    lastImportedCharacterSummary.value = summary;
    onCharacterImported(summary);
    pendingCharacterImportPath.value = null;
  } catch (err) {
    characterImportError.value = errorMessage(err);
  } finally {
    isImportingCharacterFile.value = false;
  }
}
function cancelCharacterImport(): void {
  closeCharacterImportOverlay();
}

const CHARACTER_CAPABILITY_LABELS: Record<keyof CharacterCapabilities, string> =
  {
    expression: 'expresion facial',
    mouth: 'control de boca',
    eyebrows: 'control de cejas',
  };

// AC-017.3: la declaracion es por formato (VRM/Live2D), no por archivo individual — no se parsea la escena 3D.
function describeCharacterCapabilities(
  capabilities: CharacterCapabilities,
  available: boolean,
): string {
  const keys = (
    Object.keys(CHARACTER_CAPABILITY_LABELS) as (keyof CharacterCapabilities)[]
  ).filter((key) => capabilities[key] === available);
  return keys.length > 0
    ? keys.map((key) => CHARACTER_CAPABILITY_LABELS[key]).join(', ')
    : 'ninguno';
}

let nativeMenuHandle: NativeMenuHandle | null = null;
watch(sendableCommands, (commands) => {
  if (commands.length > 0) void nativeMenuHandle?.setPluginsEnabled(true);
});
watch([chosenCwd, sessionId, sessionActive], ([folder, id, closable]) => {
  void nativeMenuHandle?.setSessionInfo(folder, id, closable);
});

// AC-102 paso 3: el submenu Sesion refleja las 5 sesiones mas recientes de la carpeta activa, no de una carpeta congelada.
async function refreshRecentSessionsMenu(cwd: string | null): Promise<void> {
  if (!cwd) {
    void nativeMenuHandle?.setRecentSessions(
      { status: 'ok', sessions: [] },
      '',
    );
    return;
  }
  const folder = cwdToProjectFolder(cwd);
  try {
    const folders = await listProjectFolders();
    const sessions = folders.includes(folder)
      ? await listProjectSessions(folder)
      : [];
    void nativeMenuHandle?.setRecentSessions(
      { status: 'ok', sessions },
      folder,
    );
  } catch {
    void nativeMenuHandle?.setRecentSessions({ status: 'read-failed' }, folder);
  }
}
watch(chosenCwd, (cwd) => void refreshRecentSessionsMenu(cwd));

const CONSOLE_VIEW_TAB_IDS: ConsoleViewMode[] = ['styled', 'markdown'];
const consoleViewTabFocus = createTabFocusRegistry();
function onConsoleViewTabKeydown(event: KeyboardEvent): void {
  handleTabListKeydown(
    event,
    CONSOLE_VIEW_TAB_IDS,
    consoleViewMode,
    consoleViewTabFocus,
  );
}

// El modo compañera no tiene pestañas propias; conserva el disclosure suelto que ya tenia.
const companionAdminPanelOpen = ref(false);

let unlistenNormalized: (() => void) | null = null;
let unlistenActivity: (() => void) | null = null;
let unlistenPermissionPending: (() => void) | null = null;
let unlistenPetRestoreRequested: UnlistenFn | null = null;
let unlistenPetSyncRequest: UnlistenFn | null = null;
let unlistenStderr: (() => void) | null = null;
let unlistenSessionClosed: (() => void) | null = null;
// Contexto para el aviso de cierre inesperado (H: la sesion muere sin avisar, ej. sin "claude login") -- no es parte de la taxonomia de fallas por si sola, es best-effort igual que el resto del stderr.
let lastStderrLine: string | null = null;

function isClaudeCodeNotFound(err: unknown): err is TransportError {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as Partial<TransportError>).kind === 'claude-code-not-found'
  );
}

async function pickFolder() {
  const selected = await open({ directory: true, multiple: false });
  if (typeof selected === 'string') {
    chosenCwd.value = selected;
  }
}

const sessionStartOptionsDraft = ref(emptyStartOptionsDraft());

async function persistSessionStartOptions(): Promise<void> {
  try {
    loadedAppSettings.value = await mergeAndPersistAppSettings({
      sessionStartOptions: buildSessionStartOptions(
        sessionStartOptionsDraft.value,
      ),
    });
  } catch (err) {
    console.error(
      '[configuracion] no se pudo persistir las opciones de arranque:',
      err,
    );
  }
}

async function beginSession(cwd: string) {
  if (isStarting.value) return;
  if (validateStartOptionsDraft(sessionStartOptionsDraft.value).length > 0) {
    return;
  }
  const previousCwd = chosenCwd.value;
  const previousSessionId = sessionId.value;
  isStarting.value = true;
  startError.value = null;
  lastStderrLine = null;
  sessionId.value = null;
  sessionActive.value = false;
  chosenCwd.value = cwd;
  chatState.value = createChatState();
  activityConsole.value = createActivityConsoleState();
  await initializeAppSettings(cwd);
  try {
    await startSessionWithRetry(
      () =>
        startSession(
          cwd,
          buildSessionStartOptions(sessionStartOptionsDraft.value),
        ),
      closeSession,
    );
    sessionActive.value = true;
    void persistSessionStartOptions();
  } catch (err) {
    chosenCwd.value = previousCwd;
    sessionId.value = previousSessionId;
    startError.value = errorMessage(err);
    if (isClaudeCodeNotFound(err)) {
      registerFailure('claude-code-error', startError.value);
    }
  } finally {
    isStarting.value = false;
  }
}

// AC-113: reanudar/bifurcar reusa startSession; el proceso reanudado no reemite los turnos previos como eventos (verificado en vivo), asi que el chat se siembra aparte leyendo el transcript real antes de arrancar.
async function resumeSession(
  cwd: string,
  resumeSessionId: string,
  fork: boolean,
  folder: string,
): Promise<void> {
  if (isStarting.value) return;
  const previousCwd = chosenCwd.value;
  const previousSessionId = sessionId.value;
  isStarting.value = true;
  startError.value = null;
  lastStderrLine = null;
  sessionId.value = null;
  sessionActive.value = false;
  chosenCwd.value = cwd;
  await initializeAppSettings(cwd);
  const [transcript, activityEvents] = await Promise.all([
    readSessionTranscript(folder, resumeSessionId).catch((err) => {
      console.error('[sesion] no se pudo leer el transcript al reanudar:', err);
      return [];
    }),
    readSessionActivityEvents(folder, resumeSessionId).catch((err) => {
      console.error(
        '[sesion] no se pudo leer los eventos de actividad al reanudar:',
        err,
      );
      return [];
    }),
  ]);
  chatState.value = {
    closedEntries: transcriptToChatEntries(transcript),
    openTurn: null,
    usage: createSessionUsage(),
  };
  rawViewEntryIds.value = new Set();
  // H13: sin el "cerca del fondo" de H11 -- al abrir una sesion no hay un "antes" que respetar, siempre arranca en el fondo.
  visibleEntryCount.value = CHAT_HISTORY_CHUNK_SIZE;
  void nextTick(scrollChatToBottom);
  activityConsole.value = resumeActivityConsoleState(activityEvents);
  try {
    await startSessionWithRetry(
      () =>
        startSession(
          cwd,
          buildSessionStartOptions(sessionStartOptionsDraft.value),
          { sessionId: resumeSessionId, fork },
        ),
      closeSession,
    );
    sessionActive.value = true;
  } catch (err) {
    chosenCwd.value = previousCwd;
    sessionId.value = previousSessionId;
    startError.value = errorMessage(err);
    if (isClaudeCodeNotFound(err)) {
      registerFailure('claude-code-error', startError.value);
    }
  } finally {
    isStarting.value = false;
  }
}

function retomarUltimaCarpeta() {
  if (!lastPreference.value) return;
  beginSession(lastPreference.value.lastWorkingDirectory);
}

// AC-101: la entrada de menu nativo "Cerrar sesion" cablea el comando de backend que ya existe y refleja el cierre en la interfaz (sessionActive gobierna casi todo el arbol de App.vue).
async function closeActiveSession(): Promise<void> {
  if (!sessionActive.value) return;
  await closeSession();
  sessionActive.value = false;
  sessionId.value = null;
}

// import.meta no es evaluable en una expresion de plantilla de Vue: se lee aqui una sola vez para el v-if del panel de depuracion.
const isDevBuild = import.meta.env.DEV;

// Extraida (Parte D del panel de depuracion) para que la inyeccion de una muestra de salida la reutilice sin pasar por Tauri/IPC.
function handleIncomingEvent(event: NormalizedEvent): void {
  activityConsole.value = handleNormalizedEvent(activityConsole.value, event);
  const hadOpenTurn = Boolean(chatState.value.openTurn);
  chatState.value = applyChatEvent(chatState.value, event);
  reactToEvent(event);
  // H8: la respuesta a un comando en caliente (/effort, /usage, /clear) nunca se narra -- solo el turno conversacional real.
  const isHotCommandResponse =
    awaitingEffortResponse.value ||
    awaitingUsageDetail.value ||
    awaitingClearReset.value;
  if (
    event.type === 'session_finished' &&
    hadOpenTurn &&
    !isHotCommandResponse
  ) {
    const lastEntry =
      chatState.value.closedEntries[chatState.value.closedEntries.length - 1];
    if (lastEntry?.role === 'agent') {
      reactToEvent({
        type: 'assistant_turn_complete',
        text: blocksToSpeechText(lastEntry.blocks),
      });
    }
  }
  if (event.type === 'session_started') {
    const previousSessionId = sessionId.value;
    sessionId.value = event.session_id;
    sendableCommands.value = event.sendable_commands;
    if (isClearSessionReset(previousSessionId, event.session_id)) {
      if (clearConfirmationTimeoutId !== null) {
        clearTimeout(clearConfirmationTimeoutId);
        clearConfirmationTimeoutId = null;
      }
      clearConfirmationTimedOut.value = false;
      chatState.value = createChatState();
      rawViewEntryIds.value = new Set();
      visibleEntryCount.value = CHAT_HISTORY_CHUNK_SIZE;
      activityConsole.value = createActivityConsoleState();
      avatarStageRef.value?.resetPoseForCurrentState();
    }
  }
  if (event.type === 'session_finished') {
    isSending.value = false;
    restoreComposerFocusIfIdle();
    // AC-113 paso 5: un id inexistente nunca llega a emitir session_started (verificado en vivo) -- sessionId sigue null cuando el error es de arranque, no de una sesion que ya vivio.
    if (event.is_error && sessionId.value === null) {
      sessionActive.value = false;
      startError.value =
        'No se pudo reanudar la sesion: el id ya no existe o no se puede recuperar.';
    }
  }
}

// D13 (correcciones-qa-gauntlet Hito 12): idempotente a proposito -- llamarla de nuevo con un cwd distinto (ej. beginSession tras cambiar de carpeta sin recargar la app) recalcula el aviso desde cero en vez de dejarlo pegado de una llamada anterior.
async function initializeAppSettings(cwd: string | null = null): Promise<void> {
  try {
    const { settings, usedDefaults } = await getAppSettings(cwd);
    appSettingsNotice.value = usedDefaults
      ? 'No se pudo leer tu configuracion guardada; se esta usando la configuracion por omision. La aplicacion funciona con normalidad.'
      : null;
    loadedAppSettings.value = settings;
    if (settings.chatColumnWidthPx) {
      chatColumnWidthPx.value = settings.chatColumnWidthPx;
    }
    petWindowSizePx.value = sanitizePetWindowSizePx(settings.windowSize.width);
    petWindowPosition.value = sanitizePetWindowPosition(
      settings.petWindowPosition,
    );
    currentPrimaryColorRgb.value = sanitizePrimaryColorRgb(
      settings.primaryColorRgb,
    );
    applyPrimaryColorRgb(currentPrimaryColorRgb.value);
    sessionStartOptionsDraft.value = draftFromSessionStartOptions(
      settings.sessionStartOptions,
    );
    await presentationManager.applyPersistedSettings(settings);
  } catch (err) {
    console.error(
      '[configuracion] no se pudo aplicar la configuracion persistida:',
      err,
    );
  }
}

onMounted(async () => {
  (window as any).__qaState = () => ({
    sessionActive: sessionActive.value,
    sessionId: sessionId.value,
    startError: startError.value,
    appSettingsNotice: appSettingsNotice.value,
    avatarState: avatarController.snapshot.state,
    avatarExpression: avatarController.snapshot.expression,
    avatarSpeaking: avatarController.snapshot.isSpeaking,
    avatarLastError: avatarController.snapshot.lastError,
    chatMessages: chatState.value.closedEntries,
    visibleEntryCount: visibleEntryCount.value,
    chatEntryListLength: chatEntryList.value.length,
    visibleChatEntryListLength: visibleChatEntryList.value.length,
    lastImportedCharacterSummary: lastImportedCharacterSummary.value,
    pendingRequests: interactionRequestsState.value,
    rawActivityTail: rawActivityLines.value
      .slice(-5)
      .map((line) => line.slice(0, 200)),
  });
  (window as any).__qaBeginSession = (cwd: string) => beginSession(cwd);
  (window as any).__qaSend = (text: string) => {
    chatDraft.value = text;
    return sendChatMessage();
  };
  (window as any).__qaInterrupt = () => interruptSession();
  (window as any).__qaClose = () => closeSession();
  (window as any).__qaCloseSessionFromMenu = () => closeActiveSession();
  // Los items reales viven en el menu nativo del SO (fuera del DOM/CDP); estos hooks disparan los mismos handlers que ese menu invoca, para poder verificarlos con Playwright.
  (window as any).__qaSelectCharacter = (id: string) => activateCharacter(id);
  // __qaTriggerAddNewCharacter llama al handler real (abre el picker nativo de archivo, bloqueante para un test automatizado); __qaOpenCharacterImportOverlayWithPath salta ese paso no automatizable y prueba el resto del flujo real (confirmar/cancelar/error/exito) contra el backend real.
  (window as any).__qaTriggerAddNewCharacter = () =>
    openCharacterImportOverlay();
  (window as any).__qaOpenCharacterImportOverlayWithPath = (path: string) =>
    showCharacterImportOverlay(path);
  (window as any).__qaOpenTheme = () => openThemePopup();
  (window as any).__qaOpenCommandsFromMenu = () => openCommandsListFromMenu();
  (window as any).__qaInjectEvent = (event: NormalizedEvent) =>
    handleIncomingEvent(event);
  // Mismo camino real que consume onPermissionPending (App.vue:1541-1546); onPermissionPending en si no es inyectable desde CDP (evento de backend Tauri).
  (window as any).__qaInjectPermissionPending = (
    request: InteractionRequest,
  ) => {
    interactionRequestsState.value = receivePendingRequest(
      interactionRequestsState.value,
      request,
    );
  };
  lastPreference.value = await getLastSessionPreference();
  try {
    importedCharacters.value = await listImportedCharacters();
  } catch (err) {
    console.error('[personaje] no se pudo listar personajes importados:', err);
  }
  await initializeAppSettings();
  void checkForUpdateSilently();
  unlistenNormalized = await onNormalizedEvent(handleIncomingEvent);
  unlistenActivity = await onActivity((activity) => {
    rawActivityLines.value = appendRawActivity(
      rawActivityLines.value,
      activity,
    );
  });
  unlistenPermissionPending = await onPermissionPending((request) => {
    interactionRequestsState.value = receivePendingRequest(
      interactionRequestsState.value,
      request,
    );
  });
  unlistenStderr = await onStderr((line) => {
    lastStderrLine = line;
  });
  unlistenSessionClosed = await onSessionClosed((closed) => {
    if (!sessionActive.value) return;
    const message = buildUnexpectedCloseMessage(closed, lastStderrLine);
    if (!message) return;
    sessionActive.value = false;
    sessionId.value = null;
    startError.value = message;
    registerFailure('process-error', message);
  });
  window.addEventListener('keydown', closeTopOverlayOnEscape);
  window.addEventListener('resize', onWindowResizeForChatColumn);
  nativeMenuHandle = await installNativeMenu(
    TOGGLEABLE_SECONDARY_TABS,
    {
      catalog: CHARACTER_CATALOG.map((entry) => ({
        id: entry.id,
        name: entry.name,
      })),
      imported: importedCharacters.value.map((entry) => ({
        id: entry.id,
        name: entry.name,
      })),
      activeCharacterId: activeCharacterId.value ?? '',
    },
    {
      onOpenPlugins: openCommandsListFromMenu,
      onToggleTab: setTabEnabled,
      onSelectCharacter: activateCharacter,
      onAddNewCharacter: openCharacterImportOverlay,
      onOpenTheme: openThemePopup,
      onCloseSession: closeActiveSession,
      onSelectRecentSession: (recentSessionId, folder) => {
        if (!chosenCwd.value) return;
        void resumeSession(chosenCwd.value, recentSessionId, false, folder);
      },
    },
  );
  unlistenPetRestoreRequested = await listen(
    PET_RESTORE_REQUESTED_EVENT,
    () => void switchToFullMode(),
  );
  unlistenPetSyncRequest = await listen(PET_SYNC_REQUEST_EVENT, () =>
    emit(PET_SYNC_EVENT, petSyncPayload.value),
  );
});

onUnmounted(() => {
  unlistenNormalized?.();
  unlistenActivity?.();
  unlistenPermissionPending?.();
  unlistenStderr?.();
  unlistenSessionClosed?.();
  unlistenPetRestoreRequested?.();
  unlistenPetSyncRequest?.();
  window.removeEventListener('keydown', closeTopOverlayOnEscape);
  window.removeEventListener('resize', onWindowResizeForChatColumn);
  if (isResizingChatColumn.value) stopChatColumnResize();
  if (clearConfirmationTimeoutId !== null)
    clearTimeout(clearConfirmationTimeoutId);
});
</script>

<template>
  <main class="app-root">
    <section v-if="presentationState.mode !== 'PET'" class="session-panel">
      <template v-if="!sessionActive">
        <h1 class="session-panel__title">Codetuver Avatar</h1>

        <div class="session-panel__row">
          <button
            type="button"
            class="session-panel__button"
            @click="pickFolder"
          >
            Elegir carpeta
          </button>
          <span class="session-panel__folder">{{
            chosenCwd ?? 'Ninguna carpeta elegida'
          }}</span>
        </div>

        <SessionStartOptionsPanel v-model="sessionStartOptionsDraft" />

        <button
          type="button"
          class="session-panel__button"
          :disabled="
            !chosenCwd ||
            isStarting ||
            validateStartOptionsDraft(sessionStartOptionsDraft).length > 0
          "
          @click="chosenCwd && beginSession(chosenCwd)"
        >
          {{ isStarting ? 'Iniciando...' : 'Iniciar sesion' }}
        </button>

        <p v-if="sessionId" class="session-panel__session">
          Sesion activa:
          <span class="session-panel__mono">{{ sessionId }}</span>
        </p>
        <p v-if="startError" class="session-panel__error">
          <IconGlyph name="error" />{{ startError }}
        </p>
        <p v-if="appSettingsNotice" class="session-panel__notice">
          <IconGlyph name="warning" />{{ appSettingsNotice }}
        </p>
        <p v-if="updateNotice" class="session-panel__notice">
          <IconGlyph name="warning" />{{ updateNotice }}
          <button
            type="button"
            class="session-panel__button"
            @click="downloadAndInstallUpdate"
          >
            Descargar e instalar
          </button>
        </p>
        <div
          v-if="updateNotice && updateReleaseNotes"
          class="update-notes activity-console__markdown"
          v-html="renderChatDraftMarkdown(updateReleaseNotes)"
          @click="openExternalLinkOnClick"
        ></div>

        <div v-if="lastPreference" class="session-panel__resume">
          <button
            type="button"
            class="session-panel__button session-panel__button--resume"
            :disabled="isStarting"
            @click="retomarUltimaCarpeta"
          >
            Retomar {{ lastPreference.lastWorkingDirectory }}
          </button>
        </div>

        <SessionHistoryExplorer @resume-session="resumeSession" />
      </template>

      <!-- AC-023.4/AC-024.4: controles de modo e indicador de peticiones pendientes, siempre visibles, nunca detras de una pestaña. -->
      <section v-if="sessionActive" class="presentation-controls">
        <!-- Sin aria-controls (a diferencia de las otras tablists): FULL/COMPANION son subtrees v-if/v-else-if mutuamente excluyentes, nunca coexisten en el DOM, asi que no hay un id de panel valido al que apuntar en todo momento. -->
        <div
          class="secondary-tabs__bar"
          role="tablist"
          aria-label="Modo de presentacion"
          @keydown="onModeTabKeydown"
        >
          <button
            v-for="tab in MODE_TABS"
            :key="tab.id"
            :id="tabButtonId('mode', tab.id)"
            type="button"
            role="tab"
            :aria-selected="presentationState.mode === tab.id"
            :tabindex="presentationState.mode === tab.id ? 0 : -1"
            :ref="(el) => modeTabFocus.register(tab.id, el)"
            class="secondary-tabs__tab"
            :class="{
              'secondary-tabs__tab--active': presentationState.mode === tab.id,
            }"
            :disabled="presentationState.isTransitioning"
            @click="onModeTabClick(tab.id)"
          >
            {{ tab.label }}
          </button>
        </div>
        <p class="presentation-controls__agent-state">
          Estado del agente:
          <span class="presentation-controls__agent-state-value">{{
            avatarController.snapshot.state
          }}</span>
          ·
          <span class="presentation-controls__agent-state-value">{{
            avatarController.snapshot.expression
          }}</span>
        </p>
        <p v-if="presentationError" class="session-panel__error">
          <IconGlyph name="error" />{{ presentationError }}
        </p>
      </section>

      <section
        v-if="interactionRequestEntries.length > 0"
        class="interaction-requests"
        aria-live="polite"
      >
        <h2 class="interaction-requests__title">Peticiones de interaccion</h2>
        <ul class="interaction-requests__list">
          <InteractionRequestCard
            v-for="entry in interactionRequestEntries"
            :key="entry.requestId"
            :request="entry.request"
            :decision="entry.status === 'resolved' ? entry.decision : null"
            @respond="
              (decision) =>
                respondToInteractionRequest(entry.requestId, decision)
            "
          />
        </ul>
        <p v-if="interactionRequestError" class="session-panel__error">
          <IconGlyph name="error" />{{ interactionRequestError }}
        </p>
      </section>

      <!-- AC-024.6: chat a la izquierda, personaje en grande a la derecha; el resto vive detras de pestañas. -->
      <div
        v-if="sessionActive && presentationState.mode === 'FULL'"
        class="full-layout"
        :style="
          chatColumnWidthPx
            ? {
                gridTemplateColumns: `${chatColumnWidthPx}px var(--space-1) 1fr`,
              }
            : undefined
        "
      >
        <section class="chat-panel full-layout__chat">
          <div class="chat-panel__header">
            <h2 class="chat-panel__title">Chat</h2>
            <button
              type="button"
              class="session-panel__button chat-panel__icon-button"
              aria-label="Ver detalle de plan"
              title="Ver detalle de plan"
              :disabled="isSending"
              @click="openUsageDetail"
            >
              <IconGlyph name="info" />
            </button>
          </div>

          <div class="chat-panel__body">
            <ul
              v-show="!chatComposerExpanded"
              ref="chatEntriesEl"
              class="chat-panel__entries"
            >
              <li
                ref="chatHistorySentinel"
                class="chat-panel__history-sentinel"
              ></li>
              <li
                v-for="item in visibleChatEntryList"
                :key="item.index"
                class="chat-panel__entry"
                :class="`chat-panel__entry--${item.entry.role}`"
              >
                <button
                  v-if="
                    item.entry.role === 'person' ||
                    !(
                      isWorkingIndicatorVisible &&
                      item.index === chatEntryList.length - 1
                    )
                  "
                  type="button"
                  class="session-panel__button chat-panel__raw-toggle"
                  :aria-pressed="rawViewEntryIds.has(item.index)"
                  :aria-label="
                    rawViewEntryIds.has(item.index)
                      ? 'Ver formato Markdown'
                      : 'Ver como texto crudo'
                  "
                  @click="toggleRawView(item.index)"
                >
                  <IconGlyph name="code" />
                </button>

                <pre
                  v-if="
                    item.entry.role === 'person' &&
                    rawViewEntryIds.has(item.index)
                  "
                  class="chat-panel__raw-text"
                  >{{ item.entry.text }}</pre>
                <div
                  v-else-if="item.entry.role === 'person'"
                  class="chat-panel__person-text"
                  v-html="renderChatDraftMarkdown(item.entry.text)"
                  @click="openExternalLinkOnClick"
                ></div>
                <span
                  v-else-if="
                    isWorkingIndicatorVisible &&
                    item.index === chatEntryList.length - 1
                  "
                  class="chat-panel__working-indicator"
                >
                  Trabajando
                </span>
                <ContentBlockRenderer
                  v-else
                  :blocks="item.entry.blocks"
                  :show-raw="rawViewEntryIds.has(item.index)"
                />
              </li>
            </ul>

            <form
              class="chat-panel__composer"
              :class="{
                'chat-panel__composer--expanded': chatComposerExpanded,
              }"
              @submit.prevent="sendChatMessage"
            >
              <!-- Sin aria-controls: la pestaña "editar" controla un <textarea>, cuyo role nativo de textbox no debe pisarse con tabpanel. -->
              <div
                v-if="chatComposerExpanded"
                class="secondary-tabs__bar"
                role="tablist"
                aria-label="Editor de mensaje"
                @keydown="onComposerTabKeydown"
              >
                <button
                  v-for="tab in COMPOSER_TABS"
                  :key="tab.id"
                  :id="tabButtonId('composer', tab.id)"
                  type="button"
                  role="tab"
                  :aria-selected="activeComposerTab === tab.id"
                  :tabindex="activeComposerTab === tab.id ? 0 : -1"
                  :ref="(el) => composerTabFocus.register(tab.id, el)"
                  class="secondary-tabs__tab"
                  :class="{
                    'secondary-tabs__tab--active': activeComposerTab === tab.id,
                  }"
                  @click="activeComposerTab = tab.id"
                >
                  {{ tab.label }}
                </button>
              </div>

              <CustomSelect
                v-if="commandsListVisible"
                inline
                :listbox-id="COMMANDS_LISTBOX_ID"
                listbox-label="Comandos"
                :options="commandOptions"
                :active-index="activeCommandIndex"
                model-value=""
                :empty-message="commandsEmptyStateMessage"
                @update:model-value="onCommandOptionChosen"
              />

              <div class="session-usage-panel">
                <span class="session-usage-panel__label">Uso de la sesion</span>
                <span class="session-usage-panel__stat"
                  >Entrada:
                  {{ formatTokenCount(sessionUsage.inputTokens) }}</span
                >
                <span class="session-usage-panel__stat"
                  >Salida:
                  {{ formatTokenCount(sessionUsage.outputTokens) }}</span
                >
                <span class="session-usage-panel__stat"
                  >Cache:
                  {{
                    formatTokenCount(
                      sessionUsage.cacheCreationInputTokens +
                        sessionUsage.cacheReadInputTokens,
                    )
                  }}</span
                >
                <span class="session-usage-panel__stat"
                  >Costo:
                  {{ formatSessionCost(sessionUsage.totalCostUsd) }}</span
                >
              </div>

              <div class="chat-panel__composer-row">
                <div
                  v-show="
                    chatComposerExpanded && activeComposerTab === 'vista-previa'
                  "
                  class="chat-panel__expanded-view"
                  aria-label="Vista previa en Markdown, solo lectura"
                  v-html="chatDraftPreviewHtml"
                ></div>
                <textarea
                  v-show="
                    !chatComposerExpanded || activeComposerTab === 'editar'
                  "
                  ref="chatComposerTextarea"
                  v-model="chatDraft"
                  rows="1"
                  class="chat-panel__input"
                  role="combobox"
                  aria-haspopup="listbox"
                  :aria-expanded="commandsListVisible"
                  :aria-controls="COMMANDS_LISTBOX_ID"
                  :aria-activedescendant="
                    commandsListVisible && filteredCommands[activeCommandIndex]
                      ? `${COMMANDS_LISTBOX_ID}-option-${filteredCommands[activeCommandIndex]}`
                      : undefined
                  "
                  aria-autocomplete="list"
                  placeholder="Escribe una instruccion... (Enter para enviar, Shift+Enter para salto de linea)"
                  :disabled="isSending"
                  @input="onChatComposerInput"
                  @keydown="onComposerKeydown"
                  @keydown.enter.exact.prevent="onComposerEnterKey"
                  @blur="onChatComposerBlur"
                ></textarea>

                <div class="chat-panel__composer-actions">
                  <CustomSelect
                    class="chat-effort-control"
                    :class="`chat-effort-control--${effortChangeStatus}`"
                    :options="effortOptions"
                    :model-value="effortLevel"
                    :disabled="isSending"
                    :title="`Nivel de esfuerzo: ${effortLevel}`"
                    :aria-label="`Nivel de esfuerzo: ${effortLevel}`"
                    @update:model-value="selectEffortLevel"
                  >
                    <template #trigger>
                      <IconGlyph name="gauge" />
                    </template>
                  </CustomSelect>
                  <button
                    type="button"
                    class="session-panel__button chat-panel__icon-button"
                    :aria-pressed="chatComposerExpanded"
                    :aria-label="
                      chatComposerExpanded
                        ? 'Volver a editar'
                        : 'Expandir vista Markdown'
                    "
                    @click="toggleChatComposerExpanded"
                  >
                    <IconGlyph
                      :name="chatComposerExpanded ? 'collapse' : 'expand'"
                    />
                  </button>
                  <button
                    type="submit"
                    class="session-panel__button chat-panel__send-button"
                    :disabled="!chatDraft.trim() || isSending"
                    aria-label="Enviar"
                  >
                    <IconGlyph name="send" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>

        <div
          class="full-layout__resizer"
          :class="{ 'full-layout__resizer--active': isResizingChatColumn }"
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar columna de chat"
          :aria-valuenow="currentChatColumnWidthPx()"
          :aria-valuemin="MIN_CHAT_COLUMN_WIDTH_PX"
          :aria-valuemax="maxChatColumnWidthPx()"
          tabindex="0"
          @pointerdown="onChatColumnResizePointerDown"
          @keydown="onChatColumnResizeKeydown"
        ></div>

        <section class="full-layout__stage">
          <div class="secondary-tabs">
            <div
              class="secondary-tabs__bar"
              role="tablist"
              @keydown="onSecondaryTabKeydown"
            >
              <button
                v-for="tab in visibleSecondaryTabs"
                :key="tab.id"
                :id="tabButtonId('secondary', tab.id)"
                type="button"
                role="tab"
                :aria-selected="activeSecondaryTab === tab.id"
                :aria-controls="tabPanelId('secondary', tab.id)"
                :tabindex="activeSecondaryTab === tab.id ? 0 : -1"
                :ref="(el) => secondaryTabFocus.register(tab.id, el)"
                class="secondary-tabs__tab"
                :class="{
                  'secondary-tabs__tab--active': activeSecondaryTab === tab.id,
                }"
                @click="activeSecondaryTab = tab.id"
              >
                {{ tab.label }}
              </button>
            </div>

            <div class="secondary-tabs__panel">
              <section
                v-if="activeSecondaryTab === 'avatar'"
                :id="tabPanelId('secondary', 'avatar')"
                role="tabpanel"
                :aria-labelledby="tabButtonId('secondary', 'avatar')"
                class="secondary-tabs__section"
              >
                <div class="avatar-panel avatar-panel--full">
                  <AvatarStage
                    ref="avatarStageRef"
                    :active-character="activeCharacter"
                    :active-imported-character="activeImportedCharacter"
                    :avatar-controller="avatarController"
                    :mouth-open="mouthOpenForActiveCharacter"
                    :animation-pool-urls="activeStateAssignment?.animations"
                    :pose-url="activeStateAssignment?.pose"
                    :transition-duration-ms="
                      activeStateAssignment?.transitionDurationMs
                    "
                  />
                  <SendToDesktopButton
                    :disabled="presentationState.isTransitioning"
                    @click="switchToPetMode"
                  />
                </div>
              </section>

              <section
                v-else-if="activeSecondaryTab === 'actividad'"
                :id="tabPanelId('secondary', 'actividad')"
                role="tabpanel"
                :aria-labelledby="tabButtonId('secondary', 'actividad')"
                class="activity-console"
              >
                <div class="activity-console__header">
                  <div
                    class="activity-console__view-switch"
                    role="tablist"
                    @keydown="onConsoleViewTabKeydown"
                  >
                    <button
                      :id="tabButtonId('console-view', 'styled')"
                      type="button"
                      role="tab"
                      class="session-panel__button"
                      :class="{
                        'session-panel__button--active':
                          consoleViewMode === 'styled',
                      }"
                      :aria-selected="consoleViewMode === 'styled'"
                      :aria-controls="tabPanelId('console-view', 'styled')"
                      :tabindex="consoleViewMode === 'styled' ? 0 : -1"
                      :ref="(el) => consoleViewTabFocus.register('styled', el)"
                      @click="consoleViewMode = 'styled'"
                    >
                      Estilizada
                    </button>
                    <button
                      :id="tabButtonId('console-view', 'markdown')"
                      type="button"
                      role="tab"
                      class="session-panel__button"
                      :class="{
                        'session-panel__button--active':
                          consoleViewMode === 'markdown',
                      }"
                      :aria-selected="consoleViewMode === 'markdown'"
                      :aria-controls="tabPanelId('console-view', 'markdown')"
                      :tabindex="consoleViewMode === 'markdown' ? 0 : -1"
                      :ref="
                        (el) => consoleViewTabFocus.register('markdown', el)
                      "
                      @click="consoleViewMode = 'markdown'"
                    >
                      Markdown
                    </button>
                  </div>
                  <button
                    type="button"
                    class="session-panel__button activity-console__visibility-toggle"
                    @click="toggleActivityVisibility"
                  >
                    {{
                      presentationState.activityVisibility === 'VISIBLE'
                        ? 'Ocultar actividad'
                        : 'Mostrar actividad'
                    }}
                  </button>
                </div>

                <ScrollableListPanel
                  v-if="presentationState.activityVisibility === 'VISIBLE'"
                  :id="tabPanelId('console-view', consoleViewMode)"
                  role="tabpanel"
                  :aria-labelledby="
                    tabButtonId('console-view', consoleViewMode)
                  "
                >
                  <template #list>
                    <ContentBlockRenderer
                      v-if="consoleViewMode === 'styled'"
                      :blocks="activityConsole.blocks"
                    />
                    <div
                      v-else
                      class="activity-console__markdown"
                      v-html="renderChatDraftMarkdown(markdownText)"
                      @click="openExternalLinkOnClick"
                    ></div>
                  </template>
                </ScrollableListPanel>
              </section>

              <section
                v-else-if="activeSecondaryTab === 'salida-cruda'"
                :id="tabPanelId('secondary', 'salida-cruda')"
                role="tabpanel"
                :aria-labelledby="tabButtonId('secondary', 'salida-cruda')"
                class="activity-console"
              >
                <!-- Sin esto, ocultar la actividad desde la pestaña "Actividad" y luego entrar aqui dejaba esta vista completamente en blanco, sin forma de restaurarla (activityVisibility es un estado global, no por pestaña). -->
                <div
                  v-if="presentationState.activityVisibility !== 'VISIBLE'"
                  class="session-panel__row"
                >
                  <p class="session-panel__notice">
                    <IconGlyph name="warning" />Actividad oculta.
                  </p>
                  <button
                    type="button"
                    class="session-panel__button"
                    @click="toggleActivityVisibility"
                  >
                    Mostrar actividad
                  </button>
                </div>
                <ScrollableListPanel v-else>
                  <template #list>
                    <pre class="activity-console__raw">{{
                      rawActivityLines.join('\n')
                    }}</pre>
                  </template>
                </ScrollableListPanel>
              </section>

              <section
                v-else-if="activeSecondaryTab === 'configuracion'"
                :id="tabPanelId('secondary', 'configuracion')"
                role="tabpanel"
                :aria-labelledby="tabButtonId('secondary', 'configuracion')"
                class="secondary-tabs__section"
              >
                <AdminSettingsPanel :cwd="chosenCwd" />
              </section>

              <section
                v-else-if="activeSecondaryTab === 'editor-personaje'"
                :id="tabPanelId('secondary', 'editor-personaje')"
                role="tabpanel"
                :aria-labelledby="tabButtonId('secondary', 'editor-personaje')"
                class="secondary-tabs__section editor-personaje-layout"
              >
                <div
                  class="avatar-panel avatar-panel--full editor-personaje-layout__avatar"
                >
                  <AvatarStage
                    ref="avatarStageRef"
                    :active-character="activeCharacter"
                    :active-imported-character="activeImportedCharacter"
                    :avatar-controller="avatarController"
                    :mouth-open="mouthOpenForActiveCharacter"
                    :animation-pool-urls="activeStateAssignment?.animations"
                    :pose-url="activeStateAssignment?.pose"
                    :transition-duration-ms="
                      activeStateAssignment?.transitionDurationMs
                    "
                    :preview-clip-id="previewClipId"
                    :preview-nonce="previewNonce"
                  />
                  <SendToDesktopButton
                    :disabled="presentationState.isTransitioning"
                    @click="switchToPetMode"
                  />
                </div>
                <div class="editor-personaje-layout__editor">
                  <CharacterEditor
                    v-if="activeCharacterId"
                    :key="activeCharacterId"
                    :character-id="activeCharacterId"
                    :capabilities="activeCharacterCapabilities"
                    :avatar-controller="avatarController"
                    :model-url="characterEditorModelUrl"
                    no-separator-above
                    @settings-saved="reloadActiveCharacterSettings"
                    @preview-clip="onPreviewClip"
                  />
                  <VoiceControls :text-to-speech="textToSpeech" />
                </div>
              </section>
            </div>
          </div>
        </section>
      </div>

      <!-- Modo compañera (u otro modo con sesion activa fuera de FULL): sin columnas ni pestañas, personaje centrado. -->
      <template v-else-if="sessionActive">
        <section class="avatar-panel avatar-panel--companion">
          <AvatarStage
            ref="avatarStageRef"
            :active-character="activeCharacter"
            :active-imported-character="activeImportedCharacter"
            :avatar-controller="avatarController"
            :mouth-open="mouthOpenForActiveCharacter"
            :animation-pool-urls="activeStateAssignment?.animations"
            :pose-url="activeStateAssignment?.pose"
            :transition-duration-ms="
              activeStateAssignment?.transitionDurationMs
            "
            :preview-clip-id="previewClipId"
            :preview-nonce="previewNonce"
          />
          <SendToDesktopButton
            :disabled="presentationState.isTransitioning"
            @click="switchToPetMode"
          />
          <label class="pet-window-size-control">
            Tamaño de la mascota
            <span class="pet-window-size-control__value"
              >{{ petWindowSizePx }}px</span
            >
            <input
              type="range"
              :min="PET_WINDOW_SIZE_MIN_PX"
              :max="PET_WINDOW_SIZE_MAX_PX"
              :value="petWindowSizePx"
              @change="onPetWindowSizeChange"
            />
          </label>
          <div class="pet-window-position-control">
            <span class="pet-window-position-control__value">{{
              petWindowPositionLabel
            }}</span>
            <button
              type="button"
              class="session-panel__button"
              :disabled="!petWindowPosition"
              @click="onRestorePetWindowPosition"
            >
              Restaurar posicion
            </button>
          </div>
        </section>

        <CharacterEditor
          v-if="activeCharacterId"
          :key="activeCharacterId"
          :character-id="activeCharacterId"
          :capabilities="activeCharacterCapabilities"
          :avatar-controller="avatarController"
          :model-url="characterEditorModelUrl"
          @settings-saved="reloadActiveCharacterSettings"
          @preview-clip="onPreviewClip"
        />

        <VoiceControls :text-to-speech="textToSpeech" />

        <details class="admin-panel-disclosure" :open="companionAdminPanelOpen">
          <summary
            class="admin-panel-disclosure__summary"
            @click.prevent="companionAdminPanelOpen = !companionAdminPanelOpen"
          >
            Configuracion de Claude Code
          </summary>
          <AdminSettingsPanel v-if="companionAdminPanelOpen" :cwd="chosenCwd" />
        </details>
      </template>
    </section>

    <DebugPanel v-if="isDevBuild" :onIncomingEvent="handleIncomingEvent" />

    <div
      v-if="clearConfirmationVisible"
      class="commands-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-label="Confirmar /clear"
      aria-describedby="clear-confirmation-text"
      @keydown="trapClearConfirmationTab"
    >
      <div ref="clearConfirmationPanel" class="commands-overlay__panel">
        <p id="clear-confirmation-text">
          Este comando inicia una nueva sesion, ¿estas seguro?
        </p>
        <div class="session-panel__row">
          <button
            type="button"
            class="session-panel__button session-panel__button--danger"
            @click="confirmClear"
          >
            Confirmar
          </button>
          <button
            type="button"
            class="session-panel__button"
            @click="cancelClear"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>

    <div v-if="clearConfirmationTimedOut" class="session-panel__row">
      <p class="session-panel__notice" role="status">
        <IconGlyph name="warning" />No se pudo confirmar que /clear reinicio la
        sesion.
      </p>
      <button
        type="button"
        class="session-panel__button"
        @click="clearConfirmationTimedOut = false"
      >
        Entendido
      </button>
    </div>

    <div
      v-if="usageDetailVisible"
      class="commands-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Detalle de plan"
      @keydown="trapUsageDetailTab"
    >
      <div ref="usageDetailPanel" class="commands-overlay__panel">
        <div class="commands-panel__header">
          <h2 class="commands-panel__title">Detalle de plan</h2>
          <button
            type="button"
            class="session-panel__button chat-panel__icon-button"
            aria-label="Cerrar"
            @click="closeUsageDetail"
          >
            <IconGlyph name="close" />
          </button>
        </div>
        <p v-if="awaitingUsageDetail" role="status">Enviando /usage...</p>
        <p v-else-if="!usageDetailText" role="status">
          No se pudo obtener el detalle de plan.
        </p>
        <div v-else v-html="usageDetailHtml"></div>
      </div>
    </div>

    <div
      v-if="characterImportOverlayVisible"
      class="commands-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Importar personaje"
      @keydown="trapCharacterImportOverlayTab"
    >
      <div
        ref="characterImportOverlayPanel"
        class="commands-overlay__panel character-import-panel"
      >
        <div class="commands-panel__header">
          <h2 class="commands-panel__title">Importar personaje</h2>
          <button
            type="button"
            class="session-panel__button chat-panel__icon-button"
            aria-label="Cerrar"
            :disabled="isImportingCharacterFile"
            @click="closeCharacterImportOverlay"
          >
            <IconGlyph name="close" />
          </button>
        </div>

        <div v-if="pendingCharacterImportPath">
          <p class="session-panel__folder">{{ pendingCharacterImportPath }}</p>
          <p class="character-import-panel__license-warning">
            La licencia de este archivo es tu responsabilidad; la aplicacion no
            la verifica.
          </p>
          <div class="session-panel__row">
            <button
              type="button"
              class="session-panel__button"
              :disabled="isImportingCharacterFile"
              @click="confirmCharacterImport"
            >
              {{
                isImportingCharacterFile
                  ? 'Importando...'
                  : 'Confirmar importacion'
              }}
            </button>
            <button
              type="button"
              class="session-panel__button"
              :disabled="isImportingCharacterFile"
              @click="cancelCharacterImport"
            >
              Cancelar
            </button>
          </div>
        </div>

        <p
          v-if="characterImportError"
          class="session-panel__error"
          aria-live="polite"
        >
          <IconGlyph name="error" />{{ characterImportError }}
        </p>

        <div
          v-if="lastImportedCharacterSummary"
          class="character-import-panel__summary"
          aria-live="polite"
        >
          <p class="character-import-panel__name">
            Importado: {{ lastImportedCharacterSummary.name }} ({{
              lastImportedCharacterSummary.format
            }})
          </p>
          <p class="character-import-panel__attribution">
            Controles disponibles:
            {{
              describeCharacterCapabilities(
                lastImportedCharacterSummary.capabilities,
                true,
              )
            }}
          </p>
          <p class="character-import-panel__attribution">
            Controles no disponibles:
            {{
              describeCharacterCapabilities(
                lastImportedCharacterSummary.capabilities,
                false,
              )
            }}
          </p>
        </div>
      </div>
    </div>

    <EditorModal
      v-if="pendingCharacterLicenseEntry"
      :title="`Aviso legal — ${pendingCharacterLicenseEntry.name}`"
      role="alertdialog"
      @close="cancelCharacterLicense"
    >
      <p class="character-license-gate__text">
        {{ pendingCharacterLicenseEntry.license }}
      </p>
      <p class="character-license-gate__text">
        Al continuar, aceptas ese riesgo de licencia para usar este personaje.
      </p>
      <div class="character-license-gate__actions">
        <button
          type="button"
          class="session-panel__button"
          @click="acceptCharacterLicense"
        >
          Acepto, usar {{ pendingCharacterLicenseEntry.name }}
        </button>
        <button
          type="button"
          class="session-panel__button"
          @click="cancelCharacterLicense"
        >
          Cancelar
        </button>
      </div>
    </EditorModal>

    <div
      v-if="themePopupVisible"
      class="commands-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Theme"
      @keydown="trapThemePopupTab"
    >
      <div ref="themePopupPanel" class="commands-overlay__panel">
        <ThemePopup
          :current-color-rgb="currentPrimaryColorRgb"
          @commit="commitPrimaryColor"
          @close="closeThemePopup"
        />
      </div>
    </div>
  </main>
</template>

<style scoped>
.app-root {
  width: 100%;
  height: 100%;
  background: var(--color-surface-base);
  backdrop-filter: blur(var(--blur-panel));
}

.session-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  font-family: var(--font-sans);
  color: var(--color-text-primary);
}

.session-panel__title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: var(--font-weight-bold);
  margin: 0;
}

.session-panel__mono {
  font-family: var(--font-mono);
}

.session-panel__button--resume {
  border-color: var(--color-accent-secondary);
}

.session-panel__session {
  font-size: var(--text-sm);
  color: var(--color-success);
}

.session-panel__resume {
  border-top: var(--border-width-thin) solid var(--color-border-subtle);
  padding-top: var(--space-4);
}

.presentation-controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.presentation-controls__agent-state {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.presentation-controls__agent-state-value {
  font-family: var(--font-mono);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-bold);
}

.avatar-panel {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  border-top: var(--border-width-thin) solid var(--color-border-subtle);
  padding-top: var(--space-4);
}

.avatar-panel--companion {
  padding-top: var(--space-8);
  padding-bottom: var(--space-8);
}

.pet-window-size-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-2);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.pet-window-size-control__value {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-primary);
}

.pet-window-position-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-2);
}

.pet-window-position-control__value {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.avatar-panel--full {
  border-top: none;
  padding-top: 0;
  flex: 1 1 auto;
  min-height: 0;
}

.interaction-requests {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  border-top: var(--border-width-thin) solid var(--color-border-subtle);
  padding-top: var(--space-4);
}

.interaction-requests__title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--font-weight-bold);
  margin: 0;
}

.interaction-requests__list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 30vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.commands-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.commands-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.commands-panel__title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--font-weight-bold);
  margin: 0;
}

.commands-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-overlay-scrim);
  z-index: var(--z-overlay);
}

.commands-overlay__panel {
  width: var(--size-overlay-panel);
  max-height: 80vh;
  overflow-y: auto;
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  background: var(--color-surface-overlay);
  backdrop-filter: blur(var(--blur-panel));
  box-shadow: var(--shadow-md);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}

.character-import-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.character-import-panel__license-warning {
  margin: 0;
  padding: var(--space-2) var(--space-4);
  border-left: var(--border-width-thick) solid var(--color-warning);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-panel));
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-warning);
}

.character-import-panel__summary {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
}

.character-import-panel__name {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.character-import-panel__attribution {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.character-license-gate__text {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}

.character-license-gate__actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.activity-console {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1 1 auto;
  min-height: 0;
}

.activity-console__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.activity-console__view-switch {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.activity-console__visibility-toggle {
  margin-left: var(--space-4);
}

.activity-console__raw {
  margin: 0;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-panel));
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  white-space: pre-wrap;
  word-break: break-word;
}

.activity-console__markdown {
  margin: 0;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-panel));
  word-break: break-word;
}

.update-notes {
  max-height: 30vh;
  overflow-y: auto;
}

.activity-console__markdown :deep(*) {
  margin: 0 0 var(--space-2);
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  line-height: var(--line-height-normal);
}

.activity-console__markdown :deep(:last-child) {
  margin-bottom: 0;
}

.activity-console__markdown :deep(code) {
  font-family: var(--font-mono);
  background: var(--color-surface-overlay);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-1);
}

.activity-console__markdown :deep(pre) {
  font-family: var(--font-mono);
  background: var(--color-surface-overlay);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  overflow-x: auto;
}

.activity-console__markdown :deep(pre code) {
  background: none;
  padding: 0;
}

.activity-console__markdown :deep(a) {
  color: var(--color-accent-primary);
  text-decoration: underline;
}

.activity-console__markdown :deep(ul),
.activity-console__markdown :deep(ol) {
  padding-left: var(--space-4);
}

.chat-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  height: 100%;
  min-height: 0;
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-surface-raised);
  backdrop-filter: blur(var(--blur-chat));
}

.chat-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chat-panel__title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--font-weight-bold);
  margin: 0;
}

.chat-panel__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1;
  min-height: 0;
}

.chat-panel__entries {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.chat-panel__history-sentinel {
  height: 1px;
}

.chat-panel__entry {
  position: relative;
  padding: var(--space-2);
  /* --space-8 (32px) no alcanzaba: el boton de ~30px anclado a --space-2 del borde tapaba texto real */
  padding-right: calc(var(--space-8) + var(--space-2));
  border-radius: var(--radius-md);
  max-width: 80%;
  /* Se hereda a todo el texto del mensaje: una ruta/comando sin espacios no debe forzar scroll horizontal en .chat-panel__entries. */
  overflow-wrap: anywhere;
}

.chat-panel__raw-toggle {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  z-index: var(--z-panel);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-1);
}

.chat-panel__raw-toggle :deep(.icon-glyph) {
  width: var(--size-icon-sm);
  height: var(--size-icon-sm);
}

.chat-panel__raw-text {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-panel__entry--person {
  align-self: flex-end;
  background: var(--color-chat-bubble);
  color: var(--color-text-primary);
}

.chat-panel__entry--agent {
  align-self: flex-start;
  background: var(--color-surface-overlay);
  border: var(--border-width-thin) solid var(--color-border-subtle);
}

/* --color-text-secondary, no --color-accent-secondary: ese token es para un status-label chico (content-blocks__command--running), no para el cuerpo completo del texto -- itálica como segunda pista ademas del color, para no depender solo del color (daltonismo/pantallas mal calibradas). */
.chat-panel__working-indicator {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-style: italic;
  color: var(--color-text-secondary);
}

.chat-panel__person-text {
  margin: 0;
  word-break: break-word;
}

.chat-panel__person-text :deep(*) {
  margin: 0 0 var(--space-2);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
}

.chat-panel__person-text :deep(:last-child) {
  margin-bottom: 0;
}

.chat-panel__person-text :deep(code) {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: var(--color-surface-raised);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-1);
}

/* --color-accent-primary daria bajo contraste: el fondo de la burbuja ya es ese mismo matiz, solo cambia el alpha */
.chat-panel__person-text :deep(a) {
  color: var(--color-text-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.chat-panel__person-text :deep(ul),
.chat-panel__person-text :deep(ol) {
  padding-left: var(--space-4);
}

.chat-panel__composer {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* H7: boton-icono compacto junto a expandir/enviar -- el trigger de CustomSelect pierde el min-width de texto y el panel abre hacia arriba (pegado al borde inferior de la columna, junto al composer). */
.chat-effort-control :deep(.custom-select__trigger) {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  justify-content: center;
}

.chat-effort-control :deep(.commands-inline-list--floating) {
  top: auto;
  bottom: 100%;
  margin: 0 0 var(--space-2);
}

.chat-effort-control--pending :deep(.custom-select__trigger) {
  color: var(--color-text-secondary);
}

.chat-effort-control--confirmed :deep(.custom-select__trigger) {
  color: var(--color-success);
}

.chat-effort-control--unknown :deep(.custom-select__trigger) {
  color: var(--color-warning);
}

.session-usage-panel {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  border-top: none;
  background: var(--color-surface-raised);
}

.session-usage-panel__label {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.session-usage-panel__stat {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.chat-panel__composer-row {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
}

.chat-panel__input {
  flex: 1;
  resize: none;
  overflow-y: auto;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: var(--border-width-thin) solid var(--color-border-strong);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
}

/* Sin backdrop-filter propio a proposito: ya viven dentro de .chat-panel, que blurea todo lo que hay detras a 28px. */
.chat-panel__expanded-view {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: var(--border-width-thin) solid var(--color-border-strong);
  background: var(--color-surface-base);
}

/* markdown-it produce HTML crudo sin clases (v-html); :deep() lo alcanza para que herede el tema en vez de los estilos por omision del navegador. */
.chat-panel__expanded-view :deep(*) {
  margin: 0 0 var(--space-2);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
  line-height: var(--line-height-normal);
}

.chat-panel__expanded-view :deep(:last-child) {
  margin-bottom: 0;
}

.chat-panel__expanded-view :deep(h1),
.chat-panel__expanded-view :deep(h2),
.chat-panel__expanded-view :deep(h3),
.chat-panel__expanded-view :deep(h4),
.chat-panel__expanded-view :deep(h5),
.chat-panel__expanded-view :deep(h6) {
  font-family: var(--font-display);
  font-weight: var(--font-weight-bold);
}

.chat-panel__expanded-view :deep(a) {
  color: var(--color-accent-primary);
}

.chat-panel__expanded-view :deep(code) {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: var(--color-surface-raised);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-1);
}

.chat-panel__expanded-view :deep(pre) {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: var(--color-surface-raised);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  overflow-x: auto;
}

.chat-panel__expanded-view :deep(pre code) {
  background: none;
  padding: 0;
}

.chat-panel__expanded-view :deep(table) {
  border-collapse: collapse;
}

.chat-panel__expanded-view :deep(th),
.chat-panel__expanded-view :deep(td) {
  border: var(--border-width-thin) solid var(--color-border-subtle);
  padding: var(--space-1) var(--space-2);
  text-align: left;
}

.chat-panel__composer--expanded {
  flex: 1;
  min-height: 0;
}

.chat-panel__composer--expanded .chat-panel__composer-row {
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

.chat-panel__composer-actions {
  display: flex;
  flex-direction: row;
  gap: var(--space-2);
}

/* En modo expandido la columna de acciones se estira a lo alto del preview (align-items:stretch de .chat-panel__composer-row); en fila quedarian los botones estirados de ancho, por eso solo aqui pasa a columna, pegados al fondo. */
.chat-panel__composer--expanded .chat-panel__composer-actions {
  flex-direction: column;
  justify-content: flex-end;
}

.chat-panel__icon-button,
.chat-panel__send-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.full-layout {
  display: grid;
  grid-template-columns: var(--size-chat-column) var(--space-2) 1fr;
  gap: var(--space-6);
  flex: 1;
  min-height: 0;
  border-top: var(--border-width-thin) solid var(--color-border-subtle);
  padding-top: var(--space-4);
}

.full-layout__chat {
  min-height: 0;
  padding-right: var(--space-2);
}

.full-layout__stage {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 0;
}

.full-layout__resizer {
  align-self: stretch;
  width: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-border-strong);
  cursor: col-resize;
  touch-action: none;
}

.full-layout__resizer:hover,
.full-layout__resizer--active {
  background: var(--color-accent-primary);
}

.full-layout__resizer:focus-visible {
  outline: var(--border-width-thick) solid var(--color-accent-primary);
  outline-offset: var(--border-width-thick);
}

.secondary-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
  min-height: 0;
}

.secondary-tabs__bar {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  border-bottom: var(--border-width-thin) solid var(--color-border-subtle);
}

.secondary-tabs__tab {
  padding: var(--space-2) var(--space-4);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  cursor: pointer;
  border-bottom: var(--border-width-thick) solid transparent;
}

.secondary-tabs__tab--active {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-bold);
  border-bottom-color: var(--color-accent-primary);
}

/* Sin esto, un tab deshabilitado durante una transicion se ve identico a uno clickeable. */
.secondary-tabs__tab:disabled {
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.secondary-tabs__panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* Sin flex:1 no toma la altura disponible de .secondary-tabs__panel (flex:1 en el eje columna) -- se queda del alto de su contenido, y .avatar-panel--full (flex:1 mas abajo) no tiene donde crecer (hallazgo real H23: el canvas quedaba mas bajo que el contenedor real). */
.secondary-tabs__section {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: var(--space-4);
  min-height: 0;
}

.editor-personaje-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-4);
  min-height: 0;
}

.editor-personaje-layout__avatar {
  min-height: 0;
}

.editor-personaje-layout__editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-height: 0;
  overflow-y: auto;
}

.admin-panel-disclosure {
  border-top: var(--border-width-thin) solid var(--color-border-subtle);
  padding-top: var(--space-4);
}

.admin-panel-disclosure__summary {
  cursor: pointer;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}
</style>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: var(--color-surface-base);
  backdrop-filter: blur(var(--blur-panel));
}
</style>

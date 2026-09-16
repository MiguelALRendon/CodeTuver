import {
  CheckMenuItem,
  Menu,
  MenuItem,
  PredefinedMenuItem,
  Submenu,
} from '@tauri-apps/api/menu';
import { truncateSessionTitle } from './session-history-format';

const PLUGINS_ITEM_ID = 'native-menu-plugins';
const COMMANDS_SUBMENU_ID = 'native-menu-commands';
const WINDOW_THEME_ITEM_ID = 'native-menu-window-theme';
const WINDOW_SUBMENU_ID = 'native-menu-window';
const SESSION_SUBMENU_ID = 'native-menu-session';
const SESSION_FOLDER_ITEM_ID = 'native-menu-session-folder';
const SESSION_ID_ITEM_ID = 'native-menu-session-id';
const SESSION_CLOSE_ITEM_ID = 'native-menu-session-close';
const CHARACTER_SUBMENU_ID = 'native-menu-character';
const CHARACTER_ADD_NEW_ITEM_ID = 'native-menu-character-add-new';
const SESSION_ID_COPIED_SUFFIX = ' (copiado)';
const SESSION_ID_COPIED_DISPLAY_MS = 1500;
const SESSION_RECENT_ITEM_ID_PREFIX = 'native-menu-session-recent-';
const SESSION_RECENT_STATUS_ITEM_ID = 'native-menu-session-recent-status';
const SESSION_RECENT_READ_FAILED_TEXT = 'No se pudo leer el historial';
const SESSION_RECENT_EMPTY_TEXT = 'Sin sesiones recientes';
const RECENT_SESSIONS_LIMIT = 5;
// Cantidad fija de items base del submenu Sesion (carpeta, id, separador, cerrar) antes de la seccion dinamica -- se recalcula solo, nunca depende de cuantos items recientes hubiera antes.
const SESSION_SUBMENU_BASE_ITEM_COUNT = 4;

export interface NativeMenuRecentSession {
  id: string;
  title: string | null;
  startTimeMs: number | null;
}

export type RecentSessionsOutcome =
  | { status: 'ok'; sessions: NativeMenuRecentSession[] }
  | { status: 'read-failed' };

export interface NativeMenuTab {
  id: string;
  label: string;
}

export interface NativeMenuCharacterEntry {
  id: string;
  name: string;
}

export interface NativeMenuCharacters {
  catalog: NativeMenuCharacterEntry[];
  imported: NativeMenuCharacterEntry[];
  activeCharacterId: string;
}

export interface NativeMenuHandlers {
  onOpenPlugins: () => void;
  onToggleTab: (tabId: string, enabled: boolean) => void;
  onSelectCharacter: (characterId: string) => void;
  onAddNewCharacter: () => void;
  onOpenTheme: () => void;
  onCloseSession: () => void;
  onSelectRecentSession: (sessionId: string, folder: string) => void;
}

export interface NativeMenuHandle {
  setPluginsEnabled(enabled: boolean): Promise<void>;
  setTabChecked(tabId: string, checked: boolean): Promise<void>;
  setSessionInfo(
    folder: string | null,
    sessionId: string | null,
    closable: boolean,
  ): Promise<void>;
  setActiveCharacter(characterId: string): Promise<void>;
  addImportedCharacter(entry: NativeMenuCharacterEntry): Promise<void>;
  setRecentSessions(
    outcome: RecentSessionsOutcome,
    folder: string,
  ): Promise<void>;
}

function tabItemId(tabId: string): string {
  return `native-menu-tab-${tabId}`;
}

async function createTabCheckItem(
  tab: NativeMenuTab,
  handlers: NativeMenuHandlers,
): Promise<CheckMenuItem> {
  const item = await CheckMenuItem.new({
    id: tabItemId(tab.id),
    text: tab.label,
    checked: true,
    action: async () => handlers.onToggleTab(tab.id, await item.isChecked()),
  });
  return item;
}

async function buildWindowSubmenu(
  tabs: NativeMenuTab[],
  handlers: NativeMenuHandlers,
): Promise<Submenu> {
  const tabItems = await Promise.all(
    tabs.map((tab) => createTabCheckItem(tab, handlers)),
  );
  const themeItem = await MenuItem.new({
    id: WINDOW_THEME_ITEM_ID,
    text: 'Theme',
    action: () => handlers.onOpenTheme(),
  });
  const items = [
    ...tabItems,
    await PredefinedMenuItem.new({ item: 'Separator' }),
    themeItem,
  ];
  return Submenu.new({ id: WINDOW_SUBMENU_ID, text: 'Window', items });
}

function characterItemId(characterId: string): string {
  return `native-menu-character-${characterId}`;
}

async function createCharacterCheckItem(
  entry: NativeMenuCharacterEntry,
  activeCharacterId: string,
  handlers: NativeMenuHandlers,
): Promise<CheckMenuItem> {
  return CheckMenuItem.new({
    id: characterItemId(entry.id),
    text: entry.name,
    checked: entry.id === activeCharacterId,
    action: () => handlers.onSelectCharacter(entry.id),
  });
}

async function buildCharacterSubmenu(
  characters: NativeMenuCharacters,
  handlers: NativeMenuHandlers,
): Promise<Submenu> {
  const catalogItems = await Promise.all(
    characters.catalog.map((entry) =>
      createCharacterCheckItem(entry, characters.activeCharacterId, handlers),
    ),
  );
  const importedItems = await Promise.all(
    characters.imported.map((entry) =>
      createCharacterCheckItem(entry, characters.activeCharacterId, handlers),
    ),
  );
  const addNewItem = await MenuItem.new({
    id: CHARACTER_ADD_NEW_ITEM_ID,
    text: 'Agregar nuevo...',
    action: () => handlers.onAddNewCharacter(),
  });
  const items =
    importedItems.length > 0
      ? [
          ...catalogItems,
          await PredefinedMenuItem.new({ item: 'Separator' }),
          ...importedItems,
          await PredefinedMenuItem.new({ item: 'Separator' }),
          addNewItem,
        ]
      : [
          ...catalogItems,
          await PredefinedMenuItem.new({ item: 'Separator' }),
          addNewItem,
        ];
  return Submenu.new({ id: CHARACTER_SUBMENU_ID, text: 'Character', items });
}

// AC-102 paso 5: un solo item deshabilitado con el aviso real, nunca una lista vacia que se confunda con "sin sesiones".
async function buildRecentSessionStatusItem(text: string): Promise<MenuItem> {
  return MenuItem.new({
    id: SESSION_RECENT_STATUS_ITEM_ID,
    text,
    enabled: false,
  });
}

async function buildSessionSubmenu(handlers: NativeMenuHandlers): Promise<{
  submenu: Submenu;
  folderItem: MenuItem;
  idItem: MenuItem;
  closeItem: MenuItem;
  setCurrentSessionId: (id: string | null) => void;
  setRecentSessions: (
    outcome: RecentSessionsOutcome,
    folder: string,
  ) => Promise<void>;
}> {
  const folderItem = await MenuItem.new({
    id: SESSION_FOLDER_ITEM_ID,
    text: 'Carpeta: ninguna',
    enabled: false,
  });
  let currentSessionId: string | null = null;
  // AC-100: copia el id real (no el texto mostrado, que puede llevar el sufijo de confirmacion) y lo confirma cambiando el propio texto del item, la unica superficie visible de un menu nativo justo tras el clic.
  const idItem = await MenuItem.new({
    id: SESSION_ID_ITEM_ID,
    text: 'Sesion: ninguna',
    enabled: false,
    action: async () => {
      if (!currentSessionId) return;
      await navigator.clipboard.writeText(currentSessionId);
      await idItem.setText(
        `Sesion: ${currentSessionId}${SESSION_ID_COPIED_SUFFIX}`,
      );
      setTimeout(() => {
        void idItem.setText(`Sesion: ${currentSessionId ?? 'ninguna'}`);
      }, SESSION_ID_COPIED_DISPLAY_MS);
    },
  });
  const closeItem = await MenuItem.new({
    id: SESSION_CLOSE_ITEM_ID,
    text: 'Cerrar sesion',
    enabled: false,
    action: () => handlers.onCloseSession(),
  });
  const submenu = await Submenu.new({
    id: SESSION_SUBMENU_ID,
    text: 'Sesion',
    items: [
      folderItem,
      idItem,
      await PredefinedMenuItem.new({ item: 'Separator' }),
      closeItem,
    ],
  });
  let recentSessionItems: MenuItem[] = [];

  async function clearRecentSessionItems(): Promise<void> {
    for (const item of recentSessionItems) {
      await submenu.remove(item);
    }
    recentSessionItems = [];
  }

  async function setRecentSessions(
    outcome: RecentSessionsOutcome,
    folder: string,
  ): Promise<void> {
    await clearRecentSessionItems();
    if (outcome.status === 'read-failed') {
      recentSessionItems = [
        await buildRecentSessionStatusItem(SESSION_RECENT_READ_FAILED_TEXT),
      ];
    } else {
      const recent = [...outcome.sessions]
        .sort((a, b) => (b.startTimeMs ?? 0) - (a.startTimeMs ?? 0))
        .slice(0, RECENT_SESSIONS_LIMIT);
      recentSessionItems =
        recent.length === 0
          ? [await buildRecentSessionStatusItem(SESSION_RECENT_EMPTY_TEXT)]
          : await Promise.all(
              recent.map((session, index) =>
                MenuItem.new({
                  id: `${SESSION_RECENT_ITEM_ID_PREFIX}${index}`,
                  text: truncateSessionTitle(session.title),
                  action: () =>
                    handlers.onSelectRecentSession(session.id, folder),
                }),
              ),
            );
    }
    await submenu.insert(recentSessionItems, SESSION_SUBMENU_BASE_ITEM_COUNT);
  }

  return {
    submenu,
    folderItem,
    idItem,
    closeItem,
    setCurrentSessionId: (id) => (currentSessionId = id),
    setRecentSessions,
  };
}

export async function installNativeMenu(
  tabs: NativeMenuTab[],
  characters: NativeMenuCharacters,
  handlers: NativeMenuHandlers,
): Promise<NativeMenuHandle> {
  const characterSubmenu = await buildCharacterSubmenu(characters, handlers);
  const knownCharacterIds = [
    ...characters.catalog.map((entry) => entry.id),
    ...characters.imported.map((entry) => entry.id),
  ];
  // D14: un MenuItem suelto entre 3 Submenu (Character/Window/Sesion) era el defecto visual reportado; como Submenu queda consistente con los demas entradas de primer nivel.
  const pluginsItem = await MenuItem.new({
    id: PLUGINS_ITEM_ID,
    text: 'Abrir listado',
    enabled: false,
    action: () => handlers.onOpenPlugins(),
  });
  const commandsSubmenu = await Submenu.new({
    id: COMMANDS_SUBMENU_ID,
    text: 'Comandos',
    items: [pluginsItem],
  });
  const windowSubmenu = await buildWindowSubmenu(tabs, handlers);
  const {
    submenu: sessionSubmenu,
    folderItem,
    idItem,
    closeItem,
    setCurrentSessionId,
    setRecentSessions,
  } = await buildSessionSubmenu(handlers);
  const menu = await Menu.new({
    items: [windowSubmenu, sessionSubmenu, characterSubmenu, commandsSubmenu],
  });
  await menu.setAsAppMenu();

  return {
    async setPluginsEnabled(enabled) {
      await pluginsItem.setEnabled(enabled);
    },
    async setTabChecked(tabId, checked) {
      const item = await windowSubmenu.get(tabItemId(tabId));
      if (item instanceof CheckMenuItem) await item.setChecked(checked);
    },
    async setSessionInfo(folder, sessionId, closable) {
      setCurrentSessionId(sessionId);
      await folderItem.setText(`Carpeta: ${folder ?? 'ninguna'}`);
      await idItem.setText(`Sesion: ${sessionId ?? 'ninguna'}`);
      await idItem.setEnabled(sessionId !== null);
      await closeItem.setEnabled(closable);
    },
    async setActiveCharacter(characterId) {
      for (const id of knownCharacterIds) {
        const item = await characterSubmenu.get(characterItemId(id));
        if (item instanceof CheckMenuItem) {
          await item.setChecked(id === characterId);
        }
      }
    },
    async setRecentSessions(outcome, folder) {
      await setRecentSessions(outcome, folder);
    },
    async addImportedCharacter(entry) {
      knownCharacterIds.push(entry.id);
      const item = await createCharacterCheckItem(entry, '', handlers);
      const items = await characterSubmenu.items();
      const addNewIndex = items.findIndex(
        (existing) => existing.id === CHARACTER_ADD_NEW_ITEM_ID,
      );
      await characterSubmenu.insert(
        item,
        addNewIndex === -1 ? items.length : addNewIndex,
      );
    },
  };
}

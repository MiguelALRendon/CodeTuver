import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Menu, Submenu } from '@tauri-apps/api/menu';
import {
  installNativeMenu,
  type NativeMenuCharacters,
  type NativeMenuHandlers,
  type NativeMenuRecentSession,
} from './native-menu';

const pluginsItemMock = vi.hoisted(() => ({
  setEnabled: vi.fn(),
}));

const menuItemMocks = vi.hoisted(
  () =>
    new Map<
      string,
      {
        text?: string;
        setText: ReturnType<typeof vi.fn>;
        setEnabled: ReturnType<typeof vi.fn>;
        action?: () => void | Promise<void>;
      }
    >(),
);

// Compartido por CheckMenuItem de tabs (Window) y de personajes (Character) — ambos son el mismo mock generico, distinguidos solo por su id.
const checkItemMocks = vi.hoisted(
  () =>
    new Map<
      string,
      {
        isChecked: ReturnType<typeof vi.fn>;
        setChecked: ReturnType<typeof vi.fn>;
      }
    >(),
);
const checkItemActions = vi.hoisted(() => new Map<string, () => void>());

const submenuMocks = vi.hoisted(
  () =>
    new Map<
      string,
      {
        get: ReturnType<typeof vi.fn>;
        insert: ReturnType<typeof vi.fn>;
        remove: ReturnType<typeof vi.fn>;
        items: ReturnType<typeof vi.fn>;
      }
    >(),
);

const menuMock = vi.hoisted(() => ({
  setAsAppMenu: vi.fn(),
}));

let pluginsAction: (() => void) | undefined;
let addNewCharacterAction: (() => void) | undefined;
let themeAction: (() => void) | undefined;
let sessionIdAction: (() => void | Promise<void>) | undefined;
let closeSessionAction: (() => void) | undefined;

vi.mock('@tauri-apps/api/menu', () => ({
  MenuItem: {
    new: vi.fn((opts: { id: string; text?: string; action?: () => void }) => {
      if (opts.id === 'native-menu-plugins') {
        pluginsAction = opts.action;
        return Promise.resolve(pluginsItemMock);
      }
      if (opts.id === 'native-menu-character-add-new') {
        addNewCharacterAction = opts.action;
        return Promise.resolve({ id: opts.id, setText: vi.fn() });
      }
      if (opts.id === 'native-menu-window-theme') {
        themeAction = opts.action;
        return Promise.resolve({ id: opts.id, setText: vi.fn() });
      }
      if (opts.id === 'native-menu-session-id') {
        sessionIdAction = opts.action;
      }
      if (opts.id === 'native-menu-session-close') {
        closeSessionAction = opts.action;
      }
      const mock = {
        id: opts.id,
        text: opts.text,
        setText: vi.fn(),
        setEnabled: vi.fn(),
        action: opts.action,
      };
      menuItemMocks.set(opts.id, mock);
      return Promise.resolve(mock);
    }),
  },
  CheckMenuItem: class CheckMenuItemMock {
    isChecked = vi.fn();
    setChecked = vi.fn();
    id: string;
    constructor(id: string) {
      this.id = id;
    }
    static new(opts: { id: string; action?: () => void }) {
      const mock = new CheckMenuItemMock(opts.id);
      checkItemMocks.set(opts.id, mock);
      if (opts.action) checkItemActions.set(opts.id, opts.action);
      return Promise.resolve(mock);
    }
  },
  PredefinedMenuItem: {
    new: vi.fn(() => Promise.resolve({ id: `separator-${Math.random()}` })),
  },
  Submenu: {
    new: vi.fn((opts: { id: string }) => {
      const mock = {
        id: opts.id,
        get: vi.fn(),
        insert: vi.fn(),
        remove: vi.fn(),
        items: vi.fn().mockResolvedValue([]),
      };
      submenuMocks.set(opts.id, mock);
      return Promise.resolve(mock);
    }),
  },
  Menu: {
    new: vi.fn(() => Promise.resolve(menuMock)),
  },
}));

function defaultCharacters(
  overrides: Partial<NativeMenuCharacters> = {},
): NativeMenuCharacters {
  return {
    catalog: [],
    imported: [],
    activeCharacterId: '',
    ...overrides,
  };
}

function defaultHandlers(
  overrides: Partial<NativeMenuHandlers> = {},
): NativeMenuHandlers {
  return {
    onOpenPlugins: vi.fn(),
    onToggleTab: vi.fn(),
    onSelectCharacter: vi.fn(),
    onAddNewCharacter: vi.fn(),
    onOpenTheme: vi.fn(),
    onCloseSession: vi.fn(),
    onSelectRecentSession: vi.fn(),
    ...overrides,
  };
}

describe('installNativeMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkItemMocks.clear();
    checkItemActions.clear();
    menuItemMocks.clear();
    submenuMocks.clear();
    pluginsAction = undefined;
    addNewCharacterAction = undefined;
    sessionIdAction = undefined;
    closeSessionAction = undefined;
  });

  describe('casos adversos', () => {
    it('crea el item Plugins deshabilitado y lo habilita via el handle', async () => {
      const handle = await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers(),
      );

      await handle.setPluginsEnabled(true);

      expect(pluginsItemMock.setEnabled).toHaveBeenCalledWith(true);
    });

    it('dispara onOpenPlugins cuando se activa el item nativo', async () => {
      const onOpenPlugins = vi.fn();
      await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers({ onOpenPlugins }),
      );

      pluginsAction?.();

      expect(onOpenPlugins).toHaveBeenCalledOnce();
    });

    it('dispara onToggleTab con el estado marcado al activar un CheckMenuItem', async () => {
      const onToggleTab = vi.fn();
      await installNativeMenu(
        [{ id: 'configuracion', label: 'Configuracion' }],
        defaultCharacters(),
        defaultHandlers({ onToggleTab }),
      );
      const item = checkItemMocks.get('native-menu-tab-configuracion')!;
      item.isChecked.mockResolvedValue(false);

      await checkItemActions.get('native-menu-tab-configuracion')?.();

      expect(onToggleTab).toHaveBeenCalledWith('configuracion', false);
    });

    it('setTabChecked resuelve el item por id en el submenu de Window y lo marca', async () => {
      const handle = await installNativeMenu(
        [{ id: 'actividad', label: 'Actividad' }],
        defaultCharacters(),
        defaultHandlers(),
      );
      const item = checkItemMocks.get('native-menu-tab-actividad')!;
      const windowSubmenu = submenuMocks.get('native-menu-window')!;
      windowSubmenu.get.mockResolvedValue(item);

      await handle.setTabChecked('actividad', false);

      expect(windowSubmenu.get).toHaveBeenCalledWith(
        'native-menu-tab-actividad',
      );
      expect(item.setChecked).toHaveBeenCalledWith(false);
    });

    it('el menu queda en el orden Window, Sesion, Character, Comandos', async () => {
      await installNativeMenu([], defaultCharacters(), defaultHandlers());

      const options = vi.mocked(Menu.new).mock.calls[0][0];
      const ids = (options?.items ?? []).map(
        (item) => (item as { id: string }).id,
      );

      expect(ids).toEqual([
        'native-menu-window',
        'native-menu-session',
        'native-menu-character',
        'native-menu-commands',
      ]);
    });

    it('Comandos es un Submenu (no un MenuItem suelto) que contiene el item de abrir', async () => {
      await installNativeMenu([], defaultCharacters(), defaultHandlers());

      expect(Submenu.new).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'native-menu-commands',
          text: 'Comandos',
          items: [pluginsItemMock],
        }),
      );
    });

    it('el id de sesion se copia al portapapeles y confirma visiblemente en el propio item', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      const handle = await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers(),
      );
      await handle.setSessionInfo('C:/proyecto', 'sesion-real-123', true);
      const idItem = menuItemMocks.get('native-menu-session-id')!;

      await sessionIdAction?.();

      expect(writeText).toHaveBeenCalledWith('sesion-real-123');
      expect(idItem.setText).toHaveBeenCalledWith(
        'Sesion: sesion-real-123 (copiado)',
      );
      vi.unstubAllGlobals();
    });

    it('sin sesion activa, activar el item del id no copia nada', async () => {
      const writeText = vi.fn();
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      await installNativeMenu([], defaultCharacters(), defaultHandlers());

      await sessionIdAction?.();

      expect(writeText).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('cerrar sesion invoca el comando de backend via onCloseSession', async () => {
      const onCloseSession = vi.fn();
      await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers({ onCloseSession }),
      );

      closeSessionAction?.();

      expect(onCloseSession).toHaveBeenCalledOnce();
    });

    it('el id se habilita solo cuando hay un sessionId real', async () => {
      const handle = await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers(),
      );
      const idItem = menuItemMocks.get('native-menu-session-id')!;

      await handle.setSessionInfo(null, null, false);
      expect(idItem.setEnabled).toHaveBeenCalledWith(false);

      await handle.setSessionInfo('C:/proyecto', 'sesion-real-123', true);
      expect(idItem.setEnabled).toHaveBeenCalledWith(true);
    });

    it('el cierre se habilita segun closable, independiente de si ya llego el sessionId', async () => {
      const handle = await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers(),
      );
      const closeItem = menuItemMocks.get('native-menu-session-close')!;

      await handle.setSessionInfo(null, null, false);
      expect(closeItem.setEnabled).toHaveBeenCalledWith(false);

      // AC-101/H2: la sesion es cerrable desde que el proceso arranca, antes de que llegue el session_id real.
      await handle.setSessionInfo(null, null, true);
      expect(closeItem.setEnabled).toHaveBeenCalledWith(true);

      await handle.setSessionInfo('C:/proyecto', 'sesion-real-123', false);
      expect(closeItem.setEnabled).toHaveBeenLastCalledWith(false);
    });

    it('setSessionInfo con carpeta/sesion nulas cae al texto por defecto', async () => {
      const handle = await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers(),
      );

      await handle.setSessionInfo(null, null, false);

      expect(
        menuItemMocks.get('native-menu-session-folder')?.setText,
      ).toHaveBeenCalledWith('Carpeta: ninguna');
      expect(
        menuItemMocks.get('native-menu-session-id')?.setText,
      ).toHaveBeenCalledWith('Sesion: ninguna');
    });

    it('dispara onSelectCharacter con el id correcto al activar un item del catalogo', async () => {
      const onSelectCharacter = vi.fn();
      await installNativeMenu(
        [],
        defaultCharacters({
          catalog: [{ id: 'alicia-solid', name: 'Alicia Solid' }],
        }),
        defaultHandlers({ onSelectCharacter }),
      );

      checkItemActions.get('native-menu-character-alicia-solid')?.();

      expect(onSelectCharacter).toHaveBeenCalledWith('alicia-solid');
    });

    it('dispara onAddNewCharacter al activar "Agregar nuevo..."', async () => {
      const onAddNewCharacter = vi.fn();
      await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers({ onAddNewCharacter }),
      );

      addNewCharacterAction?.();

      expect(onAddNewCharacter).toHaveBeenCalledOnce();
    });

    it('dispara onOpenTheme al activar "Theme" en el submenu de Window', async () => {
      const onOpenTheme = vi.fn();
      await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers({ onOpenTheme }),
      );

      themeAction?.();

      expect(onOpenTheme).toHaveBeenCalledOnce();
    });

    it('setActiveCharacter desmarca el personaje previo y marca el nuevo, catalogo e importados por igual', async () => {
      const handle = await installNativeMenu(
        [],
        defaultCharacters({
          catalog: [{ id: 'rabbit', name: 'Rabbit' }],
          imported: [{ id: 'custom-1', name: 'Custom' }],
          activeCharacterId: 'rabbit',
        }),
        defaultHandlers(),
      );
      const characterSubmenu = submenuMocks.get('native-menu-character')!;
      const rabbitItem = checkItemMocks.get('native-menu-character-rabbit')!;
      const customItem = checkItemMocks.get('native-menu-character-custom-1')!;
      characterSubmenu.get.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'native-menu-character-rabbit' ? rabbitItem : customItem,
        ),
      );

      await handle.setActiveCharacter('custom-1');

      expect(rabbitItem.setChecked).toHaveBeenCalledWith(false);
      expect(customItem.setChecked).toHaveBeenCalledWith(true);
    });

    it('addImportedCharacter inserta el nuevo item antes de "Agregar nuevo..." sin duplicar el catalogo existente', async () => {
      const handle = await installNativeMenu(
        [],
        defaultCharacters({
          catalog: [{ id: 'rabbit', name: 'Rabbit' }],
        }),
        defaultHandlers(),
      );
      const characterSubmenu = submenuMocks.get('native-menu-character')!;
      characterSubmenu.items.mockResolvedValue([
        { id: 'native-menu-character-rabbit' },
        { id: 'separator-x' },
        { id: 'native-menu-character-add-new' },
      ]);

      await handle.addImportedCharacter({ id: 'custom-2', name: 'Custom 2' });

      expect(characterSubmenu.insert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'native-menu-character-custom-2' }),
        2,
      );
    });

    it('addImportedCharacter inserta al final si no encuentra "Agregar nuevo..." (defensivo, no deberia ocurrir en produccion)', async () => {
      const handle = await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers(),
      );
      const characterSubmenu = submenuMocks.get('native-menu-character')!;
      characterSubmenu.items.mockResolvedValue([{ id: 'algo-inesperado' }]);

      await handle.addImportedCharacter({ id: 'custom-3', name: 'Custom 3' });

      expect(characterSubmenu.insert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'native-menu-character-custom-3' }),
        1,
      );
    });
  });

  describe('happy path', () => {
    it('setSessionInfo actualiza el texto de carpeta y sesion con los valores reales', async () => {
      const handle = await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers(),
      );

      await handle.setSessionInfo('C:\\proyecto', 'abc-123', true);

      expect(
        menuItemMocks.get('native-menu-session-folder')?.setText,
      ).toHaveBeenCalledWith('Carpeta: C:\\proyecto');
      expect(
        menuItemMocks.get('native-menu-session-id')?.setText,
      ).toHaveBeenCalledWith('Sesion: abc-123');
    });
  });

  describe('setRecentSessions (AC-102)', () => {
    function recentSession(
      id: string,
      startTimeMs: number,
    ): NativeMenuRecentSession {
      return { id, title: id, startTimeMs };
    }

    it('lista exactamente 5 items cuando hay 7 sesiones disponibles', async () => {
      const handle = await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers(),
      );
      const sessions = Array.from({ length: 7 }, (_, i) =>
        recentSession(`sesion-${i}`, i),
      );

      await handle.setRecentSessions(
        { status: 'ok', sessions },
        'carpeta-real',
      );

      const submenu = submenuMocks.get('native-menu-session')!;
      const [inserted] =
        submenu.insert.mock.calls[submenu.insert.mock.calls.length - 1];
      expect(inserted).toHaveLength(5);
    });

    it('lista las 3 disponibles cuando solo hay 3', async () => {
      const handle = await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers(),
      );
      const sessions = [
        recentSession('a', 1),
        recentSession('b', 2),
        recentSession('c', 3),
      ];

      await handle.setRecentSessions(
        { status: 'ok', sessions },
        'carpeta-real',
      );

      const submenu = submenuMocks.get('native-menu-session')!;
      const [inserted] =
        submenu.insert.mock.calls[submenu.insert.mock.calls.length - 1];
      expect(inserted).toHaveLength(3);
    });

    it('ordena por fecha descendente antes de truncar a 5', async () => {
      const handle = await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers(),
      );
      const sessions = [
        recentSession('antigua', 100),
        recentSession('reciente', 300),
        recentSession('media', 200),
      ];

      await handle.setRecentSessions(
        { status: 'ok', sessions },
        'carpeta-real',
      );

      const submenu = submenuMocks.get('native-menu-session')!;
      const [inserted] =
        submenu.insert.mock.calls[submenu.insert.mock.calls.length - 1];
      expect(inserted.map((item: { text: string }) => item.text)).toEqual([
        'reciente',
        'media',
        'antigua',
      ]);
    });

    it('muestra un aviso de fallo de lectura en vez de una lista vacia', async () => {
      const handle = await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers(),
      );

      await handle.setRecentSessions({ status: 'read-failed' }, 'carpeta-real');

      const submenu = submenuMocks.get('native-menu-session')!;
      const [inserted] =
        submenu.insert.mock.calls[submenu.insert.mock.calls.length - 1];
      expect(inserted).toHaveLength(1);
      expect(inserted[0].text).toBe('No se pudo leer el historial');
    });

    it('muestra un aviso de "sin sesiones" cuando la lectura funciona pero no hay ninguna', async () => {
      const handle = await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers(),
      );

      await handle.setRecentSessions(
        { status: 'ok', sessions: [] },
        'carpeta-real',
      );

      const submenu = submenuMocks.get('native-menu-session')!;
      const [inserted] =
        submenu.insert.mock.calls[submenu.insert.mock.calls.length - 1];
      expect(inserted).toHaveLength(1);
      expect(inserted[0].text).toBe('Sin sesiones recientes');
    });

    it('elegir una sesion reciente dispara onSelectRecentSession con su id y la carpeta', async () => {
      const onSelectRecentSession = vi.fn();
      const handle = await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers({ onSelectRecentSession }),
      );

      await handle.setRecentSessions(
        { status: 'ok', sessions: [recentSession('sesion-x', 1)] },
        'carpeta-real',
      );
      const submenu = submenuMocks.get('native-menu-session')!;
      const [inserted] =
        submenu.insert.mock.calls[submenu.insert.mock.calls.length - 1];
      await inserted[0].action();

      expect(onSelectRecentSession).toHaveBeenCalledWith(
        'sesion-x',
        'carpeta-real',
      );
    });

    it('quita los items de la ronda anterior antes de insertar los nuevos', async () => {
      const handle = await installNativeMenu(
        [],
        defaultCharacters(),
        defaultHandlers(),
      );
      await handle.setRecentSessions(
        { status: 'ok', sessions: [recentSession('a', 1)] },
        'carpeta-a',
      );
      const submenu = submenuMocks.get('native-menu-session')!;
      const [firstRound] =
        submenu.insert.mock.calls[submenu.insert.mock.calls.length - 1];

      await handle.setRecentSessions(
        { status: 'ok', sessions: [recentSession('b', 1)] },
        'carpeta-b',
      );

      expect(submenu.remove).toHaveBeenCalledWith(firstRound[0]);
    });
  });
});

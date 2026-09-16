import { describe, expect, it, vi } from 'vitest';
import {
  createTabFocusRegistry,
  filterVisibleTabs,
  handleTabListKeydown,
  isTabArrowKey,
  nextTabId,
  tabButtonId,
  tabPanelId,
} from './tab-navigation';

const TAB_IDS = ['a', 'b', 'c'] as const;

describe('isTabArrowKey', () => {
  it('acepta las 4 teclas de navegacion de tabs', () => {
    expect(isTabArrowKey('ArrowLeft')).toBe(true);
    expect(isTabArrowKey('ArrowRight')).toBe(true);
    expect(isTabArrowKey('Home')).toBe(true);
    expect(isTabArrowKey('End')).toBe(true);
  });

  it('rechaza otras teclas', () => {
    expect(isTabArrowKey('Enter')).toBe(false);
    expect(isTabArrowKey('Tab')).toBe(false);
  });
});

describe('nextTabId', () => {
  it('avanza con ArrowRight y da la vuelta al final', () => {
    expect(nextTabId(TAB_IDS, 'a', 'ArrowRight')).toBe('b');
    expect(nextTabId(TAB_IDS, 'c', 'ArrowRight')).toBe('a');
  });

  it('retrocede con ArrowLeft y da la vuelta al inicio', () => {
    expect(nextTabId(TAB_IDS, 'b', 'ArrowLeft')).toBe('a');
    expect(nextTabId(TAB_IDS, 'a', 'ArrowLeft')).toBe('c');
  });

  it('Home y End van a los extremos', () => {
    expect(nextTabId(TAB_IDS, 'b', 'Home')).toBe('a');
    expect(nextTabId(TAB_IDS, 'b', 'End')).toBe('c');
  });

  it('si el id activo no esta en la lista, no cambia', () => {
    expect(
      nextTabId(TAB_IDS, 'z' as (typeof TAB_IDS)[number], 'ArrowRight'),
    ).toBe('z');
  });
});

describe('tabButtonId / tabPanelId', () => {
  it('generan ids estables por grupo y tab', () => {
    expect(tabButtonId('secondary', 'actividad')).toBe(
      'secondary-tab-actividad',
    );
    expect(tabPanelId('secondary', 'actividad')).toBe(
      'secondary-panel-actividad',
    );
  });
});

describe('filterVisibleTabs', () => {
  const TABS = [
    { id: 'avatar', label: 'Avatar' },
    { id: 'actividad', label: 'Actividad' },
    { id: 'configuracion', label: 'Configuracion' },
  ];

  it('nunca oculta el id siempre-visible aunque falte en el mapa de habilitados', () => {
    expect(filterVisibleTabs(TABS, 'avatar', {}).map((t) => t.id)).toEqual([
      'avatar',
    ]);
  });

  it('oculta un tab cuyo valor en el mapa es false', () => {
    const result = filterVisibleTabs(TABS, 'avatar', {
      actividad: false,
      configuracion: true,
    });
    expect(result.map((t) => t.id)).toEqual(['avatar', 'configuracion']);
  });

  it('mantiene todos los tabs cuando el mapa los habilita a todos', () => {
    const result = filterVisibleTabs(TABS, 'avatar', {
      actividad: true,
      configuracion: true,
    });
    expect(result.map((t) => t.id)).toEqual([
      'avatar',
      'actividad',
      'configuracion',
    ]);
  });
});

describe('handleTabListKeydown', () => {
  it('ignora teclas que no son de navegacion', () => {
    const activeId = { value: 'a' as (typeof TAB_IDS)[number] };
    const registry = createTabFocusRegistry();
    const focusSpy = vi.spyOn(registry, 'focus');
    const event = {
      key: 'Enter',
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handleTabListKeydown(event, TAB_IDS, activeId, registry);

    expect(activeId.value).toBe('a');
    expect(focusSpy).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('mueve el tab activo y el foco con ArrowRight', () => {
    const activeId = { value: 'a' as (typeof TAB_IDS)[number] };
    const registry = createTabFocusRegistry();
    const focusSpy = vi.spyOn(registry, 'focus');
    const event = {
      key: 'ArrowRight',
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;

    handleTabListKeydown(event, TAB_IDS, activeId, registry);

    expect(activeId.value).toBe('b');
    expect(focusSpy).toHaveBeenCalledWith('b');
    expect(event.preventDefault).toHaveBeenCalled();
  });
});

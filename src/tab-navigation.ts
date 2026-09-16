export type TabArrowKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End';

const TAB_ARROW_KEYS: readonly TabArrowKey[] = [
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
];

export function isTabArrowKey(key: string): key is TabArrowKey {
  return (TAB_ARROW_KEYS as readonly string[]).includes(key);
}

export function nextTabId<T extends string>(
  tabIds: readonly T[],
  activeId: T,
  key: TabArrowKey,
): T {
  const currentIndex = tabIds.indexOf(activeId);
  if (currentIndex === -1) return activeId;
  if (key === 'Home') return tabIds[0];
  if (key === 'End') return tabIds[tabIds.length - 1];
  const step = key === 'ArrowRight' ? 1 : -1;
  return tabIds[(currentIndex + step + tabIds.length) % tabIds.length];
}

export function tabButtonId(groupId: string, tabId: string): string {
  return `${groupId}-tab-${tabId}`;
}

export function tabPanelId(groupId: string, tabId: string): string {
  return `${groupId}-panel-${tabId}`;
}

export interface TabFocusRegistry {
  register(id: string, el: unknown): void;
  focus(id: string): void;
}

// Un registro por tablist: el roving tabindex necesita mover el foco real al boton activo tras Arrow/Home/End.
export function createTabFocusRegistry(): TabFocusRegistry {
  const elements = new Map<string, HTMLElement>();
  return {
    register(id, el) {
      if (el instanceof HTMLElement) {
        elements.set(id, el);
      } else {
        elements.delete(id);
      }
    },
    focus(id) {
      elements.get(id)?.focus();
    },
  };
}

export function filterVisibleTabs<T extends { id: string }>(
  tabs: readonly T[],
  alwaysVisibleId: string,
  enabled: Readonly<Record<string, boolean>>,
): T[] {
  return tabs.filter(
    (tab) => tab.id === alwaysVisibleId || enabled[tab.id] === true,
  );
}

export function handleTabListKeydown<T extends string>(
  event: KeyboardEvent,
  tabIds: readonly T[],
  activeId: { value: T },
  focusRegistry: TabFocusRegistry,
): void {
  if (!isTabArrowKey(event.key)) return;
  event.preventDefault();
  const next = nextTabId(tabIds, activeId.value, event.key);
  activeId.value = next;
  focusRegistry.focus(next);
}

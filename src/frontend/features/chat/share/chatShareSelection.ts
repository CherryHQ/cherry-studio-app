import { createContext, use, useCallback, useSyncExternalStore } from 'react';

import type { ChatShareTranslations } from './chatShareTarget';

type ChatShareSelectionState = {
  isSharing: boolean;
  isEditing: boolean;
};

type ChatShareSelectionActions = {
  toggleMessage: (messageId: string) => void;
  confirmSelection: () => void;
  beginSelection(messageId: string, translations?: ChatShareTranslations): void;
  cancelSelection(): void;
};

type SelectedMessageIds = ReadonlySet<string>;
type ChatShareSelectionStore = ReturnType<typeof createChatShareSelectionStore>;

export const ChatShareSelectionStateContext = createContext<ChatShareSelectionState | null>(null);
export const ChatShareSelectionActionsContext = createContext<ChatShareSelectionActions | null>(
  null,
);
export const ChatShareSelectionStoreContext = createContext<ChatShareSelectionStore | null>(null);

export function useIsChatShareSelecting() {
  return use(ChatShareSelectionStateContext)?.isEditing ?? false;
}

export function useChatShareSelectionState() {
  const state = use(ChatShareSelectionStateContext);
  if (!state) throw new Error('Chat sharing requires ChatShareSelectionProvider');
  return state;
}

export function useChatShareSelectionActions() {
  const actions = use(ChatShareSelectionActionsContext);
  if (!actions) throw new Error('Chat sharing requires ChatShareSelectionProvider');
  return actions;
}

export function useChatShareSelectionCount() {
  return useSelectionSnapshot(useSelectionStore(), selectSelectedCount);
}

export function useIsChatMessageSelected(messageId: string) {
  const select = useCallback((ids: SelectedMessageIds) => ids.has(messageId), [messageId]);
  return useSelectionSnapshot(useSelectionStore(), select);
}

function useSelectionStore() {
  const store = use(ChatShareSelectionStoreContext);
  if (!store) throw new Error('Chat sharing requires ChatShareSelectionProvider');
  return store;
}

/** Primitive snapshots keep a toggle local to its row and the selected-count consumer. */
function useSelectionSnapshot<T extends boolean | number>(
  store: ChatShareSelectionStore,
  select: (ids: SelectedMessageIds) => T,
) {
  const getSnapshot = useCallback(() => select(store.getSnapshot()), [select, store]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

function selectSelectedCount(ids: SelectedMessageIds) {
  return ids.size;
}

/** One canonical selection per provider; no state is mirrored from React effects. */
export function createChatShareSelectionStore(initialMessageId?: string) {
  let selectedIds: SelectedMessageIds = new Set(initialMessageId ? [initialMessageId] : []);
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => selectedIds,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setSelectedIds: (next: SelectedMessageIds) => {
      if (next === selectedIds) return;
      selectedIds = next;
      listeners.forEach((listener) => listener());
    },
  };
}

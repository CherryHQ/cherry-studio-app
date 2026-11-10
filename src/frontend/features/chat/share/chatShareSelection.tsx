import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useState,
  useSyncExternalStore,
} from 'react';

import type { ChatShareTranslations } from './chatShareTarget';

type ChatShareSelectionState = {
  isSharing: boolean;
  isEditing: boolean;
  isSelectingAll: boolean;
  allSelected: boolean;
};

type ChatShareSelectionActions = {
  toggleMessage: (messageId: string) => void;
  selectMessages(messageIds: readonly string[], selected: boolean): void;
  toggleAll(): void;
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

const EMPTY_STORE = createChatShareSelectionStore();

/** The screen scope includes the transcript and its sibling header, with one canonical mode. */
export function ChatShareSelectionScope({ children }: PropsWithChildren) {
  const [store] = useState(createChatShareSelectionStore);
  return <ChatShareSelectionStoreContext value={store}>{children}</ChatShareSelectionStoreContext>;
}

export function useIsChatShareSelecting() {
  const store = use(ChatShareSelectionStoreContext) ?? EMPTY_STORE;
  return useSyncExternalStore(store.subscribe, store.getIsEditing, store.getIsEditing);
}

export function useChatShareHeaderSelection() {
  const store = use(ChatShareSelectionStoreContext) ?? EMPTY_STORE;
  const isEditing = useIsChatShareSelecting();
  const selectedCount = useSelectionSnapshot(store, selectSelectedCount);
  return isEditing ? { selectedCount, onExit: store.cancelSelection } : undefined;
}

export function useChatShareFooterHeight() {
  const store = use(ChatShareSelectionStoreContext) ?? EMPTY_STORE;
  const height = useSyncExternalStore(
    store.subscribe,
    store.getFooterHeight,
    store.getFooterHeight,
  );
  return { height, onHeightChange: store.setFooterHeight };
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

export function useIsChatMessageSelected(messageId: string | undefined) {
  const select = useCallback(
    (ids: SelectedMessageIds) => Boolean(messageId && ids.has(messageId)),
    [messageId],
  );
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
  let isEditing = Boolean(initialMessageId);
  let footerHeight = 0;
  const publish = () => listeners.forEach((listener) => listener());
  return {
    getFooterHeight: () => footerHeight,
    setFooterHeight: (height: number) => {
      if (height !== footerHeight) {
        footerHeight = height;
        publish();
      }
    },
    getIsEditing: () => isEditing,
    beginSelection: () => {
      isEditing = true;
      publish();
    },
    cancelSelection: () => {
      if (isEditing) {
        isEditing = false;
        publish();
      }
    },
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
      publish();
    },
  };
}

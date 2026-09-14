import { useToast } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';

import { toggleSelection } from '@/frontend/components/Selection';
import { DOCUMENT_EXPORT_MAX_SECTIONS } from '@/shared/contracts/documentExport';

import { useShareChat } from './useShareChat';

type ChatShareSelectionState = {
  isSharing: boolean;
};

type ChatShareSelectionActions = {
  toggleMessage: (messageId: string) => void;
  confirmSelection: () => void;
};

type SelectedMessageIds = ReadonlySet<string>;
type ChatShareSelectionStore = ReturnType<typeof createChatShareSelectionStore>;

const ChatShareSelectionStateContext = createContext<ChatShareSelectionState | null>(null);
const ChatShareSelectionActionsContext = createContext<ChatShareSelectionActions | null>(null);
const ChatShareSelectionStoreContext = createContext<ChatShareSelectionStore | null>(null);

export function ChatShareSelectionProvider({
  children,
  sessionId,
  initialMessageId,
}: PropsWithChildren<{ sessionId: string; initialMessageId?: string }>) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [store] = useState(() => createChatShareSelectionStore(initialMessageId));
  const { shareChat, isSharing, cancelShare } = useShareChat(sessionId);
  const toggleMessage = useCallback(
    (messageId: string) => {
      const selectedIds = store.getSnapshot();
      if (isSharing) return;
      if (!selectedIds.has(messageId) && selectedIds.size >= DOCUMENT_EXPORT_MAX_SECTIONS) {
        toast.show({
          label: t('chat.share.selectionLimit', { count: DOCUMENT_EXPORT_MAX_SECTIONS }),
          variant: 'danger',
        });
        return;
      }
      store.setSelectedIds(toggleSelection(selectedIds, messageId));
    },
    [isSharing, store, t, toast],
  );
  const confirmSelection = useCallback(() => {
    const selectedIds = store.getSnapshot();
    if (selectedIds.size && !isSharing) shareChat([...selectedIds]);
  }, [isSharing, shareChat, store]);

  useFocusEffect(useCallback(() => cancelShare, [cancelShare]));

  const state = useMemo(() => ({ isSharing }), [isSharing]);
  const actions = useMemo(
    () => ({ toggleMessage, confirmSelection }),
    [confirmSelection, toggleMessage],
  );

  return (
    <ChatShareSelectionStoreContext value={store}>
      <ChatShareSelectionStateContext value={state}>
        <ChatShareSelectionActionsContext value={actions}>
          {children}
        </ChatShareSelectionActionsContext>
      </ChatShareSelectionStateContext>
    </ChatShareSelectionStoreContext>
  );
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
function createChatShareSelectionStore(initialMessageId?: string) {
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

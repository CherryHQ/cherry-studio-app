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
import { BackHandler, Keyboard } from 'react-native';

import { toggleSelection } from '@/frontend/components/Selection';
import { DOCUMENT_EXPORT_MAX_SECTIONS } from '@/shared/contracts/documentExport';

import { useShareChat } from './useShareChat';

type ChatShareSelectionState = {
  isSelecting: boolean;
  isSharing: boolean;
};

type ChatShareSelectionActions = {
  startSelection: (input?: { messageId?: string }) => void;
  cancelSelection: () => void;
  toggleMessage: (messageId: string) => void;
  confirmSelection: () => void;
};

type SelectedMessageIds = ReadonlySet<string> | undefined;
type ChatShareSelectionStore = ReturnType<typeof createChatShareSelectionStore>;

const ChatShareSelectionStateContext = createContext<ChatShareSelectionState | null>(null);
const ChatShareSelectionActionsContext = createContext<ChatShareSelectionActions | null>(null);
const ChatShareSelectionStoreContext = createContext<ChatShareSelectionStore | null>(null);

export function ChatShareSelectionProvider({
  children,
  sessionId,
}: PropsWithChildren<{ sessionId?: string }>) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [store] = useState(createChatShareSelectionStore);
  const { shareChat, isSharing, cancelShare } = useShareChat(sessionId);
  const isSelecting = useSelectionSnapshot(store, selectIsSelecting);

  const startSelection = useCallback(
    ({ messageId }: { messageId?: string } = {}) => {
      if (!sessionId) return;
      cancelShare();
      Keyboard.dismiss();
      store.setSelectedIds(new Set(messageId ? [messageId] : []));
    },
    [cancelShare, sessionId, store],
  );
  const cancelSelection = useCallback(() => {
    cancelShare();
    store.setSelectedIds(undefined);
  }, [cancelShare, store]);

  const toggleMessage = useCallback(
    (messageId: string) => {
      const selectedIds = store.getSnapshot();
      if (!selectedIds || isSharing) return;
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
    if (selectedIds?.size && !isSharing) shareChat([...selectedIds]);
  }, [isSharing, shareChat, store]);

  useFocusEffect(
    useCallback(() => {
      if (!isSelecting) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        cancelSelection();
        return true;
      });
      return () => {
        subscription.remove();
        cancelShare();
      };
    }, [cancelSelection, cancelShare, isSelecting]),
  );

  const state = useMemo(() => ({ isSelecting, isSharing }), [isSelecting, isSharing]);
  const actions = useMemo(
    () => ({ startSelection, cancelSelection, toggleMessage, confirmSelection }),
    [cancelSelection, confirmSelection, startSelection, toggleMessage],
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
  const select = useCallback(
    (ids: SelectedMessageIds) => ids?.has(messageId) ?? false,
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

function selectIsSelecting(ids: SelectedMessageIds) {
  return ids !== undefined;
}

function selectSelectedCount(ids: SelectedMessageIds) {
  return ids?.size ?? 0;
}

/** One canonical selection per provider; no state is mirrored from React effects. */
function createChatShareSelectionStore() {
  let selectedIds: SelectedMessageIds;
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

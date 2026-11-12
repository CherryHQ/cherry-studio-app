import { useToast } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import {
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

import type { ConversationMessage } from '@/frontend/appShell/conversation';
import { areAllSelected } from '@/frontend/components/Selection';
import { DOCUMENT_EXPORT_MAX_SECTIONS } from '@/shared/contracts/documentExport';

import {
  ChatShareSelectionActionsContext,
  ChatShareSelectionStateContext,
  ChatShareSelectionStoreContext,
  createChatShareSelectionStore,
} from './chatShareSelection';
import type { ChatShareTarget, ChatShareTranslations } from './chatShareTarget';
import { useShareChat } from './useShareChat';

const EMPTY_MESSAGES: readonly ConversationMessage[] = [];

export function ChatShareSelectionProvider({
  children,
  target,
  messages = EMPTY_MESSAGES,
  initialMessageId,
}: PropsWithChildren<{
  target?: ChatShareTarget;
  messages?: readonly ConversationMessage[];
  initialMessageId?: string;
}>) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const scope = use(ChatShareSelectionStoreContext);
  const [store] = useState(() => scope ?? createChatShareSelectionStore(initialMessageId));
  const isActive = useSyncExternalStore(store.subscribe, store.getIsEditing, store.getIsEditing);
  const selectedIds = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [selection, setSelection] = useState<{
    target?: ChatShareTarget;
    translations?: ChatShareTranslations;
  }>(() => ({ target }));
  const selectedTarget = useMemo(
    () =>
      selection.target
        ? {
            ...selection.target,
            translations: selection.translations ?? selection.target.translations,
          }
        : undefined,
    [selection.target, selection.translations],
  );
  const { shareChat, isSharing, cancelShare } = useShareChat(selectedTarget);
  const isEditing = selection.target === target && isActive;
  const [allSelection, setAllSelection] = useState<{
    target: ChatShareTarget;
    ids: readonly string[];
  }>();
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const pendingAll = useRef<AbortController | undefined>(undefined);
  const messagesRef = useRef(messages);
  useLayoutEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(
    () => () => {
      cancelShare();
      pendingAll.current?.abort();
      store.cancelSelection();
    },
    [target, cancelShare, store],
  );
  useEffect(() => {
    if (!isEditing) pendingAll.current?.abort();
  }, [isEditing]);
  const showLimit = useCallback(
    () =>
      toast.show({
        label: t('chat.share.selectionLimit', { count: DOCUMENT_EXPORT_MAX_SECTIONS }),
        variant: 'danger',
      }),
    [t, toast],
  );
  const changeSelection = useCallback(
    (ids: readonly string[], selected: boolean) => {
      if (isSharing || pendingAll.current) return;
      const current = store.getSnapshot();
      const next = new Set(current);
      for (const id of ids) {
        if (selected) {
          next.add(id);
          const messages = messagesRef.current;
          const position = messages.findIndex(
            (message) => message.key === id && message.display.role === 'user',
          );
          if (position >= 0) {
            const answer = messages[position + 1];
            if (
              answer?.display.role === 'assistant' &&
              answer.completeness === 'complete' &&
              !['pending', 'streaming'].includes(answer.state)
            )
              next.add(answer.key);
          }
        } else next.delete(id);
      }
      if (next.size > DOCUMENT_EXPORT_MAX_SECTIONS) {
        showLimit();
        return;
      }
      if (next.size === current.size && [...next].every((id) => current.has(id))) return;
      store.setSelectedIds(next);
    },
    [isSharing, showLimit, store],
  );
  const beginSelection = useCallback(
    (messageId: string, translations?: ChatShareTranslations) => {
      if (!target || isSharing) return;
      Keyboard.dismiss();
      pendingAll.current?.abort();
      pendingAll.current = undefined;
      setIsSelectingAll(false);
      store.setSelectedIds(new Set());
      changeSelection([messageId], true);
      setSelection({ target, translations });
      setAllSelection(undefined);
      store.beginSelection();
    },
    [changeSelection, isSharing, store, target],
  );
  const cancelSelection = store.cancelSelection;
  const toggleMessage = useCallback(
    (messageId: string) => changeSelection([messageId], !store.getSnapshot().has(messageId)),
    [changeSelection, store],
  );
  const allSelected = Boolean(
    allSelection && allSelection.target === target && areAllSelected(selectedIds, allSelection.ids),
  );
  const toggleAll = useCallback(() => {
    if (!target || isSharing || pendingAll.current) return;
    if (allSelection?.target === target && areAllSelected(store.getSnapshot(), allSelection.ids)) {
      store.setSelectedIds(new Set());
      return;
    }
    const controller = new AbortController();
    pendingAll.current = controller;
    setIsSelectingAll(true);
    void (async () => {
      try {
        const ids = await target.readSelectableIds(controller.signal);
        controller.signal.throwIfAborted();
        if (!store.getIsEditing()) return;
        if (ids.length > DOCUMENT_EXPORT_MAX_SECTIONS) {
          showLimit();
          return;
        }
        setAllSelection({ target, ids });
        store.setSelectedIds(new Set(ids));
      } catch {
        if (!controller.signal.aborted)
          toast.show({ label: t('chat.share.loadFailed'), variant: 'danger' });
      } finally {
        if (pendingAll.current === controller) {
          pendingAll.current = undefined;
          setIsSelectingAll(false);
        }
      }
    })();
  }, [allSelection, isSharing, showLimit, store, t, target, toast]);
  const confirmSelection = useCallback(() => {
    const ids = store.getSnapshot();
    if (
      ids.size &&
      store.getIsEditing() &&
      !isSharing &&
      !pendingAll.current &&
      selection.target === target
    ) {
      shareChat([...ids]);
      cancelSelection();
    }
  }, [cancelSelection, isSharing, selection.target, shareChat, store, target]);
  useFocusEffect(
    useCallback(
      () => () => {
        cancelShare();
        pendingAll.current?.abort();
      },
      [cancelShare],
    ),
  );
  const state = useMemo(
    () => ({ isSharing, isEditing, isSelectingAll, allSelected }),
    [isSharing, isEditing, isSelectingAll, allSelected],
  );
  const actions = useMemo(
    () => ({
      toggleMessage,
      selectMessages: changeSelection,
      toggleAll,
      confirmSelection,
      beginSelection,
      cancelSelection,
    }),
    [beginSelection, cancelSelection, changeSelection, confirmSelection, toggleAll, toggleMessage],
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

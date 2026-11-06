import { useToast } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import { type PropsWithChildren, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toggleSelection } from '@/frontend/components/Selection';
import { DOCUMENT_EXPORT_MAX_SECTIONS } from '@/shared/contracts/documentExport';

import {
  ChatShareSelectionActionsContext,
  ChatShareSelectionStateContext,
  ChatShareSelectionStoreContext,
  createChatShareSelectionStore,
} from './chatShareSelection';
import type { ChatShareTarget, ChatShareTranslations } from './chatShareTarget';
import { useShareChat } from './useShareChat';

export function ChatShareSelectionProvider({
  children,
  target,
  initialMessageId,
}: PropsWithChildren<{ target?: ChatShareTarget; initialMessageId?: string }>) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [store] = useState(() => createChatShareSelectionStore(initialMessageId));
  const [selection, setSelection] = useState<{
    target?: ChatShareTarget;
    translations?: ChatShareTranslations;
    isEditing: boolean;
  }>(() => ({ target, isEditing: Boolean(initialMessageId) }));
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
  const isEditing = selection.target === target && selection.isEditing;
  useEffect(() => () => cancelShare(), [target, cancelShare]);
  const beginSelection = useCallback(
    (messageId: string, translations?: ChatShareTranslations) => {
      if (!target || isSharing) return;
      store.setSelectedIds(new Set([messageId]));
      setSelection({ target, translations, isEditing: true });
    },
    [isSharing, store, target],
  );
  const cancelSelection = useCallback(
    () => setSelection((current) => ({ ...current, isEditing: false })),
    [],
  );
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
    if (selectedIds.size && !isSharing && selection.target === target) {
      shareChat([...selectedIds]);
      cancelSelection();
    }
  }, [cancelSelection, isSharing, selection.target, shareChat, store, target]);

  useFocusEffect(useCallback(() => cancelShare, [cancelShare]));

  const state = useMemo(() => ({ isSharing, isEditing }), [isSharing, isEditing]);
  const actions = useMemo(
    () => ({ toggleMessage, confirmSelection, beginSelection, cancelSelection }),
    [beginSelection, cancelSelection, confirmSelection, toggleMessage],
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

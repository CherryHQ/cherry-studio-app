import { useToast } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import { createContext, type PropsWithChildren, use, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Keyboard } from 'react-native';

import { toggleSelection } from '@/frontend/components/Selection';
import { DOCUMENT_EXPORT_MAX_SECTIONS } from '@/shared/contracts/documentExport';

import { useShareChat } from './useShareChat';

type ChatShareSelection = {
  isSelecting: boolean;
  isSharing: boolean;
  selectedIds: ReadonlySet<string>;
  startSelection: (input?: { messageId?: string }) => void;
  cancelSelection: () => void;
  toggleMessage: (messageId: string) => void;
  confirmSelection: () => void;
};

const ChatShareSelectionContext = createContext<ChatShareSelection | null>(null);
const emptySelection: ReadonlySet<string> = new Set();

export function ChatShareSelectionProvider({
  children,
  sessionId,
}: PropsWithChildren<{ sessionId?: string }>) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>();
  const { shareChat, isSharing, cancelShare } = useShareChat(sessionId);
  const isSelecting = selectedIds !== undefined;

  const startSelection = useCallback(
    ({ messageId }: { messageId?: string } = {}) => {
      if (!sessionId) return;
      cancelShare();
      Keyboard.dismiss();
      setSelectedIds(new Set(messageId ? [messageId] : []));
    },
    [cancelShare, sessionId],
  );
  const cancelSelection = useCallback(() => {
    cancelShare();
    setSelectedIds(undefined);
  }, [cancelShare]);

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

  const value = useMemo<ChatShareSelection>(
    () => ({
      isSelecting,
      isSharing,
      selectedIds: selectedIds ?? emptySelection,
      startSelection,
      cancelSelection,
      toggleMessage: (messageId) => {
        if (!selectedIds || isSharing) return;
        if (!selectedIds.has(messageId) && selectedIds.size >= DOCUMENT_EXPORT_MAX_SECTIONS) {
          toast.show({
            label: t('chat.share.selectionLimit', { count: DOCUMENT_EXPORT_MAX_SECTIONS }),
            variant: 'danger',
          });
          return;
        }
        setSelectedIds((current) => current && toggleSelection(current, messageId));
      },
      confirmSelection: () => {
        if (selectedIds?.size && !isSharing) shareChat([...selectedIds]);
      },
    }),
    [cancelSelection, isSelecting, isSharing, selectedIds, shareChat, startSelection, t, toast],
  );

  return <ChatShareSelectionContext value={value}>{children}</ChatShareSelectionContext>;
}

export function useChatShareSelection() {
  const selection = use(ChatShareSelectionContext);
  if (!selection) throw new Error('Chat sharing requires ChatShareSelectionProvider');
  return selection;
}

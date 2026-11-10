import { useComposerExpansion } from '@cherrystudio/ui/components';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { type ComponentProps, useRef, useState } from 'react';
import { View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mainHeaderRowHeight } from '@/frontend/appShell/header';
import { resolveHeaderContentInset } from '@/frontend/appShell/navigation';
import { MessageList, type MessageListHandle } from '@/frontend/components/Message';

import { ChatShareDragSelection } from '../../share/ChatShareDragSelection';
import { useChatShareFooterHeight, useIsChatShareSelecting } from '../../share/chatShareSelection';
import { ChatInitialRenderCover } from './components/ChatInitialRenderCover';
import { ChatOlderMessagesIndicator } from './components/ChatOlderMessagesIndicator';
import { useMessageListInitialRenderGate } from './hooks/useMessageListInitialRenderGate';

type ChatTranscriptProps = Omit<
  ComponentProps<typeof MessageList>,
  'bottomAccessoryHeight' | 'contentTopInset'
> & { requiresInitialLayout: boolean; isLoadingMore: boolean };

const SELECTION_ROW_INSETS = { horizontal: 8, user: 0, assistant: 0 };

export function ChatTranscript({
  requiresInitialLayout,
  isLoadingMore,
  onReady,
  ...list
}: ChatTranscriptProps) {
  const composer = useComposerExpansion();
  const listRef = useRef<MessageListHandle>(null);
  const isSelecting = useIsChatShareSelecting();
  const { height: selectionFooterHeight } = useChatShareFooterHeight();
  const bottomAccessoryHeight = useDerivedValue(() =>
    isSelecting ? selectionFooterHeight : (composer?.meta.contentInset.get() ?? 0),
  );
  const reportedHeaderHeight = useHeaderHeight();
  // A header hidden under a full-screen layer reports no height; keeping the last one leaves the
  // transcript where it was, so closing the layer lands back on the same content.
  const [headerHeight, setHeaderHeight] = useState(reportedHeaderHeight);
  if (reportedHeaderHeight > 0 && reportedHeaderHeight !== headerHeight) {
    setHeaderHeight(reportedHeaderHeight);
  }
  const { top } = useSafeAreaInsets();
  const contentTopInset = resolveHeaderContentInset(headerHeight, top + mainHeaderRowHeight);
  const { isCoverVisible, markListLoaded } = useMessageListInitialRenderGate({
    renderGateKey: list.dataKey,
    requiresInitialHistoryLayout: requiresInitialLayout,
  });
  return (
    <View className="min-h-0 flex-1 bg-chat-background">
      <ChatOlderMessagesIndicator isLoading={isLoadingMore} />
      <ChatShareDragSelection
        listRef={listRef}
        topInset={contentTopInset}
        bottomInset={isSelecting ? selectionFooterHeight : 0}
      >
        <MessageList
          {...list}
          ref={listRef}
          bottomAccessoryHeight={bottomAccessoryHeight}
          contentTopInset={contentTopInset}
          rowInsets={isSelecting ? SELECTION_ROW_INSETS : undefined}
          onReady={() => {
            markListLoaded();
            onReady?.();
          }}
        />
      </ChatShareDragSelection>
      <ChatInitialRenderCover isVisible={isCoverVisible} />
    </View>
  );
}

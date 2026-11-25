import { useComposerExpansion } from '@cherrystudio/ui/components';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { type ComponentProps, useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mainHeaderRowHeight } from '@/frontend/appShell/header';
import { resolveHeaderContentInset } from '@/frontend/appShell/navigation';
import { MessageList, type MessageListHandle } from '@/frontend/components/Message';

import { ChatShareDragSelection } from '../../share/ChatShareDragSelection';
import { useChatShareFooterHeight, useIsChatShareSelecting } from '../../share/chatShareSelection';
import type { ChatTurnNavigator } from './chatTurns';
import { ChatInitialRenderCover } from './components/ChatInitialRenderCover';
import { ChatOlderMessagesIndicator } from './components/ChatOlderMessagesIndicator';
import { ChatTurnDirectory, MAX_TRIGGER_TICKS } from './components/ChatTurnDirectory';
import { useMessageListInitialRenderGate } from './hooks/useMessageListInitialRenderGate';

type ChatTranscriptProps = Omit<
  ComponentProps<typeof MessageList>,
  'bottomAccessoryHeight' | 'contentTopInset' | 'visualBottomAccessoryHeight'
> & {
  hasOlderMessages?: boolean;
  hiddenUserTurnCount?: number;
  isLoadingMore: boolean;
  requiresInitialLayout: boolean;
  turnNavigator?: ChatTurnNavigator;
};

const SELECTION_ROW_INSETS = { horizontal: 8, user: 0, assistant: 0 };

export function ChatTranscript({
  hasOlderMessages = false,
  hiddenUserTurnCount = 0,
  requiresInitialLayout,
  isLoadingMore,
  onReady,
  turnNavigator,
  ...list
}: ChatTranscriptProps) {
  const composer = useComposerExpansion();
  const listRef = useRef<MessageListHandle>(null);
  const scrollToMessage = useCallback(
    (messageId: string) => listRef.current?.scrollToMessage(messageId) ?? Promise.resolve(false),
    [],
  );
  const isSelecting = useIsChatShareSelecting();
  const { height: selectionFooterHeight } = useChatShareFooterHeight();
  const bottomAccessoryHeight = useDerivedValue(() =>
    isSelecting ? selectionFooterHeight : (composer?.meta.contentInset.get() ?? 0),
  );
  const liveDockHeight = composer?.meta.compactDockHeight;
  const dockLift = composer?.meta.dockLift;
  const visualBottomAccessoryHeight = useDerivedValue(
    () => (liveDockHeight?.get() ?? 0) + (dockLift?.get() ?? 0),
  );
  const scrollProgress = useSharedValue(1);
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
  let userTurnCount = hiddenUserTurnCount;
  for (const message of list.messages) {
    if (message.role === 'user') userTurnCount += 1;
  }
  const showTurnDirectory = Boolean(
    turnNavigator &&
    (userTurnCount >= 2 || hasOlderMessages || list.hasNewerMessages) &&
    !isSelecting &&
    !isCoverVisible &&
    !composer?.state.isPresented,
  );
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
          visualBottomAccessoryHeight={
            composer && !isSelecting ? visualBottomAccessoryHeight : undefined
          }
          rowInsets={isSelecting ? SELECTION_ROW_INSETS : undefined}
          scrollProgress={scrollProgress}
          onReady={() => {
            markListLoaded();
            onReady?.();
          }}
        />
      </ChatShareDragSelection>
      {showTurnDirectory && turnNavigator ? (
        <ChatTurnDirectory
          key={turnNavigator.scope}
          bottomAccessoryHeight={liveDockHeight ?? bottomAccessoryHeight}
          contentBottomInset={list.contentBottomInset}
          contentTopInset={contentTopInset}
          dockLift={dockLift}
          keyboardOffset={list.keyboardOffset}
          navigator={turnNavigator}
          scrollProgress={scrollProgress}
          scrollToMessage={scrollToMessage}
          turnCount={hasOlderMessages || list.hasNewerMessages ? MAX_TRIGGER_TICKS : userTurnCount}
        />
      ) : null}
      <ChatInitialRenderCover isVisible={isCoverVisible} />
    </View>
  );
}

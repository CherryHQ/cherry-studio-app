import { useHeaderHeight } from 'expo-router/react-navigation';
import { type ComponentProps, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mainHeaderRowHeight } from '@/frontend/appShell/header';
import { resolveHeaderContentInset } from '@/frontend/appShell/navigation';
import { MessageList } from '@/frontend/components/Message';

import { ChatInitialRenderCover } from './components/ChatInitialRenderCover';
import { ChatOlderMessagesIndicator } from './components/ChatOlderMessagesIndicator';
import { useMessageListInitialRenderGate } from './hooks/useMessageListInitialRenderGate';

type ChatTranscriptProps = Omit<ComponentProps<typeof MessageList>, 'contentTopInset'> & {
  requiresInitialLayout: boolean;
  isLoadingMore: boolean;
};

export function ChatTranscript({
  requiresInitialLayout,
  isLoadingMore,
  onReady,
  ...list
}: ChatTranscriptProps) {
  const reportedHeaderHeight = useHeaderHeight();
  // A header hidden under a full-screen layer reports no height; keeping the last one leaves the
  // transcript where it was, so closing the layer lands back on the same content.
  const [headerHeight, setHeaderHeight] = useState(reportedHeaderHeight);
  if (reportedHeaderHeight > 0 && reportedHeaderHeight !== headerHeight) {
    setHeaderHeight(reportedHeaderHeight);
  }
  const { top } = useSafeAreaInsets();
  const { isCoverVisible, markListLoaded } = useMessageListInitialRenderGate({
    renderGateKey: list.dataKey,
    requiresInitialHistoryLayout: requiresInitialLayout,
  });
  return (
    <View className="min-h-0 flex-1 bg-chat-background">
      <ChatOlderMessagesIndicator isLoading={isLoadingMore} />
      <MessageList
        {...list}
        contentTopInset={resolveHeaderContentInset(headerHeight, top + mainHeaderRowHeight)}
        onReady={() => {
          markListLoaded();
          onReady?.();
        }}
      />
      <ChatInitialRenderCover isVisible={isCoverVisible} />
    </View>
  );
}

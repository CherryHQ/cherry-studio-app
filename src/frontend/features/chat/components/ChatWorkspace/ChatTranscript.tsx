import { useHeaderHeight } from 'expo-router/react-navigation';
import { type ComponentProps } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mainHeaderRowHeight } from '@/frontend/appShell/header';
import { resolveHeaderContentInset } from '@/frontend/appShell/navigation';
import { MessageList } from '@/frontend/components/Message';

import { ChatInitialRenderCover } from './components/ChatInitialRenderCover';
import { ChatOlderMessagesIndicator } from './components/ChatOlderMessagesIndicator';
import { useMessageListInitialRenderGate } from './hooks/useMessageListInitialRenderGate';

type ChatTranscriptProps = Omit<
  ComponentProps<typeof MessageList>,
  'contentTopInset' | 'onReady'
> & { requiresInitialLayout: boolean; isLoadingMore: boolean };

export function ChatTranscript({
  requiresInitialLayout,
  isLoadingMore,
  ...list
}: ChatTranscriptProps) {
  const headerHeight = useHeaderHeight();
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
        onReady={markListLoaded}
      />
      <ChatInitialRenderCover isVisible={isCoverVisible} />
    </View>
  );
}

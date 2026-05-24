import type { LegendListRef } from '@legendapp/list/react-native';
import { useRef } from 'react';

import type { MessagesViewModel } from '@/hooks/chat';

import { ChatInitialRenderCover } from './components/ChatInitialRenderCover';
import { ChatMessageList } from './components/ChatMessageList';
import { ChatOlderMessagesIndicator } from './components/ChatOlderMessagesIndicator';
import { ChatWorkspaceFrame } from './components/ChatWorkspaceFrame';
import { FloatingChatInput } from './components/FloatingChatInput';
import { useFloatingChatInputLayout } from './hooks/useFloatingChatInputLayout';
import { useMessageListInitialRenderGate } from './hooks/useMessageListInitialRenderGate';

type ChatWorkspaceProps = {
  messageWindow: Pick<
    MessagesViewModel,
    'isLoadingInitial' | 'isLoadingOlder' | 'loadOlder' | 'messages' | 'prefetchOlder'
  >;
  renderGateKey: string;
};

export function ChatWorkspace({ messageWindow, renderGateKey }: ChatWorkspaceProps) {
  const { isLoadingInitial, isLoadingOlder, loadOlder, messages } = messageWindow;
  const listRef = useRef<LegendListRef | null>(null);
  const { isCoverVisible, listRenderKey, markListLoaded } = useMessageListInitialRenderGate({
    hasMessages: messages.length > 0,
    isLoadingInitial,
    renderGateKey,
  });
  const { contentBottomInset, handleInputHeightChange } = useFloatingChatInputLayout();

  return (
    <ChatWorkspaceFrame>
      <ChatOlderMessagesIndicator isLoading={isLoadingOlder} />
      <ChatMessageList
        key={listRenderKey}
        contentBottomInset={contentBottomInset}
        listRef={listRef}
        messages={messages}
        onLoad={markListLoaded}
        onLoadOlder={loadOlder}
        onPrefetchOlder={messageWindow.prefetchOlder}
      />
      <FloatingChatInput onHeightChange={handleInputHeightChange} />
      <ChatInitialRenderCover isVisible={isCoverVisible} />
    </ChatWorkspaceFrame>
  );
}

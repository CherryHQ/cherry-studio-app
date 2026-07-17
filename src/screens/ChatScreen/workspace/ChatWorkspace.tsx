import type { LegendListRef } from '@legendapp/list/react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useRef } from 'react';
import { useSharedValue } from 'react-native-reanimated';

import { isIOS } from '@/config/constants';
import type { Message } from '@/data/types/message';
import type { MessagesViewModel } from '@/hooks/chat';

import { mergeMessagesWithOverlay, useChatRuntimeTopic } from '../runtime';
import { ChatComposer } from './components/ChatComposer';
import { ChatInitialRenderCover } from './components/ChatInitialRenderCover';
import { ChatMessageList } from './components/ChatMessageList';
import { ChatOlderMessagesIndicator } from './components/ChatOlderMessagesIndicator';
import { ChatWorkspaceFrame } from './components/ChatWorkspaceFrame';
import { ScrollToBottomButton } from './components/ScrollToBottomButton';
import { useFloatingChatInputLayout } from './hooks/useFloatingChatInputLayout';
import { useMessageListInitialRenderGate } from './hooks/useMessageListInitialRenderGate';

// 「滚动到底部」按钮悬浮在输入框上方的间距：按输入框实测高度定位，
// 不用含 safe area 的 contentBottomInset，避免出现需要硬抵消的 magic 偏移。
const SCROLL_BUTTON_GAP_ABOVE_INPUT = 5;

type ChatWorkspaceProps = {
  messageWindow: Pick<
    MessagesViewModel,
    'isLoadingInitial' | 'isLoadingOlder' | 'loadOlder' | 'messages' | 'prefetchOlder'
  >;
  renderGateKey: string;
  topicId: string;
};

export function ChatWorkspace({ messageWindow, renderGateKey, topicId }: ChatWorkspaceProps) {
  const { isLoadingInitial, isLoadingOlder, loadOlder, messages } = messageWindow;
  const chatRuntime = useChatRuntimeTopic(topicId);
  const headerHeight = useHeaderHeight();
  const listRef = useRef<LegendListRef | null>(null);
  const isAtBottom = useSharedValue(true);
  const handleScrollToEnd = useCallback(() => {
    void listRef.current?.scrollToEnd({ animated: true });
  }, []);
  const messagesWithUser = mergeMessagesWithOverlay(messages, chatRuntime.pendingUserMessage);
  const visibleMessages = mergeMessagesWithOverlay(messagesWithUser, chatRuntime.overlayMessage);
  const anchorIndex = getAnchoredUserMessageIndex(visibleMessages);
  const { isCoverVisible, listRenderKey, markListLoaded } = useMessageListInitialRenderGate({
    hasMessages: visibleMessages.length > 0,
    isLoadingInitial,
    renderGateKey,
  });
  const contentTopInset = isIOS ? headerHeight : 0;
  const { contentBottomInset, handleInputHeightChange, inputHeightShared } =
    useFloatingChatInputLayout();

  return (
    <ChatWorkspaceFrame>
      <ChatOlderMessagesIndicator isLoading={isLoadingOlder} />
      <ChatMessageList
        key={listRenderKey}
        anchorIndex={anchorIndex}
        contentBottomInset={contentBottomInset}
        contentTopInset={contentTopInset}
        isAtBottom={isAtBottom}
        listRef={listRef}
        messages={visibleMessages}
        onLoadOlder={loadOlder}
        onPrefetchOlder={messageWindow.prefetchOlder}
        onReady={markListLoaded}
      />
      <ChatComposer
        inputHeight={inputHeightShared}
        onHeightChange={handleInputHeightChange}
        topicId={topicId}
      />
      <ScrollToBottomButton
        gap={SCROLL_BUTTON_GAP_ABOVE_INPUT}
        inputHeight={inputHeightShared}
        isAtBottom={isAtBottom}
        onPress={handleScrollToEnd}
      />
      <ChatInitialRenderCover bottomInset={contentBottomInset} isVisible={isCoverVisible} />
    </ChatWorkspaceFrame>
  );
}

// 返回应锚定到顶部的用户消息下标：取最后一条「其后仍有助手消息」的用户消息。
// 末尾若是孤立的用户消息（尚无回复）则返回 -1，避免在底部撑出整屏空白。
function getAnchoredUserMessageIndex(messages: readonly Message[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role !== 'user') {
      continue;
    }

    return index < messages.length - 1 ? index : -1;
  }

  return -1;
}

import type { Message } from '@cherrystudio/universal/data/types/message';
import { useKeyboardChatComposerInset } from '@legendapp/list/keyboard';
import type { LegendListRef } from '@legendapp/list/react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useToast } from 'heroui-native/toast';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import type { MessagesViewModel } from '@/frontend/hooks/chat';
import { isIOS } from '@/frontend/utils/constants';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { ToolApprovalSheet } from '../approval/ToolApprovalSheet';
import { MessageSlideInProvider } from '../messageItem';
import { useChat, useChatTopic } from '../runtime/ChatProvider';
import {
  getPendingToolApprovals,
  mergeMessagesWithOverlay,
} from '../runtime/chatRuntimeProjection';
import { ChatComposer } from './components/ChatComposer';
import { ChatInitialRenderCover } from './components/ChatInitialRenderCover';
import { ChatMessageList } from './components/ChatMessageList';
import { ChatOlderMessagesIndicator } from './components/ChatOlderMessagesIndicator';
import { ChatWorkspaceFrame } from './components/ChatWorkspaceFrame';
import { ScrollToBottomButton } from './components/ScrollToBottomButton';
import { useFloatingChatInputLayout } from './hooks/useFloatingChatInputLayout';
import {
  shouldWaitForInitialHistoryLayout,
  useMessageListInitialRenderGate,
} from './hooks/useMessageListInitialRenderGate';

// 「滚动到底部」按钮悬浮在输入框上方的间距：按输入框实测高度定位，
// 不用含 safe area 的 contentBottomInset，避免出现需要硬抵消的 magic 偏移。
const SCROLL_BUTTON_GAP_ABOVE_INPUT = 5;

const logger = loggerService.withContext('ChatWorkspace');
// 诊断埋点：冷/暖首次进入 topic 的数据加载 + 遮罩可见性时序。`[GATE]` 前缀。
const gateLog = loggerService.withContext('ChatGate');

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
  const chatTopic = useChatTopic(topicId);
  const headerHeight = useHeaderHeight();
  const { t } = useTranslation();
  const { toast } = useToast();
  const listRef = useRef<LegendListRef | null>(null);
  const composerRef = useRef<View | null>(null);
  const isAtBottom = useSharedValue(true);
  const handleScrollToEnd = useCallback(() => {
    void listRef.current?.scrollToEnd({ animated: true });
  }, []);
  const messagesWithUser = mergeMessagesWithOverlay(messages, chatTopic.pendingUserMessage);
  const visibleMessages = mergeMessagesWithOverlay(messagesWithUser, chatTopic.overlayMessage);
  const anchorIndex = getAnchoredUserMessageIndex(visibleMessages);
  const chat = useChat();
  // 待审批检测以活动 tip 的 parts 为准，因此杀 app 重进后 sheet 也会自动恢复。
  const pendingApprovals = getPendingToolApprovals(visibleMessages);
  const isApprovalSheetOpen = pendingApprovals.length > 0 && chatTopic.status !== 'streaming';
  const handleApprovalRespond = useCallback(
    async (input: { approvalId: string; approved: boolean; messageId: string }) => {
      try {
        await chat.respondToolApproval({ ...input, topicId });
      } catch (error) {
        logger.error('Tool approval response failed', error as Error);
        toast.show({ label: t('chat.tool.approval.failed'), variant: 'danger' });
      }
    },
    [chat, t, toast, topicId],
  );
  const requiresInitialHistoryLayout = shouldWaitForInitialHistoryLayout({
    hasHistoryBeforePendingTurn: chatTopic.hasHistoryBeforePendingTurn,
    isLoadingInitial,
    messageCount: messages.length,
  });
  const { isCoverVisible, listRenderKey, markListLoaded } = useMessageListInitialRenderGate({
    renderGateKey,
    requiresInitialHistoryLayout,
  });
  const contentTopInset = isIOS ? headerHeight : 0;
  const { contentBottomInset, handleInputHeightChange, inputHeightShared, keyboardOffset } =
    useFloatingChatInputLayout();
  const { contentInsetEndAdjustment, onComposerLayout } = useKeyboardChatComposerInset(
    listRef,
    composerRef,
  );

  // 冷/暖进入差异取证：记录 数据加载态 + 遮罩可见性 + 可见消息数 + 锚点 的每次变化。
  useEffect(() => {
    gateLog.debug('[GATE] state', {
      isLoadingInitial,
      isCoverVisible,
      len: visibleMessages.length,
      anchorIndex,
      t: Date.now(),
    });
  }, [isLoadingInitial, isCoverVisible, visibleMessages.length, anchorIndex]);

  return (
    <ChatWorkspaceFrame>
      <ChatOlderMessagesIndicator isLoading={isLoadingOlder} />
      <MessageSlideInProvider slideInMessageId={chatTopic.pendingUserMessage?.id}>
        <ChatMessageList
          key={listRenderKey}
          anchorIndex={anchorIndex}
          contentBottomInset={contentBottomInset}
          contentInsetEndAdjustment={contentInsetEndAdjustment}
          contentTopInset={contentTopInset}
          isAtBottom={isAtBottom}
          keyboardOffset={keyboardOffset}
          listRef={listRef}
          messages={visibleMessages}
          onLoadOlder={loadOlder}
          onPrefetchOlder={messageWindow.prefetchOlder}
          onReady={markListLoaded}
          pendingUserMessageId={chatTopic.pendingUserMessage?.id}
        />
      </MessageSlideInProvider>
      <ChatComposer
        composerRef={composerRef}
        dismissKeyboardOnSend={false}
        onComposerLayout={onComposerLayout}
        onHeightChange={handleInputHeightChange}
        topicId={topicId}
      />
      <ScrollToBottomButton
        gap={SCROLL_BUTTON_GAP_ABOVE_INPUT}
        inputHeight={inputHeightShared}
        isAtBottom={isAtBottom}
        onPress={handleScrollToEnd}
      />
      <ChatInitialRenderCover isVisible={isCoverVisible} />
      <ToolApprovalSheet
        approvals={pendingApprovals}
        isOpen={isApprovalSheetOpen}
        onRespond={handleApprovalRespond}
      />
    </ChatWorkspaceFrame>
  );
}

// 返回应锚定到顶部的用户消息下标：取最后一条用户消息（含刚发送、尚无回复的孤立消息）。
//
// 「发送即锚定」——对齐 MargeloChat 博客的做法：消息一发出就锚定到顶部、下方由
// anchoredEndSpace 预留空白，助手回复流进空白里，全程只发生一次确定性的钉顶滚动。
// 早先版本对「末尾孤立用户消息」返回 -1（延迟到回复到达才锚定），会导致回复到达时
// 才迟迟触发 scrollToEnd，与 anchoredEndSpace 的尾部空白测量竞争而「过冲→回弹」。
// 预留的尾部空白会随回复增高自动收缩至 0，不会长期在底部留整屏空白。
function getAnchoredUserMessageIndex(messages: readonly Message[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user') {
      return index;
    }
  }

  return -1;
}

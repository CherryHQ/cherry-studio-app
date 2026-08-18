import { useAlert } from '@cherrystudio/ui/components';
import type { Message } from '@cherrystudio/universal/data/types/message';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import {
  MessageList,
  type MessagePresentationItem,
} from '@/frontend/components/messagePresentation';
import { resolveHeaderContentInset } from '@/frontend/components/navigation/headerContentInset/headerContentInset';
import type { MessagesViewModel } from '@/frontend/hooks/chat';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { ToolApprovalSheet } from '../approval/ToolApprovalSheet';
import { useChat, useChatTopic } from '../runtime/ChatProvider';
import {
  getPendingToolApprovals,
  mergeMessagesWithOverlay,
} from '../runtime/chatRuntimeProjection';
import { ChatInitialRenderCover } from './components/ChatInitialRenderCover';
import { ChatMessage } from './components/ChatMessage';
import { ChatOlderMessagesIndicator } from './components/ChatOlderMessagesIndicator';
import {
  shouldWaitForInitialHistoryLayout,
  useMessageListInitialRenderGate,
} from './hooks/useMessageListInitialRenderGate';

const logger = loggerService.withContext('ChatWorkspace');
// 诊断埋点：冷/暖首次进入 topic 的数据加载 + 遮罩可见性时序。`[GATE]` 前缀。
const gateLog = loggerService.withContext('ChatGate');

function renderChatMessage(message: MessagePresentationItem) {
  return <ChatMessage message={message} />;
}

type ChatWorkspaceProps = {
  /** 输入框实测高度，用于定位悬浮按钮；预览态没有输入框，留空即可。 */
  bottomAccessoryHeight?: SharedValue<number>;
  contentBottomInset: number;
  keyboardOffset: number;
  messageWindow: Pick<
    MessagesViewModel,
    'isLoadingInitial' | 'isLoadingOlder' | 'loadOlder' | 'messages'
  >;
  renderGateKey: string;
  topicId: string;
};

export function ChatWorkspace({
  bottomAccessoryHeight,
  contentBottomInset,
  keyboardOffset,
  messageWindow,
  renderGateKey,
  topicId,
}: ChatWorkspaceProps) {
  const { isLoadingInitial, isLoadingOlder, loadOlder, messages } = messageWindow;
  const chatTopic = useChatTopic(topicId);
  const headerHeight = useHeaderHeight();
  const { t } = useTranslation();
  const { alert } = useAlert();
  const messagesWithUser = mergeMessagesWithOverlay(messages, chatTopic.pendingUserMessage);
  const visibleMessages = mergeMessagesWithOverlay(messagesWithUser, chatTopic.overlayMessage);
  const presentationMessages = useMemo(
    () =>
      visibleMessages.filter(
        (message): message is Message & MessagePresentationItem =>
          message.role === 'user' || message.role === 'assistant',
      ),
    [visibleMessages],
  );
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
        alert.show({ title: t('chat.tool.approval.failed') });
      }
    },
    [alert, chat, t, topicId],
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
  const contentTopInset = resolveHeaderContentInset(headerHeight);

  // 冷/暖进入差异取证：记录 数据加载态 + 遮罩可见性 + 可见消息数 + 锚点 的每次变化。
  useEffect(() => {
    gateLog.debug('[GATE] state', {
      isLoadingInitial,
      isCoverVisible,
      len: presentationMessages.length,
      t: Date.now(),
    });
  }, [isLoadingInitial, isCoverVisible, presentationMessages.length]);

  return (
    <View className="flex-1 bg-background">
      <ChatOlderMessagesIndicator isLoading={isLoadingOlder} />
      <MessageList
        key={listRenderKey}
        bottomAccessoryHeight={bottomAccessoryHeight}
        contentBottomInset={contentBottomInset}
        contentTopInset={contentTopInset}
        enteringMessageId={chatTopic.pendingUserMessage?.id}
        keyboardOffset={keyboardOffset}
        messages={presentationMessages}
        onLoadOlder={loadOlder}
        onReady={markListLoaded}
        renderMessage={renderChatMessage}
      />
      <ChatInitialRenderCover isVisible={isCoverVisible} />
      <ToolApprovalSheet
        approvals={pendingApprovals}
        isOpen={isApprovalSheetOpen}
        onRespond={handleApprovalRespond}
      />
    </View>
  );
}

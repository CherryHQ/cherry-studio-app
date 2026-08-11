import type { Message } from '@cherrystudio/universal/data/types/message';
import * as Clipboard from 'expo-clipboard';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAlert } from '@/frontend/components/AlertProvider';
import { useComposerDockLayout } from '@/frontend/components/composer';
import {
  MessageList,
  type AssistantMessageActions,
  type MessagePresentationItem,
} from '@/frontend/components/messagePresentation';
import type { MessagesViewModel } from '@/frontend/hooks/chat';
import { isIOS } from '@/frontend/utils/constants';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { ToolApprovalSheet } from '../approval/ToolApprovalSheet';
import { useChat, useChatTopic } from '../runtime/ChatProvider';
import {
  getPendingToolApprovals,
  mergeMessagesWithOverlay,
} from '../runtime/chatRuntimeProjection';
import { ChatComposer } from './components/ChatComposer';
import { ChatInitialRenderCover } from './components/ChatInitialRenderCover';
import { ChatOlderMessagesIndicator } from './components/ChatOlderMessagesIndicator';
import {
  shouldWaitForInitialHistoryLayout,
  useMessageListInitialRenderGate,
} from './hooks/useMessageListInitialRenderGate';

const logger = loggerService.withContext('ChatWorkspace');
const COPIED_FEEDBACK_DURATION_MS = 1_200;
// 诊断埋点：冷/暖首次进入 topic 的数据加载 + 遮罩可见性时序。`[GATE]` 前缀。
const gateLog = loggerService.withContext('ChatGate');

type ChatWorkspaceProps = {
  isPreview: boolean;
  messageWindow: Pick<
    MessagesViewModel,
    'isLoadingInitial' | 'isLoadingOlder' | 'loadOlder' | 'messages'
  >;
  renderGateKey: string;
  topicId: string;
};

export function ChatWorkspace({
  isPreview,
  messageWindow,
  renderGateKey,
  topicId,
}: ChatWorkspaceProps) {
  const { isLoadingInitial, isLoadingOlder, loadOlder, messages } = messageWindow;
  const chatTopic = useChatTopic(topicId);
  const regenerateAssistantMessage = chatTopic.regenerate;
  const headerHeight = useHeaderHeight();
  const { t } = useTranslation();
  const { alert } = useAlert();
  const [copiedMessageId, setCopiedMessageId] = useState<string>();
  const copiedFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const handleCopyAssistantMessage = useCallback(
    ({ messageId, text }: { messageId: string; text: string }) => {
      void Clipboard.setStringAsync(text)
        .then(() => {
          if (copiedFeedbackTimerRef.current !== null) {
            clearTimeout(copiedFeedbackTimerRef.current);
          }

          setCopiedMessageId(messageId);
          copiedFeedbackTimerRef.current = setTimeout(() => {
            copiedFeedbackTimerRef.current = null;
            setCopiedMessageId(undefined);
          }, COPIED_FEEDBACK_DURATION_MS);
        })
        .catch((error) => {
          logger.error('Copy assistant message failed', error as Error);
          alert.show({ title: t('chat.messageActions.copyFailed') });
        });
    },
    [alert, t],
  );
  const handleRegenerateAssistantMessage = useCallback(
    (messageId: string) => {
      void regenerateAssistantMessage({ messageId }).catch((error) => {
        logger.error('Regenerate assistant message failed', error as Error);
        alert.show({ title: t('chat.messageActions.regenerateFailed') });
      });
    },
    [alert, regenerateAssistantMessage, t],
  );
  const assistantActions = useMemo<AssistantMessageActions | undefined>(
    () =>
      isPreview
        ? undefined
        : {
            copiedMessageId,
            isRegenerateDisabled: chatTopic.isBusy,
            onCopy: handleCopyAssistantMessage,
            onRegenerate: handleRegenerateAssistantMessage,
          },
    [
      chatTopic.isBusy,
      copiedMessageId,
      handleCopyAssistantMessage,
      handleRegenerateAssistantMessage,
      isPreview,
    ],
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
  const composerDockLayout = useComposerDockLayout();
  const contentBottomInset = isPreview ? 12 : composerDockLayout.contentBottomInset;
  const keyboardOffset = isPreview ? 0 : composerDockLayout.keyboardOffset;

  useEffect(
    () => () => {
      if (copiedFeedbackTimerRef.current !== null) {
        clearTimeout(copiedFeedbackTimerRef.current);
      }
    },
    [],
  );

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
        assistantActions={assistantActions}
        key={listRenderKey}
        bottomAccessoryHeight={isPreview ? undefined : composerDockLayout.inputHeightShared}
        contentBottomInset={contentBottomInset}
        contentTopInset={contentTopInset}
        enteringMessageId={chatTopic.pendingUserMessage?.id}
        keyboardOffset={keyboardOffset}
        messages={presentationMessages}
        onLoadOlder={loadOlder}
        onReady={markListLoaded}
      />
      {isPreview ? null : (
        <ChatComposer
          dismissKeyboardOnSend={false}
          onHeightChange={composerDockLayout.handleInputHeightChange}
          topicId={topicId}
        />
      )}
      <ChatInitialRenderCover isVisible={isCoverVisible} />
      <ToolApprovalSheet
        approvals={pendingApprovals}
        isOpen={isApprovalSheetOpen}
        onRespond={handleApprovalRespond}
      />
    </View>
  );
}

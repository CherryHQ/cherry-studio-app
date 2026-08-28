import { ContentState, useAlert } from '@cherrystudio/ui/components';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { MessageList, type MessageListItem } from '@/frontend/components/messages';
import { resolveHeaderContentInset } from '@/frontend/components/navigation';
import type { AgentMessageHistoryWindow } from '@/frontend/hooks/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { type PendingToolApproval, ToolApprovalSheet } from '../approval/ToolApprovalSheet';
import {
  mergeAgentMessageViews,
  toAgentMessageListItems,
  useAgentChatActions,
  useAgentChatSession,
} from '../runtime';
import { ChatInitialRenderCover } from './components/ChatInitialRenderCover';
import { ChatMessage } from './components/ChatMessage';
import { ChatOlderMessagesIndicator } from './components/ChatOlderMessagesIndicator';
import { AssistantMessageActionsProvider } from './context/AssistantMessageActionsProvider';
import {
  shouldWaitForInitialHistoryLayout,
  useMessageListInitialRenderGate,
} from './hooks/useMessageListInitialRenderGate';

const logger = loggerService.withContext('AgentChatWorkspace');
const gateLog = loggerService.withContext('AgentChatGate');

type ChatWorkspaceProps = {
  assistantAvatarUri?: null | string;
  assistantModelName?: null | string;
  assistantName?: string;
  isAssistantToolbarEnabled: boolean;
  bottomAccessoryHeight?: SharedValue<number>;
  contentBottomInset: number;
  keyboardOffset: number;
  messageWindow: AgentMessageHistoryWindow;
  renderGateKey: string;
  sessionId: string;
};

export function ChatWorkspace({
  assistantAvatarUri,
  assistantModelName,
  assistantName,
  bottomAccessoryHeight,
  contentBottomInset,
  keyboardOffset,
  messageWindow,
  renderGateKey,
  isAssistantToolbarEnabled,
  sessionId,
}: ChatWorkspaceProps) {
  const { error, isLoadingInitial, isLoadingOlder, loadOlder, messages, retry } = messageWindow;
  const live = useAgentChatSession(sessionId);
  const client = useAgentChatActions();
  const headerHeight = useHeaderHeight();
  const { t } = useTranslation();
  const { alert } = useAlert();
  const mergedMessages = useMemo(
    () => mergeAgentMessageViews(messages, live.liveMessages),
    [live.liveMessages, messages],
  );
  const listMessages = useMemo(() => toAgentMessageListItems(mergedMessages), [mergedMessages]);
  const assistantPresentation = useMemo(
    () => ({
      avatarUri: assistantAvatarUri,
      modelName: assistantModelName,
      name: assistantName?.trim() || t('chat.backgroundReply.assistant'),
    }),
    [assistantAvatarUri, assistantModelName, assistantName, t],
  );
  const renderChatMessage = useCallback(
    (message: MessageListItem) => (
      <ChatMessage assistantPresentation={assistantPresentation} message={message} />
    ),
    [assistantPresentation],
  );
  const pendingApprovals = useMemo<readonly PendingToolApproval[]>(
    () =>
      live.pendingApprovals.map((approval) => ({
        approvalId: approval.id,
        input: approval.input,
        messageId: live.activeTurn?.assistantMessageId ?? '',
        toolCallId: approval.toolCallId,
        displayName: approval.displayName,
      })),
    [live.activeTurn?.assistantMessageId, live.pendingApprovals],
  );
  const handleApprovalRespond = useCallback(
    async (input: { approvalId: string; approved: boolean }) => {
      try {
        await client.respondApproval(
          sessionId,
          input.approvalId,
          input.approved ? 'approve' : 'deny',
        );
      } catch (approvalError) {
        logger.error('Tool approval response failed', approvalError as Error);
        alert.show({ title: t('chat.tool.approval.failed') });
      }
    },
    [alert, client, sessionId, t],
  );
  const requiresInitialHistoryLayout = shouldWaitForInitialHistoryLayout({
    hasHistoryBeforePendingTurn: undefined,
    isLoadingInitial,
    messageCount: messages.length,
  });
  const { isCoverVisible, listRenderKey, markListLoaded } = useMessageListInitialRenderGate({
    renderGateKey,
    requiresInitialHistoryLayout,
  });
  const contentTopInset = resolveHeaderContentInset(headerHeight);

  useEffect(() => {
    gateLog.debug('[GATE] state', {
      isLoadingInitial,
      isCoverVisible,
      len: listMessages.length,
      t: Date.now(),
    });
  }, [isLoadingInitial, isCoverVisible, listMessages.length]);

  if (error && !isLoadingInitial && listMessages.length === 0) {
    return (
      <ContentState.Error
        className="flex-1 px-8 py-16"
        primaryAction={{ children: t('agent.actions.retry'), onPress: () => void retry() }}
        title={t('chat.history.loadFailed')}
      />
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ChatOlderMessagesIndicator isLoading={isLoadingOlder} />
      <AssistantMessageActionsProvider
        key={sessionId}
        isAssistantToolbarEnabled={isAssistantToolbarEnabled}
      >
        <MessageList
          key={listRenderKey}
          bottomAccessoryHeight={bottomAccessoryHeight}
          contentBottomInset={contentBottomInset}
          contentTopInset={contentTopInset}
          enteringMessageId={live.enteringUserMessageId}
          extraData={assistantPresentation}
          keyboardOffset={keyboardOffset}
          messages={listMessages}
          onLoadOlder={loadOlder}
          onReady={markListLoaded}
          renderMessage={renderChatMessage}
        />
      </AssistantMessageActionsProvider>
      <ChatInitialRenderCover isVisible={isCoverVisible} />
      <ToolApprovalSheet
        approvals={pendingApprovals}
        isOpen={pendingApprovals.length > 0}
        onRespond={handleApprovalRespond}
      />
    </View>
  );
}

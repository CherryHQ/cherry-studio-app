import { ContentState, useToast } from '@cherrystudio/ui/components';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { resolveHeaderContentInset } from '@/frontend/appShell/navigation';
import { MessageList, type MessageListItem } from '@/frontend/components/Message';
import type { AgentMessageHistoryWindow } from '@/frontend/hooks/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  createAgentMessageListProjectionCache,
  mergeAgentMessageViews,
  toAgentMessageListItems,
  useAgentChatActions,
  useAgentChatSession,
} from '../../runtime';
import { type PendingToolApproval, ToolApprovalSheet } from '../ToolApprovalSheet';
import { ChatForkOriginDivider } from './components/ChatForkOriginDivider';
import { ChatInitialRenderCover } from './components/ChatInitialRenderCover';
import { ChatMessage } from './components/ChatMessage';
import { ChatOlderMessagesIndicator } from './components/ChatOlderMessagesIndicator';
import { AssistantMessageActionsProvider } from './context/AssistantMessageActionsProvider';
import {
  shouldWaitForInitialHistoryLayout,
  useMessageListInitialRenderGate,
} from './hooks/useMessageListInitialRenderGate';

const logger = loggerService.withContext('AgentChatWorkspace');

type ChatWorkspaceProps = {
  assistantAvatarUri?: null | string;
  assistantName?: string;
  isAssistantToolbarEnabled: boolean;
  contentBottomInset: number;
  /** Copied message inside this Session that closes the inherited prefix. */
  forkBoundaryMessageId?: string;
  /** Direct source Session named by the fork-origin divider. */
  forkedFromSessionId?: string;
  keyboardOffset: number;
  messageWindow: AgentMessageHistoryWindow;
  sessionId: string;
};

export function ChatWorkspace({
  assistantAvatarUri,
  assistantName,
  contentBottomInset,
  forkBoundaryMessageId,
  forkedFromSessionId,
  keyboardOffset,
  messageWindow,
  isAssistantToolbarEnabled,
  sessionId,
}: ChatWorkspaceProps) {
  const { error, isLoadingInitial, isLoadingOlder, loadOlder, messages, retry } = messageWindow;
  const live = useAgentChatSession(sessionId);
  const client = useAgentChatActions();
  const headerHeight = useHeaderHeight();
  const { t } = useTranslation();
  const { toast } = useToast();
  useEffect(() => {
    client.reconcilePersistedMessages(sessionId, messages);
  }, [client, messages, sessionId]);
  const mergedMessages = useMemo(
    () => mergeAgentMessageViews(messages, live.liveMessages),
    [live.liveMessages, messages],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionId keys the cache lifetime, not its contents
  const projectionCache = useMemo(() => createAgentMessageListProjectionCache(), [sessionId]);
  const projectedMessages = useMemo(
    () => toAgentMessageListItems(mergedMessages, projectionCache),
    [mergedMessages, projectionCache],
  );
  const listMessages = useMemo(() => {
    if (!forkBoundaryMessageId || !forkedFromSessionId) {
      return projectedMessages;
    }
    const boundaryIndex = projectedMessages.findIndex(
      (message) => message.id === forkBoundaryMessageId,
    );
    if (boundaryIndex < 0) {
      // Pagination has not loaded the persisted boundary yet. Rendering no
      // divider is more accurate than attaching it to the current page edge.
      return projectedMessages;
    }
    const boundary = projectedMessages[boundaryIndex];
    if (!boundary) {
      return projectedMessages;
    }
    const forkOriginItem = {
      createdAt: boundary.createdAt,
      data: {},
      id: `fork-origin:${sessionId}`,
      role: 'system',
      status: 'success',
      systemEvent: { sourceSessionId: forkedFromSessionId, type: 'fork-origin' },
    } satisfies MessageListItem;
    return [
      ...projectedMessages.slice(0, boundaryIndex + 1),
      forkOriginItem,
      ...projectedMessages.slice(boundaryIndex + 1),
    ];
  }, [forkBoundaryMessageId, forkedFromSessionId, projectedMessages, sessionId]);
  const assistantPresentation = useMemo(
    () => ({
      avatarUri: assistantAvatarUri,
      name: assistantName?.trim() || t('chat.backgroundReply.assistant'),
    }),
    [assistantAvatarUri, assistantName, t],
  );
  const renderChatMessage = useCallback(
    (message: MessageListItem) => {
      if (message.role === 'system') {
        return message.systemEvent?.type === 'fork-origin' ? (
          <ChatForkOriginDivider sourceSessionId={message.systemEvent.sourceSessionId} />
        ) : null;
      }

      return (
        <ChatMessage
          assistantPresentation={assistantPresentation}
          isMessageActionsEnabled={isAssistantToolbarEnabled}
          message={message}
        />
      );
    },
    [assistantPresentation, isAssistantToolbarEnabled],
  );
  const messageListExtraData = useMemo(
    () => ({ assistantPresentation, isAssistantToolbarEnabled }),
    [assistantPresentation, isAssistantToolbarEnabled],
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
        toast.show({ label: t('chat.tool.approval.failed'), variant: 'danger' });
      }
    },
    [client, sessionId, t, toast],
  );
  const handleApprovalCancel = useCallback(async () => {
    try {
      await client.cancelTurn(sessionId);
    } catch (cancelError) {
      logger.error('Turn cancellation from tool approval failed', cancelError as Error);
      toast.show({ label: t('chat.input.stopFailed'), variant: 'danger' });
    }
  }, [client, sessionId, t, toast]);
  const requiresInitialHistoryLayout = shouldWaitForInitialHistoryLayout({
    hasHistoryBeforeActiveTurn: live.hasHistoryBeforeActiveTurn,
    isLoadingInitial,
    messageCount: messages.length,
  });
  const { isCoverVisible, markListLoaded } = useMessageListInitialRenderGate({
    renderGateKey: sessionId,
    requiresInitialHistoryLayout,
  });
  const contentTopInset = resolveHeaderContentInset(headerHeight);

  if (error && !isLoadingInitial && listMessages.length === 0) {
    return (
      <View className="flex-1 justify-center px-8 py-16">
        <ContentState.Error
          primaryAction={{ children: t('agent.actions.retry'), onPress: () => void retry() }}
          title={t('chat.history.loadFailed')}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-chat-background">
      <ChatOlderMessagesIndicator isLoading={isLoadingOlder} />
      <AssistantMessageActionsProvider
        key={`assistant-actions-${sessionId}`}
        isAssistantToolbarEnabled={isAssistantToolbarEnabled}
        sessionId={sessionId}
      >
        <MessageList
          contentBottomInset={contentBottomInset}
          contentTopInset={contentTopInset}
          dataKey={sessionId}
          enteringMessageId={live.enteringUserMessageId}
          extraData={messageListExtraData}
          initialLayoutReady={!requiresInitialHistoryLayout || !isLoadingInitial}
          keyboardOffset={keyboardOffset}
          messages={listMessages}
          onLoadOlder={loadOlder}
          onReady={markListLoaded}
          renderMessage={renderChatMessage}
        />
      </AssistantMessageActionsProvider>
      <ChatInitialRenderCover isVisible={isCoverVisible} />
      <ToolApprovalSheet
        key={`tool-approval-${sessionId}`}
        approvals={pendingApprovals}
        isOpen={pendingApprovals.length > 0}
        onCancel={handleApprovalCancel}
        onRespond={handleApprovalRespond}
      />
    </View>
  );
}

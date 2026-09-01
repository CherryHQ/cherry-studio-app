import { ContentState, useAlert } from '@cherrystudio/ui/components';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { MessageList, type MessageListItem } from '@/frontend/components/messages';
import { resolveHeaderContentInset } from '@/frontend/components/navigation';
import type { AgentMessageHistoryWindow } from '@/frontend/hooks/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { type PendingToolApproval, ToolApprovalSheet } from '../approval/ToolApprovalSheet';
import {
  createAgentMessageListProjectionCache,
  mergeAgentMessageViews,
  toAgentMessageListItems,
  useAgentChatActions,
  useAgentChatSession,
} from '../runtime';
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
const gateLog = loggerService.withContext('AgentChatGate');

type ChatWorkspaceProps = {
  assistantAvatarUri?: null | string;
  assistantName?: string;
  isAssistantToolbarEnabled: boolean;
  contentBottomInset: number;
  /** Set when this session was forked; names the session it was copied from. */
  forkedFromSessionId?: string;
  keyboardOffset: number;
  messageWindow: AgentMessageHistoryWindow;
  sessionId: string;
};

export function ChatWorkspace({
  assistantAvatarUri,
  assistantName,
  contentBottomInset,
  forkedFromSessionId,
  keyboardOffset,
  messageWindow,
  isAssistantToolbarEnabled,
  sessionId,
}: ChatWorkspaceProps) {
  const { error, isAtHistoryStart, isLoadingInitial, isLoadingOlder, loadOlder, messages, retry } =
    messageWindow;
  const live = useAgentChatSession(sessionId);
  const client = useAgentChatActions();
  const headerHeight = useHeaderHeight();
  const { t } = useTranslation();
  const { alert } = useAlert();
  const mergedMessages = useMemo(
    () => mergeAgentMessageViews(messages, live.liveMessages),
    [live.liveMessages, messages],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionId keys the cache lifetime, not its contents
  const projectionCache = useMemo(() => createAgentMessageListProjectionCache(), [sessionId]);
  const listMessages = useMemo(
    () => toAgentMessageListItems(mergedMessages, projectionCache),
    [mergedMessages, projectionCache],
  );
  const assistantPresentation = useMemo(
    () => ({
      avatarUri: assistantAvatarUri,
      name: assistantName?.trim() || t('chat.backgroundReply.assistant'),
    }),
    [assistantAvatarUri, assistantName, t],
  );
  const renderChatMessage = useCallback(
    (message: MessageListItem) => (
      <ChatMessage
        assistantPresentation={assistantPresentation}
        isMessageActionsEnabled={isAssistantToolbarEnabled}
        message={message}
      />
    ),
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
        alert.show({ title: t('chat.tool.approval.failed') });
      }
    },
    [alert, client, sessionId, t],
  );
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
  // The divider claims to sit above the first message, so it may only render
  // once the whole transcript is in the window — otherwise it would hang above
  // the earliest loaded page and lie about where the fork begins.
  const forkOriginDivider =
    forkedFromSessionId && isAtHistoryStart ? (
      <ChatForkOriginDivider sourceSessionId={forkedFromSessionId} />
    ) : undefined;

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
          headerAccessory={forkOriginDivider}
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
        onRespond={handleApprovalRespond}
      />
    </View>
  );
}

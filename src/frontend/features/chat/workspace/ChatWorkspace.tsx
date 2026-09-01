import { ContentState } from '@cherrystudio/ui/components';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { MessageList, type MessageListItem } from '@/frontend/components/messages';
import { resolveHeaderContentInset } from '@/frontend/components/navigation';
import type { AgentMessageHistoryWindow } from '@/frontend/hooks/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  createAgentMessageListProjectionCache,
  mergeAgentMessageViews,
  toAgentMessageListItems,
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

const gateLog = loggerService.withContext('AgentChatGate');

type ChatWorkspaceProps = {
  assistantAvatarUri?: null | string;
  assistantName?: string;
  isAssistantToolbarEnabled: boolean;
  contentBottomInset: number;
  keyboardOffset: number;
  messageWindow: AgentMessageHistoryWindow;
  sessionId: string;
};

export function ChatWorkspace({
  assistantAvatarUri,
  assistantName,
  contentBottomInset,
  keyboardOffset,
  messageWindow,
  isAssistantToolbarEnabled,
  sessionId,
}: ChatWorkspaceProps) {
  const { error, isLoadingInitial, isLoadingOlder, loadOlder, messages, retry } = messageWindow;
  const live = useAgentChatSession(sessionId);
  const headerHeight = useHeaderHeight();
  const { t } = useTranslation();
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
    </View>
  );
}

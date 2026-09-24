import { BackgroundPressExclusion, ContentState } from '@cherrystudio/ui/components';
import { type ReactNode, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type {
  ConversationHistoryView,
  ConversationMessage,
  ConversationSnapshot,
} from '@/frontend/appShell/conversation';
import { type MessageListItem } from '@/frontend/components/Message';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';

import { type PendingChatSend } from '../../runtime';
import { ConversationApprovals } from '../ConversationApprovals';
import { ConversationMessageContent, ConversationAttachments } from '../ConversationMessageContent';
import { ChatTranscript } from './ChatTranscript';
import { ChatDraftState } from './components/ChatDraftState';
import { ChatForkOriginDivider } from './components/ChatForkOriginDivider';
import { ChatMessage } from './components/ChatMessage';
import { AssistantMessageActionsProvider } from './context/AssistantMessageActionsProvider';
import { useIsScreenReaderEnabled } from './hooks/useIsScreenReaderEnabled';
import { shouldWaitForInitialHistoryLayout } from './hooks/useMessageListInitialRenderGate';
import { getTimestampMessageIds } from './messageTimestamps';

type ChatWorkspaceProps = {
  enteringUserMessageId?: string;
  pendingSend?: PendingChatSend;
  onPendingSendDisplayed: (userMessageId: string) => void;
  assistantAvatar?: null | string;
  assistantAvatarUri?: null | string;
  assistantName?: string;
  isAssistantToolbarEnabled: boolean;
  contentBottomInset: number;
  /** Copied message inside this Session that closes the inherited prefix. */
  forkBoundaryMessageId?: string;
  /** Direct source Session named by the fork-origin divider. */
  forkedFromSessionId?: string;
  keyboardOffset: number;
  messageWindow: ConversationHistoryView;
  /** History and live rows already reconciled by the source; the workspace only presents them. */
  messages: readonly ConversationMessage[];
  snapshot: ConversationSnapshot;
  onShare?: (messageId: string) => void;
  sessionId?: string;
  renderUsage?: (message: MessageListItem) => ReactNode;
};

export function ChatWorkspace({
  snapshot: live,
  messages: mergedMessages,
  onShare,
  enteringUserMessageId,
  pendingSend,
  onPendingSendDisplayed,
  assistantAvatar,
  assistantAvatarUri,
  assistantName,
  contentBottomInset,
  forkBoundaryMessageId,
  forkedFromSessionId,
  keyboardOffset,
  messageWindow,
  isAssistantToolbarEnabled,
  sessionId,
  renderUsage,
}: ChatWorkspaceProps) {
  const {
    dataKey,
    error,
    hasNewerMessages,
    initialScrollTarget,
    isLoadingInitial,
    isLoadingOlder,
    isLoadingNewer,
    loadOlder,
    loadNewer,
    messages,
    returnToLatest,
    retry,
  } = messageWindow;
  const listKey = sessionId ?? pendingSend?.sessionId;
  const { t } = useTranslation();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  // Only the Session's latest answer is replaceable, and an older window does
  // not hold it (agent-protocol.md "Manual answer retry").
  const retryableMessageId = useMemo(() => {
    if (hasNewerMessages) return undefined;
    const last = mergedMessages.at(-1);
    return last?.display.role === 'assistant' ? last.key : undefined;
  }, [hasNewerMessages, mergedMessages]);
  useEffect(() => {
    if (
      pendingSend &&
      pendingSend.messages.every((pending) =>
        mergedMessages.some((message) => message.key === pending.id),
      )
    ) {
      onPendingSendDisplayed(pendingSend.messages[0].id);
    }
  }, [mergedMessages, onPendingSendDisplayed, pendingSend]);
  const projectedMessages = useMemo(() => {
    const projected = mergedMessages
      .filter((message) => message.display.role !== 'system')
      .map((message) =>
        message.key === live.retryingMessageKey
          ? { ...message.display, status: 'pending' as const, data: { parts: [] } }
          : message.display,
      );
    if (!pendingSend) return projected;
    const [user, assistant] = pendingSend.messages;
    const userIndex = projected.findIndex((message) => message.id === user.id);
    const assistantIndex = projected.findIndex((message) => message.id === assistant.id);
    if (userIndex >= 0 && assistantIndex >= 0) return projected;
    const result = [...projected];
    if (userIndex >= 0) result.splice(userIndex + 1, 0, assistant);
    else if (assistantIndex >= 0) result.splice(assistantIndex, 0, user);
    else result.push(user, assistant);
    return result;
  }, [mergedMessages, pendingSend, live.retryingMessageKey]);
  const timestampMessageIds = useMemo(
    () => getTimestampMessageIds(projectedMessages),
    [projectedMessages],
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
      avatar: assistantAvatar,
      avatarUri: assistantAvatarUri,
      name: assistantName?.trim() || t('chat.backgroundReply.assistant'),
    }),
    [assistantAvatar, assistantAvatarUri, assistantName, t],
  );
  const renderChatMessage = useCallback(
    (message: MessageListItem) => {
      if (message.role === 'system') {
        return message.systemEvent?.type === 'fork-origin' ? (
          <ChatForkOriginDivider sourceSessionId={message.systemEvent.sourceSessionId} />
        ) : null;
      }

      const value = mergedMessages.find((item) => item.key === message.id);
      const content = (
        <ChatMessage
          assistantPresentation={assistantPresentation}
          isMessageActionsEnabled={isAssistantToolbarEnabled}
          isScreenReaderEnabled={isScreenReaderEnabled}
          message={message}
          usage={renderUsage?.(message)}
          attachments={
            value?.attachments?.length ? <ConversationAttachments message={value} /> : undefined
          }
          shouldShowTimestamp={timestampMessageIds.has(message.id)}
        />
      );
      return value ? (
        <ConversationMessageContent message={value}>{content}</ConversationMessageContent>
      ) : (
        content
      );
    },
    [
      assistantPresentation,
      isAssistantToolbarEnabled,
      isScreenReaderEnabled,
      timestampMessageIds,
      mergedMessages,
      renderUsage,
    ],
  );
  const messageListExtraData = useMemo(
    () => ({
      assistantPresentation,
      isAssistantToolbarEnabled,
      isScreenReaderEnabled,
      timestampMessageIds,
    }),
    [assistantPresentation, isAssistantToolbarEnabled, isScreenReaderEnabled, timestampMessageIds],
  );
  const requiresInitialHistoryLayout =
    typeof initialScrollTarget === 'object' ||
    (Boolean(sessionId) &&
      !pendingSend?.isNewSession &&
      shouldWaitForInitialHistoryLayout({
        hasHistoryBeforeActiveTurn: live.hasHistoryBeforeExecution,
        isLoadingInitial,
        messageCount: messages.length,
      }));

  if (!sessionId && listMessages.length === 0) {
    return (
      <ChatDraftState
        assistantAvatar={assistantAvatar}
        assistantAvatarUri={assistantAvatarUri}
        assistantName={assistantName}
        contentBottomInset={contentBottomInset}
      />
    );
  }

  if (error && !isLoadingInitial && listMessages.length === 0) {
    return (
      <View className="flex-1 justify-center px-8 py-16">
        <BackgroundPressExclusion>
          <ContentState.Error
            primaryAction={{ children: t('agent.actions.retry'), onPress: () => void retry() }}
            secondaryAction={
              returnToLatest
                ? {
                    children: t('chat.history.returnToLatest'),
                    onPress: returnToLatest,
                  }
                : undefined
            }
            title={t(
              error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND
                ? 'chat.history.messageUnavailable'
                : 'chat.history.loadFailed',
            )}
          />
        </BackgroundPressExclusion>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-chat-background">
      <AssistantMessageActionsProvider
        key={`assistant-actions-${listKey}`}
        isAssistantToolbarEnabled={isAssistantToolbarEnabled}
        retryableMessageId={retryableMessageId}
        onShare={onShare}
        snapshot={live}
        messages={mergedMessages}
      >
        <ChatTranscript
          requiresInitialLayout={requiresInitialHistoryLayout}
          isLoadingMore={isLoadingOlder || isLoadingNewer}
          contentBottomInset={contentBottomInset}
          dataKey={dataKey ?? listKey}
          enteringMessageId={enteringUserMessageId ?? live.enteringMessageKey}
          extraData={messageListExtraData}
          initialLayoutReady={!requiresInitialHistoryLayout || !isLoadingInitial}
          initialScrollTarget={initialScrollTarget}
          hasNewerMessages={hasNewerMessages}
          keyboardOffset={keyboardOffset}
          // ChatScreen owns background presses so blur also ends composer editing.
          keyboardShouldPersistTaps="always"
          messages={listMessages}
          onLoadOlder={loadOlder}
          onLoadNewer={loadNewer}
          onReturnToLatest={returnToLatest}
          renderMessage={renderChatMessage}
        />
      </AssistantMessageActionsProvider>
      {sessionId ? <ConversationApprovals snapshot={live} /> : null}
    </View>
  );
}

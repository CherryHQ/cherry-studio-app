import { BackgroundPressExclusion, ContentState } from '@cherrystudio/ui/components';
import { type ReactNode, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import type {
  ConversationHistoryView,
  ConversationMessage,
  ConversationSnapshot,
} from '@/frontend/appShell/conversation';
import { MessageFailureReportProvider, type MessageListItem } from '@/frontend/components/Message';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';

import { type PendingChatSend } from '../../runtime';
import type { ChatShareTranslations } from '../../share/chatShareHandoff';
import { useEndReadingWithConversation } from '../../voice/useMessageSpeech';
import { ConversationApprovals } from '../ConversationApprovals';
import { ConversationQuestionSheet } from '../ConversationQuestionSheet';
import { ChatTranscript } from './ChatTranscript';
import { ChatComposerClearance } from './components/ChatComposerClearance';
import { ChatDraftState } from './components/ChatDraftState';
import { ChatForkOriginDivider } from './components/ChatForkOriginDivider';
import { ChatMessageRow } from './components/ChatMessageRow';
import { ExpandedAnswerProvider } from './components/ExpandedAnswer';
import { AssistantMessageActionsProvider } from './context/AssistantMessageActionsProvider';
import { ChatMessageRowProvider } from './context/ChatMessageRowContext';
import { ChatSessionProvider } from './context/ChatSessionContext';
import { useConversationFeedback } from './hooks/useConversationFeedback';
import { useConversationFeedbackHint } from './hooks/useConversationFeedbackHint';
import { useIsScreenReaderEnabled } from './hooks/useIsScreenReaderEnabled';
import { shouldWaitForInitialHistoryLayout } from './hooks/useMessageListInitialRenderGate';
import { getTimestampMessageIds } from './messageTimestamps';
import { MessageTranslationProvider } from './translation/MessageTranslationProvider';

type ChatWorkspaceProps = {
  executionSource: 'local' | 'desktop';
  onQuoteTargetRestored?: (target: { dataKey: string; messageId: string }) => void;
  onQuoteWindowReady?: () => void;
  onQuoteTakeover?: () => void;
  enteringUserMessageId?: string;
  pendingSend?: PendingChatSend;
  onPendingSendDisplayed: (userMessageId: string) => void;
  assistantAvatar?: null | string;
  assistantAvatarUri?: null | string;
  assistantEmoji?: string;
  assistantName?: string;
  isAssistantToolbarEnabled: boolean;
  contentBottomInset: number;
  /** Copied message inside this Session that closes the inherited prefix. */
  forkBoundaryMessageId?: string;
  /** Direct source Session named by the fork-origin divider. */
  forkedFromSessionId?: string;
  keyboardOffset: number;
  feedbackHintBottomOffset?: SharedValue<number>;
  messageWindow: ConversationHistoryView;
  /** History and live rows already reconciled by the source; the workspace only presents them. */
  messages: readonly ConversationMessage[];
  snapshot: ConversationSnapshot;
  onShare?: (messageId: string, translations?: ChatShareTranslations) => void;
  sessionId?: string;
  /** Translation is available only for locally owned Agent messages. */
  isTranslationEnabled?: boolean;
  renderUsage?: (message: MessageListItem) => ReactNode;
};

export function ChatWorkspace({
  executionSource,
  onQuoteTargetRestored,
  onQuoteWindowReady,
  onQuoteTakeover,
  snapshot: live,
  messages: mergedMessages,
  onShare,
  enteringUserMessageId,
  pendingSend,
  onPendingSendDisplayed,
  assistantAvatar,
  assistantAvatarUri,
  assistantEmoji,
  assistantName,
  contentBottomInset,
  forkBoundaryMessageId,
  forkedFromSessionId,
  keyboardOffset,
  feedbackHintBottomOffset,
  messageWindow,
  isAssistantToolbarEnabled,
  sessionId,
  isTranslationEnabled = false,
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
  useConversationFeedbackHint(
    messageWindow.dataKey || sessionId || 'draft',
    live,
    feedbackHintBottomOffset,
  );
  const listKey = sessionId ?? pendingSend?.sessionId;
  useEndReadingWithConversation(sessionId);
  const { t } = useTranslation();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
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
      .map((message) => message.display);
    // A page around an older message is not the transcript's end.
    if (!pendingSend || hasNewerMessages) return projected;
    const [user, assistant] = pendingSend.messages;
    const userIndex = projected.findIndex((message) => message.id === user.id);
    const assistantIndex = projected.findIndex((message) => message.id === assistant.id);
    if (userIndex >= 0 && assistantIndex >= 0) return projected;
    const result = [...projected];
    if (userIndex >= 0) result.splice(userIndex + 1, 0, assistant);
    else if (assistantIndex >= 0) result.splice(assistantIndex, 0, user);
    else result.push(user, assistant);
    return result;
  }, [hasNewerMessages, mergedMessages, pendingSend]);
  const timestampMessageIds = useMemo(
    () => getTimestampMessageIds(projectedMessages),
    [projectedMessages],
  );
  // Pagination may not have loaded the persisted boundary yet. Rendering no
  // divider is more accurate than attaching it to the current page edge.
  const forkBoundaryIndex =
    forkBoundaryMessageId && forkedFromSessionId
      ? projectedMessages.findIndex((message) => message.id === forkBoundaryMessageId)
      : -1;
  const forkBoundary = forkBoundaryIndex >= 0 ? projectedMessages[forkBoundaryIndex] : undefined;
  const hasForkBoundary = Boolean(forkBoundary);
  const forkBoundaryCreatedAt = forkBoundary?.createdAt;
  // The divider keeps its item while messages stream, so its row does not re-render.
  const forkOriginItem = useMemo(
    () =>
      hasForkBoundary && forkedFromSessionId
        ? ({
            createdAt: forkBoundaryCreatedAt,
            data: {},
            id: `fork-origin:${sessionId}`,
            role: 'system',
            status: 'success',
            systemEvent: { sourceSessionId: forkedFromSessionId, type: 'fork-origin' },
          } satisfies MessageListItem)
        : undefined,
    [forkBoundaryCreatedAt, forkedFromSessionId, hasForkBoundary, sessionId],
  );
  const listMessages = useMemo(
    () =>
      forkOriginItem
        ? [
            ...projectedMessages.slice(0, forkBoundaryIndex + 1),
            forkOriginItem,
            ...projectedMessages.slice(forkBoundaryIndex + 1),
          ]
        : projectedMessages,
    [forkBoundaryIndex, forkOriginItem, projectedMessages],
  );
  const reportMessage = useConversationFeedback({
    executionSource,
    messages: listMessages,
    sessionId: listKey,
    snapshot: live,
  });
  const assistantPresentation = useMemo(
    () => ({
      avatar: assistantAvatar,
      avatarUri: assistantAvatarUri,
      emoji: assistantEmoji,
      name: assistantName?.trim() || t('chat.backgroundReply.assistant'),
    }),
    [assistantAvatar, assistantAvatarUri, assistantEmoji, assistantName, t],
  );
  // Row-specific conversation state (tools, attachments, timestamps) reaches
  // each row through its keyed subscription, so this renderer and `extraData`
  // change only with list-wide presentation.
  const renderChatMessage = useCallback(
    (message: MessageListItem) => {
      if (message.role === 'system') {
        return message.systemEvent?.type === 'fork-origin' ? (
          <ChatForkOriginDivider sourceSessionId={message.systemEvent.sourceSessionId} />
        ) : null;
      }

      return (
        <ChatMessageRow
          assistantPresentation={assistantPresentation}
          isMessageActionsEnabled={isAssistantToolbarEnabled}
          isScreenReaderEnabled={isScreenReaderEnabled}
          message={message}
          renderUsage={renderUsage}
        />
      );
    },
    [assistantPresentation, isAssistantToolbarEnabled, isScreenReaderEnabled, renderUsage],
  );
  const messageListExtraData = useMemo(
    () => ({
      assistantPresentation,
      isAssistantToolbarEnabled,
      isScreenReaderEnabled,
      renderUsage,
    }),
    [assistantPresentation, isAssistantToolbarEnabled, isScreenReaderEnabled, renderUsage],
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
        assistantEmoji={assistantEmoji}
        assistantName={assistantName}
        contentBottomInset={contentBottomInset}
      />
    );
  }

  if (error && !isLoadingInitial && listMessages.length === 0) {
    return (
      <ChatComposerClearance className="flex-1">
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
      </ChatComposerClearance>
    );
  }

  return (
    // No background of its own: the screen paints it, and a layer reaching over the composer leaves
    // the composer visible beneath it.
    <View className="flex-1" onTouchStart={onQuoteTakeover}>
      <MessageTranslationProvider
        isEnabled={isTranslationEnabled}
        sessionId={listKey ?? ''}
        messages={mergedMessages}
      >
        <AssistantMessageActionsProvider
          key={`assistant-actions-${listKey}`}
          isAssistantToolbarEnabled={isAssistantToolbarEnabled}
          onShare={onShare}
          sessionId={sessionId}
          snapshot={live}
          messages={mergedMessages}
        >
          <ChatMessageRowProvider
            messages={mergedMessages}
            timestampMessageIds={timestampMessageIds}
          >
            <ChatSessionProvider value={sessionId}>
              <MessageFailureReportProvider onReport={reportMessage}>
                <ExpandedAnswerProvider messages={listMessages} renderUsage={renderUsage}>
                  <ChatTranscript
                    onTargetRestored={onQuoteTargetRestored}
                    onReady={onQuoteWindowReady}
                    requiresInitialLayout={requiresInitialHistoryLayout}
                    isLoadingMore={isLoadingOlder || isLoadingNewer}
                    contentBottomInset={contentBottomInset}
                    // A draft window has no Session yet and reports an empty key. Keying the
                    // first send by its pending Session keeps the list on one dataset across
                    // the draft-to-Session handoff instead of starting as a keyless list.
                    dataKey={dataKey || listKey}
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
                </ExpandedAnswerProvider>
              </MessageFailureReportProvider>
            </ChatSessionProvider>
          </ChatMessageRowProvider>
        </AssistantMessageActionsProvider>
      </MessageTranslationProvider>
      {sessionId ? (
        <>
          <ConversationApprovals snapshot={live} />
          <ConversationQuestionSheet snapshot={live} />
        </>
      ) : null}
    </View>
  );
}

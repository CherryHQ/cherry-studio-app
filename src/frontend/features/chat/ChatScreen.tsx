import {
  composerContentGap,
  ContentState,
  getComposerKeyboardStickyOffset,
} from '@cherrystudio/ui/components';
import { router, useIsPreview, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MainHeader } from '@/frontend/appShell/header';
import { ChatDockFooter } from '@/frontend/appShell/layout';
import {
  type ChatRouteParamsInput,
  type ChatTarget,
  conversationShareHref,
  parseChatRoute,
} from '@/frontend/appShell/navigation/chat';
import { getShareComposerHandoff } from '@/frontend/appShell/systemEntry';
import {
  ComposerDismissArea,
  ComposerDock,
  ComposerDropArea,
  ComposerSessionProvider,
} from '@/frontend/components/Composer';
import type { MessageListItem } from '@/frontend/components/Message';
import { useAgentApiById, useAgentSession } from '@/frontend/hooks/agent';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';

import { ChatInput } from './components/ChatInput';
import { ChatRouteResolver } from './components/ChatRouteResolver';
import { ChatScreenFrame } from './components/ChatScreenFrame';
import { AssistantMessageUsage, ChatEmptyState, ChatWorkspace } from './components/ChatWorkspace';
import { useChatComposerSession } from './hooks/useChatComposerSession';
import { useSessionReadReceipt } from './hooks/useSessionReadReceipt';
import {
  latestConversationImageResult,
  useAgentChatControls,
  useAgentChatDraftHandoff,
  useLocalConversation,
} from './runtime';

const PREVIEW_CONTENT_BOTTOM_INSET = 12;
const renderLocalUsage = (message: MessageListItem) => <AssistantMessageUsage message={message} />;

export function ChatScreen() {
  return (
    <ChatScreenFrame header={MainHeader}>
      <ChatRouteContent />
    </ChatScreenFrame>
  );
}

function ChatRouteContent() {
  const params = useLocalSearchParams<ChatRouteParamsInput>();
  const route = parseChatRoute(params);

  if (route.status !== 'ready') {
    return <ChatRouteResolver />;
  }

  return <ResolvedChatContent target={route.target} />;
}

function ResolvedChatContent({ target }: { target: ChatTarget }) {
  const { t } = useTranslation();
  const isPreview = useIsPreview();
  const agentId = target.kind === 'draft' ? target.agentId : undefined;
  const sessionId = target.kind === 'session' ? target.sessionId : undefined;
  const draftHandoff = useAgentChatDraftHandoff(sessionId);
  const composerSession = useChatComposerSession(target, draftHandoff);
  const session = useAgentSession(sessionId);
  const resolvedAgentId = session.data?.agentId ?? composerSession.draftAgentId ?? agentId;
  const controls = useAgentChatControls({
    agentId: resolvedAgentId,
    sessionId,
    composerKey: composerSession.key,
  });
  const agent = useAgentApiById(resolvedAgentId);
  const { snapshot, messages, messageWindow } = useLocalConversation({
    sessionId,
    title: session.data?.title,
    navigation: target.kind === 'session' ? target : undefined,
  });
  const shareMessage = useCallback(
    (messageId: string) => {
      if (sessionId)
        router.push(conversationShareHref({ source: { kind: 'local' }, sessionId }, messageId));
    },
    [sessionId],
  );
  const isSessionAvailable =
    Boolean(sessionId) && !session.error && (session.isLoading || Boolean(session.data));
  const isNewAgentAvailable =
    !sessionId && Boolean(agentId) && !agent.error && (agent.isLoading || Boolean(agent.agent));
  const hasComposer =
    !isPreview && Boolean(agent.agent) && (isSessionAvailable || isNewAgentAvailable);
  // A system share arrives as composer content, not as a message: its text and attachments wait
  // in the input for the user to edit, retarget, and send.
  const shareHandoff = getShareComposerHandoff(composerSession.seedHandoff);
  const { bottom: bottomInset } = useSafeAreaInsets();
  const contentBottomInset = hasComposer ? composerContentGap : PREVIEW_CONTENT_BOTTOM_INSET;
  const keyboardOffset = hasComposer ? getComposerKeyboardStickyOffset(bottomInset) : 0;

  if (sessionId && session.error && isNotFoundError(session.error)) {
    return <ChatRouteResolver />;
  }

  return (
    <ComposerSessionProvider
      key={composerSession.key}
      initialAttachments={shareHandoff?.attachments}
      initialDraft={shareHandoff?.draft}
    >
      {/* A drop without a composer could import files with nothing to attach
          them to, so the area refuses sessions in preview and error states. */}
      <ComposerDropArea enabled={hasComposer}>
        {!isPreview &&
        sessionId &&
        session.data &&
        !session.error &&
        !messageWindow.isLoadingInitial &&
        !messageWindow.error ? (
          <SessionReadReceipt sessionId={sessionId} />
        ) : null}
        {/* Native background taps yield to scrolling and excluded message content. */}
        <ComposerDismissArea disabled={!hasComposer} testID="chat-background">
          {sessionId && session.error ? (
            <View className="flex-1 justify-center px-8 py-16">
              <ContentState.Error
                primaryAction={{
                  children: t('agent.actions.retry'),
                  onPress: () => void session.refetch(),
                }}
                prominence="prominent"
                title={t('navigation.chatsLoadFailed')}
              />
            </View>
          ) : (isSessionAvailable && sessionId) || target.kind === 'draft' ? (
            <ChatWorkspace
              renderUsage={renderLocalUsage}
              snapshot={snapshot}
              messages={messages}
              onShare={sessionId ? shareMessage : undefined}
              pendingSend={controls.pendingSend}
              enteringUserMessageId={controls.enteringUserMessageId}
              onPendingSendDisplayed={controls.completePendingSend}
              assistantAvatar={agent.agent?.avatar}
              assistantAvatarUri={agent.agent?.avatarUri}
              assistantName={agent.agent?.name}
              isAssistantToolbarEnabled={!isPreview && Boolean(sessionId)}
              contentBottomInset={contentBottomInset}
              forkBoundaryMessageId={session.data?.forkBoundaryMessageId ?? undefined}
              forkedFromSessionId={session.data?.forkedFromSessionId ?? undefined}
              keyboardOffset={keyboardOffset}
              messageWindow={messageWindow}
              sessionId={sessionId}
            />
          ) : (
            <ChatEmptyState contentBottomInset={contentBottomInset} />
          )}
        </ComposerDismissArea>
        {hasComposer ? (
          <ComposerDock layoutMode="flow">
            <View>
              <ChatInput
                agentId={resolvedAgentId}
                controls={controls}
                dismissKeyboardOnSend
                imageResult={
                  messageWindow.hasNewerMessages
                    ? undefined
                    : latestConversationImageResult(
                        messageWindow.messages.map((message) => message.imageResult),
                      )
                }
                sessionId={sessionId}
              />
              <ChatDockFooter>
                <Text className="text-center text-xs text-muted-foreground">
                  {t('chat.input.disclaimer')}
                </Text>
              </ChatDockFooter>
            </View>
          </ComposerDock>
        ) : null}
      </ComposerDropArea>
    </ComposerSessionProvider>
  );
}

function SessionReadReceipt({ sessionId }: { sessionId: string }) {
  useSessionReadReceipt(sessionId);
  return null;
}

function isNotFoundError(error: Error) {
  return error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND;
}

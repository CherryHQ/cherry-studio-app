import {
  composerContentGap,
  ContentState,
  getComposerKeyboardStickyOffset,
} from '@cherrystudio/ui/components';
import { BlurTargetView } from 'expo-blur';
import { useIsPreview, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MainHeader } from '@/frontend/appShell/header';
import {
  type ChatRouteParamsInput,
  type ChatTarget,
  parseChatRoute,
} from '@/frontend/appShell/navigation/chat';
import { ComposerDock, ComposerSessionProvider } from '@/frontend/components/Composer';
import {
  useAgentApiById,
  useAgentMessageHistoryWindow,
  useAgentSession,
} from '@/frontend/hooks/agent';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';

import { ChatInput } from './components/ChatInput';
import { ChatRouteResolver } from './components/ChatRouteResolver';
import { ChatEmptyState, ChatWorkspace } from './components/ChatWorkspace';
import { useChatComposerSession } from './hooks/useChatComposerSession';
import { useSessionReadReceipt } from './hooks/useSessionReadReceipt';
import { useAgentChatControls, useAgentChatDraftHandoff } from './runtime';

const PREVIEW_CONTENT_BOTTOM_INSET = 12;

export function ChatScreen() {
  const blurTargetRef = useRef<View>(null);

  return (
    <>
      <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
        <ChatRouteContent />
      </BlurTargetView>
      <MainHeader blurTarget={blurTargetRef} />
    </>
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
  const messageWindow = useAgentMessageHistoryWindow(
    sessionId,
    target.kind === 'session' ? target : undefined,
  );
  const isSessionAvailable =
    Boolean(sessionId) && !session.error && (session.isLoading || Boolean(session.data));
  const isNewAgentAvailable =
    !sessionId && Boolean(agentId) && !agent.error && (agent.isLoading || Boolean(agent.agent));
  const hasComposer =
    !isPreview && Boolean(agent.agent) && (isSessionAvailable || isNewAgentAvailable);
  const { bottom: bottomInset } = useSafeAreaInsets();
  const contentBottomInset = hasComposer ? composerContentGap : PREVIEW_CONTENT_BOTTOM_INSET;
  const keyboardOffset = hasComposer ? getComposerKeyboardStickyOffset(bottomInset) : 0;

  if (sessionId && session.error && isNotFoundError(session.error)) {
    return <ChatRouteResolver />;
  }

  return (
    <>
      {!isPreview &&
      sessionId &&
      session.data &&
      !session.error &&
      !messageWindow.isLoadingInitial &&
      !messageWindow.error ? (
        <SessionReadReceipt sessionId={sessionId} />
      ) : null}
      <View className="flex-1">
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
      </View>
      {hasComposer ? (
        <ComposerSessionProvider key={composerSession.key}>
          <ComposerDock layoutMode="flow">
            <ChatInput agentId={resolvedAgentId} controls={controls} sessionId={sessionId} />
          </ComposerDock>
        </ComposerSessionProvider>
      ) : null}
    </>
  );
}

function SessionReadReceipt({ sessionId }: { sessionId: string }) {
  useSessionReadReceipt(sessionId);
  return null;
}

function isNotFoundError(error: Error) {
  return error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND;
}

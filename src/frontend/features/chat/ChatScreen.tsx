import {
  composerContentGap,
  ContentState,
  getComposerKeyboardStickyOffset,
} from '@cherrystudio/ui/components';
import { useIsPreview, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComposerDock, ComposerSessionProvider } from '@/frontend/components/composer';
import { MainHeader } from '@/frontend/components/headers';
import {
  type ChatRouteParamsInput,
  type ChatTarget,
  parseChatRoute,
} from '@/frontend/components/navigation/chat';
import {
  useAgentApiById,
  useAgentMessageHistoryWindow,
  useAgentSession,
} from '@/frontend/hooks/agent';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';

import { ChatInput } from './input';
import { ChatRouteResolver } from './navigation';
import { ChatEmptyState, ChatWorkspace } from './workspace';

const PREVIEW_CONTENT_BOTTOM_INSET = 12;

export function ChatScreen() {
  const params = useLocalSearchParams<ChatRouteParamsInput>();
  const route = parseChatRoute(params);

  if (route.status !== 'ready') {
    return <ChatRouteResolver />;
  }

  return <ResolvedChatScreen target={route.target} />;
}

function ResolvedChatScreen({ target }: { target: ChatTarget }) {
  const { t } = useTranslation();
  const isPreview = useIsPreview();
  const agentId = target.kind === 'draft' ? target.agentId : undefined;
  const sessionId = target.kind === 'session' ? target.sessionId : undefined;
  const session = useAgentSession(sessionId);
  const resolvedAgentId = session.data?.agentId ?? agentId;
  const agent = useAgentApiById(resolvedAgentId);
  const messageWindow = useAgentMessageHistoryWindow(sessionId);
  const isSessionAvailable =
    Boolean(sessionId) && !session.error && (session.isLoading || Boolean(session.data));
  const isNewAgentAvailable =
    !sessionId && Boolean(agentId) && !agent.error && (agent.isLoading || Boolean(agent.agent));
  const hasComposer =
    !isPreview && Boolean(agent.agent) && (isSessionAvailable || isNewAgentAvailable);
  const composerSessionKey = sessionId
    ? `session:${sessionId}`
    : `draft:${resolvedAgentId ?? 'unavailable'}`;
  const { bottom: bottomInset } = useSafeAreaInsets();
  const contentBottomInset = hasComposer ? composerContentGap : PREVIEW_CONTENT_BOTTOM_INSET;
  const keyboardOffset = hasComposer ? getComposerKeyboardStickyOffset(bottomInset) : 0;

  if (sessionId && session.error && isNotFoundError(session.error)) {
    return <ChatRouteResolver />;
  }

  return (
    <>
      <MainHeader />
      <View className="flex-1 bg-background">
        {sessionId && session.error ? (
          <ContentState.Error
            className="flex-1"
            layout="page"
            primaryAction={{
              children: t('agent.actions.retry'),
              onPress: () => void session.refetch(),
            }}
            title={t('navigation.chatsLoadFailed')}
          />
        ) : isSessionAvailable && sessionId ? (
          <ChatWorkspace
            assistantAvatarUri={agent.agent?.avatarUri}
            assistantName={agent.agent?.name}
            isAssistantToolbarEnabled={!isPreview}
            contentBottomInset={contentBottomInset}
            forkedFromSessionId={session.data?.forkedFromSessionId ?? undefined}
            keyboardOffset={keyboardOffset}
            messageWindow={messageWindow}
            sessionId={sessionId}
          />
        ) : (
          <ChatEmptyState contentBottomInset={contentBottomInset} />
        )}
        {hasComposer ? (
          <ComposerSessionProvider key={composerSessionKey}>
            <ComposerDock layoutMode="flow">
              <ChatInput
                agentId={resolvedAgentId}
                dismissKeyboardOnSend={false}
                sessionId={sessionId}
              />
            </ComposerDock>
          </ComposerSessionProvider>
        ) : null}
      </View>
    </>
  );
}

function isNotFoundError(error: Error) {
  return error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND;
}

import { composerContentGap, getComposerKeyboardStickyOffset } from '@cherrystudio/ui/components';
import { useIsPreview, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComposerDock, ComposerSessionProvider } from '@/frontend/components/composer';
import { MainHeader } from '@/frontend/components/headers';
import {
  type ChatRouteParamsInput,
  type ChatTarget,
  parseChatRoute,
  serializeChatTarget,
} from '@/frontend/components/navigation/chat';
import { usePreference } from '@/frontend/data/hooks';
import {
  useAgentApiById,
  useAgentMessageHistoryWindow,
  useAgentSession,
} from '@/frontend/hooks/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { ChatInput } from './input';
import { ChatRouteResolver } from './navigation';
import { ChatEmptyState, ChatWorkspace } from './workspace';

const PREVIEW_CONTENT_BOTTOM_INSET = 12;
const logger = loggerService.withContext('ChatScreen');

export function ChatScreen() {
  const params = useLocalSearchParams<ChatRouteParamsInput>();
  const route = parseChatRoute(params);

  if (route.status !== 'ready') {
    return (
      <ChatRouteResolver
        requestedSessionId={route.status === 'partial-session' ? route.sessionId : undefined}
      />
    );
  }

  return <ResolvedChatScreen target={route.target} />;
}

function ResolvedChatScreen({ target }: { target: ChatTarget }) {
  const isPreview = useIsPreview();
  const [storedTargetValue, setStoredTargetValue] = usePreference('chat.last_active_target');
  const agentId = target.agentId;
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

  useEffect(() => {
    const nextStoredTargetValue = serializeChatTarget(target);
    if (storedTargetValue === nextStoredTargetValue) {
      return;
    }

    void setStoredTargetValue(nextStoredTargetValue).catch((error) => {
      logger.warn('Failed to persist the active chat target', error as Error);
    });
  }, [setStoredTargetValue, storedTargetValue, target]);

  return (
    <>
      <MainHeader />
      <View className="flex-1 bg-background">
        {isSessionAvailable && sessionId ? (
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
